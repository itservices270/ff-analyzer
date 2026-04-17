import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { resolveUser, assertNotImpersonating } from '../../../../lib/auth';

// Admin-only manual enrollment override. Flips a priced deal into
// `enrolled` status, sets wizard_completed_at + all BO Dashboard
// display fields, and (if needed) flips the owner's role to
// business_owner so they can actually log into the merchant view.
//
// Used for:
//   1. Testing — populate the BO Dashboard with a real enrolled deal
//      so God Mode can render the full UI.
//   2. Admin override — merchant signed paper offline; admin enrolls
//      on their behalf.
//   3. Bypass broken wizard states.
//
// NOT a replacement for the real merchant-facing enrollment wizard
// (that's a separate future build — this button stays as an override
// tool even after the wizard lands).

const ENROLLABLE_STATUSES = new Set([
  'priced',
  'agreement_requested',
  'agreement_signed',
  'final_review',
  'welcome_call',
  'enrollment_fee_rcvd',
]);

// Known admin UUID — guard against demoting this account if it ever
// happens to own a deal. Multiple admins could exist in user_metadata,
// but this specific UUID is the primary admin and should never be
// auto-flipped to business_owner.
const PRIMARY_ADMIN_UUID = '915d67a9-e9d4-4114-9ca1-d8b2ec2dcceb';

function addDays(isoDate, days) {
  // Input: 'YYYY-MM-DD'. Use UTC math to avoid DST drift.
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export async function POST(request) {
  try {
    // ── 1. Reject if impersonating ─────────────────────────────────
    // Admins in God Mode are in read-only mode. They must exit before
    // running a state-mutating action like enrollment.
    try {
      await assertNotImpersonating(request);
    } catch (e) {
      return NextResponse.json({ error: e.error }, { status: e.status });
    }

    // ── 2. Resolve caller, require admin ───────────────────────────
    let caller;
    try {
      caller = await resolveUser(request);
    } catch (e) {
      return NextResponse.json({ error: e.error || 'unauthorized' }, { status: e.status || 401 });
    }
    if (!caller.isAdmin) {
      return NextResponse.json({ error: 'admin only' }, { status: 403 });
    }

    // ── 3. Parse + validate body ───────────────────────────────────
    const body = await request.json().catch(() => ({}));
    const {
      deal_id,
      merchant_weekly_payment,
      program_term_weeks,
      max_funder_term_weeks,
      original_weekly_burden,
      disclosed_payback,
      cost_display_value,
      cost_display_label,
      cost_display_note,
      enrollment_date,
      enrollment_fee,
      skip_wizard_complete = false,
    } = body;

    if (!deal_id) {
      return NextResponse.json({ error: 'deal_id is required' }, { status: 400 });
    }
    const weekly = parseFloat(merchant_weekly_payment);
    const term = parseInt(program_term_weeks, 10);
    if (!Number.isFinite(weekly) || weekly <= 0) {
      return NextResponse.json({ error: 'merchant_weekly_payment must be a positive number' }, { status: 400 });
    }
    if (!Number.isFinite(term) || term <= 0) {
      return NextResponse.json({ error: 'program_term_weeks must be a positive integer' }, { status: 400 });
    }
    if (!enrollment_date || !/^\d{4}-\d{2}-\d{2}$/.test(enrollment_date)) {
      return NextResponse.json({ error: 'enrollment_date is required (YYYY-MM-DD)' }, { status: 400 });
    }

    // ── 4. Fetch the deal ──────────────────────────────────────────
    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .select('id, status, enrollment_status, merchant_name, merchant_dba, wp_user_id, user_id')
      .eq('id', deal_id)
      .maybeSingle();

    if (dealErr) {
      return NextResponse.json({ error: dealErr.message }, { status: 500 });
    }
    if (!deal) {
      return NextResponse.json({ error: 'deal not found' }, { status: 404 });
    }

    // Check either status or enrollment_status — whichever is set.
    // The `status` column is the primary deal lifecycle; enrollment_status
    // mirrors it once the deal enters the enrollment flow.
    const currentStatus = (deal.status || deal.enrollment_status || '').toString().toLowerCase();
    if (!ENROLLABLE_STATUSES.has(currentStatus)) {
      return NextResponse.json(
        {
          error: `deal status "${currentStatus}" is not enrollable — must be one of: ${[...ENROLLABLE_STATUSES].join(', ')}`,
        },
        { status: 409 }
      );
    }

    // ── 5. Resolve owner + role flip ───────────────────────────────
    // Deals carry the merchant id on either wp_user_id or user_id
    // depending on how they were created. Try both.
    const ownerUserId = deal.wp_user_id || deal.user_id;
    if (!ownerUserId) {
      return NextResponse.json(
        { error: 'deal has no owner user — cannot enroll' },
        { status: 422 }
      );
    }

    // Never touch the primary admin account.
    if (ownerUserId === PRIMARY_ADMIN_UUID) {
      return NextResponse.json(
        { error: 'refusing to enroll a deal owned by the primary admin — this would demote the admin account' },
        { status: 422 }
      );
    }

    // Look up owner via Supabase auth admin API (source of truth for role).
    let ownerAuth;
    try {
      const { data, error } = await supabase.auth.admin.getUserById(ownerUserId);
      if (error || !data?.user) {
        return NextResponse.json({ error: 'owner user not found in auth' }, { status: 404 });
      }
      ownerAuth = data.user;
    } catch (e) {
      return NextResponse.json(
        { error: `auth lookup failed: ${e?.message || 'unknown'}` },
        { status: 500 }
      );
    }

    const ownerMeta = ownerAuth.user_metadata || {};
    const ownerAppMeta = ownerAuth.app_metadata || {};
    const ownerRole = (ownerMeta.role || ownerAppMeta.role || '').toString().toLowerCase();

    // Defense in depth: even if wp_user_id somehow pointed at an admin
    // account, the role check blocks the flip.
    if (ownerRole === 'admin') {
      return NextResponse.json(
        { error: 'refusing to demote an admin user to business_owner' },
        { status: 422 }
      );
    }

    // Flip role to business_owner if needed. Merge metadata so we don't
    // blow away first_name / last_name / etc.
    if (ownerRole !== 'business_owner') {
      const { error: roleErr } = await supabase.auth.admin.updateUserById(ownerUserId, {
        user_metadata: { ...ownerMeta, role: 'business_owner' },
      });
      if (roleErr) {
        return NextResponse.json(
          { error: `failed to set owner role to business_owner: ${roleErr.message}` },
          { status: 500 }
        );
      }
    }

    // Best-effort mirror on public.users (non-fatal if this table is
    // missing or the row doesn't exist — auth.users is source of truth).
    try {
      await supabase
        .from('users')
        .update({ role: 'business_owner' })
        .eq('id', ownerUserId);
    } catch (mirrorErr) {
      console.warn('[enroll-deal] public.users mirror failed (non-fatal):', mirrorErr?.message);
    }

    // ── 6. Compute derived fields ──────────────────────────────────
    const enrollmentDateIso = enrollment_date;
    const completionDateIso = addDays(enrollmentDateIso, term * 7);
    const nowIso = new Date().toISOString();
    const wizardCompletedAt = skip_wizard_complete ? null : nowIso;

    // ── 7. Update deal ─────────────────────────────────────────────
    const updatePayload = {
      status: 'enrolled',
      enrollment_status: 'enrolled',
      merchant_weekly_payment: Math.round(weekly),
      program_term_weeks: term,
      max_funder_term_weeks: Number.isFinite(parseInt(max_funder_term_weeks, 10))
        ? parseInt(max_funder_term_weeks, 10)
        : null,
      original_weekly_burden: Math.round(parseFloat(original_weekly_burden) || 0),
      disclosed_payback: Math.round(parseFloat(disclosed_payback) || 0),
      cost_display_value: Number.isFinite(parseFloat(cost_display_value))
        ? parseFloat(cost_display_value)
        : null,
      cost_display_label: cost_display_label || null,
      cost_display_note: cost_display_note || null,
      enrollment_fee: Math.round(parseFloat(enrollment_fee) || 0),
      enrollment_date: enrollmentDateIso,
      program_start_date: enrollmentDateIso,
      estimated_completion_date: completionDateIso,
      weeks_completed: 0,
      total_paid: 0,
      wizard_completed_at: wizardCompletedAt,
      enrolled_at: nowIso,
      updated_at: nowIso,
    };

    const { data: updatedDeal, error: updateErr } = await supabase
      .from('deals')
      .update(updatePayload)
      .eq('id', deal_id)
      .select('id, status, enrollment_date, merchant_dba, merchant_name')
      .single();

    if (updateErr) {
      return NextResponse.json(
        { error: `failed to enroll deal: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // ── 8. Audit log (best-effort) ─────────────────────────────────
    // Uses a generic deal_audit_log table if present. Don't block the
    // enrollment if the table is missing — the migration for it may
    // not have been applied yet.
    try {
      await supabase.from('deal_audit_log').insert({
        deal_id,
        admin_user_id: caller.userId,
        action: 'admin_manual_enroll',
        payload: updatePayload,
        created_at: nowIso,
      });
    } catch (auditErr) {
      console.warn('[enroll-deal] audit insert failed (non-fatal):', auditErr?.message);
    }

    return NextResponse.json({
      success: true,
      deal_id,
      enrollment_date: enrollmentDateIso,
      merchant_name: updatedDeal?.merchant_dba || updatedDeal?.merchant_name || null,
      role_flipped: ownerRole !== 'business_owner',
      wizard_skipped: !!skip_wizard_complete,
      message: 'Deal enrolled successfully',
    });
  } catch (err) {
    console.error('[enroll-deal] unexpected error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

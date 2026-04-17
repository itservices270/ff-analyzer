import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';
import { resolveUser } from '../../../../lib/auth';

// Merchant (business_owner) dashboard endpoint.
//
// Scope — deal-level fields ONLY. Explicitly does NOT read or
// expose the `positions` table, individual funder data, TAD splits,
// FF/ISO fees, or anything else that violates the April 14, 2026
// BO content rules. Removing positions here is defense-in-depth so
// a future client-side bug can't leak funder-level info that never
// leaves the server.
//
// If you need per-funder data for an ISO/admin view, use
// /api/dashboard/iso or /api/deals/:id — NOT this route.

export async function OPTIONS(request) {
  return optionsResponse(request);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only the deal columns the BO frontend renders — no positions, no
// fees, no factor rate, no TAD. Keep this list tight so drifting new
// columns in `deals` don't accidentally start reaching merchants.
const BO_DEAL_COLUMNS = [
  // identity
  'id', 'merchant_name', 'merchant_dba',
  'status', 'enrollment_status',
  // hero row + progress
  'merchant_weekly_payment',
  'weeks_completed', 'program_term_weeks',
  // savings block
  'original_weekly_burden', 'total_weekly_burden',
  // payments disclosure (set at agreement signing / admin enrollment)
  'disclosed_payback',
  'cost_display_value', 'cost_display_label', 'cost_display_note',
  'total_paid',
  // dates
  'enrollment_date', 'program_start_date', 'estimated_completion_date',
  'enrolled_at', 'approved_at',
  'wizard_completed_at',
  // account page
  'owner_phone',
  // ordering
  'updated_at',
].join(', ');

// ── Ledger helpers ──────────────────────────────────────────────
// Build the merchant's weekly payment ledger on the fly from deal
// fields. Intentionally does NOT query the `payments` or
// `payment_schedules` tables — those stay reserved for real ACH
// reconciliation once Dwolla/Stripe is wired up.
function firstWednesdayOnOrAfter(dateStr) {
  const d = new Date(`${String(dateStr).split('T')[0]}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun, 3=Wed
  const delta = (3 - day + 7) % 7;
  if (delta > 0) d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

function generateLedger(deal, weeksCompleted) {
  const startRaw =
    deal.enrollment_date ||
    deal.program_start_date ||
    deal.enrolled_at ||
    deal.approved_at ||
    null;
  const termWeeks = parseInt(deal.program_term_weeks, 10) || 0;
  const weekly = parseFloat(deal.merchant_weekly_payment) || 0;
  if (!startRaw || !termWeeks || !weekly) return [];

  const firstDate = firstWednesdayOnOrAfter(startRaw);
  const ledger = [];
  for (let i = 1; i <= termWeeks; i++) {
    const d = new Date(firstDate);
    d.setUTCDate(firstDate.getUTCDate() + (i - 1) * 7);
    let status;
    if (i <= weeksCompleted) status = 'paid';
    else if (i === weeksCompleted + 1) status = 'scheduled';
    else status = 'upcoming';
    ledger.push({
      week: i,
      date: d.toISOString().split('T')[0],
      amount: weekly,
      status,
    });
  }
  return ledger;
}

export async function GET(request) {
  try {
    // Auth — resolveUser handles the impersonation cookie natively.
    // When admin is in God Mode, caller.userId is the IMPERSONATION
    // TARGET's id (not the admin's), so the downstream query scopes
    // correctly for both real BO logins and admin-as-merchant.
    // Non-fatal if it throws; we'll fall through to the legacy
    // wp_user_id query param for unauthenticated internal callers.
    let caller = null;
    try {
      caller = await resolveUser(request);
    } catch {
      /* fall through to query-param fallback */
    }

    // Primary source: caller.userId from resolveUser.
    // Secondary: wp_user_id query param (legacy contract — some
    // callers still pass it for the pre-cookie flow).
    const { searchParams } = new URL(request.url);
    const queryUserId = searchParams.get('wp_user_id') || '';
    const targetUserId = caller?.userId || queryUserId || '';

    if (!targetUserId) {
      return jsonResponse(
        { error: 'wp_user_id is required' },
        400,
        request
      );
    }
    if (!UUID_RE.test(targetUserId)) {
      return jsonResponse(
        { error: 'wp_user_id must be a valid UUID' },
        400,
        request
      );
    }

    // Admin viewing /dashboard/bo without impersonating a specific
    // merchant → no deal to render. God Mode "preview all merchants"
    // is not something this endpoint supports; admins should either
    // impersonate a specific merchant or use /dashboard/admin for
    // the unfiltered overview. Return an empty deal so the BO
    // frontend handles it as "no data" without a 404.
    const adminNoImpersonation =
      caller?.isAdmin && !caller?.isImpersonating;
    if (adminNoImpersonation) {
      return jsonResponse({ deal: null }, 200, request);
    }

    // Lookup the most-recent deal owned by this user. The `deals`
    // table has both `user_id` (newer submit flow) and `wp_user_id`
    // (pre-migration column); different code paths write different
    // ones, so check `user_id` first and fall back to `wp_user_id`.
    // Two separate .eq() queries (rather than a single .or()) keeps
    // PostgREST filter strings out of the hot path — safer vs.
    // any surprising characters in targetUserId.
    let deal = null;

    const byUserId = await supabase
      .from('deals')
      .select(BO_DEAL_COLUMNS)
      .eq('user_id', targetUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byUserId.error) {
      return jsonResponse(
        { error: byUserId.error.message },
        500,
        request
      );
    }
    if (byUserId.data) {
      deal = byUserId.data;
    } else {
      const byWpUserId = await supabase
        .from('deals')
        .select(BO_DEAL_COLUMNS)
        .eq('wp_user_id', targetUserId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byWpUserId.error) {
        return jsonResponse(
          { error: byWpUserId.error.message },
          500,
          request
        );
      }
      deal = byWpUserId.data || null;
    }

    if (!deal) {
      // Merchant has no deal yet (post-signup, pre-submit) — return
      // null rather than 404 so the BO frontend can render its
      // empty-state UI without treating this as an error.
      return jsonResponse({ deal: null }, 200, request);
    }

    // ── Compute derived fields ────────────────────────────────────
    const weeksCompleted = parseInt(deal.weeks_completed, 10) || 0;
    const termWeeks = parseInt(deal.program_term_weeks, 10) || 0;
    const progressPct =
      termWeeks > 0 ? Math.round((weeksCompleted / termWeeks) * 100) : 0;

    // Original weekly burden — prefer the dedicated field, fall back
    // to total_weekly_burden (the sum of position weekly payments at
    // submit time) if the newer column wasn't populated on this deal.
    const originalBurden =
      parseFloat(deal.original_weekly_burden) ||
      parseFloat(deal.total_weekly_burden) ||
      0;

    const payment_ledger = generateLedger(deal, weeksCompleted);

    // Best-available enrollment date for display (in order of
    // preference). The BO frontend reads `enrolled_at || approved_at`
    // separately, so expose those raw too.
    const enrollmentDate =
      deal.enrollment_date ||
      deal.program_start_date ||
      deal.enrolled_at ||
      deal.approved_at ||
      null;

    const merchantWeekly = parseFloat(deal.merchant_weekly_payment) || 0;

    return jsonResponse(
      {
        deal: {
          id: deal.id,
          merchant_name: deal.merchant_name,
          merchant_dba: deal.merchant_dba,
          status: deal.status,
          enrollment_status: deal.enrollment_status,

          // Hero row
          merchant_weekly_payment: merchantWeekly,
          // Legacy alias — BO Home reads `weekly_payment` first
          weekly_payment: merchantWeekly,
          weeks_completed: weeksCompleted,
          program_term_weeks: termWeeks,
          progress_pct: progressPct,

          // Savings block
          original_weekly_burden: originalBurden,
          total_weekly_burden: parseFloat(deal.total_weekly_burden) || 0,

          // Payments disclosure (nullable until agreement signing /
          // admin enrollment populates them)
          disclosed_payback:
            deal.disclosed_payback != null
              ? parseFloat(deal.disclosed_payback)
              : null,
          cost_display_value:
            deal.cost_display_value != null
              ? parseFloat(deal.cost_display_value)
              : null,
          cost_display_label: deal.cost_display_label || null,
          cost_display_note: deal.cost_display_note || null,
          total_paid: parseFloat(deal.total_paid) || 0,

          // Dates
          enrollment_date: enrollmentDate,
          program_start_date: deal.program_start_date || null,
          estimated_completion_date: deal.estimated_completion_date || null,
          enrolled_at: deal.enrolled_at || null,
          approved_at: deal.approved_at || null,
          wizard_completed_at: deal.wizard_completed_at || null,

          // Account page
          owner_phone: deal.owner_phone || null,

          // Derived weekly ledger (generated on-the-fly, not from
          // the payments table)
          payment_ledger,
        },
      },
      200,
      request
    );
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

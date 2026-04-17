import { randomBytes } from 'crypto';
import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';
import { sendNewDealEmail } from '../../../../lib/notifications';
import { assertNotImpersonating } from '../../../../lib/auth';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

// ── Auth user helpers ──────────────────────────────────────────────
// Resolve an auth.users row by email. Two-path lookup:
//
//   Path 1 — public.users (authoritative for users created via this
//   route). This submit handler always writes auth.users and then
//   upserts public.users with the SAME UUID as the primary key, so
//   public.users is a reliable email→id index for anything we've
//   previously created. Deterministic, no pagination, no consistency
//   lag. A public.users hit without a matching auth.users row is a
//   legacy orphan from a pre-fix submit; fall through to Path 2.
//
//   Path 2 — paginated listUsers fallback. Catches users created
//   through other admin tooling (Supabase dashboard, backfill
//   scripts). Capped at 20,000 users via 20 pages × 1000.
//
// Why the previous single-page listUsers approach broke:
//   - `listUsers({ page: 1, perPage: 1000 })` missed newly-created
//     users in two cases — pagination (auth.users > 1000 rows) and
//     eventual-consistency lag between createUser and listUsers.
//     Test 6 (duplicate-email idempotency) caught this in preview.
async function findAuthUserByEmail(email) {
  if (!email) return null;
  const normalizedEmail = email.toLowerCase();

  // Path 1: public.users by email → getUserById to confirm.
  try {
    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (profileErr) {
      console.warn('[findAuthUserByEmail] public.users lookup failed:', profileErr.message);
    } else if (profile?.id) {
      const { data: authData, error: authErr } =
        await supabase.auth.admin.getUserById(profile.id);
      if (authErr) {
        console.warn(
          '[findAuthUserByEmail] getUserById failed for',
          profile.id,
          ':',
          authErr.message
        );
      } else if (authData?.user) {
        return authData.user;
      }
      // public hit + auth miss → legacy orphan; fall through to Path 2
    }
  } catch (err) {
    console.warn('[findAuthUserByEmail] public.users path threw:', err?.message);
  }

  // Path 2: paginated listUsers fallback.
  try {
    const perPage = 1000;
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.warn('[findAuthUserByEmail] listUsers page', page, 'failed:', error.message);
        return null;
      }
      const users = data?.users || [];
      const match = users.find(
        (u) => (u.email || '').toLowerCase() === normalizedEmail
      );
      if (match) return match;
      if (users.length < perPage) return null; // last page
    }
  } catch (err) {
    console.warn('[findAuthUserByEmail] listUsers path threw:', err?.message);
  }

  return null;
}

// Random temp password — the merchant never sees this. They get in
// later via magic link / password reset (admin sets or wizard-issues
// on enrollment; see CIRCLE-BACK-LIST welcome-email item).
function generateTempPassword() {
  return randomBytes(18).toString('base64');
}

export async function POST(request) {
  try {
    try {
      await assertNotImpersonating(request);
    } catch (e) {
      return jsonResponse({ error: e.error }, e.status, request);
    }
    const body = await request.json();
    const {
      business_name, dba, entity_type, ein, state_incorporated,
      street_address, suite_unit, city, state, zip,
      monthly_revenue, industry,
      owner_first, owner_last, owner_dob, owner_phone, owner_email, ownership_pct,
      owner_street, owner_suite, owner_city, owner_state, owner_zip,
      positions = [],
      documents = [],
      iso_wp_user_id,
      assigned_rep_id,
    } = body;

    if (!business_name || !iso_wp_user_id) {
      return jsonResponse({ error: 'business_name and iso_wp_user_id are required' }, 400, request);
    }

    // ── Resolve or create the merchant's auth.users + public.users ──
    // Every merchant owner gets an auth.users row FIRST, then a matching
    // public.users row with the SAME UUID. This is the fix for the
    // orphan bug surfaced in tonight's A-Prime preflight: previously
    // the submit path created only a public.users row, so downstream
    // admin-enrollment via supabase.auth.admin.getUserById() hit "owner
    // user not found in auth" for every deal.
    //
    // Flow:
    //   1. Look up auth.users by email. If found, reuse its UUID.
    //   2. If not found, create via supabase.auth.admin.createUser with
    //      a random temp password + email_confirm: true so there's no
    //      inbox ping at submit time. Merchant gets a magic-link / pw
    //      reset out-of-band (admin for V1; welcome-email flow for V2).
    //   3. Upsert the public.users row with the SAME id so both tables
    //      agree. onConflict: 'id' means a prior submit under the same
    //      email updates the profile fields in place rather than
    //      duplicating.
    //
    // If owner_email is not provided, skip auth + profile creation and
    // leave deals.user_id null — preserves the pre-fix behavior for
    // unusual email-less submissions. The form requires email in
    // practice, so this branch is defensive only.
    let merchantUserId = null;
    if (owner_email) {
      // 1. Resolve or create auth.users
      let authUser = await findAuthUserByEmail(owner_email);
      if (!authUser) {
        const { data: created, error: authErr } = await supabase.auth.admin.createUser({
          email: owner_email,
          password: generateTempPassword(),
          email_confirm: true,
          user_metadata: {
            role: 'business_owner',
            first_name: owner_first || null,
            last_name: owner_last || null,
          },
        });

        if (authErr) {
          // Duplicate-recovery: if the lookup missed an existing user
          // but Supabase Auth rejects the duplicate, re-resolve via
          // findAuthUserByEmail (which will hit the public.users path
          // this time IF a prior submit wrote the mirror row, or the
          // listUsers fallback otherwise). Handles the race between
          // two near-simultaneous submits AND the listUsers
          // consistency-lag case that Test 6 exposed on the preview.
          const msg = (authErr.message || '').toLowerCase();
          const isDuplicate =
            msg.includes('already been registered') ||
            msg.includes('already exists') ||
            authErr.code === 'email_exists' ||
            authErr.status === 422;

          if (isDuplicate) {
            console.warn(
              '[deals/submit] createUser reported duplicate for',
              owner_email,
              '— recovering via findAuthUserByEmail'
            );
            authUser = await findAuthUserByEmail(owner_email);
            if (!authUser) {
              console.error(
                '[deals/submit] duplicate reported but user not resolvable for',
                owner_email
              );
              return jsonResponse(
                { error: 'Could not resolve merchant account after duplicate-email error' },
                500,
                request
              );
            }
          } else {
            console.error('[deals/submit] createUser failed:', authErr.message);
            return jsonResponse(
              { error: 'Failed to create merchant auth user: ' + authErr.message },
              500,
              request
            );
          }
        } else if (!created?.user) {
          return jsonResponse(
            { error: 'Failed to create merchant auth user: no user returned' },
            500,
            request
          );
        } else {
          authUser = created.user;
        }
      }
      merchantUserId = authUser.id;

      // 2. Upsert the public.users mirror row on the same UUID
      const { error: profileErr } = await supabase
        .from('users')
        .upsert(
          {
            id: merchantUserId,
            email: owner_email,
            first_name: owner_first,
            last_name: owner_last,
            phone: owner_phone,
            role: 'business_owner',
            street_address: owner_street,
            suite_unit: owner_suite,
            city: owner_city,
            state: owner_state,
            zip: owner_zip,
          },
          { onConflict: 'id' }
        );
      if (profileErr) {
        return jsonResponse(
          { error: 'Failed to create merchant profile: ' + profileErr.message },
          500,
          request
        );
      }
    }

    // Create deal record
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert({
        merchant_name: business_name,
        merchant_dba: dba || business_name,
        merchant_ein: ein,
        merchant_state: state_incorporated || state,
        merchant_industry: industry,
        merchant_contact_name: `${owner_first || ''} ${owner_last || ''}`.trim(),
        merchant_contact_email: owner_email,
        merchant_contact_phone: owner_phone,
        monthly_revenue: parseFloat(monthly_revenue) || 0,
        entity_type,
        street_address,
        suite_unit,
        city,
        state,
        zip,
        owner_first,
        owner_last,
        owner_dob,
        owner_phone,
        owner_email,
        ownership_pct: parseFloat(ownership_pct) || 100,
        owner_street,
        owner_suite,
        owner_city,
        owner_state,
        owner_zip,
        iso_wp_user_id,
        assigned_rep_id: assigned_rep_id || null,
        user_id: merchantUserId,
        status: 'submitted',
        enrollment_status: 'submitted',
        position_count: positions.length,
        total_balance: 0,
        total_weekly_burden: 0,
      })
      .select()
      .single();

    if (dealError) {
      return jsonResponse({ error: dealError.message }, 500, request);
    }

    // Insert positions
    let totalBalance = 0;
    let totalWeeklyBurden = 0;

    if (positions.length > 0) {
      const positionRows = positions.map((p, idx) => {
        const balance = parseFloat(p.estimated_balance) || 0;
        const payment = parseFloat(p.current_weekly_payment) || 0;
        const freq = (p.frequency || 'weekly').toLowerCase();
        // Normalize user-entered payment to weekly for storage
        let weeklyPayment = payment;
        if (freq === 'daily') weeklyPayment = payment * 5;
        else if (freq === 'bi-weekly' || freq === 'biweekly') weeklyPayment = payment / 2;
        else if (freq === 'monthly') weeklyPayment = payment / 4.33;

        totalBalance += balance;
        totalWeeklyBurden += weeklyPayment;

        return {
          deal_id: deal.id,
          funder_name: p.funder_name,
          estimated_balance: balance,
          current_weekly_payment: weeklyPayment,
          daily_payment: freq === 'daily' ? payment : weeklyPayment / 5,
          payment_frequency: freq,
          payments_modified: p.payments_modified || false,
          position_order: idx + 1,
          status: 'active',
          source: 'iso_submission',
        };
      });

      const { error: posError } = await supabase.from('positions').insert(positionRows);
      if (posError) {
        return jsonResponse({ error: 'Failed to create positions: ' + posError.message }, 500, request);
      }
    }

    // Update deal totals
    await supabase
      .from('deals')
      .update({
        total_balance: Math.round(totalBalance * 100) / 100,
        total_weekly_burden: Math.round(totalWeeklyBurden * 100) / 100,
        position_count: positions.length,
      })
      .eq('id', deal.id);

    // Insert documents
    if (documents.length > 0) {
      const docRows = documents.map(d => ({
        deal_id: deal.id,
        document_type: d.type,
        file_url: d.file_url,
        file_name: d.file_name,
        uploaded_by: merchantUserId,
      }));

      await supabase.from('deal_documents').insert(docRows);
    }

    // Fetch complete deal with positions
    const { data: fullDeal } = await supabase
      .from('deals')
      .select('*, positions(*)')
      .eq('id', deal.id)
      .single();

    // Best-effort ops notification — never block or fail the submit on email errors
    try {
      let isoName = null;
      if (iso_wp_user_id) {
        const { data: isoUser } = await supabase
          .from('users')
          .select('first_name, last_name, email')
          .eq('id', iso_wp_user_id)
          .maybeSingle();
        if (isoUser) {
          isoName =
            [isoUser.first_name, isoUser.last_name].filter(Boolean).join(' ').trim() ||
            isoUser.email ||
            null;
        }
      }

      // Look up the assigned rep so we can include their contact info
      let repInfo = null;
      if (assigned_rep_id) {
        const { data: repRow } = await supabase
          .from('iso_reps')
          .select('first_name, last_name, title, email, phone')
          .eq('id', assigned_rep_id)
          .maybeSingle();
        if (repRow) repInfo = repRow;
      }

      await sendNewDealEmail({
        deal: fullDeal || deal,
        isoName,
        totalEstimatedDebt: totalBalance,
        repInfo,
      });
    } catch (notifyErr) {
      console.error('[submit] notification dispatch failed:', notifyErr);
    }

    return jsonResponse(fullDeal, 201, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

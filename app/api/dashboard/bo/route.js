import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

// ── Ledger helpers ──────────────────────────────────────────────
// Shift a date forward to the first Wednesday on or after it.
// Supabase stores dates as 'YYYY-MM-DD' strings; use UTC to avoid
// timezone drift pushing the week boundary around.
function firstWednesdayOnOrAfter(dateStr) {
  const d = new Date(`${String(dateStr).split('T')[0]}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun, 3=Wed
  const delta = (3 - day + 7) % 7;
  if (delta > 0) d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

// Build a merchant-facing payment ledger on the fly from deal fields.
// No `payments` table reads — that table stays reserved for real ACH
// reconciliation. Status derives from `weeksCompleted`:
//   week <= completed         → 'paid'
//   week === completed + 1    → 'scheduled'  (next upcoming)
//   week  >  completed + 1    → 'upcoming'
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
    const { searchParams } = new URL(request.url);
    const wpUserId = searchParams.get('wp_user_id');

    if (!wpUserId) {
      return jsonResponse({ error: 'wp_user_id is required' }, 400, request);
    }

    // God Mode: admins get an unfiltered view of every merchant deal.
    // Source of truth is Supabase Auth user_metadata.role via the admin
    // API (service-role client). Public users table is a fallback.
    let isAdmin = false;
    try {
      const { data: authLookup, error: authErr } = await supabase.auth.admin.getUserById(wpUserId);
      if (!authErr) {
        const meta = authLookup?.user?.user_metadata || {};
        const appMeta = authLookup?.user?.app_metadata || {};
        const role = (meta.role || appMeta.role || '').toString().toLowerCase();
        if (role === 'admin') isAdmin = true;
      }
      if (!isAdmin) {
        const { data: meRow } = await supabase
          .from('users')
          .select('role')
          .eq('id', wpUserId)
          .maybeSingle();
        if ((meRow?.role || '').toLowerCase() === 'admin') isAdmin = true;
      }
    } catch (e) {
      console.warn('[dashboard/bo] admin role lookup failed:', e?.message);
    }
    console.log('[dashboard/bo] wp_user_id=%s isAdmin=%s', wpUserId, isAdmin);

    // Get the deal(s) for this merchant (or the 25 most recent in God Mode)
    let dealsQuery = supabase
      .from('deals')
      .select(`
        id, merchant_name, merchant_dba, status, enrollment_status,
        total_balance, total_weekly_burden, current_dsr, proposed_dsr,
        merchant_weekly_payment, position_count, monthly_revenue,
        total_savings, original_weekly_burden, created_at, updated_at,
        enrollment_date, program_start_date, enrolled_at, approved_at,
        program_term_weeks, estimated_completion_date,
        disclosed_payback, cost_display_value, cost_display_label, cost_display_note,
        positions(
          id, funder_name, estimated_balance, current_weekly_payment,
          agreement_status, status, funder_legal_name, payment_frequency,
          settled_amount, settled_date, payments_made, payments_remaining
        )
      `)
      .order('created_at', { ascending: false });

    if (isAdmin) {
      dealsQuery = dealsQuery.limit(25);
    } else {
      dealsQuery = dealsQuery.eq('wp_user_id', wpUserId);
    }

    const { data: deals, error: dealsError } = await dealsQuery;

    if (dealsError) {
      return jsonResponse({ error: dealsError.message }, 500, request);
    }

    if (!deals || deals.length === 0) {
      return jsonResponse({ error: 'No deals found for this user' }, 404, request);
    }

    // Primary deal (most recent active)
    const deal = deals.find(d => d.status === 'active' || d.status === 'enrolled') || deals[0];

    // Get next payment info
    const { data: nextPayment } = await supabase
      .from('payment_schedules')
      .select('payment_date, amount, status')
      .eq('deal_id', deal.id)
      .eq('status', 'scheduled')
      .gte('payment_date', new Date().toISOString().split('T')[0])
      .order('payment_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    // Get payment history summary
    const { data: payments } = await supabase
      .from('payments')
      .select('id, amount, payment_date, status, week_number')
      .eq('deal_id', deal.id)
      .order('payment_date', { ascending: false });

    const totalPaid = (payments || [])
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const weeksCompleted = (payments || []).filter(p => p.status === 'completed').length;

    // Compute progress
    const originalBurden = parseFloat(deal.original_weekly_burden) || parseFloat(deal.total_weekly_burden) || 0;
    const totalBalance = parseFloat(deal.total_balance) || 0;
    const remaining = Math.max(0, totalBalance - totalPaid);
    const progressPct = totalBalance > 0 ? Math.round((totalPaid / totalBalance) * 100) : 0;

    // Get onboarding wizard state
    const { data: onboarding } = await supabase
      .from('merchant_onboarding')
      .select('*')
      .eq('deal_id', deal.id)
      .maybeSingle();

    // Build merchant-facing payment ledger from deal fields (not payments table)
    const payment_ledger = generateLedger(deal, weeksCompleted);

    // Pick the best available enrollment / completion dates to expose
    const enrollmentDate =
      deal.enrollment_date ||
      deal.program_start_date ||
      deal.enrolled_at ||
      deal.approved_at ||
      null;

    return jsonResponse({
      deal: {
        id: deal.id,
        merchant_name: deal.merchant_name,
        merchant_dba: deal.merchant_dba,
        status: deal.status,
        enrollment_status: deal.enrollment_status,
        weekly_payment: parseFloat(deal.merchant_weekly_payment) || 0,
        merchant_weekly_payment: parseFloat(deal.merchant_weekly_payment) || 0,
        weeks_completed: weeksCompleted,
        program_term_weeks: parseInt(deal.program_term_weeks, 10) || 0,
        enrollment_date: enrollmentDate,
        estimated_completion_date: deal.estimated_completion_date || null,
        total_paid: Math.round(totalPaid * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        total_balance: totalBalance,
        total_savings: parseFloat(deal.total_savings) || 0,
        original_weekly_burden: originalBurden,
        current_dsr: parseFloat(deal.current_dsr) || 0,
        proposed_dsr: parseFloat(deal.proposed_dsr) || 0,
        progress_pct: progressPct,
        // Merchant-facing pricing disclosure (null until set at agreement signing)
        disclosed_payback: deal.disclosed_payback != null ? parseFloat(deal.disclosed_payback) : null,
        cost_display_value: deal.cost_display_value != null ? parseFloat(deal.cost_display_value) : null,
        cost_display_label: deal.cost_display_label || null,
        cost_display_note: deal.cost_display_note || null,
        // Derived weekly ledger (generated, not from payments table)
        payment_ledger,
      },
      positions: (deal.positions || []).map(p => ({
        id: p.id,
        funder_name: p.funder_name,
        funder_legal_name: p.funder_legal_name,
        estimated_balance: parseFloat(p.estimated_balance) || 0,
        current_weekly_payment: parseFloat(p.current_weekly_payment) || 0,
        agreement_status: p.agreement_status || 'pending',
        status: p.status,
        payment_frequency: p.payment_frequency,
        settled_amount: parseFloat(p.settled_amount) || 0,
        settled_date: p.settled_date,
        payments_made: p.payments_made || 0,
        payments_remaining: p.payments_remaining || 0,
      })),
      next_payment: nextPayment ? {
        date: nextPayment.payment_date,
        amount: parseFloat(nextPayment.amount) || 0,
      } : null,
      onboarding: onboarding || null,
    }, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const wpUserId = searchParams.get('wp_user_id');

    if (!wpUserId) {
      return jsonResponse({ error: 'wp_user_id is required' }, 400, request);
    }

    // God Mode: admins get an unfiltered view of every merchant deal
    let isAdmin = false;
    try {
      const { data: meRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', wpUserId)
        .maybeSingle();
      if ((meRow?.role || '').toLowerCase() === 'admin') isAdmin = true;
    } catch {
      // non-fatal — default to merchant-filtered view on lookup errors
    }

    // Get the deal(s) for this merchant (or the 25 most recent in God Mode)
    let dealsQuery = supabase
      .from('deals')
      .select(`
        id, merchant_name, merchant_dba, status, enrollment_status,
        total_balance, total_weekly_burden, current_dsr, proposed_dsr,
        merchant_weekly_payment, position_count, monthly_revenue,
        total_savings, original_weekly_burden, created_at, updated_at,
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

    return jsonResponse({
      deal: {
        id: deal.id,
        merchant_name: deal.merchant_name,
        merchant_dba: deal.merchant_dba,
        status: deal.status,
        enrollment_status: deal.enrollment_status,
        weekly_payment: parseFloat(deal.merchant_weekly_payment) || 0,
        weeks_completed: weeksCompleted,
        total_paid: Math.round(totalPaid * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        total_balance: totalBalance,
        total_savings: parseFloat(deal.total_savings) || 0,
        original_weekly_burden: originalBurden,
        current_dsr: parseFloat(deal.current_dsr) || 0,
        proposed_dsr: parseFloat(deal.proposed_dsr) || 0,
        progress_pct: progressPct,
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

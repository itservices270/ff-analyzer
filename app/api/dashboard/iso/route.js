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

    // Get all deals for this ISO
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select(`
        id, merchant_name, merchant_dba, status, enrollment_status,
        total_balance, total_weekly_burden, current_dsr, proposed_dsr,
        merchant_weekly_payment, position_count, created_at, updated_at,
        positions(id, funder_name, estimated_balance, current_weekly_payment, agreement_status, status)
      `)
      .eq('iso_wp_user_id', wpUserId)
      .order('updated_at', { ascending: false });

    if (dealsError) {
      return jsonResponse({ error: dealsError.message }, 500, request);
    }

    // Compute summary stats
    const activeDealIds = [];
    let activeCount = 0;
    let enrolledCount = 0;
    let submittedCount = 0;
    const needsAttention = [];

    for (const deal of deals || []) {
      if (deal.status === 'active' || deal.status === 'enrolled' || deal.status === 'priced') {
        activeCount++;
        activeDealIds.push(deal.id);
      }
      if (deal.enrollment_status === 'enrolled') enrolledCount++;
      if (deal.enrollment_status === 'submitted' || deal.status === 'submitted') submittedCount++;
      if (deal.enrollment_status === 'pending' || deal.enrollment_status === 'priced') {
        needsAttention.push({
          id: deal.id,
          merchant_name: deal.merchant_name,
          merchant_dba: deal.merchant_dba,
          enrollment_status: deal.enrollment_status,
          status: deal.status,
          updated_at: deal.updated_at,
        });
      }
    }

    // Recent commission payments for this ISO
    const { data: recentCommissions } = await supabase
      .from('iso_commissions')
      .select('id, deal_id, amount, status, payment_date, created_at')
      .eq('iso_wp_user_id', wpUserId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Build recent activity from deals (last 10 status changes)
    const recentActivity = (deals || [])
      .slice(0, 10)
      .map(d => ({
        deal_id: d.id,
        merchant_name: d.merchant_name,
        status: d.status,
        enrollment_status: d.enrollment_status,
        updated_at: d.updated_at,
      }));

    return jsonResponse({
      active_deals: activeCount,
      enrolled_deals: enrolledCount,
      submitted_deals: submittedCount,
      total_deals: (deals || []).length,
      needs_attention: needsAttention,
      recent_activity: recentActivity,
      recent_commissions: recentCommissions || [],
      deals: deals || [],
    }, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

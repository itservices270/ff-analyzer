import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const wpUserId = searchParams.get('wp_user_id');
    const role = searchParams.get('role');

    if (!wpUserId) {
      return jsonResponse({ error: 'wp_user_id is required' }, 400, request);
    }
    if (!role || !['iso', 'merchant'].includes(role)) {
      return jsonResponse({ error: 'role must be "iso" or "merchant"' }, 400, request);
    }

    const userColumn = role === 'iso' ? 'iso_wp_user_id' : 'wp_user_id';

    const { data, error } = await supabase
      .from('deals')
      .select(`
        id, merchant_name, merchant_dba, status, enrollment_status,
        total_balance, total_weekly_burden, current_dsr, proposed_dsr,
        merchant_weekly_payment, position_count, monthly_revenue,
        iso_name, created_at, updated_at,
        positions(id, funder_name, estimated_balance, current_weekly_payment, agreement_status, status)
      `)
      .eq(userColumn, wpUserId)
      .order('updated_at', { ascending: false });

    if (error) {
      return jsonResponse({ error: error.message }, 500, request);
    }

    return jsonResponse({ deals: data || [] }, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

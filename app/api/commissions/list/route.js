import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const isoWpUserId = searchParams.get('iso_wp_user_id');

    if (!isoWpUserId) {
      return jsonResponse({ error: 'iso_wp_user_id is required' }, 400, request);
    }

    const { data, error } = await supabase
      .from('iso_commissions')
      .select('*, deals(merchant_name, merchant_dba)')
      .eq('iso_wp_user_id', isoWpUserId)
      .order('created_at', { ascending: false });

    if (error) {
      return jsonResponse({ error: error.message }, 500, request);
    }

    const commissions = data || [];
    const totalEarned = commissions.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
    const totalPaid = commissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
    const pending = commissions
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);

    // Group by deal
    const byDeal = {};
    for (const c of commissions) {
      if (!byDeal[c.deal_id]) {
        byDeal[c.deal_id] = {
          deal_id: c.deal_id,
          merchant_name: c.deals?.merchant_name || 'Unknown',
          merchant_dba: c.deals?.merchant_dba || '',
          total: 0,
          paid: 0,
          pending: 0,
          entries: [],
        };
      }
      const amount = parseFloat(c.amount) || 0;
      byDeal[c.deal_id].total += amount;
      if (c.status === 'paid') byDeal[c.deal_id].paid += amount;
      if (c.status === 'pending') byDeal[c.deal_id].pending += amount;
      byDeal[c.deal_id].entries.push(c);
    }

    return jsonResponse({
      summary: {
        total_earned: Math.round(totalEarned * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        pending: Math.round(pending * 100) / 100,
      },
      by_deal: Object.values(byDeal),
      commissions,
    }, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dealId = searchParams.get('deal_id');

    if (!dealId) {
      return jsonResponse({ error: 'deal_id is required' }, 400, request);
    }

    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('deal_id', dealId)
      .order('payment_date', { ascending: false });

    if (error) {
      return jsonResponse({ error: error.message }, 500, request);
    }

    // Compute summary
    const completed = (data || []).filter(p => p.status === 'completed');
    const totalPaid = completed.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalDistributed = completed.reduce((sum, p) => {
      const dist = p.funder_distribution;
      if (!dist) return sum;
      const distTotal = Object.values(dist).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      return sum + distTotal;
    }, 0);

    return jsonResponse({
      payments: data || [],
      summary: {
        total_payments: (data || []).length,
        completed_payments: completed.length,
        total_paid: Math.round(totalPaid * 100) / 100,
        total_distributed: Math.round(totalDistributed * 100) / 100,
      },
    }, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

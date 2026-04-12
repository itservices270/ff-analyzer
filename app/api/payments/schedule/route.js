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
      .from('payment_schedules')
      .select('*')
      .eq('deal_id', dealId)
      .order('payment_date', { ascending: true });

    if (error) {
      return jsonResponse({ error: error.message }, 500, request);
    }

    const scheduled = (data || []).filter(p => p.status === 'scheduled');
    const completed = (data || []).filter(p => p.status === 'completed');
    const upcoming = scheduled.filter(p => p.payment_date >= new Date().toISOString().split('T')[0]);

    return jsonResponse({
      schedule: data || [],
      summary: {
        total_scheduled: scheduled.length,
        completed: completed.length,
        upcoming: upcoming.length,
        next_payment: upcoming[0] || null,
      },
    }, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

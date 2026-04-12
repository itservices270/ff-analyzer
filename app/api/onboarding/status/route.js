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
      .from('merchant_onboarding')
      .select('*')
      .eq('deal_id', dealId)
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message }, 500, request);
    }

    if (!data) {
      return jsonResponse({
        deal_id: dealId,
        welcome_call_completed: false,
        step_1_completed: false,
        step_2_completed: false,
        step_3_completed: false,
        step_4_completed: false,
        hardship_email_sent: false,
      }, 200, request);
    }

    return jsonResponse(data, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

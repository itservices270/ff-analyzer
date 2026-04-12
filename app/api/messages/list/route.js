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
      .from('messages')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: true });

    if (error) {
      return jsonResponse({ error: error.message }, 500, request);
    }

    return jsonResponse({ messages: data || [] }, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { deal_id, user_id, position_id, contact_method, funder_name, description, merchant_response } = body;

    if (!deal_id || !funder_name) {
      return jsonResponse({ error: 'deal_id and funder_name are required' }, 400, request);
    }

    const { data, error } = await supabase
      .from('funder_contacts')
      .insert({
        deal_id,
        user_id: user_id || null,
        position_id: position_id || null,
        contact_method: contact_method || 'phone',
        funder_name,
        description: description || '',
        merchant_response: merchant_response || '',
      })
      .select()
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500, request);
    }

    return jsonResponse(data, 201, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

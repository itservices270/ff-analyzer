import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';
import { assertNotImpersonating } from '../../../../lib/auth';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

export async function POST(request) {
  try {
    try {
      await assertNotImpersonating(request);
    } catch (e) {
      return jsonResponse({ error: e.error }, e.status, request);
    }
    const body = await request.json();
    const { deal_id, sender_id, content, sender_role, sender_name } = body;

    if (!deal_id || !content) {
      return jsonResponse({ error: 'deal_id and content are required' }, 400, request);
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        deal_id,
        sender_id: sender_id || null,
        content,
        sender_role: sender_role || 'system',
        sender_name: sender_name || 'System',
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

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
    const { notification_id } = body;

    if (!notification_id) {
      return jsonResponse({ error: 'notification_id is required' }, 400, request);
    }

    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notification_id)
      .select()
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500, request);
    }

    return jsonResponse(data, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

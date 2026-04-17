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
    const { deal_id, step, completed, metadata } = body;

    if (!deal_id || !step) {
      return jsonResponse({ error: 'deal_id and step are required' }, 400, request);
    }

    // Valid steps
    const validSteps = [
      'welcome_call_completed',
      'step_1_completed', 'step_2_completed',
      'step_3_completed', 'step_4_completed',
      'hardship_email_sent',
    ];

    if (!validSteps.includes(step)) {
      return jsonResponse({ error: `Invalid step. Valid steps: ${validSteps.join(', ')}` }, 400, request);
    }

    // Check if onboarding record exists
    const { data: existing } = await supabase
      .from('merchant_onboarding')
      .select('id')
      .eq('deal_id', deal_id)
      .maybeSingle();

    const updateData = {
      [step]: completed !== false,
      ...(metadata ? { [`${step}_metadata`]: metadata } : {}),
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('merchant_onboarding')
        .update(updateData)
        .eq('deal_id', deal_id)
        .select()
        .single();
      if (error) return jsonResponse({ error: error.message }, 500, request);
      result = data;
    } else {
      const { data, error } = await supabase
        .from('merchant_onboarding')
        .insert({ deal_id, ...updateData })
        .select()
        .single();
      if (error) return jsonResponse({ error: error.message }, 500, request);
      result = data;
    }

    return jsonResponse(result, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

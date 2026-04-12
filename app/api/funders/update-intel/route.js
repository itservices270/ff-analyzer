import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      funder_id, deal_id, position_id,
      accepted_terms, leverage_used, lessons_learned,
      contact_id, outcome,
    } = body;

    if (!funder_id || !deal_id) {
      return jsonResponse({ error: 'funder_id and deal_id are required' }, 400, request);
    }

    // Create funder_deal_history record
    const { data: historyRecord, error: historyError } = await supabase
      .from('funder_deal_history')
      .insert({
        funder_id,
        deal_id,
        position_id: position_id || null,
        accepted_terms: accepted_terms || {},
        leverage_used: leverage_used || '',
        lessons_learned: lessons_learned || '',
        contact_id: contact_id || null,
        outcome: outcome || 'pending',
      })
      .select()
      .single();

    if (historyError) {
      return jsonResponse({ error: historyError.message }, 500, request);
    }

    // Update funder scores if outcome is resolved
    if (outcome === 'settled' || outcome === 'resolved') {
      // Increment deals_resolved count
      const { data: funder } = await supabase
        .from('funders')
        .select('deals_resolved, deals_total')
        .eq('id', funder_id)
        .single();

      if (funder) {
        await supabase
          .from('funders')
          .update({
            deals_resolved: (funder.deals_resolved || 0) + 1,
            deals_total: (funder.deals_total || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', funder_id);
      }
    }

    return jsonResponse(historyRecord, 201, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

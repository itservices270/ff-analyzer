import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const funderName = searchParams.get('funder_name');

    if (!funderName) {
      return jsonResponse({ error: 'funder_name is required' }, 400, request);
    }

    // Get funder record (fuzzy match on name)
    const { data: funders, error: funderError } = await supabase
      .from('funders')
      .select('*')
      .ilike('name', `%${funderName}%`);

    if (funderError) {
      return jsonResponse({ error: funderError.message }, 500, request);
    }

    const funder = funders?.[0] || null;

    // Get contacts from funder_directory
    let contacts = [];
    if (funder) {
      const { data: contactData } = await supabase
        .from('funder_directory')
        .select('*')
        .eq('funder_id', funder.id)
        .order('is_primary', { ascending: false });
      contacts = contactData || [];
    }

    // Get deal history
    let dealHistory = [];
    if (funder) {
      const { data: historyData } = await supabase
        .from('funder_deal_history')
        .select('*')
        .eq('funder_id', funder.id)
        .order('created_at', { ascending: false })
        .limit(20);
      dealHistory = historyData || [];
    }

    return jsonResponse({
      funder,
      contacts,
      deal_history: dealHistory,
    }, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

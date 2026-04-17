import { supabase } from '../../../../../lib/supabase';
import { NextResponse } from 'next/server';
import { assertNotImpersonating } from '../../../../../lib/auth';

// GET — All positions for a deal
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('deal_id', id)
      .order('position_order', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — Add a new position to a deal
export async function POST(request, { params }) {
  try {
    try {
      await assertNotImpersonating(request);
    } catch (e) {
      return NextResponse.json({ error: e.error }, { status: e.status });
    }
    const { id: deal_id } = await params;
    const body = await request.json();

    // Get current position count for ordering
    const { count } = await supabase
      .from('positions')
      .select('*', { count: 'exact', head: true })
      .eq('deal_id', deal_id);

    const positionData = {
      deal_id,
      funder_name: body.funder_name,
      funder_legal_name: body.funder_legal_name || body.funder_name,
      account_number: body.account_number || '',
      agreement_date: body.agreement_date || null,
      position_order: (count || 0) + 1,
      purchase_price: parseFloat(body.purchase_price) || 0,
      purchased_amount: parseFloat(body.purchased_amount) || 0,
      factor_rate: parseFloat(body.factor_rate) || 0,
      specified_percentage: parseFloat(body.specified_percentage) || 0,
      origination_fee: parseFloat(body.origination_fee) || 0,
      prior_balance_payoff: parseFloat(body.prior_balance_payoff) || 0,
      net_funding: parseFloat(body.net_funding) || 0,
      current_weekly_payment: parseFloat(body.current_weekly_payment) || 0,
      payment_frequency: body.payment_frequency || 'weekly',
      daily_payment: parseFloat(body.daily_payment) || 0,
      estimated_balance: parseFloat(body.estimated_balance) || 0,
      funder_claimed_balance: parseFloat(body.funder_claimed_balance) || 0,
      ach_descriptor: body.ach_descriptor || '',
      status: body.status || 'active',
      source: body.source || 'manual',
      notes: body.notes || '',
    };

    const { data: position, error: posError } = await supabase
      .from('positions')
      .insert(positionData)
      .select()
      .single();

    if (posError) {
      return NextResponse.json({ error: posError.message }, { status: 500 });
    }

    // Log in position_history
    await supabase.from('position_history').insert({
      position_id: position.id,
      deal_id,
      change_type: 'added',
      notes: `Position added: ${body.funder_name}`,
    });

    // Recalculate deal totals
    await recalcDealTotals(deal_id);

    return NextResponse.json(position, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function recalcDealTotals(dealId) {
  const { data: positions } = await supabase
    .from('positions')
    .select('estimated_balance, current_weekly_payment, status')
    .eq('deal_id', dealId)
    .in('status', ['active', 'negotiating', 'agreed']);

  const totalBalance = (positions || []).reduce((s, p) => s + (parseFloat(p.estimated_balance) || 0), 0);
  const totalWeekly = (positions || []).reduce((s, p) => s + (parseFloat(p.current_weekly_payment) || 0), 0);

  // Get deal gross profit for DSR
  const { data: deal } = await supabase.from('deals').select('gross_profit').eq('id', dealId).single();
  const gp = parseFloat(deal?.gross_profit) || 0;
  const gpWeekly = gp / 4.33;
  const currentDsr = gpWeekly > 0 ? Math.round(((totalWeekly / gpWeekly) * 100) * 100) / 100 : 0;

  await supabase
    .from('deals')
    .update({
      total_balance: Math.round(totalBalance * 100) / 100,
      total_weekly_burden: Math.round(totalWeekly * 100) / 100,
      position_count: (positions || []).length,
      current_dsr: currentDsr,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId);
}

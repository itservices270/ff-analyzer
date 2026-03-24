import { supabase } from '../../../../../../lib/supabase';
import { NextResponse } from 'next/server';

// PUT — Update a position
export async function PUT(request, { params }) {
  try {
    const { id: deal_id, positionId } = await params;
    const body = await request.json();

    // Get old values for history
    const { data: oldPos, error: fetchError } = await supabase
      .from('positions')
      .select('*')
      .eq('id', positionId)
      .eq('deal_id', deal_id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    }

    // Remove immutable fields
    delete body.id;
    delete body.deal_id;
    delete body.created_at;

    body.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('positions')
      .update(body)
      .eq('id', positionId)
      .eq('deal_id', deal_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log changes in history
    const changedFields = Object.keys(body).filter(
      (k) => k !== 'updated_at' && oldPos[k] !== body[k]
    );

    for (const field of changedFields) {
      await supabase.from('position_history').insert({
        position_id: positionId,
        deal_id,
        change_type: 'modified',
        field_changed: field,
        old_value: String(oldPos[field] ?? ''),
        new_value: String(body[field] ?? ''),
        notes: `${field} changed from ${oldPos[field]} to ${body[field]}`,
      });
    }

    // Recalculate deal totals
    await recalcDealTotals(deal_id);

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — Soft delete position (set status to excluded or paid_off)
export async function DELETE(request, { params }) {
  try {
    const { id: deal_id, positionId } = await params;
    const body = await request.json().catch(() => ({}));
    const newStatus = body.status === 'paid_off' ? 'paid_off' : 'excluded';

    const { data: oldPos } = await supabase
      .from('positions')
      .select('status, funder_name, current_weekly_payment')
      .eq('id', positionId)
      .eq('deal_id', deal_id)
      .single();

    const { data, error } = await supabase
      .from('positions')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', positionId)
      .eq('deal_id', deal_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log in history
    await supabase.from('position_history').insert({
      position_id: positionId,
      deal_id,
      change_type: 'status_change',
      field_changed: 'status',
      old_value: oldPos?.status || 'active',
      new_value: newStatus,
      notes: `Position ${oldPos?.funder_name || ''} set to ${newStatus}`,
    });

    // Recalculate deal totals
    await recalcDealTotals(deal_id);

    return NextResponse.json(data);
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

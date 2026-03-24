import { supabase } from '../../../lib/supabase';
import { NextResponse } from 'next/server';

// POST — Create a new deal with positions
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      merchant_name, merchant_dba, merchant_ein, merchant_state,
      merchant_industry, merchant_contact_name, merchant_contact_email,
      merchant_contact_phone, iso_name, iso_contact, iso_commission_points,
      monthly_revenue, monthly_cogs, gross_profit, avg_daily_balance,
      notes, positions = [],
    } = body;

    // Insert deal
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert({
        merchant_name,
        merchant_dba,
        merchant_ein,
        merchant_state,
        merchant_industry,
        merchant_contact_name,
        merchant_contact_email,
        merchant_contact_phone,
        iso_name,
        iso_contact,
        iso_commission_points: iso_commission_points || 0,
        monthly_revenue: monthly_revenue || 0,
        monthly_cogs: monthly_cogs || 0,
        gross_profit: gross_profit || 0,
        avg_daily_balance: avg_daily_balance || 0,
        total_balance: 0,
        total_weekly_burden: 0,
        position_count: positions.length,
        status: 'analysis',
      })
      .select()
      .single();

    if (dealError) {
      return NextResponse.json({ error: dealError.message }, { status: 500 });
    }

    // Insert positions
    let totalBalance = 0;
    let totalWeeklyBurden = 0;

    if (positions.length > 0) {
      const positionRows = positions.map((p, idx) => {
        const balance = parseFloat(p.estimated_balance) || 0;
        const weekly = parseFloat(p.current_weekly_payment || p.payment_amount_current || p.payment_amount) || 0;
        totalBalance += balance;
        totalWeeklyBurden += weekly;

        return {
          deal_id: deal.id,
          funder_name: p.funder_name,
          funder_legal_name: p.funder_legal_name || p.funder_name,
          account_number: p.account_number || '',
          agreement_date: p.agreement_date || null,
          position_order: idx + 1,
          purchase_price: parseFloat(p.purchase_price) || 0,
          purchased_amount: parseFloat(p.purchased_amount) || 0,
          factor_rate: parseFloat(p.factor_rate) || 0,
          specified_percentage: parseFloat(p.specified_percentage || p.specified_receivable_percentage) || 0,
          origination_fee: parseFloat(p.origination_fee) || 0,
          prior_balance_payoff: parseFloat(p.prior_balance_payoff) || 0,
          net_funding: parseFloat(p.net_funding) || 0,
          current_weekly_payment: weekly,
          payment_frequency: p.payment_frequency || p.frequency || 'weekly',
          daily_payment: parseFloat(p.daily_payment || p.payment_amount) || 0,
          estimated_balance: balance,
          funder_claimed_balance: parseFloat(p.funder_claimed_balance) || 0,
          ach_descriptor: p.ach_descriptor || '',
          status: p.status || 'active',
          source: p.source || 'analyzer',
          notes: p.notes || '',
        };
      });

      const { error: posError } = await supabase.from('positions').insert(positionRows);
      if (posError) {
        return NextResponse.json({ error: posError.message }, { status: 500 });
      }
    }

    // Update deal totals
    const currentDsr = (parseFloat(gross_profit) || 0) > 0
      ? Math.round(((totalWeeklyBurden / ((parseFloat(gross_profit) || 0) / 4.33)) * 100) * 100) / 100
      : 0;

    const { error: updateError } = await supabase
      .from('deals')
      .update({
        total_balance: Math.round(totalBalance * 100) / 100,
        total_weekly_burden: Math.round(totalWeeklyBurden * 100) / 100,
        current_dsr: currentDsr,
        position_count: positions.length,
      })
      .eq('id', deal.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Return full deal
    const { data: fullDeal } = await supabase
      .from('deals')
      .select('*, positions(*)')
      .eq('id', deal.id)
      .single();

    return NextResponse.json(fullDeal, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — List all deals
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    let query = supabase
      .from('deals')
      .select('id, merchant_name, merchant_dba, iso_name, status, position_count, total_balance, total_weekly_burden, current_dsr, merchant_weekly_payment, proposed_dsr, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.ilike('merchant_name', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

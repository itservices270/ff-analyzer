import { supabase } from '../../../../../lib/supabase';
import { calculatePricing, calculateEnforceabilityWeighted } from '../../../../../lib/pricing-engine';
import { NextResponse } from 'next/server';

// POST — Run pricing engine on a deal
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      iso_commission_points = 0,
      target_dsr = 0.20,
      ff_net_margin_weekly = 0,
      use_enforceability_weighting = false,
    } = body;

    // Fetch deal + positions
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('*, positions(*)')
      .eq('id', id)
      .single();

    if (dealError || !deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    const activePositions = (deal.positions || []).filter(
      (p) => p.status === 'active' || p.status === 'negotiating' || p.status === 'agreed'
    );

    if (activePositions.length === 0) {
      return NextResponse.json({ error: 'No active positions to price' }, { status: 400 });
    }

    // Run pricing engine
    const pricing = calculatePricing({
      positions: activePositions,
      grossProfit: parseFloat(deal.gross_profit) || 0,
      isoCommissionPoints: iso_commission_points,
      targetDsr: target_dsr,
      ffNetMarginWeekly: ff_net_margin_weekly,
    });

    // Optional: enforceability weighting
    let ewResults = null;
    if (use_enforceability_weighting) {
      ewResults = calculateEnforceabilityWeighted(activePositions, pricing.tad100);
    }

    // Update deal with pricing results
    const { error: dealUpdateError } = await supabase
      .from('deals')
      .update({
        iso_commission_points,
        tad_100: pricing.tad100,
        opening_tad: pricing.tad80,
        middle1_tad: pricing.tad90,
        middle2_tad: pricing.tad95,
        final_tad: pricing.tad100,
        ff_weekly_fee: pricing.ffWeeklyFee,
        merchant_weekly_payment: pricing.merchantWeeklyPayment,
        max_funder_term_weeks: pricing.maxTermWeeks,
        proposed_dsr: pricing.proposedDsr,
        effective_factor_rate: pricing.effectiveFactorRate,
        total_balance: pricing.totalDebt,
        total_weekly_burden: pricing.totalWeeklyBurden,
        current_dsr: pricing.currentDsr,
        status: deal.status === 'analysis' ? 'priced' : deal.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (dealUpdateError) {
      return NextResponse.json({ error: dealUpdateError.message }, { status: 500 });
    }

    // Update each position with pricing breakdown
    for (const pb of pricing.positionBreakdowns) {
      const updateFields = {
        funder_share_pct: pb.funder_share_pct,
        opening_payment: pb.opening_payment,
        middle1_payment: pb.middle1_payment,
        middle2_payment: pb.middle2_payment,
        final_payment: pb.final_payment,
        opening_term_weeks: pb.opening_term_weeks,
        middle1_term_weeks: pb.middle1_term_weeks,
        middle2_term_weeks: pb.middle2_term_weeks,
        final_term_weeks: pb.final_term_weeks,
        proposed_weekly_payment: pb.final_payment,
        proposed_term_weeks: pb.final_term_weeks,
        updated_at: new Date().toISOString(),
      };

      // Add EW data if available
      if (ewResults) {
        const ew = ewResults.find((e) => e.position_id === pb.position_id);
        if (ew) {
          updateFields.composite_score = ew.composite_score;
          updateFields.ew_adjusted_share = ew.ew_adjusted_share;
          updateFields.ew_adjusted_payment = ew.ew_adjusted_payment;
        }
      }

      await supabase
        .from('positions')
        .update(updateFields)
        .eq('id', pb.position_id);
    }

    // Return full pricing response
    return NextResponse.json({
      deal_id: id,
      pricing,
      enforceability_weighted: ewResults,
      status: deal.status === 'analysis' ? 'priced' : deal.status,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

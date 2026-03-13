import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 150;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Payload Trimming ────────────────────────────────────────────────────────
// Strip raw text, transaction lists, and verbose fields to stay within limits.
function trimBankAnalysis(ba) {
  if (!ba) return {};
  return {
    business_name: ba.business_name,
    bank_name: ba.bank_name,
    statement_period: ba.statement_period,
    statement_month: ba.statement_month,
    statement_periods: ba.statement_periods,
    balance_summary: ba.balance_summary,
    revenue: ba.revenue ? {
      gross_deposits: ba.revenue.gross_deposits,
      net_verified_revenue: ba.revenue.net_verified_revenue,
      monthly_average_revenue: ba.revenue.monthly_average_revenue,
      excluded_mca_proceeds: ba.revenue.excluded_mca_proceeds,
      excluded_transfers: ba.revenue.excluded_transfers,
      excluded_loan_proceeds: ba.revenue.excluded_loan_proceeds,
      revenue_sources: (ba.revenue.revenue_sources || []).map(s => ({
        name: s.name, type: s.type, total: s.total,
        monthly_avg: s.monthly_avg, is_excluded: s.is_excluded,
      })),
    } : undefined,
    mca_positions: (ba.mca_positions || []).map(p => ({
      funder_name: p.funder_name,
      payment_amount: p.payment_amount,
      payment_amount_current: p.payment_amount_current,
      payment_amount_original: p.payment_amount_original,
      frequency: p.frequency,
      payments_detected: p.payments_detected,
      estimated_monthly_total: p.estimated_monthly_total,
      first_payment_date: p.first_payment_date,
      last_payment_date: p.last_payment_date,
      payment_modified: p.payment_modified,
      modification_direction: p.modification_direction,
      advance_deposit_amount: p.advance_deposit_amount,
      advance_deposit_date: p.advance_deposit_date,
      confidence: p.confidence,
      flag: p.flag,
      status: p.status,
    })),
    other_debt_service: ba.other_debt_service,
    expense_categories: ba.expense_categories,
    nsf_analysis: ba.nsf_analysis ? {
      nsf_count: ba.nsf_analysis.nsf_count,
      overdraft_count: ba.nsf_analysis.overdraft_count,
      nsf_risk_score: ba.nsf_analysis.nsf_risk_score,
    } : undefined,
    calculated_metrics: ba.calculated_metrics,
    negotiation_intel: ba.negotiation_intel,
    monthly_breakdown: (ba.monthly_breakdown || []).map(m => ({
      month: m.month,
      revenue: m.revenue || m.net_verified_revenue,
      total_deposits: m.total_deposits,
      total_withdrawals: m.total_withdrawals,
      ending_balance: m.ending_balance,
      mca_positions: (m.mca_positions || []).map(p => ({
        funder_name: p.funder_name,
        payment_amount: p.payment_amount,
        payment_amount_current: p.payment_amount_current,
        frequency: p.frequency,
        payments_detected: p.payments_detected,
        estimated_monthly_total: p.estimated_monthly_total,
      })),
    })),
  };
}

function trimAgreement(ag) {
  if (!ag) return {};
  return {
    funder_name: ag.funder_name,
    seller_name: ag.seller_name,
    effective_date: ag.effective_date,
    funding_date: ag.funding_date,
    governing_law_state: ag.governing_law_state,
    purchase_price: ag.purchase_price,
    purchased_amount: ag.purchased_amount,
    factor_rate: ag.factor_rate,
    weekly_payment: ag.weekly_payment,
    daily_payment: ag.daily_payment,
    payment_frequency: ag.payment_frequency,
    specified_percentage: ag.specified_percentage,
    origination_fee: ag.origination_fee,
    prior_balance_amount: ag.prior_balance_amount,
    prior_balance_paid_to: ag.prior_balance_paid_to,
    prior_balance_is_self_renewal: ag.prior_balance_is_self_renewal,
    net_to_seller: ag.net_to_seller,
    stated_monthly_revenue: ag.stated_monthly_revenue,
    reconciliation_right: ag.reconciliation_right,
    reconciliation_days: ag.reconciliation_days,
    anti_stacking_clause: ag.anti_stacking_clause,
    coj_clause: ag.coj_clause,
    coj_state: ag.coj_state,
    financial_terms: ag.financial_terms ? {
      purchase_price: ag.financial_terms.purchase_price,
      purchased_amount: ag.financial_terms.purchased_amount,
      factor_rate: ag.financial_terms.factor_rate,
      specified_daily_payment: ag.financial_terms.specified_daily_payment,
      specified_weekly_payment: ag.financial_terms.specified_weekly_payment,
      specified_payment_frequency: ag.financial_terms.specified_payment_frequency,
      specified_receivable_percentage: ag.financial_terms.specified_receivable_percentage,
      stated_merchant_revenue: ag.financial_terms.stated_merchant_revenue,
      estimated_term_weeks: ag.financial_terms.estimated_term_weeks,
    } : undefined,
    fee_analysis: ag.fee_analysis ? {
      origination_fee: ag.fee_analysis.origination_fee,
      total_fees: ag.fee_analysis.total_fees,
      total_fees_pct_of_purchase: ag.fee_analysis.total_fees_pct_of_purchase,
      net_proceeds_to_merchant: ag.fee_analysis.net_proceeds_to_merchant,
      true_factor_rate: ag.fee_analysis.true_factor_rate,
      effective_annual_rate: ag.fee_analysis.effective_annual_rate,
    } : undefined,
    stacking_analysis: ag.stacking_analysis,
    negotiation_leverage: ag.negotiation_leverage,
  };
}

const XREF_PROMPT = `You are a senior MCA restructuring analyst for Funders First Inc. You have 15+ years of experience negotiating MCA restructurings and you are now performing the most critical step: CROSS-REFERENCING the contracted agreement terms against the actual bank statement data.

This is the analysis that makes funders negotiate. You are proving, with math, that their underwriting was flawed, their contracted terms don't match reality, and restructuring is the rational path to 100% recovery.

You will receive:
1. BANK STATEMENT ANALYSIS — what the business actually does (real revenue, real expenses, real cash flow)
2. MCA AGREEMENT ANALYSES — what each funder contracted for (stated revenue, purchase price, factor rate, fees, terms)

Your job is to cross-reference EACH agreement against bank statement reality.

## CROSS-REFERENCE PRIORITIES

### 1. REVENUE VERIFICATION — The Foundation of Everything
For each funder agreement:
- Compare their STATED merchant revenue (from the agreement) against ACTUAL true revenue from bank statements
- Calculate the discrepancy: (stated_revenue - actual_revenue) / stated_revenue × 100
- If stated revenue is HIGHER than actual, the funder's underwriting was inflated
- Important: "Actual revenue" means TRUE revenue EXCLUDING MCA advance wires, transfers, NSF credits
- Note: revenue should also account for EXISTING MCA burden at time of funding
- IMPORTANT: The stated revenue from the agreement data may appear under the field name "stated_monthly_revenue" at the top level OR "financial_terms.stated_merchant_revenue" nested inside financial_terms. Check BOTH fields. If NEITHER field has a value (both are null, 0, or missing), output stated_revenue as null — do NOT output 0, because 0 implies the contract stated zero revenue, which is different from the contract not disclosing revenue at all.
- IMPLIED REVENUE CALCULATION: If the agreement does NOT have an explicitly stated monthly revenue figure, but DOES have a specified/purchased percentage AND a weekly/daily remittance amount, calculate the implied revenue using the funder's own contract math:
  implied_weekly_revenue = weekly_remittance / specified_percentage_as_decimal
  implied_monthly_revenue = implied_weekly_revenue × 4.33
  For example: 12% specified percentage with $3,975/wk remittance → $3,975 / 0.12 = $33,125/wk → $143,431/mo implied.
  This is the revenue figure the funder's own underwriting model assumed. Output this as "stated_revenue" in the contract_vs_reality output, and add "revenue_source": "implied_from_specified_percentage" to distinguish it from an explicitly stated figure.
  If the agreement has BOTH an explicit stated revenue AND a specified percentage, use the explicit stated revenue but ALSO calculate the implied figure and flag any discrepancy between them — if the funder stated one revenue but their percentage math implies a different one, that's an additional underwriting inconsistency to note in leverage_points.

### 2. AVAILABLE REVENUE AT TIME OF FUNDING — The Cascading Burden
This is the critical calculation:
- At the time each funder funded their advance, what positions ALREADY existed?
- Use first_seen dates from bank statement analysis and agreement_dates to establish timeline
- Calculate: Actual_Revenue - Existing_MCA_Payments_At_Time_Of_Funding = Available_Revenue
- The funder's ACTUAL withhold percentage = their_monthly_payment / available_revenue × 100
- Compare this against their CONTRACTED withhold percentage
- If actual withhold is significantly higher than contracted, the funder's pricing model was wrong

### 3. TRUE COST OF CAPITAL — What the Merchant Actually Paid
For each position:
- Net proceeds = purchase_price - all_fees (from agreement)
- True factor rate = purchased_amount / net_proceeds
- If bank statements show the advance deposit amount differed from contracted purchase_price, flag it
- Calculate effective APR based on true factor rate and actual payment duration

### 4. STACKING CHRONOLOGY — Build the Timeline
- Order ALL positions by funding date
- For each new position, calculate:
  * What was the total weekly MCA burden BEFORE this position?
  * What was the available revenue BEFORE this position?
  * What percentage of available revenue was already committed?
  * Did this funder fund despite the merchant being already over-leveraged?
- Build a clear narrative: "When Funder X funded on [date], the merchant was already paying $X/week to Y positions, leaving only $Z available. Funder X added $W/week, pushing total burden to $V and available revenue to $U."

### 5. CONTRACT vs REALITY TABLE — Per Funder
For each funder, produce a side-by-side comparison:
| Term | Contracted | Actual | Discrepancy |
|------|-----------|--------|-------------|
| Revenue | $stated | $actual | -XX% |
| Withhold % | X% | Y% | +Z points |
| Payment Amount | $contracted | $actual | +/-$ |
| Available Revenue | assumed $X | actual $Y | -XX% |

### 6. FUNDER NEGLIGENCE SCORECARD
Rate each funder's underwriting practices:
- Did they verify revenue? (If stated revenue doesn't match, probably not)
- Did they account for existing positions? (If they funded into a stack, no)
- Did they have anti-stacking clause but funded anyway? (Hypocritical)
- Is their factor rate above market? (>1.45 is high, >1.55 is predatory)
- Did they deduct excessive fees? (>3% of purchase price is high)
- Did they include unenforceable clauses? (COJ in NY, etc.)

## OUTPUT FORMAT — Return ONLY valid JSON:

{
  "cross_reference_date": "YYYY-MM-DD",
  "merchant_name": "",
  "analysis_period": "",

  "revenue_reality": {
    "actual_monthly_revenue": 0,
    "actual_gross_profit": 0,
    "revenue_source": "bank_statements",
    "months_analyzed": 0,
    "revenue_methodology": "string — explain how true revenue was determined"
  },

  "position_chronology": [{
    "order": 1,
    "funder_name": "",
    "funding_date": "YYYY-MM-DD",
    "purchase_price": 0,
    "net_proceeds": 0,
    "weekly_payment": 0,
    "monthly_payment": 0,
    "existing_weekly_mca_at_funding": 0,
    "existing_monthly_mca_at_funding": 0,
    "actual_revenue_at_funding": 0,
    "available_revenue_at_funding": 0,
    "available_revenue_after_this_position": 0,
    "cumulative_weekly_burden_after": 0,
    "cumulative_monthly_burden_after": 0,
    "pct_of_available_revenue_consumed": 0,
    "narrative": "string — one-paragraph description of what happened when this funder funded"
  }],

  "contract_vs_reality": [{
    "funder_name": "",
    "agreement_date": "",

    "stated_revenue": null,
    "revenue_source": "explicit|implied_from_specified_percentage|not_disclosed",
    "implied_revenue_from_pct": null,
    "actual_revenue": 0,
    "revenue_discrepancy_pct": 0,
    "revenue_inflated": true,

    "contracted_withhold_pct": 0,
    "actual_withhold_pct": 0,
    "withhold_discrepancy_points": 0,

    "contracted_payment": 0,
    "actual_payment": 0,
    "payment_match": true,

    "available_revenue_at_funding": 0,
    "true_withhold_of_available": 0,

    "contracted_factor_rate": 0,
    "true_factor_rate": 0,
    "effective_apr": 0,

    "total_fees_charged": 0,
    "net_proceeds": 0,

    "underwriting_grade": "A|B|C|D|F",
    "underwriting_failures": ["string"],
    "leverage_points": ["string"]
  }],

  "cascading_burden_analysis": {
    "narrative": "string — full story of how the debt stack built up and how each funder's underwriting contributed to the merchant's distress",
    "total_purchase_prices": 0,
    "total_purchased_amounts": 0,
    "total_fees_across_all": 0,
    "total_net_proceeds": 0,
    "blended_factor_rate": 0,
    "current_weekly_burden": 0,
    "current_monthly_burden": 0,
    "actual_monthly_revenue": 0,
    "actual_gross_profit": 0,
    "true_dsr_all_mca": 0,
    "revenue_consumed_by_mca_pct": 0,
    "available_for_operations": 0,
    "viable_without_mca": true,
    "viability_explanation": "string"
  },

  "funder_scorecards": [{
    "funder_name": "",
    "underwriting_grade": "A|B|C|D|F",
    "revenue_verified": false,
    "existing_positions_accounted": false,
    "anti_stacking_hypocrite": false,
    "factor_rate_assessment": "market|above_market|predatory",
    "fee_assessment": "reasonable|high|excessive",
    "has_unenforceable_clauses": false,
    "unenforceable_clause_list": [""],
    "has_reconciliation_rights": false,
    "overall_leverage": "strong|moderate|weak",
    "recommended_approach": "string",
    "estimated_negotiation_outcome": "string — e.g. 'Extended terms likely, 40-60% payment reduction achievable'"
  }],

  "restructuring_recommendation": {
    "headline": "string — one sentence summary for all funders",
    "current_total_weekly": 0,
    "sustainable_weekly": 0,
    "recommended_reduction_pct": 0,
    "total_remaining_balance": 0,
    "recommended_term_weeks": 0,
    "per_funder_recommendation": [{
      "funder": "",
      "current_weekly": 0,
      "recommended_weekly": 0,
      "reduction_pct": 0,
      "remaining_balance": 0,
      "recommended_term_weeks": 0,
      "rationale": "string — why this funder should accept these terms"
    }],
    "repayment_guarantee": "string — explain how restructured terms ensure 100% repayment"
  }
}

RULES:
1. Revenue discrepancy = (stated - actual) / stated × 100. Positive = funder overstated.
2. Available revenue = actual_revenue - existing_mca_monthly_payments at time of funding.
3. True withhold % = this_funder_monthly_payment / available_revenue_at_funding × 100.
4. Underwriting grades: A = proper due diligence, B = minor issues, C = significant gaps, D = negligent, F = predatory.
5. A funder who funded into 3+ existing positions with no apparent revenue adjustment gets D or F.
6. Anti-stacking hypocrite = funder has anti-stacking clause BUT funded knowing merchant had existing positions.
7. Factor rate >1.45 = above market, >1.55 = predatory assessment.
8. Total fees >5% of purchase price = excessive.
9. ALWAYS calculate available revenue at time of EACH funding — this is the key number.
10. The cascading burden narrative should read like a story a funder's collections team can follow.`;

export async function POST(request) {
  try {
    const body = await request.json();
    const { bankAnalysis, agreementAnalyses, model } = body;

    if (!bankAnalysis) {
      return Response.json({ error: 'Bank statement analysis required for cross-reference.' }, { status: 400 });
    }

    if (!agreementAnalyses || !Array.isArray(agreementAnalyses) || agreementAnalyses.length === 0) {
      return Response.json({ error: 'At least one agreement analysis required for cross-reference.' }, { status: 400 });
    }

    // Cross-reference always uses Sonnet — fast enough for pattern matching, avoids Opus timeouts
    const selectedModel = 'claude-sonnet-4-20250514';

    // Trim payloads — send only the fields Claude needs, not raw text/PDFs
    const trimmedBank = trimBankAnalysis(bankAnalysis);
    const trimmedAgreements = agreementAnalyses.map(a => trimAgreement(a));

    const contextPayload = `## BANK STATEMENT ANALYSIS (source of truth for actual numbers):
${JSON.stringify(trimmedBank, null, 2)}

## MCA AGREEMENT ANALYSES (${trimmedAgreements.length} agreements):
${trimmedAgreements.map((a, i) => `### Agreement ${i + 1}: ${a.funder_name || 'Unknown'}\n${JSON.stringify(a, null, 2)}`).join('\n\n')}`;

    console.log(`Cross-ref payload size: ${contextPayload.length} chars, ${trimmedAgreements.length} agreements, model: ${selectedModel}`);

    // AbortController: fail gracefully before Vercel's 120s limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 110000);

    let response;
    try {
      response = await client.messages.create({
        model: selectedModel,
        max_tokens: 16000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `${XREF_PROMPT}\n\nDATA TO CROSS-REFERENCE:\n\n${contextPayload}`
        }]
      }, { signal: controller.signal });
    } catch (abortErr) {
      clearTimeout(timeout);
      if (abortErr.name === 'AbortError' || controller.signal.aborted) {
        console.error('Cross-ref timed out after 110s');
        return Response.json({
          error: 'Analysis timed out — try with fewer agreements loaded or switch to Sonnet.',
          partial: true
        }, { status: 408 });
      }
      throw abortErr;
    } finally {
      clearTimeout(timeout);
    }

    const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(cleaned);
    } catch {
      let depth = 0, start = -1, end = -1;
      for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '{') { if (depth === 0) start = i; depth++; }
        else if (cleaned[i] === '}') { depth--; if (depth === 0 && start >= 0) { end = i + 1; break; } }
      }
      if (start >= 0 && end > start) {
        try {
          analysis = JSON.parse(cleaned.slice(start, end));
        } catch (parseErr) {
          console.error('Cross-ref JSON parse failed:', parseErr.message, 'Raw (first 500):', cleaned.slice(0, 500));
          return Response.json({
            error: 'Cross-reference analysis returned malformed data. Try re-analyzing.',
            debug: cleaned.slice(0, 500)
          }, { status: 500 });
        }
      } else {
        console.error('Cross-ref no JSON found in response. Raw (first 500):', cleaned.slice(0, 500));
        return Response.json({
          error: 'Cross-reference did not return structured data.',
          debug: cleaned.slice(0, 500)
        }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      analysis,
      agreements_count: agreementAnalyses.length,
      model_used: selectedModel
    });

  } catch (err) {
    console.error('Cross-ref error:', err.message, err.stack);
    return Response.json({
      error: err.message || 'Cross-reference failed'
    }, { status: 500 });
  }
}

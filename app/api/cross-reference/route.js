import Anthropic from '@anthropic-ai/sdk';
import { buildIndustryPromptBlock } from '../../data/industry-profiles.js';

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
    position_label: ag.position_label || null,
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
- IMPLIED REVENUE CALCULATION: If the agreement does NOT have an explicitly stated monthly revenue figure, but DOES have a specified/purchased percentage AND a weekly/daily remittance amount, calculate the funder's IMPLIED MONTHLY revenue assumption using their own contract math:
  Step 1: implied_weekly_revenue = weekly_remittance / specified_percentage_as_decimal
  Step 2: implied_MONTHLY_revenue = implied_weekly_revenue × 4.33
  EXAMPLE: Rowan has 7.7% specified percentage with $10,500/wk remittance → $10,500 / 0.077 = $136,364/wk → $136,364 × 4.33 = $590,455/mo implied.
  EXAMPLE: TMM has 49% specified percentage with $9,765/wk → $9,765 / 0.49 = $19,929/wk → $19,929 × 4.33 = $86,291/mo implied.
  CRITICAL: The output "stated_revenue" field must ALWAYS be a MONTHLY figure. Never output the weekly implied figure. Always multiply by 4.33.
  Output this as "stated_revenue" in the contract_vs_reality output, and set "revenue_source": "implied_from_specified_percentage".
  If the agreement has BOTH an explicit stated revenue AND a specified percentage, use the explicit stated revenue but note any discrepancy in leverage_points.

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
- SELF-RENEWAL DETECTION: If a funder's agreement shows a prior_balance_amount being paid to THEMSELVES (prior_balance_is_self_renewal: true, or prior_balance_paid_to matches the funder's own name), the funder HAD a prior position that was generating weekly debits. The existing_weekly_mca_at_funding for this funder should INCLUDE the prior position's payment amount that was active before the renewal. Check the bank statement data for debits to this funder in the months before the new agreement date to determine the prior payment amount. A self-renewal does NOT mean the merchant had zero existing MCA burden — it means this funder is replacing their own prior position.
- For the narrative: Note that this was a self-renewal and the funder had full knowledge of the merchant's existing debt structure since they were already an active creditor.

### 5. CONTRACT vs REALITY TABLE — Per Funder
For each funder, produce a side-by-side comparison:
| Term | Contracted | Actual | Discrepancy |
|------|-----------|--------|-------------|
| Revenue | $stated | $actual | -XX% |
| Withhold % | X% | Y% | +Z points |
| Payment Amount | $contracted | $actual | +/-$ |
| Available Revenue | assumed $X | actual $Y | -XX% |

CRITICAL — CONTRACTED PAYMENT SOURCE: For the \`contracted_payment\` field in contract_vs_reality, ALWAYS use the payment amount directly from the agreement data fields: \`weekly_payment\`, \`daily_payment\`, or \`financial_terms.specified_weekly_payment\` / \`financial_terms.specified_daily_payment\`. Do NOT calculate the payment by dividing purchased_amount by estimated term — that produces a different number than what the contract actually specifies. The agreement data already has the extracted payment amount. Use it as-is.
Similarly, for \`position_chronology.weekly_payment\`, use the agreement's extracted weekly_payment field directly. If only a daily payment is available, multiply by 5 (business days) to get weekly.

### 6. FUNDER NEGLIGENCE SCORECARD
Rate each funder's underwriting practices:
- Did they verify revenue? (If stated revenue doesn't match, probably not)
- Did they account for existing positions? (If they funded into a stack, no)
- Did they have anti-stacking clause but funded anyway? (Hypocritical)
- Is their factor rate above market? (>1.45 is high, >1.55 is predatory)
- Did they deduct excessive fees? (>3% of purchase price is high)
- Did they include unenforceable clauses? (COJ in NY, etc.)

=== FUNDER SCORECARD TAG DEFINITIONS ===

Generate the following tags for each funder scorecard. Use EXACTLY these tag names:

ALWAYS EVALUATE (include pass ✓ or fail ✗):
- REV VERIFIED: ✓ if implied/stated revenue is within 15% of actual. ✗ if gap > 15%.
- STACK CHECKED: ✓ if existing MCA burden at funding was $0 OR funder accounted for it in terms. ✗ if funder ignored existing burden.

CONDITIONAL (include only if applicable):
- ANTI-STACK HYPOCRITE: Include if funder has anti-stacking clause AND funded into a known stack (set anti_stacking_hypocrite: true).
- PREDATORY: Include if true_factor_rate > 2.5 OR origination_fee_pct > 8% OR fee extraction > 50% of purchase price. Set factor_rate_assessment: "predatory".
- MARKET: Include if terms are within industry norms (factor 1.15-1.55, origination 2-6%, true factor < 2.0). Set factor_rate_assessment: "market". Mutually exclusive with PREDATORY.
- SELF-RENEWAL: Include if funder paid off their own prior position (prior_balance_is_self_renewal: true).
- COJ VOID: Include if COJ clause exists but is unenforceable (NY FAIR Act, state prohibition, etc.). Set has_unenforceable_clauses: true.
- RECONCILIATION: Include if contract has reconciliation/adjustment clause. Set has_reconciliation_rights: true.

Each scorecard should have 2 required tags (REV VERIFIED, STACK CHECKED) plus 1-4 conditional tags.

### CRITICAL: ONE ENTRY PER AGREEMENT
The \`contract_vs_reality\` array MUST have exactly one entry for EACH agreement provided in the input data. If there are 4 agreements, there must be 4 entries in \`contract_vs_reality\`. Do NOT merge multiple agreements from the same funder into one entry — if The Merchant Marketplace has Position A and Position C, they each get their own separate entry with their own balance, payment, dates, and analysis. Same for \`position_chronology\` — one entry per agreement/position. The number of entries in \`contract_vs_reality\` must EQUAL the number of agreements provided.

### MULTI-POSITION SAME-FUNDER RULES
When multiple agreements come from the SAME funder (e.g., TMM Position A, TMM Position B, TMM Position C), each one is a SEPARATE deal with its own terms:
1. **Payment compliance**: Each position has its OWN contracted payment amount. Do NOT apply the same payment to all positions from one funder. Use each agreement's individual weekly_payment or daily_payment field.
2. **Contract vs reality**: Each position gets its OWN entry with its own purchase_price, purchased_amount, factor_rate, net_proceeds, contracted_payment, and dates. Never copy values from one position to another.
3. **Restructuring recommendation**: Each position gets its OWN per_funder_recommendation entry with its own current_weekly, remaining_balance, and recommended terms. Use the position_label (e.g., "Position A") in the funder field to distinguish them.
4. **Funding chronology**: Each position has its OWN funding date and place in the timeline. A funder's Position C funded months after their Position A — they are separate stacking events.
5. **Funder scorecards**: When a funder has multiple positions, create ONE scorecard entry but note all positions and their combined burden.
6. **Funder name in output**: When a funder has multiple positions, use the format "Funder Name (Position X)" in contract_vs_reality, position_chronology, and per_funder_recommendation entries to distinguish them. Use the position_label field from the agreement data if available.

### SELF-RENEWAL EXISTING MCA ESTIMATION
When a funder's agreement shows prior_balance_is_self_renewal: true, this means the funder was ALREADY collecting weekly payments from the merchant before this new agreement. The existing_weekly_mca_at_funding for this position MUST include the prior position's payment burden. To estimate the prior payment:
- First check bank statement MCA positions for debits to this funder with dates BEFORE the new agreement's effective_date
- If bank data is not available for the prior period, estimate: prior_weekly_payment ≈ prior_balance_amount ÷ 25 (average remaining weeks on a typical MCA)
- NEVER show existing_weekly_mca_at_funding as $0 when prior_balance_is_self_renewal is true — the merchant was paying this funder before the renewal

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
    "revenue_inflated": false,
    "revenue_understated": false,

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
1. Revenue discrepancy calculation:
   - If stated_revenue is not null: revenue_discrepancy_pct = ((stated_revenue - actual_revenue) / actual_revenue) × 100
   - POSITIVE value = funder OVERSTATED revenue (stated was higher than actual) → set revenue_inflated: true, revenue_understated: false
   - NEGATIVE value = funder UNDERSTATED revenue (stated was lower than actual) → set revenue_inflated: false, revenue_understated: true
   - Use actual_revenue as the denominator, not stated_revenue, because actual is the ground truth.
   - If stated_revenue is null (not disclosed), set revenue_discrepancy_pct to 0, revenue_inflated to false, revenue_understated to false.
2. Available revenue = actual_revenue - existing_mca_monthly_payments at time of funding.
3. True withhold % = this_funder_monthly_payment / available_revenue_at_funding × 100.
4. Underwriting grades: A = proper due diligence, B = minor issues, C = significant gaps, D = negligent, F = predatory.
5. A funder who funded into 3+ existing positions with no apparent revenue adjustment gets D or F.
6. Anti-stacking hypocrite = funder has anti-stacking clause BUT funded knowing merchant had existing positions.
7. Factor rate >1.45 = above market, >1.55 = predatory assessment.
8. Total fees >5% of purchase price = excessive.
9. ALWAYS calculate available revenue at time of EACH funding — this is the key number.
10. The cascading burden narrative should read like a story a funder's collections team can follow.
11. NEVER calculate contracted_payment or weekly_payment by dividing purchased_amount by estimated_term. ALWAYS read the payment amount directly from the agreement data fields (weekly_payment, daily_payment, financial_terms.specified_weekly_payment, financial_terms.specified_daily_payment). The extracted agreement data is the source of truth for payment amounts.`;

// ─── Post-Processing: Override LLM numbers with agreement source data ──────
function postProcessCrossRef(analysis, agreementAnalyses, bankAnalysis) {
  if (!analysis || !agreementAnalyses || agreementAnalyses.length === 0) return analysis;

  const agLookup = [];
  for (const agWrapper of agreementAnalyses) {
    const ag = agWrapper.analysis || agWrapper;
    if (!ag.funder_name) continue;

    const weeklyPayment = ag.weekly_payment
      || ag.financial_terms?.specified_weekly_payment
      || (ag.daily_payment ? ag.daily_payment * 5 : null)
      || (ag.financial_terms?.specified_daily_payment ? ag.financial_terms.specified_daily_payment * 5 : null);

    const specifiedPct = ag.specified_percentage
      || ag.financial_terms?.specified_receivable_percentage
      || null;

    let impliedMonthlyRevenue = null;
    if (specifiedPct && specifiedPct > 0 && weeklyPayment && weeklyPayment > 0) {
      const pctDecimal = specifiedPct > 1 ? specifiedPct / 100 : specifiedPct;
      const impliedWeekly = weeklyPayment / pctDecimal;
      impliedMonthlyRevenue = Math.round(impliedWeekly * 4.33);
    }

    agLookup.push({
      funder_name: ag.funder_name,
      position_label: ag.position_label || null,
      normalized: ag.funder_name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      purchase_price: ag.purchase_price || ag.financial_terms?.purchase_price || null,
      purchased_amount: ag.purchased_amount || ag.financial_terms?.purchased_amount || null,
      factor_rate: ag.factor_rate || ag.financial_terms?.factor_rate || null,
      weekly_payment: weeklyPayment,
      origination_fee: ag.origination_fee || ag.fee_analysis?.origination_fee || null,
      net_to_seller: ag.net_to_seller || ag.fee_analysis?.net_proceeds_to_merchant || null,
      specified_pct: specifiedPct,
      implied_monthly_revenue: impliedMonthlyRevenue,
      stated_monthly_revenue: ag.stated_monthly_revenue || ag.financial_terms?.stated_merchant_revenue || null,
      effective_date: ag.effective_date || ag.funding_date || null,
      prior_balance_amount: ag.prior_balance_amount || null,
      prior_balance_is_self_renewal: ag.prior_balance_is_self_renewal || false,
    });
  }

  // Helper: check if two funder names refer to the same funder
  function isSameFunder(name1, name2) {
    if (!name1 || !name2) return false;
    const n1 = name1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n2 = name2.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (n1 === n2) return true;
    // Strip position labels before comparing
    const strip1 = n1.replace(/position[a-z0-9]/g, '');
    const strip2 = n2.replace(/position[a-z0-9]/g, '');
    if (strip1 === strip2) return true;
    // Substring match (8+ chars)
    if (strip1.length >= 8 && strip2.length >= 8) {
      return strip1.includes(strip2.slice(0, 8)) || strip2.includes(strip1.slice(0, 8));
    }
    // First-word match (6+ chars)
    const fw1 = strip1.replace(/[0-9]/g, '').slice(0, 6);
    const fw2 = strip2.replace(/[0-9]/g, '').slice(0, 6);
    return fw1.length >= 4 && fw1 === fw2;
  }

  // Exclusive matching: each agreement can only be matched once per section
  function exclusiveMatch(items, getKey, getPayment) {
    const result = new Map(); // item index -> agLookup index
    const usedAg = new Set();

    // Pass 1: position label match
    for (let i = 0; i < items.length; i++) {
      const name = getKey(items[i]);
      if (!name) continue;
      const posMatch = name.match(/position\s*([a-z0-9])/i);
      if (!posMatch) continue;
      const posLabel = posMatch[1].toUpperCase();

      for (let j = 0; j < agLookup.length; j++) {
        if (usedAg.has(j)) continue;
        if (!isSameFunder(name, agLookup[j].funder_name)) continue;
        if (agLookup[j].position_label && agLookup[j].position_label.toUpperCase().includes(posLabel)) {
          result.set(i, j);
          usedAg.add(j);
          break;
        }
      }
    }

    // Pass 2: payment proximity match (within 10%)
    for (let i = 0; i < items.length; i++) {
      if (result.has(i)) continue;
      const name = getKey(items[i]);
      if (!name) continue;
      const payment = getPayment(items[i]);

      for (let j = 0; j < agLookup.length; j++) {
        if (usedAg.has(j)) continue;
        if (!isSameFunder(name, agLookup[j].funder_name)) continue;
        if (payment > 0 && agLookup[j].weekly_payment && Math.abs(agLookup[j].weekly_payment - payment) < payment * 0.10) {
          result.set(i, j);
          usedAg.add(j);
          break;
        }
      }
    }

    // Pass 3: fallback — next available same-funder agreement
    for (let i = 0; i < items.length; i++) {
      if (result.has(i)) continue;
      const name = getKey(items[i]);
      if (!name) continue;

      for (let j = 0; j < agLookup.length; j++) {
        if (usedAg.has(j)) continue;
        if (isSameFunder(name, agLookup[j].funder_name)) {
          result.set(i, j);
          usedAg.add(j);
          break;
        }
      }
    }

    return { matched: result, usedAg };
  }

  // Helper: build display name for a position
  function displayName(ag) {
    const label = ag.position_label || '';
    return label ? `${ag.funder_name} (${label})` : ag.funder_name;
  }

  // Helper: apply agreement overrides to a contract_vs_reality entry
  function applyCvrOverrides(cvr, ag) {
    if (ag.weekly_payment) cvr.contracted_payment = ag.weekly_payment;
    if (ag.factor_rate) cvr.contracted_factor_rate = ag.factor_rate;
    if (ag.origination_fee) cvr.total_fees_charged = ag.origination_fee;
    if (ag.net_to_seller) cvr.net_proceeds = ag.net_to_seller;

    if (ag.stated_monthly_revenue && ag.stated_monthly_revenue > 0) {
      cvr.stated_revenue = ag.stated_monthly_revenue;
      cvr.revenue_source = 'explicit';
    } else if (ag.implied_monthly_revenue && ag.implied_monthly_revenue > 0) {
      cvr.stated_revenue = ag.implied_monthly_revenue;
      cvr.revenue_source = 'implied_from_specified_percentage';
      cvr.implied_revenue_from_pct = ag.implied_monthly_revenue;
    }

    if (cvr.stated_revenue && cvr.stated_revenue > 0 && cvr.actual_revenue && cvr.actual_revenue > 0) {
      cvr.revenue_discrepancy_pct = parseFloat((((cvr.stated_revenue - cvr.actual_revenue) / cvr.actual_revenue) * 100).toFixed(1));
      cvr.revenue_inflated = cvr.revenue_discrepancy_pct > 0;
      cvr.revenue_understated = cvr.revenue_discrepancy_pct < 0;
    }

    if (ag.purchased_amount && ag.net_to_seller && ag.net_to_seller > 0) {
      cvr.true_factor_rate = parseFloat((ag.purchased_amount / ag.net_to_seller).toFixed(2));
    }
  }

  // ── Override contract_vs_reality with exclusive matching ──
  if (analysis.contract_vs_reality && Array.isArray(analysis.contract_vs_reality)) {
    const { matched, usedAg } = exclusiveMatch(
      analysis.contract_vs_reality,
      cvr => cvr.funder_name,
      cvr => cvr.contracted_payment
    );

    for (const [i, j] of matched) {
      applyCvrOverrides(analysis.contract_vs_reality[i], agLookup[j]);
    }

    // Inject missing agreements that the LLM didn't produce entries for
    for (let j = 0; j < agLookup.length; j++) {
      if (usedAg.has(j)) continue;
      const ag = agLookup[j];
      const actualRevenue = analysis.revenue_reality?.actual_monthly_revenue || 0;
      const newCvr = {
        funder_name: displayName(ag),
        agreement_date: ag.effective_date || '',
        stated_revenue: null,
        revenue_source: 'not_disclosed',
        implied_revenue_from_pct: null,
        actual_revenue: actualRevenue,
        revenue_discrepancy_pct: 0,
        revenue_inflated: false,
        revenue_understated: false,
        contracted_withhold_pct: 0,
        actual_withhold_pct: 0,
        withhold_discrepancy_points: 0,
        contracted_payment: ag.weekly_payment || 0,
        actual_payment: ag.weekly_payment || 0,
        payment_match: true,
        available_revenue_at_funding: 0,
        true_withhold_of_available: 0,
        contracted_factor_rate: ag.factor_rate || 0,
        true_factor_rate: 0,
        effective_apr: 0,
        total_fees_charged: ag.origination_fee || 0,
        net_proceeds: ag.net_to_seller || 0,
        underwriting_grade: 'D',
        underwriting_failures: ['Position missing from LLM analysis — injected from agreement data'],
        leverage_points: [],
        _injected: true,
      };
      applyCvrOverrides(newCvr, ag);
      analysis.contract_vs_reality.push(newCvr);
    }
  }

  // ── Override position_chronology with exclusive matching ──
  if (analysis.position_chronology && Array.isArray(analysis.position_chronology)) {
    const { matched, usedAg } = exclusiveMatch(
      analysis.position_chronology,
      pos => pos.funder_name,
      pos => pos.weekly_payment
    );

    for (const [i, j] of matched) {
      const pos = analysis.position_chronology[i];
      const ag = agLookup[j];
      if (ag.weekly_payment) {
        pos.weekly_payment = ag.weekly_payment;
        pos.monthly_payment = Math.round(ag.weekly_payment * 4.33);
      }
      if (ag.purchase_price) pos.purchase_price = ag.purchase_price;
      if (ag.net_to_seller) pos.net_proceeds = ag.net_to_seller;
    }

    // Inject missing agreements into chronology
    for (let j = 0; j < agLookup.length; j++) {
      if (usedAg.has(j)) continue;
      const ag = agLookup[j];
      const maxOrder = analysis.position_chronology.reduce((m, p) => Math.max(m, p.order || 0), 0);
      analysis.position_chronology.push({
        order: maxOrder + 1,
        funder_name: displayName(ag),
        funding_date: ag.effective_date || '',
        purchase_price: ag.purchase_price || 0,
        net_proceeds: ag.net_to_seller || 0,
        weekly_payment: ag.weekly_payment || 0,
        monthly_payment: ag.weekly_payment ? Math.round(ag.weekly_payment * 4.33) : 0,
        existing_weekly_mca_at_funding: 0,
        existing_monthly_mca_at_funding: 0,
        actual_revenue_at_funding: analysis.revenue_reality?.actual_monthly_revenue || 0,
        available_revenue_at_funding: 0,
        available_revenue_after_this_position: 0,
        cumulative_weekly_burden_after: 0,
        cumulative_monthly_burden_after: 0,
        pct_of_available_revenue_consumed: 0,
        narrative: `Position injected from agreement data — not present in original LLM analysis.`,
        _injected: true,
      });
    }

    // Re-sort chronology by funding date
    analysis.position_chronology.sort((a, b) => {
      const da = a.funding_date ? new Date(a.funding_date) : new Date(0);
      const db = b.funding_date ? new Date(b.funding_date) : new Date(0);
      return da - db;
    });
    analysis.position_chronology.forEach((p, i) => { p.order = i + 1; });
  }

  // ── Override restructuring_recommendation per-funder with exclusive matching ──
  if (analysis.restructuring_recommendation?.per_funder_recommendation) {
    const recs = analysis.restructuring_recommendation.per_funder_recommendation;
    const { matched, usedAg } = exclusiveMatch(
      recs,
      rec => rec.funder,
      rec => rec.current_weekly
    );

    for (const [i, j] of matched) {
      if (agLookup[j].weekly_payment) {
        recs[i].current_weekly = agLookup[j].weekly_payment;
      }
    }

    // Inject missing agreements into restructuring recommendations
    for (let j = 0; j < agLookup.length; j++) {
      if (usedAg.has(j)) continue;
      const ag = agLookup[j];
      if (!ag.weekly_payment) continue;
      recs.push({
        funder: displayName(ag),
        current_weekly: ag.weekly_payment,
        recommended_weekly: Math.round(ag.weekly_payment * 0.5),
        reduction_pct: 50,
        remaining_balance: ag.purchased_amount || 0,
        recommended_term_weeks: 52,
        rationale: `Position injected from agreement data. Payment reduction estimated pending full analysis.`,
        _injected: true,
      });
    }

    // Recalculate totals
    const totalCurrent = recs.reduce((s, r) => s + (r.current_weekly || 0), 0);
    const totalRecommended = recs.reduce((s, r) => s + (r.recommended_weekly || 0), 0);
    analysis.restructuring_recommendation.current_total_weekly = totalCurrent;
    if (totalCurrent > 0 && totalRecommended > 0) {
      analysis.restructuring_recommendation.recommended_reduction_pct =
        parseFloat(((1 - totalRecommended / totalCurrent) * 100).toFixed(1));
    }
  }

  // ── Compute existing MCA burden at each funding date from bank data ──
  if (analysis.position_chronology && Array.isArray(analysis.position_chronology)) {
    const bankPositions = bankAnalysis?.mca_positions || [];

    // Parse a date string into comparable value; returns null if unparseable
    function parseDate(d) {
      if (!d) return null;
      const t = new Date(d);
      return isNaN(t.getTime()) ? null : t;
    }

    // For each position in chronology, compute existing burden from bank data
    for (const pos of analysis.position_chronology) {
      const fundingDate = parseDate(pos.funding_date);
      if (!fundingDate) continue;

      let computedWeeklyBurden = 0;
      for (const bp of bankPositions) {
        // Skip if this is the same funder/position
        if (isSameFunder(bp.funder_name, pos.funder_name)) continue;

        const firstSeen = parseDate(bp.first_payment_date);
        const lastSeen = bp.last_payment_date === 'present' ? new Date() : parseDate(bp.last_payment_date);
        if (!firstSeen) continue;

        // Was this position active when pos funded?
        if (firstSeen <= fundingDate && (!lastSeen || lastSeen >= fundingDate)) {
          const weeklyAmt = bp.payment_amount_current || bp.payment_amount || 0;
          if (bp.frequency === 'daily') {
            computedWeeklyBurden += weeklyAmt * 5;
          } else if (bp.frequency === 'monthly') {
            computedWeeklyBurden += Math.round(weeklyAmt / 4.33);
          } else {
            // weekly or bi-weekly default to weekly
            computedWeeklyBurden += weeklyAmt;
          }
        }
      }

      // Use computed burden if higher than what the LLM produced (catches $0 errors)
      const existingWeekly = pos.existing_weekly_mca_at_funding || 0;
      if (computedWeeklyBurden > existingWeekly) {
        pos.existing_weekly_mca_at_funding = computedWeeklyBurden;
        pos.existing_monthly_mca_at_funding = Math.round(computedWeeklyBurden * 4.33);
        pos.burden_source = 'computed_from_bank_data';
      }
    }

    // Self-renewal existing MCA fix: estimate prior payment from prior_balance_amount
    for (const pos of analysis.position_chronology) {
      // Find matching agreement using isSameFunder + position label
      const posMatch = pos.funder_name?.match(/position\s*([a-z0-9])/i);
      const posLabel = posMatch ? posMatch[1].toUpperCase() : null;
      let ag = null;
      for (const a of agLookup) {
        if (!isSameFunder(pos.funder_name, a.funder_name)) continue;
        if (posLabel && a.position_label && !a.position_label.toUpperCase().includes(posLabel)) continue;
        ag = a;
        break;
      }
      if (!ag || !ag.prior_balance_is_self_renewal || !ag.prior_balance_amount) continue;

      const existingWeekly = pos.existing_weekly_mca_at_funding || 0;
      const estimatedPriorWeekly = Math.round(ag.prior_balance_amount / 25);

      // Add self-renewal prior payment if not already accounted for
      if (existingWeekly < estimatedPriorWeekly) {
        // The existing burden from other funders + estimated prior self-payment
        const otherBurden = existingWeekly;
        pos.existing_weekly_mca_at_funding = otherBurden + estimatedPriorWeekly;
        pos.existing_monthly_mca_at_funding = Math.round((otherBurden + estimatedPriorWeekly) * 4.33);
        pos.self_renewal_prior_estimated = true;
        pos.self_renewal_note = `Self-renewal: prior ${ag.funder_name} position had ~$${estimatedPriorWeekly.toLocaleString()}/wk remaining balance of $${ag.prior_balance_amount.toLocaleString()} (estimated ÷25 weeks)`;
      }
    }

    // Recompute available_revenue fields and cumulative burden after corrections
    let cumulativeWeekly = 0;
    for (const pos of analysis.position_chronology) {
      const actualRevenue = pos.actual_revenue_at_funding || analysis.revenue_reality?.actual_monthly_revenue || 0;
      const existingMonthly = pos.existing_monthly_mca_at_funding || 0;
      pos.available_revenue_at_funding = actualRevenue - existingMonthly;
      const thisMonthly = pos.monthly_payment || Math.round((pos.weekly_payment || 0) * 4.33);
      pos.available_revenue_after_this_position = pos.available_revenue_at_funding - thisMonthly;
      cumulativeWeekly += pos.weekly_payment || 0;
      pos.cumulative_weekly_burden_after = cumulativeWeekly;
      pos.cumulative_monthly_burden_after = Math.round(cumulativeWeekly * 4.33);
      if (pos.available_revenue_at_funding > 0) {
        pos.pct_of_available_revenue_consumed = parseFloat(((thisMonthly / pos.available_revenue_at_funding) * 100).toFixed(1));
      }
    }
  }

  return analysis;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { bankAnalysis, agreementAnalyses, model, industry } = body;

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

    const industryContext = industry ? buildIndustryPromptBlock(industry) : '';
    const contextPayload = `## BANK STATEMENT ANALYSIS (source of truth for actual numbers):
${JSON.stringify(trimmedBank, null, 2)}
${industryContext ? `\n## INDUSTRY CONTEXT:\n${industryContext}\n` : ''}
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

    // Post-process: override LLM numbers with agreement source data
    const processedAnalysis = postProcessCrossRef(analysis, agreementAnalyses.map(a => a.analysis || a), bankAnalysis);

    return Response.json({
      success: true,
      analysis: processedAnalysis,
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

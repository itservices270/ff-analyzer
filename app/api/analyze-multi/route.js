import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 180;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MULTI_PROMPT = `You are an expert MCA underwriter for Funders First Inc. with 15+ years of bank statement analysis experience. You are analyzing MULTIPLE months of statements for the SAME business to build a complete underwriting picture.

Your job is to CROSS-REFERENCE data across all months to identify patterns a single-month analysis would miss. Funders will verify your numbers against their own records. Every number must be defensible.

## CROSS-REFERENCING PRIORITIES

### 1. PAYMENT FREQUENCY CONFIRMATION
- If a payment appears ONCE per month across multiple months = TERM LOAN, not MCA.
- If weekly payments are consistent across months = HIGH CONFIDENCE MCA position.
- If daily payments (Mon-Fri) are consistent = HIGH CONFIDENCE MCA position (daily split).
- Track payment AMOUNT changes across months — increases after new advance wires = refinance.

### 2. STACKING TIMELINE — Track when each position appeared
- Look for large wire deposits FROM known funders (advance proceeds).
- Match advance wire dates to when new payment patterns begin.
- Show the escalation: "Position X started [date] after $XXK advance wire, adding $XX,XXX/week to debt service."
- Calculate cumulative weekly burden at each stacking event.

### 3. PAYMENT MODIFICATIONS vs REFINANCES
- If a funder's payment amount changed AND a wire from that funder appeared = REFINANCE (new advance), not modification.
- If a payment decreased without a new wire = true MODIFICATION (restructured or partial payment arrangement).
- Different ACH IDs from same funder at different amounts = separate advances.

### 4. ADVANCE DEPOSITS — Must identify ALL of these:
- Wire transfers FROM known MCA funders = advance proceeds. NOT revenue.
- Match each advance to the payment pattern that followed.
- Sum total new MCA debt taken on across the entire analysis period.

### 5. REVENUE CLASSIFICATION:
- Card processing / POS payouts from payment processors = TRUE REVENUE
- Cash deposits from operations = TRUE REVENUE
- ACH credits from customers = TRUE REVENUE
- MCA advance wires = EXCLUDE (debt proceeds)
- NSF returns, RETURN ITEMs, credit memos = EXCLUDE
- Staffing company advances = EXCLUDE from revenue
- Quarterly vendor rebates over $500 = flag separately
- Internal account transfers = EXCLUDE

### 6. TERM LOANS (classify as other_debt_service, NOT mca_positions):
- Monthly payment with declining balance = amortizing term loan
- Descriptors with "PURCHASE", "LN PMT", "LOAN", "SBA" = term loans
- Auto fleet financing = term loans
- SBA loans = term loans
- Equipment leases = term loans

### 7. NOT DEBT (operating expenses):
- Payment processing fees = OpEx
- Staffing/temp agencies = OpEx (payroll)
- 401(k)/investment contributions = Owner expense
- All product/inventory suppliers = COGS
- Rent, utilities, insurance = OpEx

### 8. REMAINING BALANCE ESTIMATION (Critical for negotiations):
For each MCA position across all months:
- Count TOTAL successful payments across entire analysis period
- If advance deposit wire detected: estimated_payback = advance × factor_rate (use 1.35 default if unknown)
- estimated_remaining = estimated_payback - (total_payments_made × payment_amount)
- Cross-reference: if payments decreased or stopped in later months, note as modification/default

### 9. FACTOR RATE & COST ANALYSIS:
- If advance deposit AND payment pattern known: implied_payback = payment × frequency × estimated_term
- implied_factor_rate = implied_payback / advance_amount
- effective_annual_rate = ((factor_rate - 1) / (term_weeks / 52)) × 100

## KNOWN MCA FUNDER KEYWORDS (200+):
501 Advance, Accord Business Funding, Alfa Advance, Amazon Lending, Arcarius, Arsenal Funding,
Backd, Bitty Advance, Blade Funding, BlueVine, Boom Funded, BriteCap, Broad Street Capital, ByzFunder,
CAN Capital, Capytal, Cashium, Cedar Advance, CFG Merchant, Clearco, Clearfund, Credibly, Creditsafe,
Delta Bridge, Driven Capital, Duluth Capital,
Elevate Funding, Everest Business Funding, Expansion Capital,
FAC Solutions, Fora Financial, Forward Financing, Fox Capital, Fundbox, Fundkite, FundRight,
Green Grass Capital, Greenbox Capital,
Headway Capital, High Rise Capital, Horizon Funding,
Ironwood Finance,
Kapitus, Kinetic Advance, Knight Capital,
Libertas, Liberty Capital, Limelight Capital,
Mantis Funding, Melio Funding, Merchant Marketplace, Mulligan Funding,
National Funding, Newco Capital, Newton Capital,
ONDECK CAPITAL, Ocelot Capital,
Payoneer Capital Advance, PayPal Working Capital, Pearl Capital, Pinnacle Funding, Pipe,
Rapid Finance, Reliant Funding, ROWANADVANCEGROU,
Shopify Capital, Slice Capital, Square Capital, Swift Capital,
TBF GRP, Thryve Capital, Tiger Capital,
Unique Funding, United Capital Source,
Velocity Capital, Vox Funding,
Wayflyer, World Business Lenders,
Yellowstone Capital, Zig Capital,
— and ANY ACH with "CAPITAL", "FUNDING", "ADVANCE", "MCA", "MERCHANT", "FUNDER", "FACTOR" in the description.

## OUTPUT FORMAT — Return ONLY valid JSON, no markdown fences, no text before or after:

{
  "business_name": "string",
  "bank_name": "string",
  "analysis_period": { "earliest": "YYYY-MM-DD", "latest": "YYYY-MM-DD", "months_covered": 0 },

  "monthly_summary": [{
    "month": "November 2025",
    "period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "days_in_period": 0,
    "true_revenue": 0,
    "card_processing": 0,
    "cash_deposits": 0,
    "cogs": 0,
    "gross_profit": 0,
    "total_opex": 0,
    "operating_income": 0,
    "mca_total": 0,
    "beginning_balance": 0,
    "ending_balance": 0,
    "average_daily_balance": 0,
    "negative_days": 0,
    "nsf_events": 0,
    "returned_mca_payments": 0
  }],

  "revenue_trend": {
    "avg_3_month": 0,
    "avg_all": 0,
    "direction": "improving|stable|declining",
    "detail": "string — describe the trend with context including any seasonal observations",
    "monthly_values": [{ "month": "", "revenue": 0 }],
    "peak_month": "",
    "low_month": "",
    "seasonal_note": "string — flag if analyzed months may represent peak or trough season"
  },

  "cash_flow_waterfall": {
    "avg_monthly_revenue": 0,
    "minus_avg_cogs": 0,
    "avg_gross_profit": 0,
    "minus_avg_payroll": 0,
    "minus_avg_rent": 0,
    "minus_avg_utilities": 0,
    "minus_avg_insurance": 0,
    "minus_avg_taxes": 0,
    "minus_avg_other_opex": 0,
    "avg_operating_income": 0,
    "minus_avg_term_loans": 0,
    "minus_avg_sba": 0,
    "minus_avg_auto_fleet": 0,
    "avg_income_before_mca": 0,
    "minus_avg_mca_payments": 0,
    "avg_net_free_cash_flow": 0
  },

  "mca_positions": [{
    "funder_name": "string",
    "descriptor": "string",
    "current_payment_amount": 0,
    "frequency": "weekly",
    "monthly_estimate": 0,
    "confidence": "high|medium|low",
    "status": "active|modified|refinanced|default",
    "first_seen": "YYYY-MM-DD",
    "total_payments_observed": 0,
    "total_returned_observed": 0,
    "payment_trend": [{ "month": "", "amount": 0, "payments_count": 0, "returned_count": 0 }],
    "advance_deposit": { "date": "", "amount": 0 },
    "estimated_original_advance": null,
    "implied_factor_rate": null,
    "implied_payback_total": null,
    "effective_annual_rate": null,
    "estimated_remaining_balance": null,
    "estimated_weeks_remaining": null,
    "returned_payments": [{ "date": "", "amount": 0 }],
    "notes": ""
  }],

  "other_debt_service": [{
    "creditor": "",
    "type": "term_loan|sba|auto_fleet|credit_card|revolving|equipment_lease",
    "monthly_amount": 0,
    "payment_trend": "stable|declining|increasing",
    "notes": ""
  }],

  "stacking_timeline": [{
    "date": "YYYY-MM-DD",
    "event": "string — e.g. 'Funder X funded $179,625 new advance'",
    "impact": "string — e.g. 'Weekly MCA burden increased by $5,437'",
    "weekly_mca_before": 0,
    "weekly_mca_after": 0,
    "cumulative_weekly_burden": 0
  }],

  "advance_deposits": [{
    "date": "",
    "funder": "",
    "amount": 0,
    "evidence": "string — wire description",
    "payment_impact": "string — what payment started or changed",
    "matched_position": "string — which MCA position this funded"
  }],

  "gross_profit_analysis": {
    "avg_monthly_revenue": 0,
    "avg_monthly_cogs": 0,
    "avg_gross_profit": 0,
    "avg_gross_margin_pct": 0,
    "mca_as_pct_of_gross_profit": 0,
    "gross_profit_after_mca": 0
  },

  "risk_metrics": {
    "current_mca_weekly": 0,
    "current_mca_monthly": 0,
    "dsr_mca_only": 0,
    "dsr_all_debt": 0,
    "dsr_tier": "healthy|elevated|stressed|critical|unsustainable",
    "mca_pct_of_gross_profit": 0,
    "gross_profit_after_mca": 0,
    "avg_daily_balance": 0,
    "adb_covers_weekly_mca": false,
    "adb_coverage_ratio": 0,
    "total_negative_days": 0,
    "total_banking_days": 0,
    "total_nsf_events": 0,
    "total_returned_mca": 0,
    "new_debt_in_period": 0,
    "weekly_burden_increase": 0,
    "burden_increase_pct": 0
  },

  "sustainable_payment_analysis": {
    "avg_gross_profit": 0,
    "avg_total_opex": 0,
    "avg_operating_income": 0,
    "non_mca_debt_monthly": 0,
    "available_for_mca": 0,
    "sustainable_weekly_payment": 0,
    "current_weekly_mca": 0,
    "recommended_reduction_pct": 0,
    "recommended_weekly_total": 0,
    "recommended_term_weeks": 0,
    "rationale": "string — explain the math showing what the business can actually support, referencing specific numbers from the analysis. This is the key paragraph funders need to see."
  },

  "negotiation_intel": {
    "headline": "string — one-sentence case summary for funder communications",
    "key_facts": ["string"],
    "stacking_narrative": "string — timeline of how debt escalated with cumulative burden numbers",
    "default_evidence": "string — returned payments, negative days, NSFs with dates",
    "gross_profit_story": "string — the business is viable but the MCA stack is killing it",
    "cost_of_capital_story": "string — highlight any positions with extreme factor rates or APR equivalents",
    "sustainability_case": "string — explain the recommended payment capacity and why it ensures 100% repayment",
    "funder_specific": [{
      "funder": "",
      "estimated_remaining": 0,
      "implied_factor_rate": null,
      "leverage_points": ["string"]
    }]
  },

  "analysis_confidence": {
    "overall": "high|medium|low",
    "revenue_confidence": "high|medium|low",
    "mca_detection_confidence": "high|medium|low",
    "balance_estimation_confidence": "high|medium|low",
    "uncertain_items": ["string — anything the analysis was unsure about"],
    "notes": ""
  }
}

## CALCULATION RULES:
1. DSR tiers: healthy=0-15%, elevated=15-25%, stressed=25-35%, critical=35-50%, unsustainable=50%+
2. Monthly MCA estimate = current_weekly × 4.33
3. Use MOST RECENT month's payment amounts for current calculations.
4. DSR = total_mca_monthly / avg_gross_profit × 100. USE GROSS PROFIT as denominator, NOT revenue.
5. Cross-reference advance wires against payment changes — wire from funder preceded payment increase = refinance, not modification.
6. Sum all advance wires in the period as "new_debt_in_period".
7. weekly_burden_increase = difference between earliest and latest month's total weekly MCA payments.
8. burden_increase_pct = weekly_burden_increase / earliest_weekly × 100
9. sustainable_weekly_payment = (avg_operating_income - non_mca_debt_monthly_converted_to_weekly - 15%_operating_reserve) / 4.33, then convert to weekly
10. recommended_reduction_pct = (current_weekly - sustainable_weekly) / current_weekly × 100
11. ADB coverage ratio = avg_daily_balance / (weekly_mca / 5)
12. effective_annual_rate = ((factor_rate - 1) / (term_weeks / 52)) × 100
13. If seasonal patterns are suspected based on business type or revenue fluctuations, note in seasonal_note.`;

export async function POST(request) {
  try {
    const { statements, model } = await request.json();

    if (!statements || !Array.isArray(statements) || statements.length === 0) {
      return Response.json({ error: 'No statements provided' }, { status: 400 });
    }

    // Validate each statement has text
    const validStatements = [];
    const skipped = [];
    for (let i = 0; i < statements.length; i++) {
      const s = statements[i];
      if (!s || !s.text || typeof s.text !== 'string' || s.text.trim().length < 100) {
        skipped.push(s?.accountLabel || `Statement ${i + 1}`);
      } else {
        validStatements.push(s);
      }
    }

    if (validStatements.length === 0) {
      return Response.json({
        error: 'None of the provided statements contained extractable text. They may be image-based PDFs.',
        skipped
      }, { status: 400 });
    }

    const selectedModel = model === 'sonnet' ? 'claude-sonnet-4-20250514' : 'claude-opus-4-20250514';

    // Build combined text with clear section labels
    const combined = validStatements.map((s, i) =>
      `\n${'='.repeat(60)}\nSTATEMENT ${i + 1}: ${s.accountLabel || 'Unknown'} — ${s.month || 'Unknown'}\n${'='.repeat(60)}\n${s.text}`
    ).join('\n\n');

    // Truncate if needed — scale limit with number of statements
    const maxChars = Math.min(180000, 40000 * validStatements.length);
    const truncated = combined.length > maxChars
      ? combined.slice(0, maxChars) + '\n[TRUNCATED]'
      : combined;

    const response = await client.messages.create({
      model: selectedModel,
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: `${MULTI_PROMPT}\n\nSTATEMENTS TO ANALYZE (${validStatements.length} total):\n${truncated}`
      }]
    });

    const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(cleaned);
    } catch (e) {
      // Robust JSON extraction with balanced brace matching
      let depth = 0, start = -1, end = -1;
      for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (cleaned[i] === '}') {
          depth--;
          if (depth === 0 && start >= 0) { end = i + 1; break; }
        }
      }

      if (start >= 0 && end > start) {
        try {
          analysis = JSON.parse(cleaned.slice(start, end));
        } catch (e2) {
          return Response.json({
            error: 'Multi-analysis completed but returned malformed data. Try re-analyzing or switching models.',
            debug: cleaned.slice(0, 500)
          }, { status: 500 });
        }
      } else {
        return Response.json({
          error: 'Multi-analysis did not return structured data.',
          debug: cleaned.slice(0, 500)
        }, { status: 500 });
      }
    }

    // Post-processing: recalculate DSR against gross profit as safety net
    if (analysis.risk_metrics && analysis.gross_profit_analysis) {
      const gp = analysis.gross_profit_analysis.avg_gross_profit || 0;
      const mcaMonthly = analysis.risk_metrics.current_mca_monthly || 0;
      if (gp > 0) {
        analysis.risk_metrics.dsr_mca_only = parseFloat(((mcaMonthly / gp) * 100).toFixed(1));
        analysis.risk_metrics.mca_pct_of_gross_profit = analysis.risk_metrics.dsr_mca_only;
        analysis.risk_metrics.gross_profit_after_mca = parseFloat((gp - mcaMonthly).toFixed(2));
      }
    }

    return Response.json({
      success: true,
      analysis,
      statement_count: validStatements.length,
      skipped_statements: skipped.length > 0 ? skipped : undefined,
      model_used: selectedModel
    });
  } catch (err) {
    console.error('Multi-analyze error:', err);
    return Response.json({
      error: err.message || 'Multi-analysis failed'
    }, { status: 500 });
  }
}

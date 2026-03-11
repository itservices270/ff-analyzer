import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_PROMPT = `You are an expert MCA (Merchant Cash Advance) underwriter and bank statement analyst for Funders First Inc., a debt restructuring company. You have 15+ years of experience reading bank statements and identifying MCA positions, payment patterns, advance deposits, and true business revenue.

Analyze this bank statement and return a JSON object. Be precise — every number you report will be used in funder negotiations where accuracy is everything. Funders will verify your numbers against their own records. Getting a number wrong destroys credibility.

## CRITICAL CLASSIFICATION RULES

### REVENUE — What counts as TRUE business revenue:
- Card processing / POS payouts (e.g. processor settlements, cashless payment deposits). TRUE REVENUE.
- Cash deposits from operations: Branch deposits, register deposits, physical collection deposits. TRUE REVENUE.
- ACH credits from customers / accounts receivable payments. TRUE REVENUE.
- Small vendor credits/rebates under $500 from product suppliers. TRUE REVENUE (flag separately).

### MUST EXCLUDE FROM REVENUE — these inflate the number and destroy credibility:
- MCA advance wire transfers — ANY large wire from a known MCA funder. These are DEBT PROCEEDS, not revenue.
- NSF RETURN ITEM credits — bounced check reversals, not income.
- RETURN ITEM credits — failed ACH reversals returning a bounced payment.
- CREDIT MEMO entries — bank adjustments.
- Staffing company advances / payroll funding credits — NOT revenue.
- Quarterly vendor rebates over $500 — flag separately, do not include in monthly average.
- Internal transfers between accounts owned by same business. NOT revenue.
- Insurance claim proceeds, legal settlement deposits. NOT revenue.
- Loan proceeds from ANY lender. NOT revenue.

### MCA POSITION DETECTION — Be surgical:
1. Look for recurring ACH debits with CONSISTENT amounts on daily/weekly patterns.
2. CRITICAL: A single funder can have MULTIPLE simultaneous advances. If you see two different recurring payment amounts from the same funder name, list them as SEPARATE positions (e.g. "Funder X (Advance 1)" and "Funder X (Advance 2)"). NEVER merge different payment amounts from the same funder.
3. Track by ACH descriptor reference numbers — different ref numbers from same funder with different amounts = different positions.
4. If a payment amount CHANGED mid-statement AND there was an advance wire deposit from that funder, flag as "refinanced" not "modified". The funder funded a new advance.
5. A returned/bounced MCA payment (NSF, returned item) is a DEFAULT EVENT. Flag prominently.
6. Count EXACT number of successful payments and returned payments per position.

### TERM LOANS vs MCA — Critical distinction:
- ONCE per month = likely TERM LOAN, not MCA. Classify as other_debt_service.
- Payments DECLINING month over month = amortizing term loan.
- Descriptors with "PURCHASE", "LN PMT", "LOAN", "SBA" = term loans.
- Auto fleet financing (GM Financial, Ally, etc.) = term loans.
- SBA loans = term loans.
- Equipment leases = term loans.

### NOT DEBT — Operating expenses (classify under operating_expenses):
- Payment processing fees to card processors. OpEx.
- Staffing/temp agencies. OpEx (payroll).
- 401(k)/investment contributions. Owner expense.
- Beverage/food/product suppliers = COST OF GOODS SOLD.
- Rent, utilities, insurance = OpEx.

### EXPENSE CLASSIFICATION for Gross Profit:
**COGS:** All product suppliers, inventory purchases, wholesale product costs, raw materials.
**Payroll:** Checks to individuals, payroll services (ADP, Gusto, Paychex), staffing agencies.
**Taxes:** IRS payments, state tax agencies. Separate monthly from quarterly spikes.
**Insurance:** All insurance payments (health, liability, property, workers comp).
**Auto/Fleet:** Vehicle financing, fuel cards, fleet management.
**Utilities:** Electric, gas, water, internet, phone, connectivity services.
**Rent/Occupancy:** Lease payments, property management, CAM charges.

### REMAINING BALANCE ESTIMATION — Critical for negotiations:
For each MCA position, estimate the remaining balance using this logic:
- If you detect an advance deposit wire AND know the payment amount and frequency, calculate:
  estimated_payback_total = advance_amount × implied_factor_rate (if factor rate is unknown, use 1.35 as default)
  payments_made = count of successful payments observed (extrapolate if only partial statement)
  estimated_remaining = estimated_payback_total - (payments_made × payment_amount)
- If no advance deposit is visible, estimate based on typical MCA terms:
  If weekly payments, typical term = 26-52 weeks
  Note confidence as "low" if estimating without advance data

### FACTOR RATE & COST ANALYSIS:
- If advance deposit AND payment amount AND frequency are known:
  implied_payback = payment_amount × frequency_per_week × estimated_term_weeks
  implied_factor_rate = implied_payback / advance_amount
  effective_annual_rate = ((factor_rate - 1) / (estimated_term_weeks / 52)) × 100
- Flag any position with factor rate > 1.45 as "high cost"
- Flag any position with effective annual rate > 100% as "extreme cost"

## KNOWN MCA FUNDER KEYWORDS (200+):
501 Advance, Accord Business Funding, Alfa Advance, Amazon Lending, Arcarius, Arsenal Funding,
Backd, Bitty Advance, Blade Funding, BlueVine, Boom Funded, BriteCap, Broad Street Capital, ByzFunder,
CAN Capital, Capytal, Cashium, Cedar Advance, CFG Merchant, Clearco, Clearfund, Credibly,
Creditsafe, Delta Bridge, Driven Capital, Duluth Capital,
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

## OUTPUT FORMAT — Return ONLY valid JSON, no markdown, no backticks, no text before or after:

{
  "business_name": "string",
  "bank_name": "string",
  "account_last4": "string",
  "statement_period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "days_in_period": 0,

  "balance_summary": {
    "beginning_balance": 0,
    "ending_balance": 0,
    "average_daily_balance": 0,
    "lowest_balance": 0,
    "lowest_balance_date": "YYYY-MM-DD",
    "highest_balance": 0,
    "total_deposits": 0,
    "total_withdrawals": 0
  },

  "revenue": {
    "card_processing": 0,
    "cash_deposits": 0,
    "ach_credits": 0,
    "vendor_credits": 0,
    "total_true_revenue": 0,
    "excluded_items": [{ "description": "", "amount": 0, "reason": "" }]
  },

  "gross_profit": {
    "cogs_total": 0,
    "cogs_breakdown": [{ "vendor": "", "amount": 0 }],
    "gross_profit_amount": 0,
    "gross_margin_pct": 0
  },

  "cash_flow_waterfall": {
    "total_true_revenue": 0,
    "minus_cogs": 0,
    "gross_profit": 0,
    "minus_payroll": 0,
    "minus_rent": 0,
    "minus_utilities": 0,
    "minus_insurance": 0,
    "minus_taxes": 0,
    "minus_other_opex": 0,
    "operating_income": 0,
    "minus_term_loans": 0,
    "minus_sba": 0,
    "minus_auto_fleet": 0,
    "income_before_mca": 0,
    "minus_mca_payments": 0,
    "net_free_cash_flow": 0
  },

  "mca_positions": [{
    "funder_name": "",
    "descriptor": "",
    "payment_amount": 0,
    "frequency": "weekly",
    "payments_in_period": 0,
    "returned_payments_count": 0,
    "monthly_total": 0,
    "confidence": "high",
    "status": "active",
    "advance_deposit": null,
    "estimated_remaining_balance": null,
    "estimated_original_advance": null,
    "implied_factor_rate": null,
    "implied_payback_total": null,
    "effective_annual_rate": null,
    "estimated_weeks_remaining": null,
    "payment_history": [{ "date": "", "amount": 0, "status": "paid|returned" }],
    "notes": ""
  }],

  "other_debt_service": [{
    "creditor": "",
    "type": "term_loan|sba|auto_fleet|credit_card|revolving|equipment_lease",
    "monthly_amount": 0,
    "notes": ""
  }],

  "operating_expenses": {
    "estimated_payroll": 0,
    "rent_occupancy": 0,
    "insurance": 0,
    "utilities": 0,
    "taxes_regular": 0,
    "taxes_quarterly_spike": 0,
    "other_operating": 0,
    "total_opex": 0
  },

  "risk_metrics": {
    "dsr_mca_only": 0,
    "dsr_all_debt": 0,
    "mca_pct_of_gross_profit": 0,
    "gross_profit_after_mca": 0,
    "average_daily_balance": 0,
    "adb_covers_weekly_mca": false,
    "adb_coverage_ratio": 0,
    "negative_balance_days": 0,
    "total_banking_days": 0,
    "negative_day_pct": 0,
    "nsf_events": 0,
    "returned_mca_payments": 0,
    "days_negative_list": [],
    "dsr_tier": "healthy|elevated|stressed|critical|unsustainable",
    "trend_direction": "stable|improving|declining",
    "trend_detail": ""
  },

  "advance_deposits_detected": [{
    "date": "",
    "funder": "",
    "amount": 0,
    "evidence": "",
    "matched_position": ""
  }],

  "daily_balances": [{ "date": "", "balance": 0 }],

  "sustainable_payment_analysis": {
    "gross_profit_monthly": 0,
    "total_opex_monthly": 0,
    "operating_income_monthly": 0,
    "non_mca_debt_monthly": 0,
    "available_for_mca": 0,
    "sustainable_weekly_payment": 0,
    "current_weekly_mca": 0,
    "recommended_reduction_pct": 0,
    "recommended_weekly_total": 0,
    "rationale": "string — explain the math showing what the business can actually support"
  },

  "negotiation_intel": {
    "headline": "",
    "key_facts": [],
    "stacking_evidence": "",
    "default_events": "",
    "gross_profit_story": "",
    "cost_of_capital_story": "",
    "funder_specific": [{
      "funder": "",
      "estimated_remaining": 0,
      "leverage_points": ["string"]
    }]
  },

  "analysis_confidence": {
    "overall": "high|medium|low",
    "revenue_confidence": "high|medium|low",
    "mca_detection_confidence": "high|medium|low",
    "uncertain_items": ["string — anything Claude was unsure about"],
    "notes": ""
  }
}

## CALCULATION RULES:
1. DSR tiers: healthy=0-15%, elevated=15-25%, stressed=25-35%, critical=35-50%, unsustainable=50%+
2. Monthly MCA estimate = weekly_amount × 4.33
3. gross_profit_amount = total_true_revenue - cogs_total
4. DSR (MCA only) = total_mca_monthly / gross_profit_amount × 100 (USE GROSS PROFIT, NOT REVENUE)
5. DSR (all debt) = (total_mca_monthly + other_debt_monthly) / gross_profit_amount × 100
6. mca_pct_of_gross_profit = total_mca_monthly / gross_profit_amount × 100
7. gross_profit_after_mca = gross_profit_amount - total_mca_monthly
8. ADB coverage ratio = average_daily_balance / (total_weekly_mca / 5 banking days)
9. Sustainable weekly payment = (operating_income - non_mca_debt - minimum_operating_reserve) / 4.33, where minimum_operating_reserve = 15% of operating_income
10. recommended_reduction_pct = (current_weekly_mca - sustainable_weekly_payment) / current_weekly_mca × 100
11. Every number must trace to specific transactions. Do not estimate when you can count.
12. For remaining balance estimation: if advance deposit detected, use actual amount. If not, flag confidence as "low" and note assumption.
13. effective_annual_rate = ((implied_factor_rate - 1) / (estimated_term_weeks / 52)) × 100`;

export async function POST(request) {
  try {
    const body = await request.json();
    const { text, images, fileName, model } = body;

    const hasText = text && typeof text === 'string' && text.trim().length >= 100;
    const hasImages = images && Array.isArray(images) && images.length > 0;

    if (!hasText && !hasImages) {
      return Response.json({
        error: 'No statement data received. Upload a valid PDF (text-based or scanned).'
      }, { status: 400 });
    }

    const selectedModel = model === 'sonnet' ? 'claude-sonnet-4-20250514' : 'claude-opus-4-20250514';

    // Build content blocks — text or vision
    const contentBlocks = [{ type: 'text', text: ANALYSIS_PROMPT + '\n\nBANK STATEMENT:' }];

    if (hasText) {
      const truncated = text.length > 80000
        ? text.slice(0, 80000) + '\n[TRUNCATED - first 80k chars analyzed]'
        : text;
      contentBlocks.push({ type: 'text', text: truncated });
    }

    if (hasImages) {
      // Cap at 15 pages for vision to control costs
      const pageImages = images.slice(0, 15);
      for (const b64 of pageImages) {
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
      }
      if (!hasText) {
        contentBlocks.push({ type: 'text', text: '\n[This is a scanned/image-based bank statement. Read the images above carefully and extract all data.]' });
      }
    }

    const response = await client.messages.create({
      model: selectedModel,
      max_tokens: 16000,
      messages: [{ role: 'user', content: contentBlocks }]
    });

    const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(cleaned);
    } catch (parseErr) {
      // More robust JSON extraction - find the outermost balanced braces
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
            error: 'Analysis completed but returned malformed data. This sometimes happens with complex statements. Try re-analyzing or switching models.',
            debug: cleaned.slice(0, 500)
          }, { status: 500 });
        }
      } else {
        return Response.json({
          error: 'Analysis did not return structured data. The statement may be too complex or in an unusual format.',
          debug: cleaned.slice(0, 500)
        }, { status: 500 });
      }
    }

    // Post-processing: validate and fill critical fields
    if (analysis.risk_metrics && analysis.gross_profit) {
      const gp = analysis.gross_profit.gross_profit_amount || 0;
      const mcaMonthly = (analysis.mca_positions || []).reduce((s, p) => s + (p.monthly_total || 0), 0);
      // Recalculate DSR against gross profit (not revenue) as a safety check
      if (gp > 0) {
        analysis.risk_metrics.dsr_mca_only = parseFloat(((mcaMonthly / gp) * 100).toFixed(1));
        analysis.risk_metrics.mca_pct_of_gross_profit = analysis.risk_metrics.dsr_mca_only;
        analysis.risk_metrics.gross_profit_after_mca = parseFloat((gp - mcaMonthly).toFixed(2));
      }
    }

    return Response.json({
      success: true,
      analysis,
      file_name: fileName || 'unknown',
      model_used: selectedModel
    });

  } catch (err) {
    console.error('Analyze error:', err);
    return Response.json({
      error: err.message || 'Analysis failed',
      details: err.status ? `API status: ${err.status}` : undefined
    }, { status: 500 });
  }
}

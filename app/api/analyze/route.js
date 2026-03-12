import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_PROMPT = `You are an expert MCA (Merchant Cash Advance) underwriter and bank statement analyst for Funders First Inc., a debt restructuring company.

Analyze this bank statement text thoroughly and return ONLY a valid JSON object (no markdown, no explanation, just raw JSON) with this exact structure:

{
  "business_name": "string",
  "bank_name": "string",
  "account_number": "string (masked, last 4 only)",
  "statement_period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "statement_month": "Month YYYY",

  "balance_summary": {
    "beginning_balance": 0.00,
    "ending_balance": 0.00,
    "total_deposits": 0.00,
    "total_withdrawals": 0.00,
    "days_negative": 0,
    "lowest_balance": 0.00,
    "highest_balance": 0.00
  },

  "revenue": {
    "gross_deposits": 0.00,
    "excluded_mca_proceeds": 0.00,
    "excluded_transfers": 0.00,
    "excluded_loan_proceeds": 0.00,
    "excluded_other": 0.00,
    "net_verified_revenue": 0.00,
    "revenue_sources": [
      { "name": "string", "type": "card_processing|cash_deposit|ach_credit|vendor_payment|loan|transfer|other", "total": 0.00, "is_excluded": false, "confidence": 95, "note": "string" }
    ]
  },

  "mca_positions": [
    {
      "funder_name": "string",
      "payment_amount": 0.00,
      "payment_amount_current": 0.00,
      "payment_amount_original": 0.00,
      "frequency": "daily|weekly|bi-weekly|monthly",
      "payments_detected": 0,
      "estimated_monthly_total": 0.00,
      "first_payment_date": "YYYY-MM-DD",
      "last_payment_date": "YYYY-MM-DD",
      "payment_modified": false,
      "modification_date": "YYYY-MM-DD or null",
      "modification_direction": "reduced|increased|null",
      "advance_deposit_amount": 0.00,
      "advance_deposit_date": "YYYY-MM-DD or null",
      "days_from_deposit_to_payments": 0,
      "pattern_description": "string",
      "confidence": "high|medium|low",
      "flag": "standard|modified|undisclosed|default_modified|double_pull",
      "fuzzy_match": false,
      "fuzzy_match_source": "string or null",
      "double_pull": false,
      "double_pull_dates": [],
      "double_pull_amounts": []
    }
  ],

  "other_debt_service": [
    { "name": "string", "type": "sba_loan|bank_loan|equipment|credit_card|other", "monthly_total": 0.00 }
  ],

  "expense_categories": {
    "payroll": 0.00,
    "rent_utilities": 0.00,
    "inventory_cogs": 0.00,
    "insurance": 0.00,
    "taxes": 0.00,
    "vehicle_fleet": 0.00,
    "technology": 0.00,
    "other_operating": 0.00,
    "total_operating_expenses": 0.00
  },

  "nsf_analysis": {
    "nsf_count": 0,
    "overdraft_count": 0,
    "nsf_dates": [],
    "nsf_risk_score": 0,
    "nsf_trend": "none|stable|increasing|decreasing"
  },

  "calculated_metrics": {
    "total_mca_monthly": 0.00,
    "total_debt_service_monthly": 0.00,
    "dsr_percent": 0.00,
    "free_cash_after_mca": 0.00,
    "avg_daily_balance": 0.00,
    "cash_velocity_score": 0,
    "weeks_to_insolvency": null,
    "trend_direction": "growing|stable|declining|unknown",
    "trend_score": 0
  },

  "flags_and_alerts": [
    { "severity": "critical|warning|info", "category": "string", "message": "string" }
  ],

  "negotiation_intel": {
    "dsr_posture": "healthy|elevated|stressed|critical|unsustainable",
    "strongest_leverage_point": "string",
    "recommended_approach": "string",
    "impossibility_statement": "string or null"
  },

  "raw_transaction_summary": {
    "total_credit_transactions": 0,
    "total_debit_transactions": 0,
    "largest_single_deposit": 0.00,
    "largest_single_withdrawal": 0.00,
    "check_count": 0
  }
}

CRITICAL EXTRACTION RULES:
1. MCA detection: Look for recurring ACH debits with consistent amounts on daily/weekly patterns. Known funders include: OnDeck, TBF GRP, The Merchant Marketplace, TMM, Fundkite, Libertas, Forward Financing, Fora Financial, Rapid Finance, Credibly, Kapitus, CAN Capital, Newtek, FleetCor Funding, Cantaloupe, Square Capital, and any "CAPITAL", "FUNDING", "ADVANCE", "MCA", "MERCHANT" in ACH descriptions. CRITICAL: A single funder can have MULTIPLE simultaneous advances — if you see two different recurring payment amounts from the same funder name, list them as SEPARATE positions with a suffix e.g. "The Merchant Marketplace (Advance 1)" and "The Merchant Marketplace (Advance 2)". Never merge two different payment amounts from the same funder into one position. Look carefully at every unique recurring debit amount separately.
2. PAYMENT MODIFICATION DETECTION: For each funder, scan ALL payments across the entire statement chronologically. If the payment amount CHANGED at any point (e.g. was $3,000/week for first 3 weeks then dropped to $1,500/week), set payment_modified=true, flag="default_modified", record payment_amount_original (what it was before), payment_amount_current (most recent payment), modification_date (first date the new amount appeared), and modification_direction ("reduced" or "increased"). The payment_amount field should always reflect the CURRENT/MOST RECENT payment amount. A reduced payment is a strong signal of default modification or hardship agreement.
3. ADVANCE DEPOSIT CORRELATION: Look for large lump-sum credits from funder names (these are the MCA advance proceeds). Record advance_deposit_amount and advance_deposit_date. Calculate days_from_deposit_to_payments as the number of days between the deposit date and the first payment date. This helps estimate remaining balance and advance age.
4. Revenue exclusions: Exclude MCA advance proceeds (large round-number credits labeled with funder names), inter-account transfers, SBA/loan proceeds. ANY credit containing keywords: "WIRE", "ADVANCE", "GRP", "FUNDING", "CAPITAL", "LOAN", "PROCEEDS" should be classified as type "loan" with is_excluded: true — unless it clearly matches a known revenue processor (Square, Cantaloupe, USA Technologies, etc.). STAFFING companies: "AMF TEAM"/"AMFTEAM"/"AMF STAFFING" and any credit containing "STAFFING" → type "transfer", is_excluded: true. Credits containing "TRANSFER" (not from known revenue processors) → type "transfer", is_excluded: true.
5. Card processing credits (Square, Three Square MAR, LE-USA TECHNOL, Cantaloupe Payouts) are TRUE REVENUE.
5a. ACH CREDITS CLASSIFICATION: Do NOT lump all ACH credits together. ACH from known processors → type "card_processing" or "ach_credit", is_excluded: false. ACH from MCA funders or containing "wire/advance/grp/funding/capital" → type "loan", is_excluded: true. Never combine MCA advance wires into the ach_credits revenue bucket.
5b. PROTECTED REVENUE ACH — ALWAYS COUNT: "ROUTE"/"ROUTE COLLECTION"/"ROUTE PMT" → customer route collections = TRUE REVENUE. "CUSTOMER"/"CUST PMT" → customer payments = TRUE REVENUE. "VEND"/"VENDING" → vending income = TRUE REVENUE. Any ACH credit NOT matching a known MCA funder name → DEFAULT to ach_credit, is_excluded: false. The funder keywords should ONLY promote matching credits to LOAN type, never demote unrecognized customer ACH.
5c. CONFIDENCE SCORING — EVERY revenue_source MUST have a "confidence" field (0-100): 95-100 = known processor exact match or obvious MCA wire; 80-94 = strong match, slightly ambiguous; 60-79 = uncertain, could be revenue or non-revenue (FLAG); 0-59 = very uncertain, unrecognized descriptor (FLAG). When in doubt, score LOWER — better to flag for manual review than silently misclassify.
6. NSF risk score formula: +15 per NSF event, +10 per overdraft, +20 if NSF in final 10 days, +15 if increasing trend. Max 100.
7. DSR = total_mca_monthly / net_verified_revenue * 100
8. Free cash = net_verified_revenue - total_mca_monthly - total_operating_expenses
9. Weeks to insolvency: Only calculate if trend is declining AND ending balance is negative or near zero. Formula: current_balance / weekly_burn_rate.
10. DSR posture: healthy=0-15%, elevated=15-25%, stressed=25-35%, critical=35-50%, unsustainable=50%+
Do NOT include MCA or loan payments in expense_categories — only true operating costs. For vending businesses, inventory purchases go in inventory_cogs only, never double-counted.
11. Be precise with dollar amounts. Cross-reference the balance summary totals with your transaction tallies.
11a. EVERY excluded transaction (MCA wires, staffing credits, transfers) MUST appear in the revenue_sources array with is_excluded: true and the appropriate type (loan/transfer). If a wire appears as an advance_deposit on an MCA position, it MUST ALSO appear in revenue_sources. CROSS-CHECK: After building mca_positions, scan ALL advance_deposit entries — for EACH advance_deposit_amount/advance_deposit_date, verify a matching revenue_source entry exists. If missing, ADD it. A funder with 2 wires = 2 separate revenue_source entries, both type "loan", is_excluded: true.
12. If this is a vending business (Square, Cantaloupe, USA Technologies credits), card processing settlements are the primary revenue source.
13. estimated_monthly_total should always be calculated using payment_amount_current (most recent payment), not the original amount.

FUZZY NAME MATCHING FOR OCR ARTIFACTS:
When matching funder names across transactions, apply these techniques:
1. NORMALIZE: Strip spaces, lowercase, remove special chars. "Merchant Market8882711420" → "merchantmarket8882711420"
2. TOKEN MATCH: 60%+ token overlap = match. "MERCH MKTPLCE HLDGS" matches "Merchant Marketplace Holdings"
3. SUBSTRING MATCH: 6+ char substring of known funder = match. "ROWANADVANCEGROU" matches "Rowan Advance Group"
4. KNOWN ALIASES: "Merchant Market8882711420"/"THE MERCHANT MARKETP"/"TMM" → "The Merchant Marketplace"; "TBF GRP"/"TBF GRPID:56085" → "TBF GRP"; "ROWANADVANCEGROUACHPAYMENT"/"ROWAN ADVANCE" → "Rowan Advance Group"; "ONDECK CAPITAL"/"ONDECK CAP" → "OnDeck Capital"; "Newtek S Bus Fin"/"NEWTEK" → "Newtek"
If fuzzy/alias matched, set fuzzy_match: true and fuzzy_match_source to the original bank descriptor.

DOUBLE-PULL DETECTION:
If >1 debit from the same funder within a 7-day window at DIFFERENT amounts, set double_pull: true, double_pull_dates: [dates], double_pull_amounts: [amounts]. Count ALL debits (including double-pulls) in payments_detected. estimated_monthly_total = sum of ALL debits in that month. Add critical flag. Does NOT apply to regular same-amount daily/weekly patterns.

DATE RANGE RULES: first_payment_date = earliest debit, last_payment_date = latest debit. If only 1 payment detected, set last_payment_date to "present". payments_detected = total count of ALL debits for this position.`;

export async function POST(request) {
  try {
    const body = await request.json();
    const { text, fileName, model, images } = body;

    if (!text && (!images || images.length === 0)) {
      return Response.json({ error: 'No statement data received.' }, { status: 400 });
    }

    const selectedModel = model === 'sonnet' ? 'claude-sonnet-4-20250514' : 'claude-opus-4-20250514';

    const response = await client.messages.create({
      model: selectedModel,
      max_tokens: 8000,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `${ANALYSIS_PROMPT}\n\nBANK STATEMENT TEXT:\n\n${text}`
      }]
    });

    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        analysis = JSON.parse(match[0]);
      } else {
        return Response.json({ error: 'Analysis parsing failed. Raw response: ' + cleaned.slice(0, 300) }, { status: 500 });
      }
    }

    return Response.json({ success: true, analysis, file_name: fileName, model_used: selectedModel });

  } catch (err) {
    console.error('Analyze error:', err);
    return Response.json({ error: err.message || 'Analysis failed' }, { status: 500 });
  }
}

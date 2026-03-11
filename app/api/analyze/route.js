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
      { "name": "string", "type": "card_processing|cash_deposit|ach_credit|vendor_payment|loan|transfer|other", "total": 0.00, "is_excluded": false, "note": "string" }
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
      "flag": "standard|modified|undisclosed|default_modified"
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
4. Revenue exclusions: Exclude MCA advance proceeds (large round-number credits labeled with funder names), inter-account transfers, SBA/loan proceeds.
5. Card processing credits (Square, Three Square MAR, LE-USA TECHNOL, Cantaloupe Payouts) are TRUE REVENUE.
6. NSF risk score formula: +15 per NSF event, +10 per overdraft, +20 if NSF in final 10 days, +15 if increasing trend. Max 100.
7. DSR = total_mca_monthly / net_verified_revenue * 100
8. Free cash = net_verified_revenue - total_mca_monthly - total_operating_expenses
9. Weeks to insolvency: Only calculate if trend is declining AND ending balance is negative or near zero. Formula: current_balance / weekly_burn_rate.
10. DSR posture: healthy=0-15%, elevated=15-25%, stressed=25-35%, critical=35-50%, unsustainable=50%+
Do NOT include MCA or loan payments in expense_categories — only true operating costs. For vending businesses, inventory purchases go in inventory_cogs only, never double-counted.
11. Be precise with dollar amounts. Cross-reference the balance summary totals with your transaction tallies.
12. If this is a vending business (Square, Cantaloupe, USA Technologies credits), card processing settlements are the primary revenue source.
13. estimated_monthly_total should always be calculated using payment_amount_current (most recent payment), not the original amount.`;

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

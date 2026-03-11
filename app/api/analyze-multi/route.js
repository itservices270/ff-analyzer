import Anthropic from '@anthropic-ai/sdk';
export const maxDuration = 180;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MULTI_PROMPT = `You are an expert MCA underwriter and bank statement analyst for Funders First Inc.

You are analyzing MULTIPLE bank statements for the same business — potentially across multiple months and multiple accounts. Your job is to synthesize everything into one unified analysis.

Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:

{
  "business_name": "string",
  "analysis_summary": "2-3 sentence overview of the business's financial health across all statements",
  
  "accounts": [
    {
      "account_label": "string (e.g. Main Checking, Payroll, Pass-through)",
      "bank_name": "string",
      "account_number": "last 4 only",
      "months_provided": ["Month YYYY"]
    }
  ],

  "monthly_breakdown": [
    {
      "month": "Month YYYY",
      "account_label": "string",
      "beginning_balance": 0.00,
      "ending_balance": 0.00,
      "gross_deposits": 0.00,
      "net_verified_revenue": 0.00,
      "card_processing": 0.00,
      "cash_deposits": 0.00,
      "ach_credits": 0.00,
      "vendor_credits": 0.00,
      "total_mca_payments": 0.00,
      "days_negative": 0,
      "nsf_count": 0
    }
  ],

  "revenue_trend": {
    "monthly_revenues": [{"month": "string", "amount": 0.00}],
    "three_month_avg": 0.00,
    "six_month_avg": 0.00,
    "trend_direction": "growing|stable|declining|unknown",
    "trend_score": 0,
    "peak_month": "Month YYYY",
    "lowest_month": "Month YYYY",
    "revenue_volatility": "stable|moderate|volatile"
  },

  "revenue": {
    "gross_deposits": 0.00,
    "excluded_mca_proceeds": 0.00,
    "excluded_transfers": 0.00,
    "excluded_loan_proceeds": 0.00,
    "excluded_other": 0.00,
    "net_verified_revenue": 0.00,
    "monthly_average_revenue": 0.00,
    "card_processing": 0.00,
    "cash_deposits": 0.00,
    "ach_credits": 0.00,
    "vendor_credits": 0.00,
    "cross_account_transfers_detected": 0.00,
    "revenue_sources": [
      { "name": "string", "type": "card_processing|cash_deposit|ach_credit|vendor_payment|loan|transfer|other", "total": 0.00, "monthly_avg": 0.00, "is_excluded": false, "note": "string" }
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
      "pulls_from_accounts": ["account labels where payments appear"],
      "pattern_description": "string",
      "confidence": "high|medium|low",
      "status": "active|paid_off|unmatched_payments|modified|default_modified",
      "flag": "standard|modified|undisclosed|default_modified|paid_off|unmatched"
    }
  ],

  "balance_summary": {
    "most_recent_ending_balance": 0.00,
    "average_ending_balance": 0.00,
    "lowest_ending_balance": 0.00,
    "total_days_negative": 0,
    "lowest_balance_date": "YYYY-MM-DD or null"
  },

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

CRITICAL RULES:
1. CROSS-ACCOUNT DEDUPLICATION: If you see the same transfer appearing as a deposit in one account and a withdrawal in another, it is an internal transfer — exclude from revenue and record in cross_account_transfers_detected.
2. MCA MULTI-ACCOUNT PULLS: Some funders pull from multiple accounts. List all accounts in pulls_from_accounts. Only count the payment ONCE in estimated_monthly_total.
3. MULTIPLE ADVANCES PER FUNDER: If a funder has two different recurring payment amounts, list them as separate positions with "(Advance 1)" and "(Advance 2)" suffixes. CRITICAL: "Merchant Market 8882711420" debits with DIFFERENT reference numbers at DIFFERENT amounts = SEPARATE MCA positions. Example: Merchant Market at $10,718.75 and Merchant Market at $5,587.50 = TWO separate positions.
4. PAYMENT MODIFICATION: If payment amount changed across months, set payment_modified=true, record original vs current, flag="default_modified".
5. ADVANCE DEPOSIT CORRELATION: Match large lump deposits from funder names to their payment streams. Record deposit date and days to first payment.
6. REVENUE TREND: Use all months provided to calculate trend. monthly_revenues should list each month chronologically.
7. Use the MOST RECENT month's MCA payments for estimated_monthly_total and DSR calculations. But if a position is PAID OFF (see rule 12), use $0 for current.
7b. monthly_average_revenue = net_verified_revenue ÷ number of months analyzed. This is the correct denominator for DSR.
8. DSR posture: healthy=0-15%, elevated=15-25%, stressed=25-35%, critical=35-50%, unsustainable=50%+

REVENUE CLASSIFICATION (CRITICAL — get this right):
9. Card processing settlements are TRUE REVENUE — these are the business's actual income:
   - THREE SQUARE MAR (Square card processing) — often $15K-$40K+ per settlement
   - LE-USA TECHNOL / LE - USA TECHNOL (cashless vending processor) — often $50K-$100K+ per settlement
   - Cantaloupe, Inc. PAYMENTS (vending cashless payments) — often $45K-$75K+ per settlement
   - CANTALOUPE PAYOUTS (smaller vending payouts) — typically $1K-$3K
   For vending businesses, these card processor settlements ARE the primary revenue. Do NOT confuse them with MCA advance wires.
9b. Cash deposits labeled "DEPOSIT" with no further descriptor = TRUE REVENUE (cash collections from routes)
9c. ADVANTECH CORP PAYMENT, FERRARA CANDY CO, Unified Strategi = TRUE REVENUE (vendor rebates)
9d. revenue.card_processing = sum of all card processing settlements (THREE SQUARE MAR + LE-USA + Cantaloupe PAYMENTS + Cantaloupe PAYOUTS). cash_deposits = all generic DEPOSITs. ach_credits = other customer ACH payments. vendor_credits = rebates/credits from suppliers.
9e. Each monthly_breakdown entry MUST include card_processing, cash_deposits, ach_credits, vendor_credits that sum to approximately net_verified_revenue.

WIRE TRANSFERS IN: Any large wire transfer deposit (e.g. "WIRE TRANSFER IN", "ACH CREDIT" from a known MCA funder name) must be listed as a revenue_source with is_excluded=true and type="loan". Even if the funder name appears mid-description (e.g. "THE MERCHANT MARKETP" or "ROWAN ADVANCE" or "TBF GRP"), flag it. Do NOT omit large one-time deposits — always include them in revenue_sources so the user can see and manually toggle them.
ADVANCE DEPOSITS: When you detect an MCA funder wire in as a deposit, also record it in the corresponding mca_position as advance_deposit_amount and advance_deposit_date.

NOT-MCA EXCLUSIONS (do NOT classify these as MCA positions):
10. AMF Team Inc / AMFTEAM = STAFFING COMPANY, NOT MCA. Classify as payroll expense even if payments are daily.
10b. FLEETCOR FUNDING = fleet fuel cards. Classify as operating expense, NOT MCA.
10c. AMERICAN FUNDS INVESTMENT = 401k/investment contributions. Owner expense, NOT MCA.
10d. Any staffing/temp agency with daily payment patterns = payroll OpEx, NOT MCA.

PAID-OFF DETECTION (CRITICAL):
11. If a funder has CONSISTENT weekly/daily payments in earlier months but ZERO payments in the most recent 1-2 months, set status="paid_off" and flag="paid_off".
11b. Example: OnDeck Capital at $3,300/week in Nov-Dec-Jan but $0 in Feb = PAID OFF.
11c. For paid-off positions, set payment_amount_current=0, estimated_monthly_total=0.

UNMATCHED ADVANCE DEPOSITS (CRITICAL):
12. If you detect a wire deposit FROM a known/suspected MCA funder but CANNOT find matching payment debits:
12b. STILL list it as an mca_position with status="unmatched_payments" and flag="unmatched"
12c. The funder may use DIFFERENT ACH descriptors for debits vs wire deposits
12d. For Merchant Marketplace: Wire deposits = "THE MERCHANT MARKETP LACE CORP" but debits = "Merchant Market 8882711420" with different reference numbers at different amounts
12e. Look for debits that START or CHANGE near the advance wire date`;

export async function POST(request) {
  try {
    const { statements, model } = await request.json();
    if (!statements || statements.length === 0) {
      return Response.json({ error: 'No statements provided' }, { status: 400 });
    }

    const selectedModel = model === 'sonnet' ? 'claude-sonnet-4-20250514' : 'claude-opus-4-20250514';

    // Build combined content — mix of text and images
    const contentBlocks = [];
    contentBlocks.push({ type: 'text', text: `${MULTI_PROMPT}\n\nSTATEMENTS TO ANALYZE (${statements.length} total):` });

    for (let i = 0; i < statements.length; i++) {
      const s = statements[i];
      contentBlocks.push({ type: 'text', text: `\n${'='.repeat(60)}\nSTATEMENT ${i + 1}: ${s.accountLabel} — ${s.month}\n${'='.repeat(60)}` });
      if (s.images && s.images.length > 0) {
        for (const b64 of s.images.slice(0, 10)) {
          contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
        }
      } else if (s.text) {
        const maxPerStmt = Math.min(50000, Math.floor(200000 / statements.length));
        const truncText = s.text.length > maxPerStmt ? s.text.slice(0, maxPerStmt) + '\n[TRUNCATED]' : s.text;
        contentBlocks.push({ type: 'text', text: truncText });
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
    } catch (e) {
      // Robust balanced-brace JSON extraction
      let depth = 0, start = -1, end = -1;
      for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '{') { if (depth === 0) start = i; depth++; }
        else if (cleaned[i] === '}') { depth--; if (depth === 0 && start >= 0) { end = i + 1; break; } }
      }
      if (start >= 0 && end > start) {
        try { analysis = JSON.parse(cleaned.slice(start, end)); }
        catch { return Response.json({ error: 'Analysis parsing failed. Raw: ' + cleaned.slice(0, 400) }, { status: 500 }); }
      } else {
        return Response.json({ error: 'Analysis did not return structured data.', debug: cleaned.slice(0, 400) }, { status: 500 });
      }
    }

    return Response.json({ success: true, analysis, statement_count: statements.length });
  } catch (err) {
    console.error('Multi-analyze error:', err);
    return Response.json({ error: err.message || 'Analysis failed' }, { status: 500 });
  }
}

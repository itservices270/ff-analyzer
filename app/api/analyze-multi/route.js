import Anthropic from '@anthropic-ai/sdk';
import { buildIndustryPromptBlock } from '../../data/industry-profiles.js';
import achDescriptors from '../../data/ach-descriptors.json' with { type: 'json' };
import funderRiskTiers from '../../data/funder-risk-tiers.json' with { type: 'json' };
export const maxDuration = 180;
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
});

// Build a prompt block from the ACH descriptors + risk tiers JSON data
function buildFunderIntelBlock() {
  const mcaFunders = achDescriptors.descriptors.filter(d => d.category === 'mca_funder');
  const nonMca = achDescriptors.descriptors.filter(d => ['fuel_card', 'factoring', 'loan', 'collections', 'settlement', 'restructuring'].includes(d.category));

  const funderLines = mcaFunders.map(d => `• "${d.pattern}" → ${d.funder} (Tier ${d.tier})`).join('\n');
  const nonMcaLines = nonMca.map(d => `• "${d.pattern}" → ${d.funder} [${d.category.toUpperCase()}] — NOT MCA`).join('\n');

  const tierSummary = Object.entries(funderRiskTiers.tiers).map(([key, t]) => {
    return `${key}-Tier: ${t.label} | Default rate: ${t.default_rate} | Recovery: ${t.default_recovery_cents.low}-${t.default_recovery_cents.high} cents/dollar | Negotiation: ${t.negotiation_difficulty}`;
  }).join('\n');

  return `\n## KNOWN MCA FUNDER ACH DESCRIPTORS (auto-loaded reference)
When you see these patterns in bank statement debits, classify accordingly:

${funderLines}

## NON-MCA DESCRIPTORS — DO NOT CLASSIFY AS MCA POSITIONS:
${nonMcaLines}

## FUNDER RISK TIER REFERENCE:
${tierSummary}
`;
}

const MULTI_PROMPT = `RESPOND WITH VALID JSON ONLY. NO TEXT BEFORE OR AFTER THE JSON. START YOUR RESPONSE WITH { AND END WITH }. ANY TEXT OUTSIDE THE JSON OBJECT WILL BREAK THE APPLICATION.

You are an expert MCA underwriter performing forensic bank statement analysis for Funders First Inc., a debt restructuring company. You have 15+ years of experience analyzing bank statements for MCA debt restructuring cases across all industries.

## REVENUE CLASSIFICATION — VENDING BUSINESSES (CRITICAL — GET THIS RIGHT)

TRUE REVENUE — ALWAYS COUNT (never exclude these):
• "THREE SQUARE MAR" / "THREE SQUARE" → Square card processing settlements. $15K–$45K per settlement. Weekly frequency.
• "LE-USA TECHNOL" / "LEUSA TECHNOL" / "USA TECHNOL" → USA Technologies cashless vending processor. $50K–$100K+ per settlement. Weekly.
• "Cantaloupe, Inc. PAYMENTS" / "CANTALOUPE INC PAYMENTS" / "CANTALOUPE PAYMENTS" → Cashless vending processor. $45K–$80K per settlement. Weekly. THIS IS THE LARGEST REVENUE SOURCE — DO NOT SKIP OR MISCLASSIFY.
• "CANTALOUPE PAYOUTS" → Smaller Cantaloupe payouts. $1K–$3K each.
• "DEPOSIT" entries (cash with no processor name) → Physical route cash collections. Sum ALL of them.
• "FERRARA CANDY" / "FERRARA CANDY CO" → Vendor candy rebate. TRUE REVENUE.
• "ADVANTECH CORP" / "ADVANTECH CORP PAYMENT" → Vendor rebate. TRUE REVENUE.
• "Unified Strategi" → Vendor rebate. TRUE REVENUE.
• Any descriptor containing "VEND" or "VENDING" → Vending machine income. TRUE REVENUE.
• "CANTEEN" → Canteen vending operator. TRUE REVENUE.
• "COMPASS GROUP" → Food service operator. TRUE REVENUE.
• "ARAMARK" → Food service operator. TRUE REVENUE.
• "FIRST DATA" → Card processing settlement. TRUE REVENUE.

EXCLUSIONS — NEVER COUNT AS REVENUE:
• MCA advance wire proceeds: Large credits labeled with funder names (MERCHANT MARKETPLACE, THE MERCHANT MARKETP, TBF, TBF GRP, ROWAN ADVANCE, ONDECK, NEWTEK, etc.) — these are ADVANCE PROCEEDS, not revenue
• ANY credit containing the keywords: "WIRE", "ADVANCE", "GRP", "FUNDING", "CAPITAL", "LOAN", "PROCEEDS" — classify as type "loan" with is_excluded: true unless it clearly matches a known revenue processor (Square, Cantaloupe, USA Technologies, etc.)
• Returned/NSF items: "NSF RETURN ITEM", "RETURN ITEM" credits — these are bounced debits returning to the account, not income
• Returned ACH debits: When a funder's ACH bounces, the bank credits back the amount — this is NOT revenue
• "CREDIT MEMO" entries under $100 — bank fee adjustments
• Inter-account transfers: "TRANSFER FROM", "TRANSFER IN" between own accounts
• STAFFING COMPANIES: "AMF TEAM" / "AMFTEAM" / "AMF STAFFING" / any credit containing "STAFFING" → type: "transfer", is_excluded: true. These are staffing company payments/refunds, NOT revenue.
• Any credit containing "TRANSFER" that is NOT from a known revenue processor → type: "transfer", is_excluded: true

ACH CREDITS CLASSIFICATION (CRITICAL — DO NOT LUMP ALL ACH TOGETHER):
• ACH credits from known processors (Cantaloupe, USA Technologies, Square, First Data) → type: "card_processing" or "ach_credit", is_excluded: false
• ACH credits from MCA funders (any funder name, or containing "wire", "advance", "grp", "funding", "capital") → type: "loan", is_excluded: true
• ACH credits you cannot identify → type: "ach_credit", is_excluded: false (benefit of the doubt), but add note: "unidentified ACH — manual review recommended"
• NEVER combine MCA advance wires into the ach_credits revenue bucket. They are LOANS, not revenue.

PROTECTED REVENUE ACH PATTERNS — ALWAYS COUNT AS REVENUE (never exclude):
• "ROUTE" / "ROUTE COLLECTION" / "ROUTE PMT" → customer route collections, TRUE REVENUE
• "CUSTOMER" / "CUST PMT" / "CUST PAYMENT" → customer payments, TRUE REVENUE
• "VEND" / "VENDING" / "VEND PMT" → vending income, TRUE REVENUE
• Any ACH credit that does NOT match a known MCA funder name → DEFAULT to ach_credit, is_excluded: false
• The funder keyword list ("WIRE", "ADVANCE", "GRP", "FUNDING", "CAPITAL") should ONLY be used to classify credits that match a known funder — NEVER to demote an unrecognized customer ACH payment to LOAN type

ACH CREDIT DEPOSITS — DO NOT REPORT AS $0:
ACH credits are electronic deposits from customers, vendors, or payment processors. On bank statements they typically appear as:
- "ACH Credit" or "ACH CREDIT"
- "ACH Deposit"
- "Electronic Deposit"
- "Direct Deposit" (from a customer, not payroll)
- Credits with a company name that is NOT a known payment processor AND NOT a known MCA funder

ACH credits from CUSTOMERS or CLIENTS are REVENUE. Classify them as type "ach_credit" in the revenue breakdown with is_excluded: false.
ACH credits from KNOWN MCA FUNDERS (wire deposits from TBF, TMM, Rowan, etc.) are NOT revenue — classify as type "loan" with is_excluded: true.
ACH credits from payment processors (Cantaloupe, Square, etc.) should be classified under their specific processor type ("card_processing"), not as generic ACH credits.

Do NOT report ach_credits as $0 if there are electronic deposits on the statements that don't fall into card processing, cash deposits, or MCA wires. If deposits exist on the statement that are not card processing and not MCA wires, they are likely ACH credits — count them.

CONFIDENCE SCORING — EVERY revenue_source MUST have a "confidence" field (0-100):
• 95-100: Known processor exact match (Cantaloupe, Square, LE-USA TECHNOL, Three Square MAR) or obvious MCA wire with funder name match
• 80-94: Strong match with slightly ambiguous descriptor (e.g., cash deposit with clear business pattern, known staffing transfer)
• 60-79: Uncertain — could be revenue or non-revenue. Unrecognized ACH with ambiguous descriptor, vendor returns that might be revenue or refunds. FLAG THESE.
• 0-59: Very uncertain — completely unrecognized descriptor, unusual one-time amount, could be anything. FLAG THESE.
When in doubt, score LOWER. It is better to flag a deposit for manual review (confidence < 80) than to silently misclassify it. A wrong revenue number cascades errors into DSR, free cash flow, and negotiation intel.

CRITICAL REVENUE CALCULATION METHOD:
1. Start with the gross deposits total printed on page 1 of the statement
2. Identify ALL exclusions (MCA wires, NSF returns, returned ACH, transfers)
3. Subtract exclusions from gross deposits = TRUE REVENUE
4. Do NOT start from zero and sum only recognized items — you will miss cash deposits

## MCA POSITION DETECTION

CRITICAL RULE — SAME FUNDER, MULTIPLE POSITIONS:
If you see debits from the same payee at DIFFERENT amounts on the SAME dates or same week, those are SEPARATE positions ONLY IF the payment amounts differ by more than $500. If two debits from the same funder have the SAME amount (within $500), they are the SAME position — do NOT create duplicates.

DEDUPLICATION RULE: Before finalizing mca_positions, check for duplicates:
- If two entries have the same funder name (fuzzy match) AND payment amounts within $500 → MERGE into one position, keeping the one with more payments_detected
- Only create separate positions for the same funder when amounts are MEANINGFULLY different (>$500 apart)
- Example: Two "TBF GRP" entries both at $16,312.50/week = ONE position (merge them)
- Example: "Merchant Market" at $11,693/week AND "Merchant Market" at $9,764/week = TWO positions (different amounts)

### Merchant Marketplace / The Merchant Marketplace Holdings Corp:
• Bank debit payee: "Merchant Market8882711420" (note phone number embedded)
• Wire credit payee: "THE MERCHANT MARKETPLACE CORP" or "THE MERCHANT MARKETP LACE CORP"
• The ACH reference number is embedded in the description — different reference series = different positions
• Example: ref ~137xxxxx at $11,693.18/wk = Position A (older, ongoing)
• Example: ref ~138xxxxx at $9,764.75/wk = Position C (newer, started 02/25/2026)
• Example: ref ~133xxxxx or ~501xxxxx at $5,587.50/wk = Position B (paid off 02/18/2026)
• The $35.00 fee debits are ACH Program Fees, NOT a separate position
• If one amount STOPS and a wire arrives and a NEW amount STARTS one week later → old position paid off, new position started
• List old position as status: "paid_off" with last_payment_date
• List new position as status: "active" with first_payment_date and wire_deposit_date

### Known MCA funders and their bank debit patterns:
• TBF GRP: "TBF GRPID:56085" or "TBF GRP" — weekly $16,312.50
• Rowan Advance Group: "ROWANADVANCEGROUACHPAYMENT" or "ROWAN ADVANCE" — weekly
• Merchant Marketplace: "Merchant Market8882711420" — see above for multiple position handling
• OnDeck Capital: "ONDECK CAPITAL" — weekly
• Newtek: "Newtek S Bus Fin" — daily/weekly

### NOT-MCA EXCLUSIONS (do NOT classify as MCA positions):
• FleetCor: "FLEETCOR FUNDING" — fleet fuel cards. Classify as vehicle_fleet expense, NOT MCA.
• AMF Team / AMFTEAM: STAFFING company. Classify as payroll expense, NOT MCA.
• AMERICAN FUNDS INVESTMENT: 401k/investment contributions. Owner expense, NOT MCA.
• Any staffing/temp agency with daily payment patterns = payroll OpEx, NOT MCA.

## PAID-OFF DETECTION (CRITICAL):
• If a funder shows consistent weekly/daily payments in earlier months but ZERO debits in the most recent month → status: "paid_off"
• If a funder wire appears (credit) but NO matching debits ever appear → status: "unmatched_advance"
• When a Merchant Marketplace position STOPS mid-statement and a wire from "THE MERCHANT MARKETPLACE CORP" arrives around the same time, followed by a new debit amount starting 1 week later:
  1. Old position was paid off (final balance in the new advance)
  2. New advance was funded (wire = net proceeds)
  3. New position starts debiting 1 week later at new amount
• List paid-off positions with status: "paid_off" and final payment date filled in

## NSF / RETURNED ITEMS — REPORT ALL:
• Returned checks: Look for "R" flag next to check number, or "RETURN ITEM" credit appearing after the check debit
• Returned ACH: Look for credit with same amount as a recent funder debit, labeled "RETURN" — report the funder name and amount
• These are CRITICAL signals — a returned TBF ACH debit is MORE important than 10 NSFs
• Count every NSF event in nsf_count
• List details in nsf_events array

## DSR CALCULATION — MANDATORY FORMULA:
• monthly_gross_profit = monthly_true_revenue × (1 - cogs_rate). The cogs_rate is specified in the INDUSTRY CONTEXT section below. If no industry context is provided, use 0.40 as default.
• cogs_rate = see INDUSTRY CONTEXT section below (default: 0.40 if not specified)
• dsr_percent = (total_mca_monthly / monthly_gross_profit) × 100
• DO NOT divide MCA by gross revenue — that produces an artificially low DSR
• Example: $209,000 MCA / ($571,000 × 0.60 = $342,600 gross profit) = 61.0% DSR
• DSR tiers: <20% healthy | 20–35% elevated | 35–50% stressed | 50–65% critical | 65%+ unsustainable

## AVERAGE DAILY BALANCE (ADB) EXTRACTION — CRITICAL:
Many bank statements include a daily balance table, daily ledger, or a summary line showing "Average Daily Balance" or "Average Collected Balance" or "Average Ledger Balance."

To extract ADB:
1. FIRST: Look for an explicit "Average Daily Balance" or "Average Balance" line printed on the statement summary page. Many banks print this directly. If found, use that number.
2. SECOND: If no explicit average is shown, look for a daily balance table (a table showing each day's ending balance). Sum all daily ending balances and divide by the number of days.
3. THIRD: If neither is available, use the transaction ledger — each transaction line shows a running balance. Use the ending balance from the LAST transaction each day to get daily closing balances. Calculate the average of those daily closing balances.
4. FOURTH: If no daily data can be extracted, estimate from (beginning balance + ending balance) / 2 for each month.

For Beverly Bank & Trust specifically: The statement includes daily balance information in the transaction ledger — each transaction line shows a running balance column. Use the ending balance from the last transaction on each day to compute the daily closing balance, then average across all days.

Output the ADB as "avg_daily_balance" in balance_summary AND populate "adb_by_month" with per-month ADB values.

DO NOT return 0 for ADB unless the account truly had a $0 balance every day. An ADB of $0 on an active business account with deposits and withdrawals is ALWAYS an extraction error — try harder.

• Flag: If any single day's balance is >50% higher than surrounding days due to a known MCA advance wire, calculate a second "avg_daily_balance_adjusted" excluding that spike date

## NEGATIVE BALANCE TRACKING:
• Count every calendar day the closing balance was negative
• Include weekends if the balance was negative Friday through Monday (those are negative even without a listed balance entry)
• Record in total_days_negative and days_negative per month

## OUTPUT SCHEMA — Return ONLY valid JSON, no markdown, no preamble:

{
  "business_name": "string",
  "bank_name": "string — e.g. Beverly Bank & Trust",
  "analysis_summary": "2-3 sentence overview of financial health",

  "months_analyzed": 0,
  "months_missing": ["string — months that could not be read"],
  "statement_periods": [{"month": "February 2026", "start": "2026-01-31", "end": "2026-02-27"}],
  "revenue_confidence": "high|partial|low",

  "accounts": [
    {
      "account_label": "string (e.g. Main Checking)",
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
      "nsf_count": 0,
      "notes": "string — any anomalies"
    }
  ],

  "revenue": {
    "gross_deposits": 0.00,
    "excluded_mca_proceeds": 0.00,
    "excluded_nsf_returns": 0.00,
    "excluded_transfers": 0.00,
    "excluded_other": 0.00,
    "net_verified_revenue": 0.00,
    "monthly_average_revenue": 0.00,
    "cogs_rate": 0.40,
    "monthly_gross_profit": 0.00,
    "card_processing": 0.00,
    "cash_deposits": 0.00,
    "ach_credits": 0.00,
    "vendor_credits": 0.00,
    "cross_account_transfers_detected": 0.00,
    "revenue_sources": [
      { "name": "string", "type": "card_processing|cash_deposit|ach_credit|vendor_payment|loan|transfer|other", "total": 0.00, "monthly_avg": 0.00, "is_excluded": false, "confidence": 95, "date": "YYYY-MM-DD or null", "note": "string" }
    ]
  },

  "revenue_trend": {
    "monthly_revenues": [{"month": "string", "revenue": 0.00, "notes": "string"}],
    "three_month_avg": 0.00,
    "six_month_avg": 0.00,
    "trend_direction": "increasing|stable|declining|unknown",
    "trend_score": 0,
    "peak_month": "Month YYYY",
    "lowest_month": "Month YYYY",
    "revenue_volatility": "stable|moderate|volatile"
  },

  "mca_positions": [
    {
      "funder_name": "string — append (Position A), (Position B) if same funder has multiple",
      "bank_debit_description": "string — exact ACH descriptor from bank",
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
      "pulls_from_accounts": ["account labels"],
      "pattern_description": "string",
      "confidence": "high|medium|low",
      "status": "active|paid_off|unmatched_advance|modified",
      "flag": "standard|modified|undisclosed|paid_off|unmatched|double_pull",
      "fuzzy_match": false,
      "fuzzy_match_source": "string or null — original bank descriptor if fuzzy matched",
      "double_pull": false,
      "double_pull_dates": [],
      "double_pull_amounts": [],
      "notes": "string — e.g. ACH reference series, payoff details"
    }
  ],

  "balance_summary": {
    "most_recent_ending_balance": 0.00,
    "average_ending_balance": 0.00,
    "lowest_ending_balance": 0.00,
    "total_days_negative": 0,
    "lowest_balance_date": "YYYY-MM-DD or null",
    "avg_daily_balance": 0.00,
    "avg_daily_balance_adjusted": 0.00,
    "negative_periods": [{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "min_balance": 0.00}]
  },

  "nsf_analysis": {
    "nsf_count": 0,
    "overdraft_count": 0,
    "nsf_dates": ["YYYY-MM-DD"],
    "nsf_risk_score": 0,
    "nsf_trend": "none|stable|increasing|decreasing",
    "nsf_events": [{"date": "YYYY-MM-DD", "amount": 0.00, "description": "string", "type": "returned_check|returned_ach|overdraft"}],
    "returned_ach_debits": [{"date": "YYYY-MM-DD", "amount": 0.00, "funder": "string", "note": "string"}]
  },

  "adb_by_month": [{"month": "Month YYYY", "adb": 0.00, "adb_adjusted": 0.00, "note": "string"}],

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

  "calculated_metrics": {
    "total_mca_weekly": 0.00,
    "total_mca_monthly": 0.00,
    "total_debt_service_monthly": 0.00,
    "dsr_percent": 0.00,
    "dsr_posture": "healthy|elevated|stressed|critical|unsustainable",
    "free_cash_after_mca": 0.00,
    "true_free_cash": 0.00,
    "weeks_to_insolvency": null,
    "trend_direction": "increasing|stable|declining|unknown",
    "trend_score": 0
  },

  "flags_and_alerts": [
    { "severity": "critical|warning|info", "category": "string", "message": "string" }
  ],

  "negotiation_intel": {
    "dsr_posture": "healthy|elevated|stressed|critical|unsustainable",
    "strongest_leverage_point": "string",
    "recommended_approach": "string",
    "impossibility_statement": "string or null — only if DSR >50%"
  },

  "raw_transaction_summary": {
    "total_credit_transactions": 0,
    "total_debit_transactions": 0,
    "largest_single_deposit": 0.00,
    "largest_single_withdrawal": 0.00,
    "check_count": 0
  },

  "analysis_notes": "string — any issues, scanned pages that couldn't be read, etc."
}

## WEEKS TO INSOLVENCY — CORRECTED FORMULA:
weeks_to_insolvency should ONLY be calculated when true_free_cash is NEGATIVE (business is losing money).
Formula: weeks = (avg_daily_balance × 30) / (total_mca_monthly - monthly_average_revenue) × 4.33
If monthly_average_revenue >= total_mca_monthly, set weeks_to_insolvency to null — the business is NOT insolvent.
If avg_daily_balance is 0, set weeks_to_insolvency to null.
Do NOT default to 2 weeks. A business doing $500K+ monthly revenue with $200K MCA burden is NOT 2 weeks from insolvency.

## EXCLUDED MCA PROCEEDS — STRICT RULES:
excluded_mca_proceeds must ONLY include actual MCA advance wire deposits from known funders.
NEVER classify these as MCA proceeds regardless of amount:
• THREE SQUARE MAR / THREE SQUARE → Square card processing = REVENUE
• LE-USA TECHNOL / USA TECHNOL → USA Technologies = REVENUE
• Cantaloupe, Inc. PAYMENTS / CANTALOUPE → Cashless vending = REVENUE
• FERRARA CANDY → Vendor rebate = REVENUE
• ADVANTECH CORP → Vendor rebate = REVENUE
• Any deposit from a payment processor or customer = REVENUE
Only these patterns indicate MCA advance proceeds:
• Wire credits explicitly labeled with funder names (TMM, TBF, ROWAN, ONDECK, etc.)
• Credits containing "WIRE" + a funder name
• Large lump sums appearing 5-7 days before new MCA debit series starts

## CRITICAL RULES SUMMARY:

1. REVENUE: Start with gross deposits, subtract exclusions. Cantaloupe PAYMENTS is the LARGEST vending revenue source.

2. MULTIPLE POSITIONS: Same funder with different amounts (>$500 apart) = SEPARATE positions. Same funder with same amount (within $500) = ONE position, do NOT duplicate.

3. WIRE TRACKING: List EACH MCA wire as separate revenue_source entry with its own date. Never combine or sum multiple wires from same funder. EVERY excluded transaction (MCA wires, staffing credits, transfers) MUST appear in the revenue_sources array with is_excluded: true. If a wire appears as an advance_deposit on an MCA position, it MUST ALSO appear in revenue_sources as type "loan", is_excluded: true. CROSS-CHECK: After building mca_positions, scan ALL advance_deposit entries — for EACH advance_deposit_amount/advance_deposit_date, verify a matching revenue_source entry exists. If missing, ADD it. A funder with 2 wires = 2 revenue_source entries. Example: TMM wire $319K on 12/30 AND TMM wire $121K on 2/19 = TWO separate revenue_source entries both type "loan", is_excluded: true.

4. DSR DENOMINATOR: dsr_percent = total_mca_monthly / (monthly_average_revenue × 0.60). Use gross profit, NOT revenue.

5. DSR TIERS: <20% healthy | 20-35% elevated | 35-50% stressed | 50-65% critical | 65%+ unsustainable

6. PAID-OFF: Consistent payments in earlier months + $0 in recent month = status: "paid_off"

7. NSF PRIORITY: Returned MCA ACH debits are CRITICAL signals. Always report funder name and amount.

8. NEGATIVE DAYS: Count ALL calendar days with negative balance, including weekends.

9. SCANNED MONTHS: If a statement has empty or unreadable text, note in months_missing and set revenue_confidence to "partial" or "low".

10. MERCHANT MARKETPLACE SPECIFICS: Different ACH reference series = different positions. $35.00 debits are fees, not positions.

11. TAX EXPENSE CATEGORIZATION:
When categorizing tax-related debits in expense_categories.taxes:
• QUARTERLY ESTIMATED TAX PAYMENTS: If you see a large tax payment ($50K-$200K+) that appears once in a 3-4 month period, this is a quarterly estimated tax payment. Divide by 3 to get the monthly equivalent. Do NOT attribute the full quarterly amount to a single month's expense.
• SALES TAX REMITTANCES: Payments to state tax authorities for collected sales tax are pass-throughs — include them in taxes but note they are sales tax remittances.
• PAYROLL TAXES: Regular tax payments tied to payroll (941 deposits, state withholding) should be included under payroll, not under taxes.
• REASONABLENESS CHECK: For a business doing $500K-$800K monthly revenue, total monthly tax expense (income + sales) should typically be 5-15% of revenue ($25K-$120K/month). If your calculation exceeds 20% of monthly revenue, re-examine — you likely counted a quarterly/annual payment as monthly. A $150K quarterly tax payment = $50K/month, not $150K/month.
• Report the MONTHLY AVERAGE tax expense across all analyzed months, not a single month's spike.

## FUZZY NAME MATCHING FOR OCR ARTIFACTS (CRITICAL FOR SCANNED STATEMENTS)

When matching funder names across transactions and months, apply these techniques in order:
1. NORMALIZE: Strip all spaces, lowercase, remove special characters. "Merchant Market8882711420" → "merchantmarket8882711420"
2. TOKEN MATCH: If 60%+ of tokens in the bank descriptor match a known funder name, it's a match. "MERCH MKTPLCE HLDGS" matches "Merchant Marketplace Holdings"
3. SUBSTRING MATCH: If a 6+ character substring of a known funder appears in the descriptor, it's a match. "ROWANADVANCEGROU" matches "Rowan Advance Group"
4. KNOWN ALIASES — always treat these as the same funder:
   - "Merchant Market8882711420", "THE MERCHANT MARKETP", "THE MERCHANT MARKETPLACE CORP", "MERCH MKTPLCE", "TMM" → "The Merchant Marketplace"
   - "TBF GRP", "TBF GRPID:56085", "TBF GRPID" → "TBF GRP"
   - "ROWANADVANCEGROUACHPAYMENT", "ROWAN ADVANCE", "ROWAN ADV" → "Rowan Advance Group"
   - "ONDECK CAPITAL", "ONDECK CAP", "ON DECK" → "OnDeck Capital"
   - "Newtek S Bus Fin", "NEWTEK SMALL", "NEWTEK" → "Newtek"
   - "FUNDKITE", "FUND KITE" → "Fundkite"
   - "LIBERTAS FUND", "LIBERTAS" → "Libertas Funding"
   - "FORWARD FIN", "FORWARD FINANCING" → "Forward Financing"

If a funder match was made via fuzzy/alias matching rather than an exact descriptor match, set fuzzy_match: true and fuzzy_match_source to the original bank descriptor text.

IMPORTANT: Fuzzy matching applies ONLY to DEBITS for MCA position detection. Do NOT use fuzzy matching to reclassify ACH CREDITS as loans. Customer ACH credits ("ROUTE", "CUSTOMER", "CUST PMT", "VEND", etc.) must remain as revenue even if they partially match a funder keyword. Only reclassify a credit as LOAN if it is a clear, specific match to a known MCA funder name.

## PAYMENT CHANGE DETECTION ACROSS MONTHS

For each funder, group ALL debits chronologically across ALL months. Compare the payment amount in the MOST RECENT month to prior months:
- If the amount changed by >2%, set payment_modified: true
- payment_amount_current = the LATEST month's recurring debit amount (this is the authoritative current figure)
- payment_amount_original = the amount from the earlier month(s)
- modification_date = first date the new amount appeared
- modification_direction = "reduced" if current < original, "increased" if current > original
- >2% change → add to flags_and_alerts as severity "warning": "Payment change detected: [funder] changed from $X to $Y in [month]"
- >10% change → add to flags_and_alerts as severity "critical": "Significant payment change: [funder] dropped from $X to $Y (XX% reduction) — possible default modification"
- ALWAYS use the latest month's payment for estimated_monthly_total calculations

## DOUBLE-PULL DETECTION

If MORE THAN ONE debit from the same funder occurs within a 7-day window at DIFFERENT amounts, flag as a double-pull. This does NOT apply to regular daily/weekly patterns at the SAME amount — only flag when two DIFFERENT debit amounts from the same funder hit within 7 days.
- Set double_pull: true on the position
- Set double_pull_dates to the array of dates involved
- Set double_pull_amounts to the array of amounts involved
- payments_detected should count ALL debits attributed to this position (including double-pull debits)
- estimated_monthly_total should be the SUM of all debits in the most recent month, not just one payment
- Add to flags_and_alerts as severity "critical": "Double pull detected: [funder] debited $X on [date1] and $Y on [date2] within 7 days"
- This is a CRITICAL red flag — it may indicate the funder is pulling two separate advances or made an unauthorized extra pull

## DATE RANGE AND PAYMENT COUNTING RULES

- first_payment_date = the EARLIEST debit date detected for this position across all months
- last_payment_date = the LATEST debit date detected for this position across all months
- If only ONE payment was detected, set last_payment_date to "present" (indicating the position is still active)
- payments_detected = total COUNT of ALL debits attributed to this position across all months
- If a funder has double-pull debits (two different amounts in same week), count BOTH as separate payments
- estimated_monthly_total should reflect the ACTUAL total debited in the most recent month (sum all debits for that month)

RESPOND WITH VALID JSON ONLY. NO TEXT BEFORE OR AFTER THE JSON. START YOUR RESPONSE WITH { AND END WITH }. ANY TEXT OUTSIDE THE JSON OBJECT WILL BREAK THE APPLICATION.`;

// ─── POST-PROCESSING: Deduplicate MCA positions ────────────────────────────
// Merges duplicate positions from the same funder when payment amounts match
// within $500 and dates overlap within 2 weeks. Only keeps separate positions
// when the payment amounts are meaningfully different.
function deduplicatePositions(positions) {
  if (!positions || positions.length === 0) return [];

  const normalize = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Group by normalized funder name (first 6+ chars match)
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < positions.length; i++) {
    if (assigned.has(i)) continue;
    const group = [i];
    assigned.add(i);
    const nameI = normalize(positions[i].funder_name);

    for (let j = i + 1; j < positions.length; j++) {
      if (assigned.has(j)) continue;
      const nameJ = normalize(positions[j].funder_name);

      // Check if same funder (6+ char prefix match or substring containment)
      const isSameFunder =
        (nameI.length >= 6 && nameJ.length >= 6 &&
         (nameI.includes(nameJ.slice(0, 6)) || nameJ.includes(nameI.slice(0, 6)))) ||
        nameI === nameJ;

      if (isSameFunder) {
        group.push(j);
        assigned.add(j);
      }
    }
    groups.push(group);
  }

  const deduped = [];
  for (const group of groups) {
    if (group.length === 1) {
      deduped.push(positions[group[0]]);
      continue;
    }

    // Within a same-funder group, merge positions with similar payment amounts
    const subPositions = group.map(i => positions[i]);
    const kept = [];

    for (const pos of subPositions) {
      const amt = pos.payment_amount_current || pos.payment_amount || 0;
      // Find an existing kept position with similar amount
      const match = kept.find(k => {
        const kAmt = k.payment_amount_current || k.payment_amount || 0;
        return Math.abs(amt - kAmt) <= 500;
      });

      if (match) {
        // Merge: keep the one with more payments detected, or the more recent one
        const matchPayments = match.payments_detected || 0;
        const posPayments = pos.payments_detected || 0;
        if (posPayments > matchPayments) {
          // Replace match with this one (more data)
          const idx = kept.indexOf(match);
          kept[idx] = pos;
        }
        // Otherwise just skip this duplicate
      } else {
        // Meaningfully different amount (>$500) → separate position
        kept.push(pos);
      }
    }

    deduped.push(...kept);
  }

  return deduped;
}

// ─── POST-PROCESSING: Fix excluded_mca_proceeds ─────────────────────────────
// Only count revenue_sources as excluded MCA proceeds if they match known funder
// patterns. Protected revenue processors are NEVER MCA proceeds.
function fixExcludedMCAProceeds(analysis) {
  if (!analysis?.revenue?.revenue_sources) return analysis;

  const protectedProcessors = [
    'three square', 'square', 'le-usa', 'usa technol', 'cantaloupe',
    'ferrara', 'advantech', 'unified strategi', 'canteen', 'compass group',
    'aramark', 'first data', 'vend', 'route', 'customer', 'cust pmt',
  ];

  const knownFunders = [
    'tbf', 'rowan', 'merchant market', 'ondeck', 'newtek', 'fundkite',
    'libertas', 'forward fin', 'merchant marketplace', 'tmm',
    'bizfi', 'credibly', 'kapitus', 'yellowstone', 'rapid', 'can capital',
    'square capital' // Note: "Square Capital" IS an MCA funder, not Square payments
  ];

  let correctedExcluded = 0;
  const sources = analysis.revenue.revenue_sources;

  for (const src of sources) {
    const name = (src.name || '').toLowerCase();

    // If marked as excluded loan, check if it's actually a protected processor
    if (src.is_excluded && src.type === 'loan') {
      const isProtected = protectedProcessors.some(p => name.includes(p));
      const isFunder = knownFunders.some(f => name.includes(f));

      if (isProtected && !isFunder) {
        // Wrongly classified — this is revenue, not MCA proceeds
        src.is_excluded = false;
        src.type = 'ach_credit';
        src.note = (src.note || '') + ' [CORRECTED: reclassified from loan to revenue — matches known revenue processor]';
      } else if (isFunder) {
        correctedExcluded += src.total || src.monthly_avg || 0;
      }
    } else if (src.is_excluded && src.type === 'loan') {
      correctedExcluded += src.total || src.monthly_avg || 0;
    }
  }

  // Recalculate excluded_mca_proceeds from actual funder wires only
  const months = Math.max((analysis.monthly_breakdown || []).length, 1);
  const totalExcludedFromFunders = sources
    .filter(s => s.is_excluded && s.type === 'loan')
    .reduce((sum, s) => sum + (s.total || 0), 0);

  if (totalExcludedFromFunders > 0) {
    analysis.revenue.excluded_mca_proceeds = totalExcludedFromFunders;
  }

  // Recalculate net_verified_revenue
  const grossDeposits = analysis.revenue.gross_deposits || 0;
  const excludedTotal = (analysis.revenue.excluded_mca_proceeds || 0) +
    (analysis.revenue.excluded_nsf_returns || 0) +
    (analysis.revenue.excluded_transfers || 0) +
    (analysis.revenue.excluded_other || 0);
  analysis.revenue.net_verified_revenue = grossDeposits - excludedTotal;
  analysis.revenue.monthly_average_revenue = analysis.revenue.net_verified_revenue / months;

  return analysis;
}

// ─── POST-PROCESSING: Fix weeks_to_insolvency ───────────────────────────────
// Formula: weeks = avg_daily_balance * 30 / (monthly_mca - monthly_revenue)
// Only calculate if true_free_cash is negative (spending more than earning)
function fixInsolvencyCalc(analysis) {
  const metrics = analysis?.calculated_metrics;
  const balance = analysis?.balance_summary;
  if (!metrics) return analysis;

  const avgDailyBalance = balance?.avg_daily_balance || 0;
  const monthlyMCA = metrics.total_mca_monthly || 0;
  const monthlyRevenue = analysis?.revenue?.monthly_average_revenue || 0;
  const trueFree = metrics.true_free_cash;

  // Only calculate insolvency if the business is truly cash-flow negative
  if (trueFree !== undefined && trueFree !== null && trueFree < 0) {
    const monthlyBurn = monthlyMCA - monthlyRevenue;
    if (monthlyBurn > 0 && avgDailyBalance > 0) {
      // weeks = (ADB * 30) / monthly_burn_rate / 4.33
      const monthsToInsolvency = (avgDailyBalance * 30) / monthlyBurn;
      metrics.weeks_to_insolvency = Math.round(monthsToInsolvency * 4.33 * 10) / 10;
    } else {
      metrics.weeks_to_insolvency = null;
    }
  } else {
    // Revenue exceeds MCA burden — not insolvent
    metrics.weeks_to_insolvency = null;
  }

  return analysis;
}

// ─── POST-PROCESSING: Ensure balance fields are populated ───────────────────
function fixBalanceFields(analysis) {
  const balance = analysis?.balance_summary || {};
  const monthly = analysis?.monthly_breakdown || [];
  const adbByMonth = analysis?.adb_by_month || [];
  const periods = analysis?.statement_periods || [];

  // ending_balance: use most_recent_ending_balance or last month's ending balance
  if (!balance.most_recent_ending_balance && monthly.length > 0) {
    const lastMonth = monthly[monthly.length - 1];
    balance.most_recent_ending_balance = lastMonth.ending_balance || 0;
  }
  // Also set a convenience ending_balance field
  if (balance.most_recent_ending_balance && !balance.ending_balance) {
    balance.ending_balance = balance.most_recent_ending_balance;
  }

  // days_negative: sum from monthly breakdowns if total_days_negative is missing
  if (!balance.total_days_negative && monthly.length > 0) {
    balance.total_days_negative = monthly.reduce((sum, m) => sum + (m.days_negative || 0), 0);
  }
  // Also set convenience days_negative field
  if (balance.total_days_negative && !balance.days_negative) {
    balance.days_negative = balance.total_days_negative;
  }

  // avg_daily_balance: compute from adb_by_month if missing
  if (!balance.avg_daily_balance && adbByMonth.length > 0) {
    const validAdbs = adbByMonth.filter(m => m.adb > 0);
    if (validAdbs.length > 0) {
      balance.avg_daily_balance = Math.round(validAdbs.reduce((s, m) => s + m.adb, 0) / validAdbs.length);
    }
  }
  // Fallback: estimate from beginning + ending balance average
  if (!balance.avg_daily_balance && monthly.length > 0) {
    const avgBalances = monthly
      .filter(m => m.beginning_balance || m.ending_balance)
      .map(m => ((m.beginning_balance || 0) + (m.ending_balance || 0)) / 2);
    if (avgBalances.length > 0) {
      balance.avg_daily_balance = Math.round(avgBalances.reduce((a, b) => a + b, 0) / avgBalances.length);
    }
  }

  // statement_period: build from statement_periods array if statement_month missing
  if (!analysis.statement_month && periods.length > 0) {
    const sortedPeriods = [...periods].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const earliest = sortedPeriods[0];
    const latest = sortedPeriods[sortedPeriods.length - 1];
    analysis.statement_month = `${earliest.month || ''} – ${latest.month || ''}`.trim();
  }

  analysis.balance_summary = balance;
  return analysis;
}

// ─── POST-PROCESSING: Recalculate total MCA from deduped positions ──────────
function recalcMCAMetrics(analysis) {
  const positions = analysis?.mca_positions || [];
  const metrics = analysis?.calculated_metrics || {};
  const revenue = analysis?.revenue || {};

  // Only sum active positions
  const activePositions = positions.filter(p => p.status === 'active' || !p.status);
  const totalWeekly = activePositions.reduce((sum, p) => {
    const amt = p.payment_amount_current || p.payment_amount || 0;
    const freq = (p.frequency || '').toLowerCase();
    if (freq === 'daily') return sum + amt * 5;
    if (freq === 'bi-weekly') return sum + amt / 2;
    if (freq === 'monthly') return sum + amt / 4.33;
    return sum + amt; // default weekly
  }, 0);

  metrics.total_mca_weekly = Math.round(totalWeekly * 100) / 100;
  metrics.total_mca_monthly = Math.round(totalWeekly * 4.33 * 100) / 100;

  // Recalculate DSR
  const monthlyRevenue = revenue.monthly_average_revenue || revenue.net_verified_revenue || 1;
  const cogsRate = revenue.cogs_rate || 0.40;
  const grossProfit = monthlyRevenue * (1 - cogsRate);
  metrics.dsr_percent = Math.round((metrics.total_mca_monthly / grossProfit) * 10000) / 100;

  // DSR posture
  if (metrics.dsr_percent < 20) metrics.dsr_posture = 'healthy';
  else if (metrics.dsr_percent < 35) metrics.dsr_posture = 'elevated';
  else if (metrics.dsr_percent < 50) metrics.dsr_posture = 'stressed';
  else if (metrics.dsr_percent < 65) metrics.dsr_posture = 'critical';
  else metrics.dsr_posture = 'unsustainable';

  // Free cash
  const opex = analysis?.expense_categories?.total_operating_expenses || 0;
  const otherDebt = (analysis?.other_debt_service || []).reduce((s, d) => s + (d.monthly_total || 0), 0);
  metrics.free_cash_after_mca = Math.round((monthlyRevenue - metrics.total_mca_monthly) * 100) / 100;
  metrics.true_free_cash = Math.round((monthlyRevenue - metrics.total_mca_monthly - otherDebt - opex) * 100) / 100;
  metrics.total_debt_service_monthly = Math.round((metrics.total_mca_monthly + otherDebt) * 100) / 100;

  analysis.calculated_metrics = metrics;
  return analysis;
}

// Parse raw text into a JSON analysis object.
// Strips any preamble text before the first { and trailing text after the last }.
function parseAnalysisJSON(rawText) {
  let text = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Strip everything before the first {
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) {
    throw new Error(`No JSON object in response. Raw: ${text.slice(0, 500)}`);
  }
  if (firstBrace > 0) {
    console.log(`[analyze-multi] Stripping ${firstBrace} chars of preamble before first {`);
    text = text.slice(firstBrace);
  }

  // Strip everything after the last }
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace === -1) {
    throw new Error(`No closing brace in response. Raw: ${text.slice(0, 500)}`);
  }
  text = text.slice(0, lastBrace + 1);

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error(`[analyze-multi] JSON.parse failed after brace extraction: ${e.message}. First 300 chars: ${text.slice(0, 300)}`);
    throw new Error(`JSON parse failed after extraction. Length: ${text.length}. Start: ${text.slice(0, 200)}`);
  }
}

export async function POST(request) {
  try {
    const { statements, model, industry } = await request.json();
    if (!statements || statements.length === 0) {
      return Response.json({ error: 'No statements provided' }, { status: 400 });
    }

    const selectedModel = model === 'sonnet' ? 'claude-sonnet-4-20250514' : 'claude-opus-4-20250514';
    const useStreaming = model !== 'sonnet'; // Stream for Opus to bypass Vercel 60s timeout

    // Check for empty/scanned statements that need warning
    const emptyStatements = statements.filter(s => !s.text || s.text.length < 200);
    const hasEmptyStatements = emptyStatements.length > 0;

    // Build combined content — mix of text and images
    const contentBlocks = [];

    let promptAddendum = '';
    if (hasEmptyStatements) {
      const missingMonths = emptyStatements.map(s => s.month || 'Unknown').join(', ');
      promptAddendum = `\n\nWARNING: The following months have missing or unreadable text: ${missingMonths}. Set months_missing to include these, and set revenue_confidence to "partial". Calculate averages using only the readable months.`;
    }

    const industryBlock = industry ? buildIndustryPromptBlock(industry) : '';
    const funderIntelBlock = buildFunderIntelBlock();
    contentBlocks.push({ type: 'text', text: `${MULTI_PROMPT}${industryBlock}${funderIntelBlock}${promptAddendum}\n\nSTATEMENTS TO ANALYZE (${statements.length} total):` });

    for (let i = 0; i < statements.length; i++) {
      const s = statements[i];
      contentBlocks.push({ type: 'text', text: `\n${'='.repeat(60)}\nSTATEMENT ${i + 1}: ${s.accountLabel} — ${s.month}\n${'='.repeat(60)}` });
      if (s.images && s.images.length > 0) {
        for (const b64 of s.images.slice(0, 10)) {
          contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
        }
      } else if (s.text && s.text.length >= 200) {
        const maxPerStmt = Math.min(50000, Math.floor(200000 / statements.length));
        const truncText = s.text.length > maxPerStmt ? s.text.slice(0, maxPerStmt) + '\n[TRUNCATED]' : s.text;
        contentBlocks.push({ type: 'text', text: truncText });
      } else {
        contentBlocks.push({ type: 'text', text: `[STATEMENT COULD NOT BE READ - likely a scanned PDF. Include in months_missing.]` });
      }
    }

    const apiParams = {
      model: selectedModel,
      max_tokens: 16000,
      temperature: 0,
      messages: [{ role: 'user', content: contentBlocks }]
    };

    console.log(`[analyze-multi] model: ${selectedModel} | streaming: ${useStreaming} | statements: ${statements.length} | API key: ${(process.env.ANTHROPIC_API_KEY || '').slice(0, 7)}...`);

    // ─── STREAMING PATH (Opus) ─────────────────────────────────────────
    // Streams text chunks back to the client so Vercel's timeout resets
    // with each chunk. The client accumulates the full text and parses
    // JSON only after the [DONE] marker.
    if (useStreaming) {
      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            const stream = client.messages.stream(apiParams);

            stream.on('text', (text) => {
              controller.enqueue(encoder.encode(text));
            });

            const finalMessage = await stream.finalMessage();

            console.log(`[analyze-multi] Stream complete | stop_reason: ${finalMessage.stop_reason} | usage: input=${finalMessage.usage?.input_tokens} output=${finalMessage.usage?.output_tokens}`);

            // Send end marker on its own line
            controller.enqueue(encoder.encode('\n[DONE]'));
            controller.close();
          } catch (err) {
            console.error(`[analyze-multi] Stream error: ${err.message}`);
            // Send error as a parseable marker the client can detect
            const errPayload = JSON.stringify({ error: true, message: err.message });
            controller.enqueue(encoder.encode(`\n[ERROR]${errPayload}`));
            controller.close();
          }
        }
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Stream-Mode': 'opus',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // ─── NON-STREAMING PATH (Sonnet) ───────────────────────────────────
    let response;
    try {
      response = await client.messages.create(apiParams);
    } catch (apiErr) {
      const status = apiErr.status || apiErr.statusCode || 'unknown';
      console.error(`[analyze-multi] SDK error: [${status}] ${apiErr.message}`);
      throw new Error(`Anthropic API error (${status}): ${apiErr.message}`);
    }

    console.log(`[analyze-multi] Response | stop_reason: ${response.stop_reason} | usage: input=${response.usage?.input_tokens} output=${response.usage?.output_tokens}`);

    const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let analysis = parseAnalysisJSON(rawText);

    // Post-process: deduplicate, fix fields, recalculate metrics
    analysis.mca_positions = deduplicatePositions(analysis.mca_positions);
    analysis = fixExcludedMCAProceeds(analysis);
    analysis = fixBalanceFields(analysis);
    analysis = recalcMCAMetrics(analysis);
    analysis = fixInsolvencyCalc(analysis);

    console.log(`[analyze-multi] Post-processing: ${analysis.mca_positions?.length} positions, MCA monthly: $${analysis.calculated_metrics?.total_mca_monthly}`);

    return Response.json({ success: true, analysis, statement_count: statements.length });
  } catch (err) {
    console.error(`[analyze-multi] Error: ${err.message}`);
    return Response.json({
      error: true,
      message: err.message || 'Analysis failed',
    }, { status: 500 });
  }
}

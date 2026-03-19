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

## HOME CARE / HEALTHCARE BUSINESS REVENUE RULES:

TRUE REVENUE — ALWAYS COUNT (for home care / healthcare businesses):
• "HomeWell Care Se DES:Settlement" → franchisor commission/settlement payments. TRUE REVENUE.
• "MERCHANT BANKCD DES:DEPOSIT" → card processing (net of chargebacks). TRUE REVENUE.
• "TRIWEST VA VT6 DES:HCCLAIMPMT" → VA healthcare claim payments. TRUE REVENUE.
• Any "[insurer] DES:HCCLAIMPMT" → health insurance claim reimbursements. TRUE REVENUE.
• "Viventium HCM Pa DES:DD CR" → payroll reimbursement credits. TRUE REVENUE.

EXCLUDE FROM HOME CARE REVENUE (NOT income):
• Any credit from a known reverse MCA funder (UFCE, Greenbox, SOS Capital, etc.) → type: "reverse_mca_advance", is_excluded: true. These are LOAN PROCEEDS, not revenue.
• "HOMEWELL SEN2024 DES:CASH CONC" or similar franchise cash concentration entries → type: "transfer", is_excluded: true. This is the FRANCHISOR pulling money OUT, not revenue IN.
• "RETURN OF POSTED CHECK / ITEM" or "RETURN POSTED ITEM" or "RETURNED ITEM" or any credit containing "RETURN" + "ITEM" or "RETURN" + "CHECK" → type: "returned_item", is_excluded: true. These are bounced checks/debits returning to the account, NOT revenue. Sum ALL returned items and exclude them.
• "BKOFAMERICA BC FR CHKG" or any inter-account transfer between the merchant's own bank accounts (look for "BC FR", "TRANSFER FROM", "XFER FROM", same-bank credit with matching debit pattern) → type: "transfer", is_excluded: true.
• Any Zelle deposit from an owner/principal name or guarantor name (match against guarantor names in the file) → type: "owner_loan", is_excluded: true. Owner loans to the business are NOT revenue — they are capital injections.
• Any deposit labeled "LOAN" from an individual (not a funder) → type: "owner_loan", is_excluded: true.
• Inter-account transfers between the merchant's own accounts at the same bank → type: "transfer", is_excluded: true. Look for credits that match debits of the same amount on the same or adjacent day from the same bank.

NOT MCA — DO NOT CLASSIFY AS MCA POSITIONS (for home care businesses):
• "BDB DIRECTAX INC DES:TAX COL" → payroll tax collection, NOT MCA
• "VIVENTIUM HCM DES:BILLING" → HR software billing, NOT MCA
• "QUINABLE INC DEP DES:PAYMENTS" → staffing/agency payments, NOT MCA
• "Tapcheck Inc" → earned wage access, NOT MCA
• "WISE US INC DES:WISE" → on-call staffing payments, NOT MCA
• "Paradigm Senior DES:Bill.com" → vendor/referral fee, NOT MCA
• "AMTRUST NA DES:PAYMENT" → insurance premium, NOT MCA
• "AFLAC COLUMBUS DES:ACHPMT" → insurance premium, NOT MCA
• "LEGALSHIELD" → legal subscription, NOT MCA
• "LIGHTSTREAM DES:LOAN PMTS" → personal auto/equipment loan, NOT MCA (classify as other_debt_service)
• "FIRST CITIZENS DES:PAYMENTS" → personal loan/equipment, NOT MCA (classify as other_debt_service)

DSR NOTE FOR HOME CARE:
When calculating DSR for home care businesses, add a flag_and_alert with severity: "warning" and message: "Home care business — payroll typically represents 60-70% of gross revenue. DSR on gross revenue may understate true burden on free cash flow after labor costs."

## REVERSE MCA DETECTION — EXCLUDE ADVANCE CREDITS FROM REVENUE:

KNOWN REVERSE MCA FUNDERS (detect by ACH descriptor):
• UFCE / United First Capital Experts: credit "UFCE" (DC=advance), debit "UFCE" (P=payment, T=$79.99 monthly fee). Actual lender: First Gate Finance LLC.
• Greenbox Capital: credit/debit "GREENBOX"
• SOS Capital: credit/debit "SOS CAPITAL"
• Stream Capital: credit/debit "STREAM CAPITAL"
• Expansion Capital Group: credit/debit "EXPANSION CAP"
• 1West Capital: credit/debit "1WEST"
• Libertas Funding: credit/debit "LIBERTAS"
• Mantis Funding: credit/debit "MANTIS"
• Everest Business Funding: credit/debit "EVEREST"
• Velocity Capital Group: credit/debit "VELOCITY CAP"
• Cresthill Capital: credit/debit "CRESTHILL"
• Reliant Funding: credit/debit "RELIANT FUNDING"

REVERSE MCA DETECTION RULE:
If the SAME ACH originator (matched by company ID, phone number, or name) appears as BOTH a credit deposit AND a debit withdrawal in the same or adjacent statement periods → this is a REVERSE MCA.
Additional signal: Credit entries labeled DC, DISBURSE, ADVANCE, ACH CR from an entity that also debits the account.

CRITICAL — UFCE REVERSE MCA CREDIT EXCLUSION:
UFCE credits appear as "UFCE [phone] DES:DC" (DC = Disbursement Credit). These are ADVANCE PROCEEDS from the reverse MCA, NOT revenue.
• Every "UFCE" credit with "DES:DC" or "DC" transaction code = type: "reverse_mca_advance", is_excluded: true
• UFCE debits appear as "UFCE [phone] DES:P" (P = Payment) or "DES:T" (T = monthly fee)
• If you see UFCE credits in the deposits and UFCE debits in withdrawals, ALL UFCE credits are advance disbursements — exclude every single one from revenue
• Failing to exclude UFCE DES:DC credits will overstate revenue by $5K-$20K per occurrence

When a reverse MCA is detected:
• Set position_type: "reverse_mca"
• ALL credit deposits from this funder must be classified as type: "reverse_mca_advance", is_excluded: true — this includes EVERY credit with "DES:DC", "DES:DISBURSE", "DES:ADVANCE", or any ACH credit from the funder
• These credits are LOAN PROCEEDS, not business revenue — failing to exclude them dramatically overstates revenue
• Track: total_advances_received (sum of all credits from this funder), total_payments_made (sum of all debits)

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

## ACH CREDITS AND VENDOR CREDITS — DO NOT REPORT AS $0:

ACH CREDITS (ach_credits field in revenue and monthly_breakdown):
Customer ACH payments are electronic deposits that are NOT card processing and NOT MCA wires. They include:
- Route collection payments from customers
- B2B customer payments via ACH
- Insurance reimbursements
- Government payments
- Any electronic credit that is NOT from a known payment processor (Cantaloupe, Square, etc.) and NOT from a known MCA funder
Sum ALL of these as ach_credits. If the bank statement shows electronic deposits besides card processing and MCA wires, ach_credits CANNOT be $0.

VENDOR CREDITS (vendor_credits field in revenue and monthly_breakdown):
Vendor rebates and credits from suppliers. For vending businesses, look for:
- "FERRARA CANDY" / "FERRARA CANDY CO" → candy vendor rebate
- "ADVANTECH CORP" / "ADVANTECH CORP PAYMENT" → equipment vendor rebate
- "Unified Strategi" → vendor rebate
- Any credit from a product supplier or equipment vendor
Sum ALL vendor rebates as vendor_credits. If ANY of the above descriptors appear on the statements, vendor_credits CANNOT be $0.

CROSS-CHECK: After building revenue breakdown, verify:
- If card_processing > 0 but ach_credits = 0 → likely missed customer ACH deposits, re-examine
- If vendor names (Ferrara, Advantech, Unified) appear on statement but vendor_credits = 0 → extraction error, re-examine
- Sum of (card_processing + cash_deposits + ach_credits + vendor_credits) should approximate net_verified_revenue

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

MINIMUM THRESHOLD RULES — APPLY BEFORE CREATING ANY MCA POSITION:
1. MINIMUM PAYMENT: Only classify as MCA if the recurring debit is >= $500/week ($100/day, $2,165/month). Smaller recurring debits are operating expenses (insurance, subscriptions, services), NOT MCA positions.
2. MINIMUM OCCURRENCES: A debit must appear at least 3 times across all statements to be classified as MCA. One-time or twice-only debits are NOT MCA positions — they are likely vendor payments, tax payments, or one-off expenses.
3. REGULARITY: MCA payments follow a strict daily or weekly pattern. Irregular debits at varying intervals are NOT MCA.
4. TMM OVERCHARGES: If a Merchant Marketplace debit appears at an amount HIGHER than the expected position amount (e.g., $12,000 when expected is $11,693), do NOT create a separate position. Instead, flag it as double_pull: true on the existing TMM position and add the overpull dates/amounts to double_pull_dates and double_pull_amounts arrays.

## LINE OF CREDIT (LOC) DETECTION — CLASSIFY SEPARATELY FROM MCA

KNOWN LOC FUNDERS (detect by ACH descriptor):
• Headway Capital (Enova) — weekly or monthly payments
• OnDeck (Enova) — weekly or monthly, may have BOTH draw deposits AND payments on same account
• Rapid Finance — weekly payments
• Bluevine — weekly or monthly
• Fundbox — weekly
• Back'd / Backd — weekly

LOC DETECTION SIGNALS (if 2+ signals match, classify as LOC not MCA):
1. VARIABLE PAYMENTS — payment amount changes month to month (MCA payments are fixed)
2. DRAW DEPOSITS — periodic credits FROM the funder appear on the same account (funders don't send credits for MCA unless it's a new advance)
3. PAYMENT DECREASES when no new draw is taken
4. PAYMENT INCREASES after a new draw
5. NO FIXED PAYBACK AMOUNT or factor rate (LOCs have revolving balances)
6. Funder is on the KNOWN LOC FUNDERS list above

WHEN LOC IS DETECTED, set these fields:
• position_type: "loc" (NOT "mca")
• Do NOT include in total_mca_weekly or total_mca_monthly calculations
• DO include in total_debt_service_monthly
• If draw balance is detectable from credits minus payments, set current_draw_balance
• LOC positions should NOT trigger: stacking violations, anti-stacking analysis, specified percentage calculations, or factor rate calculations

NOTE: OnDeck can be either MCA or LOC. If OnDeck shows FIXED payment amounts with no draw deposits, classify as MCA. If OnDeck shows VARIABLE payments or draw deposits, classify as LOC.

## TRUE MCA / TRUE SPLIT DETECTION — REVENUE-BASED PERCENTAGE SPLITS

True splits are the original MCA structure where the funder takes a percentage directly from processor settlements, NOT via fixed ACH debits. Rare but critical — especially for Texas deals where 2nd+ position ACH is restricted by law.

TRUE SPLIT DETECTION SIGNALS (if 2+ signals match, classify as true_split):
1. DAILY PAYMENT AMOUNTS VARY proportionally with daily sales deposits — never the same amount twice
2. PAYMENT SOURCE IS THE PROCESSOR, not a funder ACH (appears as a reduction in processor settlement amount)
3. PAYMENT PERCENTAGE IS CONSISTENT even if dollar amount varies — e.g. always ~10% of that day's deposits
4. NO FIXED ACH DEBIT from a funder — the split happens upstream at the processor level
5. May appear as TWO entries on the same day: gross processor deposit + funder split deduction
6. Processor remittance shows net-after-split, not gross

KNOWN TRUE SPLIT CONTEXTS:
• Texas 2nd+ position deals (state law restricts fixed ACH on stacked positions)
• Older MCA agreements (pre-2018 style)
• Some Rapid Finance and smaller regional funders
• Any agreement stating "specified percentage of future receivables" with NO fixed payment amount

WHEN TRUE SPLIT DETECTED, set these fields:
• position_type: "true_split"
• estimated_split_percentage: the percentage of daily receipts (e.g. 10, 15, 20)
• avg_daily_payment: average of the variable daily payments across all statements
• estimated_weekly_equivalent: avg_daily_payment × 5 (for DSR calculation)
• estimated_monthly_total: avg_daily_payment × 22 (business days per month)
• Do NOT flag as "payment modified" — the variation is intentional and reflects daily revenue fluctuation
• Do NOT flag as phantom/suspicious position
• Note: "True split — payment varies with revenue. Built-in reconciliation by nature."

DSR CALCULATION FOR TRUE SPLITS:
• Use avg_daily_payment × 22 for monthly burden (NOT a fixed weekly amount)
• Include in total_mca_monthly (true splits ARE MCA, just revenue-based)
• Flag as "estimated — true split" in DSR breakdown

IMPORTANT DISTINCTION FROM LOC:
• LOC = variable payments from a LINE OF CREDIT (revolving debt, draw deposits)
• True Split = variable payments from a PERCENTAGE-BASED MCA (revenue split, no ACH)
• LOC is excluded from MCA totals. True splits are INCLUDED in MCA totals.

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
• Itria Ventures: "Itria Ven-Mercha" — see below for multiple position handling

### Itria Ventures — MULTIPLE POSITION DETECTION:
Itria Ventures commonly runs multiple simultaneous positions on the same merchant. The ACH descriptor includes a Trans# (transaction reference number) that distinguishes positions:
• Different Trans# reference numbers = DIFFERENT positions — never combine them
• Example: "Itria Ven-Mercha Trans#12345" at $2,100/wk = Position A
• Example: "Itria Ven-Mercha Trans#67890" at $1,800/wk = Position B
• Even if both Trans# references show the SAME payment amount, different Trans# = different positions
• The payment frequency is typically 3x/week (Mon-Wed-Fri), so multiply per-payment amount × 3 to get weekly equivalent
• If you see multiple distinct Trans# series in Itria debits, output SEPARATE position objects for each Trans# series
• Label them "Itria Ventures (Position A)", "Itria Ventures (Position B)", etc.
• Include the Trans# reference in the notes field for each position

### NOT-MCA EXCLUSIONS (do NOT classify as MCA positions):
• FleetCor: "FLEETCOR FUNDING" — fleet fuel cards. Classify as vehicle_fleet expense, NOT MCA.
• AMF Team / AMFTEAM: STAFFING company. Classify as payroll expense, NOT MCA.
• AMERICAN FUNDS INVESTMENT: 401k/investment contributions. Owner expense, NOT MCA.
• Any staffing/temp agency with daily payment patterns = payroll OpEx, NOT MCA.

## PAID-OFF DETECTION (CRITICAL — MANDATORY RULE):
A position is paid_off if it shows ZERO payment activity in the MOST RECENT statement month.
Do NOT mark as active unless payments appear in the most recent month.
• If a funder shows consistent weekly/daily payments in earlier months but ZERO debits in the most recent month → status: "paid_off"
• If payments stopped before the final statement month → status: "paid_off" even if there were many payments in prior months
• OnDeck, Newtek, or any funder with $0 debits in the last month = paid_off
• If a funder wire appears (credit) but NO matching debits ever appear → status: "unmatched_advance"
• When a Merchant Marketplace position STOPS mid-statement and a wire from "THE MERCHANT MARKETPLACE CORP" arrives around the same time, followed by a new debit amount starting 1 week later:
  1. Old position was paid off (final balance in the new advance)
  2. New advance was funded (wire = net proceeds)
  3. New position starts debiting 1 week later at new amount
• List paid-off positions with status: "paid_off" and final payment date filled in

## BALANCE CALCULATION RULES (MANDATORY):
• remaining_balance = purchased_amount - total_paid_to_date
• Do NOT add purchase_price to payback_amount to get balance — that produces a number HIGHER than the original deal
• Never show a remaining_balance higher than the original purchased_amount unless there is a documented factor rate applied
• If total_paid_to_date is unknown, estimate: weekly_payment × estimated_weeks_remaining
• Cross-check: if your calculated balance exceeds the purchased_amount, you made an arithmetic error — recalculate
• Example: TBF at $16,312.50/wk, started ~Nov 2025, ~24 weeks remaining ≈ $391,500 balance (NOT $848,250)

## IRREGULAR PAYMENT HANDLING (OnDeck and similar):
Some funders (especially OnDeck) have payment amounts that vary slightly from week to week due to interest recalculation, partial weeks, or payment timing. When a funder's payments are NOT a fixed amount:
• payment_amount_current = the MOST RECENT CONSISTENT payment amount (the amount that appears most frequently in the last 30 days, i.e., the MODE, not the average)
• Do NOT average all historical payments — this produces a misleading number that doesn't match any actual debit
• If the most recent 3+ payments are all the same amount, use that amount as payment_amount_current
• If payments truly vary every time (no consistent amount), use the most recent payment as payment_amount_current and note: "Variable payment — using most recent amount"
• For balance estimation with irregular payments: use payment_amount_current × estimated_weeks_remaining, NOT an averaged amount
• Example: OnDeck debits of $4,200, $4,200, $4,150, $4,200, $3,800 → payment_amount_current = $4,200 (mode), NOT $4,110 (average)

## POSITION SEPARATION RULES (MANDATORY):
• The Merchant Marketplace commonly has MULTIPLE separate positions with DIFFERENT weekly payment amounts
• Different ACH reference numbers = DIFFERENT positions — never combine them
• If you see two different payment amounts from Merchant Marketplace debits, output TWO separate position objects
• Each position must have its own payment_amount, remaining_balance, and reference number
• Do NOT sum two Merchant Marketplace positions into one combined entry

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

MANDATORY ADB CALCULATION — DO NOT SKIP:
If you cannot find an explicit "Average Daily Balance" line, you MUST calculate it yourself:
- Look at the running balance column in the transaction ledger
- For each calendar day, take the closing balance (last transaction balance of that day)
- For days with no transactions, carry forward the previous day's closing balance
- Sum all daily closing balances and divide by the number of days in the statement period
- A business doing $500K+ monthly through the account will have an ADB of at least $10K-$100K+
- If your calculated ADB is $0 or suspiciously low, you made an error — recalculate

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
      "position_type": "mca|loc|true_split|reverse_mca — default 'mca'. Set to 'loc' for lines of credit, 'true_split' for revenue-percentage splits, 'reverse_mca' for reverse MCAs where funder both credits AND debits the account",
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
      "current_draw_balance": "0.00 or null — for LOC positions only, estimated current draw balance",
      "estimated_split_percentage": "0 or null — for true_split positions only, e.g. 10 means 10% of daily receipts",
      "avg_daily_payment": "0.00 or null — for true_split positions only, average of variable daily payments",
      "estimated_weekly_equivalent": "0.00 or null — for true_split positions only, avg_daily_payment × 5",
      "total_advances_received": "0.00 or null — for reverse_mca only, sum of all credit deposits from this funder",
      "total_payments_made": "0.00 or null — for reverse_mca only, sum of all debit payments to this funder",
      "advance_stopped": "false — for reverse_mca only, true if no credits from funder in most recent month",
      "estimated_factor_rate": "0.00 or null — for reverse_mca only, from agreement or default 1.4",
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

6. PAID-OFF (MANDATORY): A position is paid_off if it has ZERO debits in the most recent statement month. Do NOT mark as active unless payments appear in the LAST month. OnDeck, Newtek, or any funder with $0 in the final month = paid_off.

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
// 1. Filters out sub-$500/wk positions (not MCA — operating expenses)
// 2. Filters out positions with fewer than 3 occurrences (one-off debits)
// 3. Merges duplicate positions from same funder with same amount (within $500)
// 4. Merges TMM overcharges as overpull flags on existing TMM positions
function deduplicatePositions(positions) {
  if (!positions || positions.length === 0) return [];

  const normalize = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Convert payment to weekly equivalent for threshold check
  const toWeekly = (amt, freq) => {
    const f = (freq || '').toLowerCase();
    if (f === 'daily') return amt * 5;
    if (f === 'bi-weekly') return amt / 2;
    if (f === 'monthly') return amt / 4.33;
    return amt; // default weekly
  };

  // Step 1: Filter out positions below minimum thresholds
  // Paid-off positions are exempt from the occurrence threshold
  // LOC positions are exempt from MCA-specific minimum thresholds
  // Potential overcharges (same funder name as another position) are kept for merge step
  const funderNames = positions.map(p => normalize(p.funder_name));
  const filtered = positions.filter((p, idx) => {
    const amt = p.payment_amount_current || p.payment_amount || 0;
    const weeklyAmt = toWeekly(amt, p.frequency);
    const occurrences = p.payments_detected || 0;
    const isPaidOff = (p.status || '').toLowerCase() === 'paid_off';
    const isLOC = (p.position_type || '').toLowerCase() === 'loc';
    const nameNorm = funderNames[idx];

    const isTrueSplit = (p.position_type || '').toLowerCase() === 'true_split';
    const isReverseMCA = (p.position_type || '').toLowerCase() === 'reverse_mca';

    // LOC, True Split, and Reverse MCA positions skip MCA minimum thresholds
    if (isLOC || isTrueSplit || isReverseMCA) return true;

    // Minimum $500/week to be MCA
    if (weeklyAmt < 500 && weeklyAmt > 0) {
      console.log(`[dedup] Filtering out ${p.funder_name}: $${weeklyAmt.toFixed(0)}/wk below $500 minimum`);
      return false;
    }
    // Minimum 3 occurrences (unless paid-off, or matches another position's funder for overcharge merge)
    if (occurrences > 0 && occurrences < 3 && !isPaidOff) {
      const prefixLen = Math.max(3, Math.min(nameNorm.length, 6));
      const hasSameFunderSibling = funderNames.some((fn, j) => j !== idx &&
        fn.length >= prefixLen && nameNorm.length >= prefixLen &&
        (fn.includes(nameNorm.slice(0, prefixLen)) || nameNorm.includes(fn.slice(0, prefixLen))));
      if (!hasSameFunderSibling) {
        console.log(`[dedup] Filtering out ${p.funder_name}: only ${occurrences} occurrences (need 3+)`);
        return false;
      }
      // Keep it — will be merged as overcharge in step 3
    }
    return true;
  });

  // Step 2: Group by normalized funder name (6+ char prefix match)
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < filtered.length; i++) {
    if (assigned.has(i)) continue;
    const group = [i];
    assigned.add(i);
    const nameI = normalize(filtered[i].funder_name);

    for (let j = i + 1; j < filtered.length; j++) {
      if (assigned.has(j)) continue;
      const nameJ = normalize(filtered[j].funder_name);

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

  // Step 3: Within each funder group, merge same-amount and handle overcharges
  const deduped = [];
  for (const group of groups) {
    if (group.length === 1) {
      deduped.push(filtered[group[0]]);
      continue;
    }

    const subPositions = group.map(i => filtered[i]);
    const kept = [];

    for (const pos of subPositions) {
      const amt = pos.payment_amount_current || pos.payment_amount || 0;

      // Find an existing kept position with similar amount (within $500)
      // Only merge if BOTH have the same status (don't merge active with paid_off)
      const posStatus = (pos.status || 'active').toLowerCase();
      const match = kept.find(k => {
        const kAmt = k.payment_amount_current || k.payment_amount || 0;
        const kStatus = (k.status || 'active').toLowerCase();
        return Math.abs(amt - kAmt) <= 500 && kStatus === posStatus;
      });

      if (match) {
        // Same amount + same status → merge (keep higher payments_detected)
        const matchPayments = match.payments_detected || 0;
        const posPayments = pos.payments_detected || 0;
        if (posPayments > matchPayments) {
          const idx = kept.indexOf(match);
          kept[idx] = pos;
        }
      } else {
        // Different amount — check if this is an overcharge on an existing position
        // (amount is close but higher, like $12K vs expected $11.6K for TMM)
        const overchargeTarget = kept.find(k => {
          const kAmt = k.payment_amount_current || k.payment_amount || 0;
          // Overcharge: pos amount is 1-15% higher than existing position
          return amt > kAmt && amt < kAmt * 1.15 && (amt - kAmt) > 500;
        });

        if (overchargeTarget) {
          // Merge as overpull/double-pull on the existing position
          overchargeTarget.double_pull = true;
          overchargeTarget.double_pull_amounts = [
            ...(overchargeTarget.double_pull_amounts || []),
            amt
          ];
          overchargeTarget.double_pull_dates = [
            ...(overchargeTarget.double_pull_dates || []),
            ...(pos.double_pull_dates || [pos.first_payment_date || 'unknown'])
          ];
          overchargeTarget.notes = (overchargeTarget.notes || '') +
            ` | Overpull detected: $${amt.toFixed(2)} vs expected $${(overchargeTarget.payment_amount_current || overchargeTarget.payment_amount || 0).toFixed(2)}`;
        } else {
          // Genuinely different amount → separate position
          kept.push(pos);
        }
      }
    }

    deduped.push(...kept);
  }

  return deduped;
}

// ─── POST-PROCESSING: Fix excluded_mca_proceeds ─────────────────────────────
// Only keep deposits excluded if:
// 1. Source name matches a known MCA funder, AND
// 2. Amount is consistent with a lump-sum advance wire (not a recurring payment)
// Recurring weekly/daily payments from funders are NOT proceeds — they are
// already captured as MCA debt service debits (credits from returned ACH, etc.)
function fixExcludedMCAProceeds(analysis) {
  if (!analysis?.revenue?.revenue_sources) return analysis;

  const knownFunders = [
    'tbf', 'rowan', 'merchant market', 'ondeck', 'newtek', 'fundkite',
    'libertas', 'forward fin', 'merchant marketplace', 'tmm',
    'bizfi', 'credibly', 'kapitus', 'yellowstone', 'rapid', 'can capital',
    'square capital', // Note: "Square Capital" IS an MCA funder, not Square payments
    'itria', 'suncoast',
    // Reverse MCA funders
    'ufce', 'greenbox', 'sos capital', 'stream capital', 'expansion cap',
    '1west', 'mantis', 'everest', 'velocity cap', 'cresthill', 'reliant funding'
  ];

  // Determine typical MCA payment amounts so we can distinguish
  // recurring ACH returns from lump-sum advance wires
  const mcaPaymentAmounts = (analysis.mca_positions || [])
    .map(p => p.payment_amount_current || p.payment_amount || 0)
    .filter(a => a > 0);

  const sources = analysis.revenue.revenue_sources;

  // Scan ALL excluded sources — reclassify anything that shouldn't be excluded
  for (const src of sources) {
    if (!src.is_excluded) continue;
    const name = (src.name || '').toLowerCase();
    const isFunder = knownFunders.some(f => name.includes(f));
    const amount = src.total || src.monthly_avg || 0;

    if (!isFunder) {
      // Not a known funder — this is revenue, reclassify
      src.is_excluded = false;
      src.type = 'ach_credit';
      src.note = (src.note || '') + ' [CORRECTED: not a known MCA funder — reclassified as revenue]';
      continue;
    }

    // IS a known funder — but is this a lump-sum advance or a recurring payment?
    // Advance wires are large one-time amounts (typically $50K+)
    // Recurring returned ACH credits match the MCA debit amount
    const isLikelyRecurring = mcaPaymentAmounts.some(pmt =>
      Math.abs(amount - pmt) < 500 || // Matches a known payment amount
      (amount > 0 && amount < 25000 && src.type !== 'loan') // Small recurring credit
    );

    // Lump-sum advance indicators:
    // - Amount > $25,000 (typical minimum advance)
    // - Type is explicitly 'loan' or 'wire'
    // - Contains 'wire' in the name/note
    const noteAndName = `${name} ${(src.note || '').toLowerCase()}`;
    const isLumpSum = amount >= 25000 ||
      src.type === 'loan' ||
      noteAndName.includes('wire') ||
      noteAndName.includes('advance') ||
      noteAndName.includes('funding');

    if (isLikelyRecurring && !isLumpSum) {
      // This is a recurring credit (returned ACH, etc.), not an advance wire
      src.is_excluded = false;
      src.type = 'ach_credit';
      src.note = (src.note || '') + ' [CORRECTED: recurring funder credit, not advance wire — reclassified as non-excluded]';
    }
  }

  // Recalculate excluded_mca_proceeds from what remains excluded
  const months = Math.max((analysis.monthly_breakdown || []).length, 1);
  analysis.revenue.excluded_mca_proceeds = sources
    .filter(s => s.is_excluded)
    .reduce((sum, s) => sum + (s.total || 0), 0);

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
// Two scenarios:
// 1. Revenue > MCA burden but true_free_cash < 0 (OpEx + debt > revenue):
//    weeks = ADB / weekly_burn where weekly_burn = abs(true_free_cash) × 12 / 52
// 2. Revenue < MCA burden (deeply insolvent from MCA alone):
//    weeks = ADB / weekly_burn (same formula, higher burn rate)
// 3. true_free_cash >= 0: merchant is sustainable, no insolvency calculation
function fixInsolvencyCalc(analysis) {
  const metrics = analysis?.calculated_metrics;
  const balance = analysis?.balance_summary;
  if (!metrics) return analysis;

  const avgDailyBalance = balance?.avg_daily_balance || 0;
  const monthlyMCA = metrics.total_mca_monthly || 0;
  const monthlyRevenue = analysis?.revenue?.monthly_average_revenue || 0;
  const trueFree = metrics.true_free_cash;

  // Check if MCA burden alone exceeds revenue
  const dailyMCA = monthlyMCA / 30;
  const dailyRevenue = monthlyRevenue / 30;

  if (trueFree !== undefined && trueFree !== null && trueFree < 0) {
    // Business is cash-flow negative — calculate weeks until ADB hits zero
    // weekly_burn = abs(true_free_cash) annualized then divided by 52
    const annualBurn = Math.abs(trueFree) * 12;
    const weeklyBurn = annualBurn / 52;

    if (weeklyBurn > 0 && avgDailyBalance > 0) {
      const weeks = avgDailyBalance / weeklyBurn;
      metrics.weeks_to_insolvency = Math.round(weeks * 10) / 10;
      // Add context: is this MCA-driven or OpEx-driven?
      if (dailyRevenue > dailyMCA) {
        metrics.insolvency_note = `~${metrics.weeks_to_insolvency} weeks at current burn rate (revenue covers MCA but not total obligations)`;
      } else {
        metrics.insolvency_note = `~${metrics.weeks_to_insolvency} weeks at current burn rate (MCA burden exceeds revenue)`;
      }
    } else {
      metrics.weeks_to_insolvency = null;
      metrics.insolvency_note = avgDailyBalance <= 0 ? 'ADB is zero — already insolvent' : null;
    }
  } else {
    // Revenue exceeds all obligations — sustainable
    metrics.weeks_to_insolvency = null;
    if (dailyRevenue > dailyMCA) {
      metrics.insolvency_note = 'Sustainable at current revenue';
    }
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

// ─── POST-PROCESSING: Sanity-check MCA position balances ─────────────────────
// remaining_balance should never exceed purchased_amount. If it does, estimate
// from weekly_payment × estimated_weeks_remaining instead.
function fixPositionBalances(analysis) {
  const positions = analysis?.mca_positions || [];
  for (const pos of positions) {
    const balance = pos.remaining_balance || 0;
    const purchased = pos.purchased_amount || pos.purchase_price || 0;
    const weeklyPayment = pos.payment_amount_current || pos.payment_amount || 0;

    // Balance exceeds purchased amount — this is an arithmetic error
    if (balance > 0 && purchased > 0 && balance > purchased) {
      const weeksRemaining = pos.estimated_weeks_remaining || 24;
      const estimated = weeklyPayment * weeksRemaining;
      pos.remaining_balance = Math.round(estimated * 100) / 100;
      pos.notes = (pos.notes || '') + ` [CORRECTED: balance $${balance.toLocaleString()} exceeded purchase $${purchased.toLocaleString()} — estimated from ${weeksRemaining}wk × $${weeklyPayment.toLocaleString()}]`;
    }

    // Balance is zero but position is active — estimate from payments
    if ((!balance || balance === 0) && weeklyPayment > 0 && (pos.status || '').toLowerCase() !== 'paid_off') {
      const weeksRemaining = pos.estimated_weeks_remaining || 24;
      pos.remaining_balance = Math.round(weeklyPayment * weeksRemaining * 100) / 100;
      pos.notes = (pos.notes || '') + ` [ESTIMATED: balance from ${weeksRemaining}wk × $${weeklyPayment.toLocaleString()}]`;
    }
  }
  analysis.mca_positions = positions;
  return analysis;
}

// ─── POST-PROCESSING: Enforce paid_off for positions with no recent activity ─
// If a position has payments in earlier months but ZERO in the most recent month,
// it must be marked paid_off regardless of what the AI returned.
function enforcePaidOffStatus(analysis) {
  const positions = analysis?.mca_positions || [];
  const monthly = analysis?.monthly_breakdown || [];
  if (positions.length === 0 || monthly.length === 0) return analysis;

  // Determine the most recent month's date range
  const sortedMonths = [...monthly].sort((a, b) => {
    const dateA = a.month_end || a.end_date || a.month || '';
    const dateB = b.month_end || b.end_date || b.month || '';
    return dateB.localeCompare(dateA);
  });
  const latestMonth = sortedMonths[0];
  const latestMonthLabel = (latestMonth?.month || latestMonth?.period || '').toLowerCase();

  for (const pos of positions) {
    const status = (pos.status || '').toLowerCase().replace(/[_\s]+/g, '');
    if (status === 'paidoff') continue; // Already marked

    // Check if position has a last_payment_date that's before the latest month
    const lastPayment = pos.last_payment_date || pos.final_payment_date || '';
    const paymentsInLatest = pos.payments_in_latest_month ?? pos.recent_month_payments;

    // If explicitly zero payments in latest month → paid_off
    if (paymentsInLatest !== undefined && paymentsInLatest !== null && paymentsInLatest === 0) {
      pos.status = 'paid_off';
      pos.notes = (pos.notes || '') + ' [AUTO: $0 activity in most recent month → paid_off]';
      continue;
    }

    // If last payment date exists and is clearly before the latest statement month
    if (lastPayment) {
      const lastPayDate = new Date(lastPayment);
      const latestEnd = new Date(latestMonth?.month_end || latestMonth?.end_date || '');
      if (!isNaN(lastPayDate) && !isNaN(latestEnd)) {
        // If last payment was more than 35 days before the end of latest statement
        const daysDiff = (latestEnd - lastPayDate) / (1000 * 60 * 60 * 24);
        if (daysDiff > 35) {
          pos.status = 'paid_off';
          pos.notes = (pos.notes || '') + ` [AUTO: last payment ${lastPayment} is >35 days before latest statement end → paid_off]`;
        }
      }
    }
  }

  analysis.mca_positions = positions;
  return analysis;
}

// ─── POST-PROCESSING: Recalculate total MCA from deduped positions ──────────
function recalcMCAMetrics(analysis) {
  const positions = analysis?.mca_positions || [];
  const metrics = analysis?.calculated_metrics || {};
  const revenue = analysis?.revenue || {};

  const toWeeklyAmt = (p) => {
    const amt = p.payment_amount_current || p.payment_amount || 0;
    const freq = (p.frequency || '').toLowerCase();
    if (freq === 'daily') return amt * 5;
    if (freq === 'bi-weekly') return amt / 2;
    if (freq === 'monthly') return amt / 4.33;
    return amt; // default weekly
  };

  // Only sum active positions — STRICTLY filter by status === 'active'
  // Positions with status 'paid_off', 'paid off', or any non-active status are excluded
  const activePositions = positions.filter(p => {
    const status = (p.status || '').toLowerCase().replace(/[_\s]+/g, '');
    return status === 'active' || status === '';
  });

  // Separate MCA vs LOC vs True Split positions
  const activeMCA = activePositions.filter(p => {
    const t = (p.position_type || 'mca').toLowerCase();
    return t !== 'loc' && t !== 'true_split';
  });
  const activeLOC = activePositions.filter(p => (p.position_type || 'mca').toLowerCase() === 'loc');
  const activeTrueSplit = activePositions.filter(p => (p.position_type || 'mca').toLowerCase() === 'true_split');

  const mcaWeekly = activeMCA.reduce((sum, p) => sum + toWeeklyAmt(p), 0);
  const locWeekly = activeLOC.reduce((sum, p) => sum + toWeeklyAmt(p), 0);

  // True splits use avg_daily_payment × 5 for weekly equivalent (revenue-based, not fixed)
  const trueSplitWeekly = activeTrueSplit.reduce((sum, p) => {
    if (p.estimated_weekly_equivalent) return sum + p.estimated_weekly_equivalent;
    if (p.avg_daily_payment) return sum + p.avg_daily_payment * 5;
    return sum + toWeeklyAmt(p); // fallback to standard calc
  }, 0);

  // True splits ARE MCA (revenue-based), so include in MCA totals
  const totalMCAWeekly = mcaWeekly + trueSplitWeekly;

  metrics.total_mca_weekly = Math.round(totalMCAWeekly * 100) / 100;
  metrics.total_mca_monthly = Math.round(totalMCAWeekly * 4.33 * 100) / 100;
  metrics.total_loc_weekly = Math.round(locWeekly * 100) / 100;
  metrics.total_loc_monthly = Math.round(locWeekly * 4.33 * 100) / 100;
  metrics.total_true_split_weekly = Math.round(trueSplitWeekly * 100) / 100;
  metrics.total_true_split_monthly = Math.round(trueSplitWeekly * 4.33 * 100) / 100;

  // Recalculate DSR — MCA only (LOC tracked separately)
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

  // Free cash — include BOTH MCA and LOC in total debt service
  const totalMCAandLOC = metrics.total_mca_monthly + metrics.total_loc_monthly;
  const opex = analysis?.expense_categories?.total_operating_expenses || 0;
  const otherDebt = (analysis?.other_debt_service || []).reduce((s, d) => s + (d.monthly_total || 0), 0);
  metrics.free_cash_after_mca = Math.round((monthlyRevenue - totalMCAandLOC) * 100) / 100;
  metrics.true_free_cash = Math.round((monthlyRevenue - totalMCAandLOC - otherDebt - opex) * 100) / 100;
  metrics.total_debt_service_monthly = Math.round((totalMCAandLOC + otherDebt) * 100) / 100;

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
    analysis = fixPositionBalances(analysis);
    analysis = enforcePaidOffStatus(analysis);
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

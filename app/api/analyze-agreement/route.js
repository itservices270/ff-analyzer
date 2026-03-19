import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGREEMENT_PROMPT = `You are an expert MCA (Merchant Cash Advance) contract analyst. Extract ALL terms from this Future Receivables Sale and Purchase Agreement with maximum precision.

=== MCA AGREEMENT FIELD GLOSSARY — READ CAREFULLY ===

These fields have SPECIFIC meanings in MCA contracts. Many fields appear near each other on the same page and are easily confused. READ THE LABEL NEXT TO EACH NUMBER, not just the number itself.

PURCHASE PRICE (also called "Advance Amount", "Funding Amount"):
- The total amount the funder commits to the deal BEFORE any deductions
- This is the GROSS funding amount, NOT what the merchant receives
- Typically the largest round number on page 1 (e.g., $300,000, $450,000)
- CRITICAL: This is NOT the Net Amount Funded / Net to Seller

PURCHASED AMOUNT (also called "Sold Amount", "Payback Amount", "Total Remittance"):
- The total amount the merchant must repay = Purchase Price × Factor Rate
- Always LARGER than Purchase Price
- Example: $300,000 Purchase × 1.33 factor = $399,000 Purchased Amount

FACTOR RATE:
- Purchased Amount ÷ Purchase Price
- Always between 1.10 and 1.60 for typical MCAs
- If your calculated factor is outside this range, you likely swapped Purchase Price and Purchased Amount

PERIODIC AMOUNT / WEEKLY PAYMENT / DAILY PAYMENT (also called "Initial Installment", "Estimated Weekly Amount"):
- The recurring payment amount debited from merchant's account
- For weekly MCAs: typically $5,000–$20,000 range
- READ THIS DIRECTLY from the field labeled "Periodic Amount" or "Weekly Installment"
- CRITICAL: Do NOT confuse with Origination Fee. The Periodic Amount is the RECURRING payment. The Origination Fee is a ONE-TIME deduction.
- Sanity check: Purchased Amount ÷ Periodic Amount should give 20-60 weeks of payments

ORIGINATION FEE (also called "Underwriting Fee", "Processing Fee"):
- A one-time fee deducted from Purchase Price before funding
- Typically 2-10% of Purchase Price
- Usually found in Rider 1 or a fee schedule, NOT in the main terms grid
- CRITICAL: This is NOT the weekly/daily payment amount
- Sanity check: Origination Fee is usually much smaller than Purchase Price

NET AMOUNT FUNDED TO SELLER (also called "Net to Merchant", "Net Proceeds", "Amount Deposited"):
- What the merchant actually receives after all deductions
- = Purchase Price − Origination Fee − Prior Balance Payoff − Other Fees
- This is always LESS than Purchase Price
- CRITICAL: Do NOT put this in the purchase_price field

PRIOR BALANCE (Rider 2):
- Amount paid to a prior funder (often the same funder if self-renewal)
- Deducted from Purchase Price before merchant receives funds
- If present, note WHO is being paid off (same funder = self-renewal, different funder = buyout)

SPECIFIED PERCENTAGE:
- The contractual percentage of revenue the funder claims
- Found in the main agreement terms, usually near the Purchased Amount
- Range: 5% to 49%+ — higher values indicate more aggressive terms
- Used to calculate implied revenue: Periodic Amount × frequency ÷ Specified %

=== FIELD VALIDATION RULES ===

After extracting all fields, verify:
1. purchase_price > net_amount_funded (always — fees are deducted)
2. purchased_amount > purchase_price (always — factor rate > 1.0)
3. purchased_amount / purchase_price should be between 1.10 and 1.60
4. weekly_payment × estimated_weeks ≈ purchased_amount (within 10%)
5. origination_fee / purchase_price should be between 0.02 and 0.10 (2-10%)
6. If origination_fee > weekly_payment, something is likely swapped — double-check
7. If purchase_price < net_amount_funded, they are swapped — fix it

CRITICAL RULES — READ BEFORE EXTRACTING:

RULE 1 — MULTI-AGREEMENT DETECTION:
A single PDF may contain MULTIPLE separate MCA agreements, especially from the same funder (self-renewals). Look for:
- Multiple signature pages
- Multiple "Purchase Price" or "Purchased Amount" sections with different dollar amounts
- References to "prior balance" or "payoff" of an earlier agreement
- Different dates on different sections of the document
- An Exhibit A or Schedule A that references a different agreement than the main body

If you detect multiple agreements in one PDF, return a JSON ARRAY of agreement objects, one per agreement found. Each agreement object has the full schema below. Label them with a "position_label" field like "Position 1", "Position 2", etc.

If there is only one agreement, still return a single JSON object (NOT an array).

RULE 2 — READ PAYMENT AMOUNTS, NEVER CALCULATE:
The weekly_payment or daily_payment field MUST be read directly from the contract text. Look for phrases like:
- "weekly installment of $X"
- "weekly payment of $X"
- "$X per week"
- "daily payment of $X"
- "$X per business day"
Do NOT calculate payment from purchased_amount ÷ term. The contract states the payment amount explicitly. If you cannot find an explicit payment amount, set the field to null and add a note: "Payment amount not found in contract text."

RULE 3 — PRIOR BALANCE PAYOFF:
If the agreement references paying off a prior balance from the SAME funder (self-renewal), extract:
- "prior_balance_payoff": the dollar amount being applied to the prior position
- "is_self_renewal": true
- "net_to_merchant": purchase_price minus prior_balance_payoff minus origination_fee minus all other fees
The prior balance payoff is often listed on the funding instructions page, closing disclosure, or in an exhibit. It may say "payoff", "prior balance", "existing balance", "renewal payoff", or similar.

RULE 4 — SPECIFIED PERCENTAGE:
Read the specified percentage (also called "specified receivable percentage" or "specified daily/weekly percentage") directly from the contract. This is usually stated as a percentage like "49%" or "7.7%" or "11.5%". It represents the percentage of the merchant's receivables that the funder is entitled to. Do NOT confuse this with the factor rate or holdback percentage.

RULE 5 — UCC LIEN DETECTION (CRITICAL — DO NOT MISS):
Search the ENTIRE agreement for ANY of these indicators of a UCC lien or security interest:
• "UCC" or "UCC-1" or "UCC filing" anywhere in the document
• "Uniform Commercial Code" (full phrase)
• "financing statement" or "continuation statement"
• "lien on assets" or "lien on all assets"
• "security interest" or "security agreement"
• "grant a security interest" or "hereby grants"
• "collateral" (when referring to merchant's assets)
• "all assets" or "all personal property" (in a security context)
If ANY of these appear, set ucc_lien.has_ucc to true and extract the clause details.
Most MCA agreements contain UCC language — if you find ZERO UCC references, double-check the entire document before reporting has_ucc: false.
Also add a "ucc_blanket" entry to problematic_clauses if a blanket UCC is found.

Return ONLY valid JSON, no markdown, no preamble. Use null for any field not found.

{
  "funder_name": "exact legal name of the buying/funding entity",
  "position_label": "Position 1, Position 2, etc. — only needed if multiple agreements in one PDF",
  "is_self_renewal": false,
  "prior_balance_payoff": 0,
  "net_to_merchant": 0,
  "seller_name": "merchant legal name",
  "effective_date": "MM/DD/YYYY",
  "funding_date": "YYYY-MM-DD — the date funds were disbursed, if different from effective_date",
  "governing_law_state": "state name",
  "purchase_price": "GROSS funding amount BEFORE deductions — the largest number, NOT net to merchant",
  "purchased_amount": "Total payback obligation = purchase_price × factor_rate — LARGER than purchase_price",
  "factor_rate": "purchased_amount ÷ purchase_price — must be between 1.10 and 1.60",
  "weekly_payment": "Recurring periodic amount — READ from 'Periodic Amount' field, NOT origination fee",
  "daily_payment": 0.00,
  "payment_frequency": "weekly|daily|biweekly",
  "specified_percentage": "Contractual % of revenue claimed by funder — read directly from contract",
  "origination_fee": "One-time fee — usually 2-10% of purchase_price, found in Rider 1",
  "origination_fee_pct": "origination_fee ÷ purchase_price × 100",
  "prior_balance_amount": 0.00,
  "prior_balance_paid_to": "funder name or null",
  "prior_balance_is_self_renewal": false,
  "net_to_seller": "What merchant actually received = purchase_price minus all deductions",
  "stated_monthly_revenue": 0.00,
  "reconciliation_right": false,
  "reconciliation_days": null,
  "reconciliation_contact": "email or phone or null",
  "anti_stacking_clause": false,
  "anti_stacking_penalty": "description or null",
  "coj_clause": false,
  "coj_state": "state or null",
  "coj_enforceability_note": "e.g. NY FAIR Act Feb 2026 may render unenforceable, or null",
  "arbitration_clause": false,
  "arbitration_opt_out": false,
  "arbitration_opt_out_deadline_days": null,
  "arbitration_opt_out_address": "address or null",
  "fees": [
    {"fee_name": "ACH Program Fee", "amount": 35.00, "frequency": "monthly"},
    {"fee_name": "NSF Fee", "amount": 35.00, "frequency": "per event"}
  ],
  "guarantors": [
    {"name": "full name", "ssn_last4": "last 4 or null", "ownership_pct": null}
  ],
  "bank_name": "depository institution name",
  "routing_number": "9-digit routing or null",
  "account_number": "account number or null",
  "deposit_account_checked": "XXXXXX3000 format or null",
  "extraction_confidence": "high|medium|low",
  "extraction_notes": "note any blank pages, illegible sections, or missing clauses",

  "financial_terms": {
    "purchase_price": 0,
    "purchased_amount": 0,
    "factor_rate": 0.00,
    "specified_daily_payment": 0,
    "specified_weekly_payment": 0,
    "specified_payment_frequency": "daily|weekly|bi-weekly|monthly",
    "specified_receivable_percentage": 0,
    "stated_merchant_revenue": 0,
    "stated_revenue_type": "gross|net|deposits|receivables|unspecified",
    "stated_revenue_period": "monthly|annual|unspecified",
    "estimated_term_weeks": 0,
    "estimated_term_months": 0
  },

  "fee_analysis": {
    "origination_fee": 0,
    "closing_fee": 0,
    "admin_fee": 0,
    "broker_commission": 0,
    "ach_fee": 0,
    "ucc_fee": 0,
    "technology_fee": 0,
    "prior_balance_paid": 0,
    "other_fees": [{ "name": "", "amount": 0 }],
    "total_fees": 0,
    "total_fees_pct_of_purchase": 0,
    "net_proceeds_to_merchant": 0,
    "true_factor_rate": 0,
    "effective_annual_rate": 0
  },

  "default_triggers": [{
    "trigger": "string",
    "clause_reference": "string",
    "severity": "standard|aggressive|potentially_unenforceable",
    "notes": "string"
  }],

  "ucc_lien": {
    "has_ucc": false,
    "ucc_type": "blanket|specific|null — blanket covers all assets, specific covers only receivables",
    "ucc_filing_reference": "UCC-1 filing number if mentioned, or null",
    "ucc_clause_summary": "brief summary of UCC/lien/security interest language, or null",
    "ucc_note": "string or null"
  },

  "problematic_clauses": [{
    "clause_type": "coj|personal_guarantee|ucc_blanket|venue|jury_waiver|counterclaim_waiver|mac_clause|anti_stacking|attorney_fees|non_solicitation|other",
    "clause_text_summary": "string",
    "clause_reference": "string",
    "enforceability": "enforceable|questionable|unenforceable|state_dependent",
    "leverage_rating": "high|medium|low",
    "negotiation_notes": "string"
  }],

  "key_clauses": [{
    "clause_type": "reconciliation|anti_stacking|coj|personal_guarantee|other",
    "clause_text_summary": "string",
    "clause_reference": "string"
  }],

  "merchant_protections": [{
    "protection_type": "reconciliation|early_payoff|cure_period|revenue_protection|audit_right|other",
    "description": "string",
    "clause_reference": "string",
    "merchant_action_required": "string",
    "leverage_rating": "high|medium|low"
  }],

  "stacking_analysis": {
    "has_anti_stacking_clause": false,
    "anti_stacking_text_summary": "",
    "stacking_consequence": "string",
    "notes": ""
  },

  "state_compliance": {
    "merchant_state": "",
    "funder_state": "",
    "governing_law_state": "",
    "venue_state": "",
    "compliance_flags": [{
      "issue": "string",
      "applicable_law": "string",
      "severity": "critical|warning|info",
      "notes": "string"
    }]
  },

  "revenue_verification": {
    "stated_revenue": 0,
    "stated_revenue_type": "gross|net",
    "revenue_clause_text": "string",
    "withhold_percentage_stated": 0,
    "daily_payment_implied_annual_revenue": 0,
    "notes": "string"
  },

  "negotiation_leverage": {
    "overall_leverage_rating": "strong|moderate|weak",
    "top_leverage_points": ["string"],
    "funder_vulnerabilities": ["string"],
    "recommended_approach": "string",
    "estimated_settlement_range_pct": "string"
  },

  "contract_red_flags": [{
    "flag": "string",
    "severity": "critical|warning|info",
    "explanation": "string"
  }],

  "analysis_confidence": {
    "overall": "high|medium|low",
    "notes": "string"
  }
}

IMPORTANT EXTRACTION RULES:

1. "prior_balance_is_self_renewal" = true if prior_balance_paid_to matches the funder's own name (e.g., Merchant Marketplace paying off a prior Merchant Marketplace balance). This is CRITICAL evidence of stacking knowledge. The same funder renewing their own position means they knew about and approved the existing stack.

2. If pages appear blank or unreadable, set extraction_confidence to "low" and describe in extraction_notes exactly which pages were blank and what clauses are therefore unknown.

3. The "specified_percentage" is the % of future receipts the funder is entitled to receive — find this on page 1 of the agreement. It is NOT the factor rate.

4. "reconciliation_days" — look for "X calendar days" language near the reconciliation section. Rowan uses 3 calendar days, which is unusually favorable to the seller.

5. For COJ clauses: if the governing law is New York AND the agreement date is on or after February 1, 2026, note: "NY FAIR Business Practices Act (eff. Feb 2026) substantially restricts COJ enforceability."

6. Read ALL riders (Rider 1, Rider 2, Rider 3, etc.) — these contain origination fees, prior balances, and fee schedules that are NOT on page 1.

7. Factor rate = purchased_amount / purchase_price. If >1.50, flag as "extreme" in contract_red_flags.

8. True factor rate = purchased_amount / net_proceeds_to_merchant (accounts for fees).

9. Effective annual rate = ((factor_rate - 1) / (estimated_term_months / 12)) × 100

10. If anti-stacking clause exists AND prior_balance_paid_to is a DIFFERENT funder, note: "Funder funded into existing stack despite anti-stacking clause — enforcement position weakened."

11. Always calculate net_proceeds = purchase_price - total_fees - prior_balance_paid. This is what the merchant actually received.

12. daily_payment_implied_annual_revenue = (daily_payment / specified_receivable_percentage) × 365 if percentage is given.

13. Be precise with clause references — cite section numbers when visible.

14. Every fee matters. Even a $495 closing fee on a $50K advance is 1% — it adds up.`;

// ─── Post-parse: normalize to array, validate, return ──────────────────────
function normalizeAndValidate(parsed) {
  let agreements;
  if (Array.isArray(parsed)) {
    agreements = parsed;
  } else if (parsed.agreements && Array.isArray(parsed.agreements)) {
    agreements = parsed.agreements;
  } else {
    agreements = [parsed];
  }

  for (const ag of agreements) {
    // === FIELD SWAP DETECTION ===

    // Purchase price vs net_to_seller swap
    const netField = ag.net_to_seller || ag.net_to_merchant;
    if (ag.purchase_price && netField && ag.purchase_price < netField) {
      console.warn(`[SWAP DETECTED] purchase_price (${ag.purchase_price}) < net (${netField}) — swapping`);
      const temp = ag.purchase_price;
      ag.purchase_price = netField;
      if (ag.net_to_seller) ag.net_to_seller = temp;
      if (ag.net_to_merchant) ag.net_to_merchant = temp;
    }

    // Weekly payment vs origination fee swap
    if (ag.weekly_payment && ag.origination_fee && ag.purchased_amount) {
      const weeksFromOrigFee = ag.purchased_amount / ag.origination_fee;
      const weeksFromPayment = ag.purchased_amount / ag.weekly_payment;

      if (weeksFromOrigFee >= 15 && weeksFromOrigFee <= 80 &&
          (weeksFromPayment < 10 || weeksFromPayment > 100)) {
        console.warn(`[SWAP DETECTED] origination_fee (${ag.origination_fee}) looks like weekly_payment — swapping`);
        const temp = ag.weekly_payment;
        ag.weekly_payment = ag.origination_fee;
        ag.origination_fee = temp;
        // Also fix financial_terms if present
        if (ag.financial_terms) {
          ag.financial_terms.specified_weekly_payment = ag.weekly_payment;
          ag.financial_terms.origination_fee = ag.origination_fee;
        }
        if (ag.fee_analysis) {
          ag.fee_analysis.origination_fee = ag.origination_fee;
        }
      }
    }

    // Calculate origination fee percentage
    if (ag.origination_fee && ag.purchase_price && ag.purchase_price > 0) {
      ag.origination_fee_pct = parseFloat(((ag.origination_fee / ag.purchase_price) * 100).toFixed(1));
      if (ag.origination_fee_pct > 8) {
        ag.extraction_notes = (ag.extraction_notes || '') + ` High origination fee (${ag.origination_fee_pct}% of purchase price).`;
      }
    }

    // Validate and fix factor rate
    if (ag.factor_rate && (ag.factor_rate < 1.05 || ag.factor_rate > 1.70)) {
      if (ag.purchased_amount && ag.purchase_price && ag.purchase_price > 0) {
        const calcFactor = parseFloat((ag.purchased_amount / ag.purchase_price).toFixed(4));
        if (calcFactor >= 1.05 && calcFactor <= 1.70) {
          console.warn(`[VALIDATION] factor_rate ${ag.factor_rate} outside range, recalculated to ${calcFactor}`);
          ag.factor_rate = calcFactor;
        }
      }
    }

    // === EXISTING SANITY CHECKS ===
    if (ag.factor_rate === 1 || ag.factor_rate === 1.00) {
      ag._warning = 'Factor rate of 1.00 detected — likely extraction error. This agreement may contain multiple positions that were merged.';
      ag._needs_review = true;
    }
    if (ag.purchase_price && ag.purchased_amount && ag.purchase_price === ag.purchased_amount) {
      ag._warning = (ag._warning || '') + ' Purchase price equals payback amount (factor 1.00) — likely extraction error.';
      ag._needs_review = true;
    }
    if (ag.weekly_payment && ag.purchased_amount) {
      const impliedWeeks = ag.purchased_amount / ag.weekly_payment;
      if (impliedWeeks > 104) {
        ag._warning = (ag._warning || '') + ' Implied term of ' + Math.round(impliedWeeks) + ' weeks seems too long for MCA.';
        ag._needs_review = true;
      }
    }
  }

  return agreements;
}

// Parse JSON that might be an object or array — handles LLM output quirks
function parseAgreementJSON(cleaned) {
  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch { /* fall through */ }

  // Try to find array
  if (cleaned.indexOf('[') >= 0 && cleaned.indexOf('[') < cleaned.indexOf('{')) {
    let depth = 0, start = -1, end = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '[') { if (depth === 0) start = i; depth++; }
      else if (cleaned[i] === ']') { depth--; if (depth === 0 && start >= 0) { end = i + 1; break; } }
    }
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end)); } catch { /* fall through */ }
    }
  }

  // Try to find object
  let depth = 0, start = -1, end = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (cleaned[i] === '}') { depth--; if (depth === 0 && start >= 0) { end = i + 1; break; } }
  }
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end));
  }

  return null;
}

export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let text = null, fileName = 'unknown', selectedModel, pdfBase64 = null;

    if (contentType.includes('multipart/form-data')) {
      // FormData path — scanned PDF or images sent directly
      const formData = await request.formData();
      const model = formData.get('model') || 'opus';
      const useImages = formData.get('useImages') === 'true';
      selectedModel = model === 'sonnet' ? 'claude-sonnet-4-20250514' : 'claude-opus-4-20250514';
      fileName = formData.get('fileName') || 'agreement.pdf';

      if (useImages) {
        // Image array path — client rendered PDF pages to JPEG
        const imageEntries = [];
        for (const [key, val] of formData.entries()) {
          if (key.startsWith('image_') && val && val.arrayBuffer) {
            const bytes = await val.arrayBuffer();
            const b64 = Buffer.from(bytes).toString('base64');
            imageEntries.push({ key, b64 });
          }
        }
        imageEntries.sort((a, b) => parseInt(a.key.split('_')[1]) - parseInt(b.key.split('_')[1]));
        // Build image content blocks directly
        const imgBlocks = imageEntries.map(e => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: e.b64 } }));
        imgBlocks.push({ type: 'text', text: AGREEMENT_PROMPT + '\n\n[Read the agreement pages above and extract all terms.]' });
        const response = await client.messages.create({
          model: selectedModel, max_tokens: 12000, temperature: 0,
          messages: [{ role: 'user', content: imgBlocks }]
        });
        const raw = response.content[0]?.text || '';
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = parseAgreementJSON(cleaned);
        if (!parsed) return Response.json({ error: 'No JSON in response' }, { status: 500 });
        const agreements = normalizeAndValidate(parsed);
        return Response.json({
          success: true,
          analysis: agreements.length === 1 ? agreements[0] : agreements,
          agreement_count: agreements.length,
          file_name: fileName,
        });
      }

      const file = formData.get('pdf');
      if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
      const bytes = await file.arrayBuffer();
      pdfBase64 = Buffer.from(bytes).toString('base64');
    } else {
      // JSON path — text already extracted
      const body = await request.json();
      text = body.text;
      fileName = body.fileName || 'unknown';
      const model = body.model || 'opus';
      selectedModel = model === 'sonnet' ? 'claude-sonnet-4-20250514' : 'claude-opus-4-20250514';
    }

    const hasText = text && typeof text === 'string' && text.trim().length >= 200;
    if (!hasText && !pdfBase64) {
      return Response.json({ error: 'No agreement data received.' }, { status: 400 });
    }

    // Build content blocks
    const contentBlocks = [];
    if (pdfBase64) {
      contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } });
    }
    contentBlocks.push({ type: 'text', text: AGREEMENT_PROMPT + (hasText ? '\n\nMCA AGREEMENT TEXT:\n\n' + (text.length > 100000 ? text.slice(0, 100000) + '\n[TRUNCATED]' : text) : '\n\n[Read the PDF document above and extract all agreement terms.]') });

    const response = await client.messages.create({
      model: selectedModel,
      max_tokens: 12000,
      temperature: 0,
      messages: [{ role: 'user', content: contentBlocks }]
    });

    const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed;
    try {
      parsed = parseAgreementJSON(cleaned);
    } catch {
      parsed = null;
    }
    if (!parsed) {
      return Response.json({
        error: 'Agreement analysis returned malformed data. Try re-analyzing or switching models.',
        debug: cleaned.slice(0, 500)
      }, { status: 500 });
    }

    const agreements = normalizeAndValidate(parsed);

    return Response.json({
      success: true,
      analysis: agreements.length === 1 ? agreements[0] : agreements,
      agreement_count: agreements.length,
      file_name: fileName || 'unknown',
      model_used: selectedModel
    });

  } catch (err) {
    console.error('Agreement analyze error:', err);
    return Response.json({
      error: err.message || 'Agreement analysis failed'
    }, { status: 500 });
  }
}

import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGREEMENT_PROMPT = `You are a senior MCA (Merchant Cash Advance) contract analyst for Funders First Inc., a debt restructuring company. You have 15+ years of experience reading MCA purchase agreements, identifying predatory terms, hidden fees, unenforceable clauses, and leverage points for restructuring negotiations.

You are analyzing an MCA agreement (also called a Merchant Cash Advance Agreement, Revenue Purchase Agreement, Future Receivables Purchase Agreement, or similar). Extract EVERY material term and flag anything that weakens the funder's position or could be used in restructuring negotiations.

## CRITICAL EXTRACTION PRIORITIES

### 1. FINANCIAL TERMS — Get these EXACT:
- Purchase Price (the advance amount the merchant received)
- Purchased Amount (total amount to be repaid — this is purchase price × factor rate)
- Factor Rate (purchased_amount / purchase_price). If not stated, calculate it.
- Specified Percentage of receivables being purchased (e.g. "10% of future receivables")
- Daily/Weekly payment amount specified in contract
- Estimated revenue the funder used to underwrite (often stated as "Merchant represents monthly revenue of $X")
- Origination fee, closing fee, admin fee, processing fee — ANY fee deducted from proceeds
- Net proceeds (purchase price minus all fees = what merchant actually received)

### 2. REVENUE REPRESENTATION — This is the KEY leverage point:
- Find the exact clause where merchant "represents" or "warrants" their monthly/annual revenue
- Extract the EXACT dollar amount the funder claims the merchant's revenue is
- Note if the agreement says "gross revenue", "net revenue", "receivables", or "deposits"
- This number will be cross-referenced against actual bank statements to find discrepancies

### 3. DEFAULT TRIGGERS — What gives the funder the right to accelerate:
- Payment default (missed payments)
- Breach of representation (including the revenue representation)
- Change in business operations
- Bankruptcy filing
- Other MCA positions (stacking prohibition)
- Change of bank account
- Material adverse change clause (MAC clause — often abused)
- CRITICAL: Note if the funder ALSO breached by funding into a stacked merchant despite their own anti-stacking clause

### 4. PROBLEMATIC CLAUSES — Flag for negotiation leverage:
- Confession of Judgment (COJ) — UNENFORCEABLE in NY as of Feb 2026 (FAIR Act), and restricted in many other states
- Personal Guarantee — scope and limitations
- UCC Filing — blanket vs specific
- Venue/Jurisdiction clause — especially if filed in a state different from merchant's state
- Waiver of right to jury trial
- Waiver of right to assert counterclaims
- Attorney fee shifting clauses
- Non-solicitation of other funders (anti-competition)

### 5. MERCHANT PROTECTIONS THEY MAY NOT KNOW ABOUT:
- Reconciliation rights — if the agreement allows merchant to request payment adjustment based on actual revenue decline, this is HUGE and most merchants don't know they have it
- Early payoff discount — some agreements allow payoff at less than full purchased amount
- Cure periods — how many days to cure a default before acceleration
- Revenue decline protection — some agreements reduce payments if revenue drops below threshold
- Right to audit funder's records

### 6. STACKING ANALYSIS:
- Does this agreement prohibit additional MCA positions?
- If yes, and the merchant HAS additional positions, was this funder the first or did THEY fund into an already stacked merchant?
- A funder who funded knowing about existing positions AND has a no-stacking clause in their own contract has severely weakened enforcement position

### 7. FEE ANALYSIS — Calculate TRUE cost of capital:
- Origination fee
- Closing/admin fee
- Broker/ISO commission (if disclosed)
- ACH processing fees
- Technology/platform fees
- Late fees / default fees
- UCC filing fees
- Any other fee that reduces net proceeds
- Total fees as percentage of purchase price
- TRUE advance amount = purchase_price - all_fees

### 8. STATE-SPECIFIC COMPLIANCE FLAGS:
- New York: FAIR Business Practices Act (Feb 2026) — COJ banned, disclosure requirements
- California: SB 1286 — APR disclosure required, specific form requirements
- Virginia: Commercial financing disclosure requirements
- Utah: Commercial financing registration requirements
- Connecticut: Small business lending disclosure
- Maryland: Commercial financing disclosure
- If agreement was executed after these laws took effect and doesn't comply, FLAG IT

## OUTPUT FORMAT — Return ONLY valid JSON, no markdown, no backticks:

{
  "funder_name": "string",
  "merchant_name": "string",
  "agreement_date": "YYYY-MM-DD",
  "agreement_type": "MCA|revenue_purchase|factoring|other",

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
    "other_fees": [{ "name": "", "amount": 0 }],
    "total_fees": 0,
    "total_fees_pct_of_purchase": 0,
    "net_proceeds_to_merchant": 0,
    "true_factor_rate": 0,
    "effective_annual_rate": 0
  },

  "default_triggers": [{
    "trigger": "string",
    "clause_reference": "string — section/paragraph number",
    "severity": "standard|aggressive|potentially_unenforceable",
    "notes": "string"
  }],

  "problematic_clauses": [{
    "clause_type": "coj|personal_guarantee|ucc_blanket|venue|jury_waiver|counterclaim_waiver|mac_clause|anti_stacking|attorney_fees|non_solicitation|other",
    "clause_text_summary": "string — brief summary of what the clause says",
    "clause_reference": "string — section/paragraph",
    "enforceability": "enforceable|questionable|unenforceable|state_dependent",
    "leverage_rating": "high|medium|low",
    "negotiation_notes": "string — how to use this in restructuring"
  }],

  "merchant_protections": [{
    "protection_type": "reconciliation|early_payoff|cure_period|revenue_protection|audit_right|other",
    "description": "string",
    "clause_reference": "string",
    "merchant_action_required": "string — what the merchant needs to do to invoke this right",
    "leverage_rating": "high|medium|low"
  }],

  "stacking_analysis": {
    "has_anti_stacking_clause": false,
    "anti_stacking_text_summary": "",
    "stacking_consequence": "string — what happens if merchant stacks (default trigger? acceleration?)",
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
    "revenue_clause_text": "string — exact or near-exact wording of the revenue representation",
    "withhold_percentage_stated": 0,
    "daily_payment_implied_annual_revenue": 0,
    "notes": "string — any inconsistencies in the revenue representation"
  },

  "negotiation_leverage": {
    "overall_leverage_rating": "strong|moderate|weak",
    "top_leverage_points": ["string"],
    "funder_vulnerabilities": ["string"],
    "recommended_approach": "string — how to approach this specific funder in restructuring",
    "estimated_settlement_range_pct": "string — e.g. '65-80% of remaining balance' if there are strong leverage points"
  },

  "contract_red_flags": [{
    "flag": "string",
    "severity": "critical|warning|info",
    "explanation": "string"
  }],

  "analysis_confidence": {
    "overall": "high|medium|low",
    "notes": "string — what was hard to extract or unclear"
  }
}

RULES:
1. Factor rate = purchased_amount / purchase_price. If >1.50, flag as "extreme"
2. True factor rate = purchased_amount / net_proceeds_to_merchant (accounts for fees)
3. Effective annual rate = ((factor_rate - 1) / (estimated_term_months / 12)) × 100
4. If COJ clause exists AND agreement is governed by NY law or merchant is in NY, mark as UNENFORCEABLE per FAIR Act (Feb 2026)
5. If reconciliation rights exist, this is always HIGH leverage — the merchant can demand payment adjustment
6. If anti-stacking clause exists AND merchant had prior positions when this funder funded, the FUNDER breached first
7. Always calculate net_proceeds = purchase_price - total_fees. This is what the merchant actually got.
8. daily_payment_implied_annual_revenue = (daily_payment / specified_receivable_percentage) × 365 if percentage is given
9. Be precise with clause references — cite section numbers when visible
10. Every fee matters. Even a $495 closing fee on a $50K advance is 1% — it adds up.`;

export async function POST(request) {
  try {
    const body = await request.json();
    const { text, images, fileName, model } = body;

    const hasText = text && typeof text === 'string' && text.trim().length >= 200;
    const hasImages = images && Array.isArray(images) && images.length > 0;

    if (!hasText && !hasImages) {
      return Response.json({
        error: 'No agreement data received. Upload a valid PDF.'
      }, { status: 400 });
    }

    const selectedModel = model === 'sonnet' ? 'claude-sonnet-4-20250514' : 'claude-opus-4-20250514';

    // Build content blocks
    const contentBlocks = [{ type: 'text', text: AGREEMENT_PROMPT + '\n\nMCA AGREEMENT:' }];

    if (hasText) {
      const truncated = text.length > 100000
        ? text.slice(0, 100000) + '\n[TRUNCATED]'
        : text;
      contentBlocks.push({ type: 'text', text: truncated });
    }

    if (hasImages) {
      const pageImages = images.slice(0, 20);
      for (const b64 of pageImages) {
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
      }
      if (!hasText) {
        contentBlocks.push({ type: 'text', text: '\n[This is a scanned MCA agreement. Read all pages above carefully and extract every contractual term.]' });
      }
    }

    const response = await client.messages.create({
      model: selectedModel,
      max_tokens: 12000,
      messages: [{ role: 'user', content: contentBlocks }]
    });

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
        } catch {
          return Response.json({
            error: 'Agreement analysis returned malformed data. Try re-analyzing or switching models.',
            debug: cleaned.slice(0, 500)
          }, { status: 500 });
        }
      } else {
        return Response.json({
          error: 'Agreement analysis did not return structured data.',
          debug: cleaned.slice(0, 500)
        }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      analysis,
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

import Anthropic from '@anthropic-ai/sdk';
import achDescriptors from '../../data/ach-descriptors.json' with { type: 'json' };
import funderRiskTiers from '../../data/funder-risk-tiers.json' with { type: 'json' };

export const maxDuration = 120;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
});

// Build compact funder intel reference for the prompt
function buildFunderIntelBlock() {
  const mcaFunders = achDescriptors.descriptors.filter(d => d.category === 'mca_funder');
  const nonMca = achDescriptors.descriptors.filter(d =>
    ['fuel_card', 'factoring', 'loan', 'collections', 'settlement', 'restructuring'].includes(d.category)
  );

  const funderLines = mcaFunders.map(d => `"${d.pattern}" → ${d.funder} (Tier ${d.tier})`).join('\n');
  const nonMcaLines = nonMca.map(d => `"${d.pattern}" → ${d.funder} [${d.category.toUpperCase()}] — NOT MCA`).join('\n');

  return `
## KNOWN MCA FUNDER ACH DESCRIPTORS
${funderLines}

## NON-MCA DESCRIPTORS — DO NOT CLASSIFY AS MCA:
${nonMcaLines}
`;
}

const QUICK_UW_PROMPT = `RESPOND WITH VALID JSON ONLY. NO TEXT BEFORE OR AFTER THE JSON. START YOUR RESPONSE WITH { AND END WITH }.

You are an expert MCA underwriter doing a QUICK SCREENING of bank statements for Funders First Inc. Your job is to extract two things: REVENUE and MCA POSITIONS. Speed and accuracy on the numbers matter — skip all narrative, negotiation analysis, and stacking commentary.

## TASK 1: REVENUE PER MONTH

For each statement month:
1. Start with GROSS DEPOSITS (total credits for the month)
2. Identify and FLAG any large deposits that look like MCA/loan funding proceeds:
   - Round-number wires ($50K, $100K, $200K, etc.)
   - Credits containing "WIRE", "ADVANCE", "FUNDING", "CAPITAL", "LOAN", "PROCEEDS", "GRP"
   - Credits matching any known MCA funder descriptor from the reference list below
   - These are NOT revenue — they are borrowed money being deposited
3. Also flag and exclude: NSF return credits, internal transfers between accounts, owner deposits labeled as such
4. NET REVENUE = Gross Deposits − Flagged MCA/Loan Proceeds − NSF Returns − Transfers
5. Record the ENDING BALANCE for each month
6. Record AVERAGE DAILY BALANCE if stated on the statement; otherwise estimate from beginning + ending / 2
7. Count NEGATIVE BALANCE DAYS and NSF/OD events

Revenue sources to ALWAYS count as TRUE REVENUE (never exclude):
- Card processing (Square, Clover, Stripe, PayPal, etc.)
- "THREE SQUARE" / "LE-USA TECHNOL" / "Cantaloupe" / "CANTALOUPE PAYOUTS" → vending processors
- Cash deposits / route collections
- Customer payments / invoices
- Vendor rebates
- ACH credits that do NOT match any known funder descriptor

Revenue sources to ALWAYS EXCLUDE:
- "AMF TEAM" / "AMFTEAM" = staffing company (OpEx), NOT MCA
- "FLEETCOR" / "WEX" / "COMDATA" = fleet fuel cards (OpEx), NOT MCA
- "AMERICAN FUNDS" = 401k, NOT revenue
- Any deposit matching a known MCA funder descriptor = loan proceeds

## TASK 2: MCA POSITIONS

Scan ALL months of statements for recurring ACH debits. For each funder position found:
1. FUNDER NAME — match against the descriptor reference list below. Use the canonical funder name.
2. ACH DESCRIPTOR — the exact text from the bank statement
3. PAYMENT AMOUNT — the recurring debit amount. If it varies, use the most recent consistent amount.
4. FREQUENCY — determine from payment spacing:
   - Every business day (Mon-Fri) = "daily"
   - Every week (same day) = "weekly"
   - Every two weeks = "bi-weekly"
   - Once per month = "monthly"
5. PAYMENTS OBSERVED — count how many debits from this funder across all statement months
6. FIRST SEEN / LAST SEEN — earliest and latest dates this funder's debit appears
7. STATUS:
   - "active" = payments appear in most recent month
   - "paid_off" = payments appeared in older months but ZERO in most recent month
   - "collections" = descriptor matches a known collections agency
8. POSITION TYPE:
   - "mca" for standard MCA positions
   - "loc" for lines of credit (Bluevine, Kabbage, OnDeck LOC — identified by variable payment amounts)
9. ESTIMATED MONTHLY TOTAL = payment × frequency multiplier (daily×22, weekly×4.33, bi-weekly×2.17, monthly×1)
10. CONFIDENCE: "high" if descriptor clearly matches known funder, "medium" if pattern-matched, "low" if uncertain

CRITICAL RULES:
- POSITION SEPARATION IS CRITICAL: If the same funder has debits at DIFFERENT AMOUNTS, these are SEPARATE positions (separate advances). For example, if "Merchant Market" has debits of $10,718.75 AND $9,764.75, that is TWO positions, not one. Each unique recurring debit amount from the same funder = separate position. Do NOT average them. Do NOT pick just one. List EACH as its own entry.
- Same funder with different reference numbers = SEPARATE positions even if amounts are similar
- Term loans with declining balances go in other_debt_service, NOT mca_positions
- "INCREASE" descriptor = Funders First (our company) — classify as "restructuring", not MCA
- "CORPORATE TURNAROUND" = debt settlement company, not MCA
- Collections descriptors ("MCA RECOVERY", "NOMAS", "MCALLC") = flag as collections, not active MCA
- REVENUE CALCULATION: net_verified_revenue MUST equal gross_deposits MINUS total_excluded. Double-check your math. monthly_average_revenue = sum of all months net_verified_revenue / number of months.
- total_mca_payments per month = sum of all MCA debits in that month (for the trend chart)

${buildFunderIntelBlock()}

## REQUIRED JSON OUTPUT STRUCTURE

{
  "business_name": "string",
  "bank_name": "string",
  "account_last4": "string or null",
  "statement_months_analyzed": 0,
  "quick_uw_mode": true,

  "monthly_breakdown": [
    {
      "month": "Month YYYY",
      "statement_period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
      "gross_deposits": 0,
      "flagged_proceeds": [
        { "description": "descriptor text", "amount": 0, "type": "mca_advance|loan|transfer|nsf_return|owner_deposit" }
      ],
      "total_excluded": 0,
      "net_verified_revenue": 0,
      "ending_balance": 0,
      "beginning_balance": 0,
      "average_daily_balance": 0,
      "days_negative": 0,
      "nsf_count": 0,
      "total_withdrawals": 0,
      "total_mca_payments": 0
    }
  ],

  "revenue": {
    "gross_deposits": 0,
    "excluded_mca_proceeds": 0,
    "excluded_loan_proceeds": 0,
    "excluded_nsf_returns": 0,
    "excluded_transfers": 0,
    "excluded_other": 0,
    "net_verified_revenue": 0,
    "monthly_average_revenue": 0,
    "cogs_rate": 0.40,
    "revenue_sources": [
      {
        "name": "string",
        "type": "card_processing|cash_deposit|ach_credit|vendor_credit|mca_advance|loan_advance|transfer|nsf_return",
        "total": 0,
        "monthly_avg": 0,
        "is_excluded": false,
        "confidence": 95,
        "exclusion_reason": "string or null"
      }
    ]
  },

  "balance_summary": {
    "beginning_balance": 0,
    "ending_balance": 0,
    "most_recent_ending_balance": 0,
    "average_daily_balance": 0,
    "total_deposits": 0,
    "total_withdrawals": 0
  },

  "mca_positions": [
    {
      "funder_name": "string",
      "descriptor": "string",
      "payment_amount": 0,
      "payment_amount_current": 0,
      "frequency": "daily|weekly|bi-weekly|monthly",
      "payments_in_period": 0,
      "first_seen": "YYYY-MM-DD or null",
      "last_seen": "YYYY-MM-DD or null",
      "estimated_monthly_total": 0,
      "status": "active|paid_off|collections",
      "position_type": "mca|loc",
      "confidence": "high|medium|low",
      "tier": "A|B|C|D|F|null",
      "notes": ""
    }
  ],

  "other_debt_service": [
    {
      "creditor": "string",
      "type": "term_loan|sba|auto_fleet|loc|other",
      "monthly_amount": 0,
      "notes": ""
    }
  ],

  "risk_metrics": {
    "negative_balance_days": 0,
    "nsf_events": 0,
    "returned_mca_payments": 0
  },

  "calculated_metrics": {
    "monthly_revenue": 0,
    "gross_profit": 0,
    "total_mca_monthly": 0,
    "total_mca_weekly": 0,
    "dsr_percent": 0,
    "active_positions": 0,
    "free_cash_monthly": 0
  }
}

IMPORTANT:
- payment_amount_current should equal payment_amount (this is for compatibility with the full analyzer)
- cogs_rate: use 0.40 as default unless the business type clearly suggests otherwise
- Calculate calculated_metrics yourself:
  - monthly_revenue = revenue.monthly_average_revenue
  - gross_profit = monthly_revenue × (1 - cogs_rate)
  - total_mca_monthly = sum of all active mca_positions estimated_monthly_total
  - total_mca_weekly = total_mca_monthly / 4.33
  - dsr_percent = (total_mca_monthly / gross_profit) × 100
  - active_positions = count of mca_positions with status "active"
  - free_cash_monthly = gross_profit - total_mca_monthly
- balance_summary.most_recent_ending_balance = ending balance from the most recent month`;


export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let statements = [];
    let industry = 'general';

    if (contentType.includes('multipart/form-data')) {
      // FormData upload (scanned PDFs sent as raw files)
      const formData = await request.formData();
      const files = formData.getAll('pdfs');
      industry = formData.get('industry') || 'general';

      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = buffer.toString('base64');
        statements.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          fileName: file.name,
        });
      }
    } else {
      // JSON body (text-extracted PDFs)
      const body = await request.json();
      industry = body.industry || 'general';

      if (body.statements && Array.isArray(body.statements)) {
        statements = body.statements;
      } else if (body.text) {
        statements = [{ text: body.text, accountLabel: body.fileName || 'Statement' }];
      }
    }

    if (!statements.length) {
      return Response.json({ error: 'No statements provided' }, { status: 400 });
    }

    // Build message content
    const content = [];

    // Add each statement as either document or text
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      if (stmt.type === 'document') {
        // Raw PDF file
        content.push({
          type: 'document',
          source: stmt.source,
        });
        content.push({
          type: 'text',
          text: `[Statement ${i + 1}: ${stmt.fileName || `File ${i + 1}`}]`,
        });
      } else if (stmt.images && stmt.images.length > 0) {
        // Scanned as images
        for (const img of stmt.images) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.data },
          });
        }
        content.push({
          type: 'text',
          text: `[Statement ${i + 1}: ${stmt.accountLabel || stmt.month || `File ${i + 1}`} — scanned images]`,
        });
      } else if (stmt.text) {
        // Text-extracted content
        content.push({
          type: 'text',
          text: `[Statement ${i + 1}: ${stmt.accountLabel || stmt.month || `File ${i + 1}`}]\n\n${stmt.text}`,
        });
      }
    }

    // Add the prompt
    content.push({
      type: 'text',
      text: QUICK_UW_PROMPT,
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      temperature: 0,
      messages: [{ role: 'user', content }],
    });

    const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');

    // Balanced-brace JSON extraction
    let jsonText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const firstBrace = jsonText.indexOf('{');
    if (firstBrace === -1) {
      return Response.json({ error: 'Quick UW did not return structured data.', debug: jsonText.slice(0, 500) }, { status: 500 });
    }

    // Walk braces to find matching close
    let depth = 0;
    let endIdx = -1;
    for (let i = firstBrace; i < jsonText.length; i++) {
      if (jsonText[i] === '{') depth++;
      else if (jsonText[i] === '}') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx === -1) {
      return Response.json({ error: 'Quick UW returned incomplete JSON.', debug: jsonText.slice(0, 500) }, { status: 500 });
    }
    jsonText = jsonText.slice(firstBrace, endIdx + 1);

    let analysis;
    try {
      analysis = JSON.parse(jsonText);
    } catch (parseErr) {
      // Try to fix common JSON issues
      try {
        const fixed = jsonText
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/[\x00-\x1f]/g, ' ');
        analysis = JSON.parse(fixed);
      } catch {
        return Response.json({
          error: 'Quick UW returned malformed JSON.',
          debug: jsonText.slice(0, 800),
          parseError: parseErr.message,
        }, { status: 500 });
      }
    }

    // Ensure required fields exist for frontend compatibility
    analysis.quick_uw_mode = true;
    analysis.revenue = analysis.revenue || {};
    analysis.mca_positions = analysis.mca_positions || [];
    analysis.other_debt_service = analysis.other_debt_service || [];
    analysis.monthly_breakdown = analysis.monthly_breakdown || [];
    analysis.balance_summary = analysis.balance_summary || {};
    analysis.risk_metrics = analysis.risk_metrics || {};
    analysis.calculated_metrics = analysis.calculated_metrics || {};

    // Ensure revenue_sources exists (needed for postProcess and PricingTab)
    if (!analysis.revenue.revenue_sources) {
      analysis.revenue.revenue_sources = [];
    }

    // Ensure each position has payment_amount_current for frontend compat
    analysis.mca_positions = analysis.mca_positions.map(p => ({
      ...p,
      payment_amount_current: p.payment_amount_current || p.payment_amount || 0,
      estimated_monthly_total: p.estimated_monthly_total || 0,
    }));

    return Response.json({
      success: true,
      analysis,
      statement_count: statements.length,
      model_used: 'claude-sonnet-4-20250514',
      mode: 'quick_uw',
    });

  } catch (err) {
    console.error('Quick UW error:', err);
    return Response.json({
      error: err.message || 'Quick UW analysis failed',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    }, { status: 500 });
  }
}

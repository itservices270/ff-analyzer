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
2. List EVERY INDIVIDUAL DEPOSIT of $10,000 or more. For each one, provide:
   - descriptor: the exact text from the bank statement
   - amount: the dollar amount
   - date: the date it posted (YYYY-MM-DD)
   - is_revenue: your best guess — true if it's real business income, false if it's MCA/loan proceeds, a transfer, or non-revenue
   - exclusion_reason: if is_revenue is false, explain why (e.g., "MCA advance wire", "internal transfer", "loan proceeds")
3. Calculate the sum of ALL deposits UNDER $10,000 for the month — report this as "small_deposits_total"
4. Record ENDING BALANCE, BEGINNING BALANCE for each month
5. Record AVERAGE DAILY BALANCE if stated on the statement; otherwise estimate from (beginning + ending) / 2
6. Count NEGATIVE BALANCE DAYS and NSF/OD events
7. Calculate total_mca_payments = sum of all MCA debits in that month

Classification guidance for large deposits:
- EXCLUDE (is_revenue: false): Round-number wires ($50K, $100K, $200K), credits containing "WIRE" + "ADVANCE"/"FUNDING"/"CAPITAL"/"LOAN"/"PROCEEDS"/"GRP", credits matching known MCA funder descriptors, NSF return credits, internal transfers, "AMF TEAM"/"AMFTEAM" (staffing, not revenue)
- CHECK DEPOSITS: Physical checks ("CHECK" + number) over $25K → is_revenue: false (likely owner capital, insurance, transfers). CHECK $5K-$25K → flag for review, lean toward excluding. Multiple large CHECKs ($50K+) in one month → exclude (capital infusions). Round-number CHECKs ($10K/$25K/$50K/$100K exactly) → exclude (capital transfer). Bare "DEPOSIT" with no descriptor → lean toward excluding if over $10K. When in doubt about CHECK/DEPOSIT items, err on EXCLUDING — better for user to manually include than overstate revenue.
- INCLUDE (is_revenue: true): Card processing (Square, Clover, Stripe, PayPal), "THREE SQUARE"/"LE-USA TECHNOL"/"Cantaloupe"/"CANTALOUPE PAYOUTS" (vending processors), cash deposits/route collections, customer payments/invoices, vendor rebates, ACH credits NOT matching any known funder descriptor

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
- REVENUE CALCULATION: The server will calculate revenue from your large_deposits data. Just make sure gross_deposits is accurate and every deposit ≥ $10,000 is listed in large_deposits.
- total_mca_payments per month = sum of all MCA debits in that month (for the trend chart)

## POSITION COUNT VERIFICATION (do this BEFORE outputting JSON):
1. Scan ALL recurring debits across ALL months. List every unique (descriptor, amount) pair.
2. If the SAME funder name/descriptor has debits at 2+ DIFFERENT amounts, that is 2+ SEPARATE positions. Create one mca_positions entry for EACH amount.
3. Count your total unique positions. If you only found 1-2 positions on a business with $40K+/week in MCA payments, you almost certainly missed or merged positions. Re-scan.
4. Common merge error: "Merchant Market" or "Merchant Marketplace" often has 2-3 advances at different amounts ($10,718 and $9,764 for example). These MUST be separate entries.

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
      "large_deposits": [
        { "descriptor": "exact text from statement", "amount": 0, "date": "YYYY-MM-DD", "is_revenue": true, "exclusion_reason": null }
      ],
      "small_deposits_total": 0,
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
    "cogs_rate": 0.40
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

    // ── SERVER-SIDE REVENUE BUILDER ──
    // Build revenue_sources from individual large_deposits for manual toggle control
    const mb = analysis.monthly_breakdown || [];
    if (mb.length > 0) {
      const totalGross = mb.reduce((s, m) => s + (m.gross_deposits || 0), 0);
      const avgMonthlyGross = totalGross / mb.length;

      // Dynamic threshold: 3% of avg monthly gross, minimum $10,000
      const threshold = Math.max(10000, avgMonthlyGross * 0.03);

      // Collect all large deposits across all months
      const allLargeDeposits = [];
      let totalSmallDeposits = 0;

      mb.forEach(m => {
        (m.large_deposits || []).forEach(dep => {
          allLargeDeposits.push({
            descriptor: dep.descriptor || 'Unknown',
            amount: dep.amount || 0,
            date: dep.date || null,
            month: m.month,
            is_revenue: dep.is_revenue !== false, // default to revenue if not specified
            exclusion_reason: dep.exclusion_reason || null,
          });
        });
        totalSmallDeposits += (m.small_deposits_total || 0);

        // Backfill net_verified_revenue and total_excluded for Trend tab compat
        const monthExcluded = (m.large_deposits || [])
          .filter(d => d.is_revenue === false)
          .reduce((s, d) => s + (d.amount || 0), 0);
        m.total_excluded = monthExcluded;
        m.net_verified_revenue = (m.gross_deposits || 0) - monthExcluded;
      });

      // Group deposits by normalized descriptor for the toggle table
      const groups = {};
      allLargeDeposits.forEach(dep => {
        // Normalize: strip dates, numbers, whitespace for grouping
        const normKey = (dep.descriptor || '')
          .replace(/\d{2}\/\d{2}\/?\d{0,4}/g, '') // strip dates
          .replace(/\d{6,}/g, '') // strip long numbers (reference IDs)
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase()
          || 'UNKNOWN';

        if (!groups[normKey]) {
          groups[normKey] = {
            name: dep.descriptor, // keep first occurrence's original text
            total: 0,
            count: 0,
            is_excluded: !dep.is_revenue,
            exclusion_reason: dep.exclusion_reason,
            deposits: [],
          };
        }
        groups[normKey].total += dep.amount;
        groups[normKey].count += 1;
        groups[normKey].deposits.push(dep);
        // If ANY deposit in the group is excluded, mark the group as excluded
        if (dep.is_revenue === false) {
          groups[normKey].is_excluded = true;
          groups[normKey].exclusion_reason = groups[normKey].exclusion_reason || dep.exclusion_reason;
        }
      });

      // Build revenue_sources array
      const revenueSources = Object.values(groups).map(g => ({
        name: g.name + (g.count > 1 ? ` (${g.count}×)` : ''),
        type: g.is_excluded ? 'mca_advance' : 'ach_credit',
        total: Math.round(g.total * 100) / 100,
        monthly_avg: Math.round((g.total / mb.length) * 100) / 100,
        is_excluded: g.is_excluded,
        confidence: g.is_excluded ? 95 : 90,
        exclusion_reason: g.exclusion_reason,
      }));

      // Sort: excluded items first (so they're visible at top), then by total descending
      revenueSources.sort((a, b) => {
        if (a.is_excluded !== b.is_excluded) return a.is_excluded ? -1 : 1;
        return b.total - a.total;
      });

      // Add "Other deposits below threshold" line for small deposits
      if (totalSmallDeposits > 0) {
        revenueSources.push({
          name: `Other deposits under ${threshold >= 10000 ? '$' + Math.round(threshold / 1000) + 'K' : '$' + Math.round(threshold)}`,
          type: 'ach_credit',
          total: Math.round(totalSmallDeposits * 100) / 100,
          monthly_avg: Math.round((totalSmallDeposits / mb.length) * 100) / 100,
          is_excluded: false,
          confidence: 85,
          exclusion_reason: null,
        });
      }

      // Calculate revenue from sources
      const totalExcluded = revenueSources.filter(s => s.is_excluded).reduce((s, r) => s + r.total, 0);
      const totalIncluded = revenueSources.filter(s => !s.is_excluded).reduce((s, r) => s + r.total, 0);
      const netRevenue = totalGross - totalExcluded;
      const avgRevenue = netRevenue / mb.length;

      // Set revenue object
      analysis.revenue.gross_deposits = totalGross;
      analysis.revenue.net_verified_revenue = Math.round(netRevenue * 100) / 100;
      analysis.revenue.monthly_average_revenue = Math.round(avgRevenue * 100) / 100;
      analysis.revenue.excluded_mca_proceeds = Math.round(totalExcluded * 100) / 100;
      analysis.revenue.excluded_loan_proceeds = 0;
      analysis.revenue.excluded_transfers = 0;
      analysis.revenue.excluded_nsf_returns = 0;
      analysis.revenue.excluded_other = 0;
      analysis.revenue.revenue_sources = revenueSources;

      // Recalculate metrics with corrected revenue
      const cogsRate = analysis.revenue.cogs_rate || 0.40;
      const grossProfit = avgRevenue * (1 - cogsRate);
      const activeMCA = analysis.mca_positions.filter(p => (p.status || '').toLowerCase() === 'active');
      const totalMCAMonthly = activeMCA.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0);
      const totalMCAWeekly = totalMCAMonthly / 4.33;
      const dsrPercent = grossProfit > 0 ? (totalMCAMonthly / grossProfit) * 100 : 0;

      analysis.calculated_metrics.monthly_revenue = Math.round(avgRevenue * 100) / 100;
      analysis.calculated_metrics.gross_profit = Math.round(grossProfit * 100) / 100;
      analysis.calculated_metrics.total_mca_monthly = Math.round(totalMCAMonthly * 100) / 100;
      analysis.calculated_metrics.total_mca_weekly = Math.round(totalMCAWeekly * 100) / 100;
      analysis.calculated_metrics.dsr_percent = Math.round(dsrPercent * 100) / 100;
      analysis.calculated_metrics.active_positions = activeMCA.length;
      analysis.calculated_metrics.free_cash_monthly = Math.round((grossProfit - totalMCAMonthly) * 100) / 100;
      analysis.calculated_metrics.avg_daily_balance = analysis.balance_summary.average_daily_balance || analysis.balance_summary.avg_daily_balance || 0;
    }

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

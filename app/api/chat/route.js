import Anthropic from '@anthropic-ai/sdk';
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a senior MCA restructuring negotiation advisor embedded inside the Funders First Analyzer tool. You have 15+ years of experience negotiating MCA debt restructurings.

## YOUR ROLE
- Help the user in REAL-TIME during funder negotiations — they may be on a live call
- Provide specific talking points, counter-arguments, and deal math
- Reference the analysis data provided to give concrete, data-backed responses
- Be concise and actionable — short paragraphs, not essays
- When the user asks about a specific funder, reference that funder's contract terms, leverage points, and cross-reference data

## YOUR KNOWLEDGE
- You understand MCA mechanics: factor rates, specified percentages, reconciliation clauses, anti-stacking violations, COJ enforceability
- You know the NY FAIR Act restricts COJ enforcement for agreements post-Feb 2026
- You know that mutual stacking breach (funder funded knowing other positions existed) weakens enforcement
- You understand Funders First's model: 100% repayment, reduced weekly payments, extended terms, proportional TAD allocation
- You are NOT a debt settlement advisor — FF restructures, it doesn't settle for less than full balance

## TONE
- Professional but direct — like a coach in the user's earpiece during a negotiation
- Data-forward — always cite specific numbers from the analysis
- Confident but not aggressive — the goal is collaborative restructuring, not confrontation
- If the user is on a call, keep responses SHORT (2-4 sentences max)

## IMPORTANT
- Never advise the user to threaten legal action — FF's approach is data-driven collaboration
- Always frame proposals as "100% repayment" — funders need to hear this
- Reference Gavin Roberts (resolutions@fundersfirst.com, 480-631-7691) as the official point of contact
- If you don't know something from the data, say so — don't fabricate numbers`;

export async function POST(request) {
  try {
    const { messages, analysisContext } = await request.json();

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'No messages provided' }, { status: 400 });
    }

    // Build context from analysis data
    let contextBlock = '';
    if (analysisContext) {
      const { businessName, revenue, positions, agreements, crossRef, industry } = analysisContext;

      contextBlock += `\n## CURRENT DEAL: ${businessName || 'Unknown Business'}\n`;
      if (industry) contextBlock += `Industry: ${industry}\n`;
      if (revenue) contextBlock += `Monthly Revenue (bank-verified): ${revenue.toLocaleString()}\n`;

      if (positions && positions.length > 0) {
        contextBlock += `\n### ACTIVE MCA POSITIONS (${positions.length}):\n`;
        positions.forEach((p, i) => {
          contextBlock += `${i + 1}. ${p.funder_name || 'Unknown'}: ${(p.weekly || 0).toLocaleString()}/wk, Balance: ${(p.balance || 0).toLocaleString()}`;
          if (p.specified_pct) contextBlock += `, Specified %: ${p.specified_pct}%`;
          if (p.status) contextBlock += ` [${p.status}]`;
          contextBlock += '\n';
        });
        const totalWeekly = positions.reduce((s, p) => s + (p.weekly || 0), 0);
        const totalBalance = positions.reduce((s, p) => s + (p.balance || 0), 0);
        contextBlock += `TOTAL: ${totalWeekly.toLocaleString()}/wk, ${totalBalance.toLocaleString()} total debt\n`;
        if (revenue) contextBlock += `Withhold %: ${((totalWeekly * 4.33 / revenue) * 100).toFixed(1)}% of monthly revenue\n`;
      }

      if (agreements && agreements.length > 0) {
        contextBlock += `\n### AGREEMENT DETAILS (${agreements.length} contracts on file):\n`;
        agreements.forEach(ag => {
          const a = ag.analysis || ag;
          contextBlock += `- ${a.funder_name || 'Unknown'}: `;
          if (a.purchase_price) contextBlock += `Purchase: ${a.purchase_price.toLocaleString()}, `;
          if (a.purchased_amount) contextBlock += `Payback: ${a.purchased_amount.toLocaleString()}, `;
          if (a.factor_rate) contextBlock += `Factor: ${a.factor_rate}x, `;
          if (a.specified_percentage) contextBlock += `Specified %: ${a.specified_percentage}%, `;
          if (a.reconciliation_right) contextBlock += `Reconciliation: YES (${a.reconciliation_days || '?'} days), `;
          if (a.anti_stacking_clause) contextBlock += `Anti-stacking: YES, `;
          if (a.coj_clause) contextBlock += `COJ: YES, `;
          if (a.governing_law_state) contextBlock += `Gov law: ${a.governing_law_state}`;
          contextBlock += '\n';

          if (a.negotiation_leverage) {
            const lev = a.negotiation_leverage;
            if (lev.reconciliation_leverage) contextBlock += `  → Reconciliation leverage: ${lev.reconciliation_leverage}\n`;
            if (lev.stacking_leverage) contextBlock += `  → Stacking leverage: ${lev.stacking_leverage}\n`;
          }
        });
      }

      if (crossRef) {
        const cr = crossRef.analysis || crossRef;

        if (cr.contract_vs_reality && cr.contract_vs_reality.length > 0) {
          contextBlock += `\n### CROSS-REFERENCE INTELLIGENCE:\n`;
          cr.contract_vs_reality.forEach(cvr => {
            contextBlock += `- ${cvr.funder_name}: Grade ${cvr.underwriting_grade || '?'}`;
            if (cvr.stated_revenue) contextBlock += `, Implied revenue: ${cvr.stated_revenue.toLocaleString()}`;
            if (cvr.actual_revenue) contextBlock += `, Actual: ${cvr.actual_revenue.toLocaleString()}`;
            if (cvr.true_factor_rate) contextBlock += `, True factor: ${cvr.true_factor_rate}x`;
            contextBlock += '\n';
            if (cvr.underwriting_failures) {
              cvr.underwriting_failures.forEach(f => { contextBlock += `  ⚠ ${f}\n`; });
            }
            if (cvr.leverage_points) {
              cvr.leverage_points.forEach(lp => { contextBlock += `  ✓ ${lp}\n`; });
            }
          });
        }

        if (cr.cascading_burden_analysis?.narrative) {
          contextBlock += `\n### CASCADING BURDEN NARRATIVE:\n${cr.cascading_burden_analysis.narrative}\n`;
        }

        if (cr.restructuring_recommendation?.headline) {
          contextBlock += `\n### RESTRUCTURING RECOMMENDATION:\n${cr.restructuring_recommendation.headline}\n`;
        }
      }
    }

    const apiMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: `${SYSTEM_PROMPT}\n\n## DEAL CONTEXT — REFERENCE THIS DATA IN YOUR RESPONSES:\n${contextBlock}`,
      messages: apiMessages,
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');

    return Response.json({ success: true, response: text });

  } catch (err) {
    console.error('Chat error:', err.message);
    return Response.json({ error: err.message || 'Chat failed' }, { status: 500 });
  }
}

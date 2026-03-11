import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 30;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  try {
    const { description } = await request.json();
    if (!description || typeof description !== 'string' || !description.trim()) {
      return Response.json({ error: 'No description provided' }, { status: 400 });
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Parse this MCA (Merchant Cash Advance) position description into a JSON object. Return ONLY raw JSON, no markdown fences, no explanation, no text before or after.

Description: "${description}"

Return this exact structure:
{
  "funder_name": "string - the funder/company name",
  "payment_amount": 0.00,
  "frequency": "daily|weekly|bi-weekly|monthly",
  "payments_detected": 0,
  "estimated_monthly_total": 0.00,
  "first_payment_date": "YYYY-MM-DD or null",
  "last_payment_date": "YYYY-MM-DD or null",
  "pattern_description": "brief description of the payment pattern",
  "confidence": "manual",
  "flag": "standard"
}

Rules:
- estimated_monthly_total: if weekly payment, multiply by 4.33. If daily, multiply by 21.67 (banking days). If bi-weekly, multiply by 2.17.
- payments_detected: estimate based on frequency and month (weekly=4, daily=22, bi-weekly=2, monthly=1)
- If only a monthly total is given, set payment_amount = estimated_monthly_total / payments_detected
- confidence must always be "manual" since this is user-entered`
      }]
    });

    const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let position;
    try {
      position = JSON.parse(cleaned);
    } catch {
      // Robust extraction with balanced brace matching
      let depth = 0, start = -1, end = -1;
      for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '{') { if (depth === 0) start = i; depth++; }
        else if (cleaned[i] === '}') { depth--; if (depth === 0 && start >= 0) { end = i + 1; break; } }
      }
      if (start >= 0 && end > start) {
        try {
          position = JSON.parse(cleaned.slice(start, end));
        } catch {
          return Response.json({ error: 'Could not parse description into a structured position. Try being more specific (e.g., "TBF Group $5,000 weekly").' }, { status: 500 });
        }
      } else {
        return Response.json({ error: 'Could not parse description into a position.' }, { status: 500 });
      }
    }

    // Validate and fill required fields
    if (!position.funder_name) {
      position.funder_name = 'Unknown Funder';
    }
    if (!position.estimated_monthly_total && position.payment_amount) {
      const mult = { daily: 21.67, weekly: 4.33, 'bi-weekly': 2.17, monthly: 1 };
      position.estimated_monthly_total = parseFloat((position.payment_amount * (mult[position.frequency] || 4.33)).toFixed(2));
    }
    position.confidence = 'manual';

    return Response.json({ success: true, position });

  } catch (err) {
    console.error('Parse position error:', err);
    return Response.json({ error: err.message || 'Parse failed' }, { status: 500 });
  }
}

import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 30;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  try {
    const { description } = await request.json();
    if (!description?.trim()) {
      return Response.json({ error: 'No description provided' }, { status: 400 });
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Parse this MCA (Merchant Cash Advance) position description into a JSON object. Return ONLY raw JSON, no markdown.

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
- estimated_monthly_total: if weekly payment, multiply by 4.33. If daily, multiply by 30. If bi-weekly, multiply by 2.17.
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
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) position = JSON.parse(match[0]);
      else return Response.json({ error: 'Could not parse description into a position' }, { status: 500 });
    }

    return Response.json({ success: true, position });

  } catch (err) {
    console.error('Parse position error:', err);
    return Response.json({ error: err.message || 'Parse failed' }, { status: 500 });
  }
}

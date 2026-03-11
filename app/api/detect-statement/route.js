import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 15;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  try {
    const body = await request.json();
    const { text, fileName } = body;

    if (!text || typeof text !== 'string' || text.trim().length < 50) {
      return Response.json({
        success: true,
        info: {
          account_name: (fileName || 'Unknown').replace('.pdf', ''),
          statement_month: 'Unknown',
          bank_name: '',
          account_number: ''
        }
      });
    }

    const sample = text.slice(0, 3000);

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `From this bank statement text, extract ONLY these fields. Return raw JSON only — no markdown fences, no explanation, no text before or after the JSON object.

{"account_name": "business name or account holder name", "statement_month": "Month YYYY", "bank_name": "bank name", "account_number": "last 4 digits only", "statement_start": "YYYY-MM-DD or empty", "statement_end": "YYYY-MM-DD or empty"}

Bank statement text:
${sample}`
      }]
    });

    const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let info;
    try {
      info = JSON.parse(cleaned);
    } catch {
      // Try to extract JSON from mixed response
      const jsonMatch = cleaned.match(/\{[^{}]*\}/);
      if (jsonMatch) {
        try {
          info = JSON.parse(jsonMatch[0]);
        } catch {
          info = null;
        }
      }

      if (!info) {
        info = {
          account_name: (fileName || 'Unknown').replace('.pdf', ''),
          statement_month: 'Unknown',
          bank_name: '',
          account_number: '',
          statement_start: '',
          statement_end: ''
        };
      }
    }

    return Response.json({ success: true, info });
  } catch (err) {
    console.error('Detect-statement error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

import Anthropic from '@anthropic-ai/sdk';
export const maxDuration = 30;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  try {
    const body = await request.json();
    const { text, fileName, images } = body;
    const fullText = text || '';
    // Take first 2000 chars (header/cover) AND chars 2000-5000 (where statement period often appears)
    const sample = fullText.slice(0, 2000) + '\n---\n' + fullText.slice(2000, 5000);
    const hasText = sample.trim().length > 50;
    const hasImage = images && images.length > 0;

    if (!hasText && !hasImage) {
      const info = { account_name: (fileName || 'Unknown').replace('.pdf','').replace(/-/g, ' '), statement_month: 'Unknown', bank_name: '', account_number: '' };
      return Response.json({ success: true, info });
    }

    const contentBlocks = [];
    if (hasImage) {
      contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: images[0] } });
    }
    contentBlocks.push({
      type: 'text',
      text: `From this bank statement${hasImage ? ' image' : ' text'}, extract ONLY these fields. Return raw JSON only, no markdown, no explanation.

Look for: business/account holder name, statement period or date range (convert to "Month YYYY" format for the ending month), bank name, account number last 4 digits.

{"account_name": "business name", "statement_month": "Month YYYY", "bank_name": "bank name", "account_number": "last 4 digits only"}

${hasText ? 'Bank statement text:\n' + sample : '[Read the statement image above]'}`
    });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: 'user', content: contentBlocks }]
    });

    const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let info;
    try { info = JSON.parse(cleaned); }
    catch { info = { account_name: (fileName || 'Unknown').replace('.pdf','').replace(/-/g, ' '), statement_month: 'Unknown', bank_name: '', account_number: '' }; }
    return Response.json({ success: true, info });
  } catch (err) {
    console.error('Detect error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

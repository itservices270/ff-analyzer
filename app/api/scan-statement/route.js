import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCAN_PROMPT = `You are an expert MCA underwriter for Funders First Inc. You are reading a scanned bank statement PDF. Extract all transaction data and return the same structured analysis as you would for text-based statements.

Be precise — every number will be used in funder negotiations. Read every page carefully.

Return ONLY valid JSON with this structure (no markdown, no backticks):

{
  "business_name": "string",
  "bank_name": "string",
  "account_last4": "string",
  "statement_period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "statement_month": "Month YYYY",
  "text_content": "string — full extracted text of all transactions you can read, one line per transaction",
  "balance_summary": {
    "beginning_balance": 0, "ending_balance": 0,
    "total_deposits": 0, "total_withdrawals": 0,
    "average_daily_balance": 0
  },
  "revenue": {
    "card_processing": 0, "cash_deposits": 0, "ach_credits": 0, "vendor_credits": 0,
    "total_true_revenue": 0,
    "excluded_items": [{ "description": "", "amount": 0, "reason": "" }]
  },
  "mca_positions": [{
    "funder_name": "", "descriptor": "",
    "payment_amount": 0, "frequency": "weekly",
    "payments_in_period": 0, "monthly_total": 0,
    "confidence": "high|medium|low", "status": "active",
    "notes": ""
  }],
  "other_debt_service": [{
    "creditor": "", "type": "term_loan|sba|auto_fleet|other",
    "monthly_amount": 0, "notes": ""
  }],
  "risk_metrics": {
    "negative_balance_days": 0,
    "nsf_events": 0,
    "returned_mca_payments": 0
  },
  "scan_confidence": "high|medium|low",
  "scan_notes": "string — any readability issues, blurry sections, or uncertain data"
}

RULES:
1. Monthly estimate = weekly × 4.33
2. MCA = recurring ACH debits with "CAPITAL", "FUNDING", "ADVANCE", "MCA", "MERCHANT" etc.
3. Term loans (monthly, declining) go in other_debt_service, NOT mca_positions
4. Exclude MCA advance wires, NSF returns, transfers from revenue
5. The text_content field should contain your best reading of every transaction — this will be used for the full multi-month analysis later`;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('pdf');
    const scanModel = formData.get('model') || 'opus';

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const mediaType = file.type || 'application/pdf';

    const isPDF = mediaType === 'application/pdf' || file.name?.endsWith('.pdf');
    const isImage = mediaType.startsWith('image/');

    if (!isPDF && !isImage) {
      return Response.json({ error: 'Please upload a PDF or image file' }, { status: 400 });
    }

    const contentBlock = isPDF
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

    const selectedModel = scanModel === 'sonnet' ? 'claude-sonnet-4-20250514' : 'claude-opus-4-20250514';

    const response = await client.messages.create({
      model: selectedModel,
      max_tokens: 12000,
      messages: [{
        role: 'user',
        content: [contentBlock, { type: 'text', text: SCAN_PROMPT }]
      }]
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
        try { analysis = JSON.parse(cleaned.slice(start, end)); }
        catch { return Response.json({ error: 'Scan returned malformed data. Try again.', debug: cleaned.slice(0, 500) }, { status: 500 }); }
      } else {
        return Response.json({ error: 'Scan did not return structured data.', debug: cleaned.slice(0, 500) }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      analysis,
      text_content: analysis.text_content || '',
      file_name: file.name,
      model_used: selectedModel
    });

  } catch (err) {
    console.error('Scan error:', err);
    return Response.json({ error: err.message || 'Scan failed' }, { status: 500 });
  }
}

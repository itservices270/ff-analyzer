import Anthropic from '@anthropic-ai/sdk';
export const maxDuration = 30;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Month name mapping for filename parsing
const MONTH_MAP = {
  'january': 'January', 'jan': 'January', '01': 'January', '1': 'January',
  'february': 'February', 'feb': 'February', '02': 'February', '2': 'February',
  'march': 'March', 'mar': 'March', '03': 'March', '3': 'March',
  'april': 'April', 'apr': 'April', '04': 'April', '4': 'April',
  'may': 'May', '05': 'May', '5': 'May',
  'june': 'June', 'jun': 'June', '06': 'June', '6': 'June',
  'july': 'July', 'jul': 'July', '07': 'July', '7': 'July',
  'august': 'August', 'aug': 'August', '08': 'August', '8': 'August',
  'september': 'September', 'sep': 'September', 'sept': 'September', '09': 'September', '9': 'September',
  'october': 'October', 'oct': 'October', '10': 'October',
  'november': 'November', 'nov': 'November', '11': 'November',
  'december': 'December', 'dec': 'December', '12': 'December'
};

// Known bank names for filename parsing
const KNOWN_BANKS = ['beverly', 'chase', 'wells fargo', 'bank of america', 'bofa', 'td bank', 'pnc', 'us bank', 'citizens', 'capital one', 'truist', 'fifth third', 'huntington', 'regions', 'keybank', 'bmo', 'santander', 'comerica', 'first national', 'bancorp'];

// Parse month/year from filename like "November_2025.pdf", "Nov-2025.pdf", "11_2025.pdf", "Statement_Nov_2025.pdf"
function parseMonthFromFilename(fileName) {
  if (!fileName) return null;
  const name = fileName.toLowerCase().replace('.pdf', '').replace('.png', '').replace('.jpg', '').replace('.jpeg', '');
  // Try patterns: Month_YYYY, Month-YYYY, MM_YYYY, MM-YYYY, YYYY_Month, YYYY-Month, etc.
  const patterns = [
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[_\-\s]*(20\d{2})\b/i,
    /\b(20\d{2})[_\-\s]*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i,
    /\b(0?[1-9]|1[0-2])[_\-\s]*(20\d{2})\b/,
    /\b(20\d{2})[_\-\s]*(0?[1-9]|1[0-2])\b/
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      let monthKey, year;
      if (/^\d{4}$/.test(match[1])) {
        year = match[1];
        monthKey = match[2].toLowerCase();
      } else {
        monthKey = match[1].toLowerCase();
        year = match[2];
      }
      const month = MONTH_MAP[monthKey];
      if (month && year) return `${month} ${year}`;
    }
  }
  return null;
}

// Try to extract bank name from filename
function parseBankFromFilename(fileName) {
  if (!fileName) return '';
  const name = fileName.toLowerCase();
  for (const bank of KNOWN_BANKS) {
    if (name.includes(bank)) {
      return bank.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }
  return '';
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { text, fileName, images } = body;
    const fullText = text || '';
    // Sample multiple regions: header (0-2500), mid (2500-6000), and later (6000-10000) where statement period may appear
    const sample = fullText.slice(0, 2500) + '\n---\n' + fullText.slice(2500, 6000) + '\n---\n' + fullText.slice(6000, 10000);
    const hasText = sample.trim().length > 50;
    const hasImage = images && images.length > 0;

    if (!hasText && !hasImage) {
      const info = { account_name: (fileName || 'Unknown').replace('.pdf','').replace(/-/g, ' '), statement_month: 'Unknown', bank_name: '', account_number: '' };
      return Response.json({ success: true, info });
    }

    const contentBlocks = [];
    if (hasImage) {
      // Include first 2 pages if available (statement period sometimes on page 2)
      const pagesToUse = images.slice(0, 2);
      for (const img of pagesToUse) {
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } });
      }
    }
    contentBlocks.push({
      type: 'text',
      text: `From this bank statement${hasImage ? ' image' : ' text'}, extract ONLY these fields. Return raw JSON only, no markdown, no explanation.

REQUIRED FIELDS:
1. account_name: Business name or account holder name (look for "Account Name", "Primary Owner", company name in header)
2. statement_month: The ending month of the statement period in "Month YYYY" format. Look for phrases like:
   - "Statement Period: MM/DD/YYYY - MM/DD/YYYY" or "MM/DD/YYYY through MM/DD/YYYY"
   - "For the period ending" or "Thru" or "To" date
   - "Statement Date" or "Closing Date"
   Use the END date's month and year (e.g., "January 2025", "February 2024")
3. bank_name: The financial institution name (e.g., "Beverly Bank", "Chase", "Bank of America")
4. account_number: Last 4 digits only of the account number

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

    // Filename fallbacks when Claude returns Unknown or empty values
    if (!info.statement_month || info.statement_month === 'Unknown') {
      const parsedMonth = parseMonthFromFilename(fileName);
      if (parsedMonth) info.statement_month = parsedMonth;
    }
    if (!info.bank_name) {
      const parsedBank = parseBankFromFilename(fileName);
      if (parsedBank) info.bank_name = parsedBank;
    }

    return Response.json({ success: true, info });
  } catch (err) {
    console.error('Detect error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// Zero-dep email notifications via the Resend HTTP API.
// Requires env var RESEND_API_KEY. Optional: NOTIFICATION_FROM_EMAIL,
// NEW_DEAL_NOTIFY_TO (comma-separated). Never throws — always returns
// a result object so callers can stay best-effort.

const DEFAULT_FROM = 'Funders First <deals@fundersfirst.com>';
const DEFAULT_TO = 'info@fundersfirst.com,logan@fundersfirst.com';

function parseRecipients(raw) {
  return (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function sendResendEmail({ from, to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[notifications] RESEND_API_KEY not set — skipping email:', subject);
    return { ok: false, skipped: true, reason: 'no-api-key' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[notifications] resend failed:', res.status, body);
      return { ok: false, status: res.status, body };
    }

    const data = await res.json().catch(() => null);
    console.log('[notifications] email sent:', { id: data?.id, subject });
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[notifications] resend exception:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Sends the "new deal submitted" notification email to the ops team.
 * Best-effort — never throws.
 */
export async function sendNewDealEmail({ deal, isoName, totalEstimatedDebt }) {
  const from = process.env.NOTIFICATION_FROM_EMAIL || DEFAULT_FROM;
  const to = parseRecipients(process.env.NEW_DEAL_NOTIFY_TO || DEFAULT_TO);

  if (to.length === 0) {
    console.warn('[notifications] no recipients configured — skipping new deal email');
    return { ok: false, skipped: true, reason: 'no-recipients' };
  }

  const merchantName = deal?.merchant_name || deal?.merchant_dba || 'Unknown merchant';
  const ownerName =
    [deal?.owner_first, deal?.owner_last].filter(Boolean).join(' ').trim() || 'Unknown';
  const positionCount =
    deal?.position_count ?? (Array.isArray(deal?.positions) ? deal.positions.length : 0);
  const debtFormatted =
    '$' + Math.round(totalEstimatedDebt || 0).toLocaleString('en-US');

  const subject = `New Deal Submitted: ${merchantName}`;
  const text = [
    `New deal submitted by ${isoName || 'an ISO partner'}`,
    '',
    `Business: ${merchantName}`,
    `Owner: ${ownerName}`,
    `Positions: ${positionCount}`,
    `Total Estimated Debt: ${debtFormatted}`,
    '',
    'Review in Analyzer: https://ff-analyzer.vercel.app',
  ].join('\n');

  return sendResendEmail({ from, to, subject, text });
}

'use client';
import { useState, useCallback, useRef } from 'react';

// ─── PDF.js for client-side text extraction ───
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = PDFJS_CDN; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return window.pdfjsLib;
}

async function extractPDFText(file) {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text;
}

// ─── PDF page-to-image for scanned/image-based PDFs ───
async function extractPDFImages(file, maxPages = 10) {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const images = [];
  const pages = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const scale = 1.5; // Balance between readability and payload size
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    const base64 = dataUrl.split(',')[1];
    images.push(base64);
  }
  return images;
}

// ─── Design Tokens ───
const C = {
  bg: '#0a0e14',
  bgAlt: '#0d1117',
  card: '#141a23',
  cardHover: '#1a2230',
  cardBorder: '#1e2a3a',
  cardBorderHover: '#2a3a4e',
  text: '#e2e4ea',
  textMuted: 'rgba(226,228,234,0.45)',
  textSoft: 'rgba(226,228,234,0.7)',
  cyan: '#00d4f5',
  cyanDim: 'rgba(0,212,245,0.08)',
  cyanGlow: 'rgba(0,212,245,0.15)',
  gold: '#EAD068',
  goldDim: 'rgba(234,208,104,0.1)',
  red: '#ff4757',
  redDim: 'rgba(255,71,87,0.08)',
  green: '#26de81',
  greenDim: 'rgba(38,222,129,0.08)',
  orange: '#ffa502',
  orangeDim: 'rgba(255,165,2,0.08)',
  purple: '#a55eea',
};

const S = {
  page: {
    minHeight: '100vh', background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bgAlt} 100%)`,
    color: C.text, fontFamily: "'SF Pro Display','Inter','Segoe UI',system-ui,-apple-system,sans-serif",
    padding: '24px 28px', maxWidth: 1280, margin: '0 auto',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, paddingBottom: 20, borderBottom: `1px solid ${C.cardBorder}` },
  logo: { fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px', background: `linear-gradient(135deg, ${C.cyan}, ${C.gold})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  logoSub: { fontSize: 11, color: C.textMuted, marginTop: 2, letterSpacing: '0.5px', textTransform: 'uppercase' },
  card: { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: 20, marginBottom: 14 },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 16 },
  stat: { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: '16px 20px' },
  statLabel: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: C.textMuted, marginBottom: 6 },
  statValue: (color) => ({ fontSize: 26, fontWeight: 700, color: color || C.cyan, lineHeight: 1.1 }),
  statSub: { fontSize: 11, color: C.textMuted, marginTop: 4 },
  tabs: { display: 'flex', gap: 2, marginBottom: 16, overflowX: 'auto', paddingBottom: 4, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 4 },
  tab: (active) => ({
    padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
    fontFamily: 'inherit', background: active ? C.cyanGlow : 'transparent', color: active ? C.cyan : C.textMuted,
    transition: 'all 0.2s', whiteSpace: 'nowrap',
  }),
  btn: (type) => ({
    padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
    background: type === 'primary' ? `linear-gradient(135deg, ${C.cyan}, #00b4d8)` : type === 'danger' ? C.red : 'rgba(255,255,255,0.06)',
    color: type === 'primary' ? '#000' : type === 'danger' ? '#fff' : C.text,
    transition: 'all 0.15s', boxShadow: type === 'primary' ? '0 2px 12px rgba(0,212,245,0.25)' : 'none',
  }),
  sectionTitle: { fontSize: 14, fontWeight: 700, color: C.cyan, marginBottom: 12, marginTop: 16, textTransform: 'uppercase', letterSpacing: '0.5px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', padding: '8px 12px', borderBottom: `1px solid ${C.cardBorder}`, color: C.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 },
  td: { padding: '8px 12px', borderBottom: `1px solid rgba(30,42,58,0.5)` },
  badge: (color) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${color}18`, color, border: `1px solid ${color}30`, marginRight: 6, letterSpacing: '0.3px' }),
  dropzone: (dragging) => ({
    border: `2px dashed ${dragging ? C.cyan : C.cardBorder}`, borderRadius: 14, padding: '56px 48px', textAlign: 'center',
    cursor: 'pointer', background: dragging ? C.cyanDim : 'rgba(255,255,255,0.01)', transition: 'all 0.3s',
  }),
};

const fmt = (n) => {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const formatted = abs >= 1000000
    ? '$' + (abs / 1000000).toFixed(2) + 'M'
    : '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n < 0 ? '-' + formatted : formatted;
};
const fmtPct = (n) => (n == null || isNaN(n)) ? '—' : n.toFixed(1) + '%';
const fmtFactor = (n) => (n == null || isNaN(n)) ? '—' : n.toFixed(3);
const tierColor = { healthy: C.green, elevated: C.gold, stressed: C.orange, critical: C.red, unsustainable: '#ff1744' };
const tierLabel = { healthy: 'HEALTHY', elevated: 'ELEVATED', stressed: 'STRESSED', critical: 'CRITICAL', unsustainable: 'UNSUSTAINABLE' };

// ─── Confidence Badge ───
function ConfidenceBadge({ level }) {
  const colors = { high: C.green, medium: C.gold, low: C.red };
  return <span style={S.badge(colors[level] || C.textMuted)}>{(level || 'unknown').toUpperCase()}</span>;
}

// ─── Cash Flow Waterfall ───
function WaterfallChart({ waterfall }) {
  if (!waterfall) return null;
  const steps = [
    { label: 'Revenue', value: waterfall.total_true_revenue || waterfall.avg_monthly_revenue || 0, type: 'total' },
    { label: 'COGS', value: -(waterfall.minus_cogs || waterfall.minus_avg_cogs || 0), type: 'negative' },
    { label: 'Gross Profit', value: waterfall.gross_profit || waterfall.avg_gross_profit || 0, type: 'subtotal' },
    { label: 'Payroll', value: -(waterfall.minus_payroll || waterfall.minus_avg_payroll || 0), type: 'negative' },
    { label: 'Rent', value: -(waterfall.minus_rent || waterfall.minus_avg_rent || 0), type: 'negative' },
    { label: 'Utilities', value: -(waterfall.minus_utilities || waterfall.minus_avg_utilities || 0), type: 'negative' },
    { label: 'Insurance', value: -(waterfall.minus_insurance || waterfall.minus_avg_insurance || 0), type: 'negative' },
    { label: 'Taxes', value: -(waterfall.minus_taxes || waterfall.minus_avg_taxes || 0), type: 'negative' },
    { label: 'Other OpEx', value: -(waterfall.minus_other_opex || waterfall.minus_avg_other_opex || 0), type: 'negative' },
    { label: 'Op. Income', value: waterfall.operating_income || waterfall.avg_operating_income || 0, type: 'subtotal' },
    { label: 'Term Loans', value: -(waterfall.minus_term_loans || waterfall.minus_avg_term_loans || 0), type: 'negative' },
    { label: 'Before MCA', value: waterfall.income_before_mca || waterfall.avg_income_before_mca || 0, type: 'subtotal' },
    { label: 'MCA Payments', value: -(waterfall.minus_mca_payments || waterfall.minus_avg_mca_payments || 0), type: 'negative' },
    { label: 'Net Cash', value: waterfall.net_free_cash_flow || waterfall.avg_net_free_cash_flow || 0, type: 'result' },
  ].filter(s => s.value !== 0 || s.type === 'subtotal' || s.type === 'result' || s.type === 'total');

  const maxVal = Math.max(...steps.map(s => Math.abs(s.value)), 1);

  return (
    <div style={{ ...S.card, overflowX: 'auto' }}>
      <div style={S.statLabel}>MONTHLY CASH FLOW WATERFALL</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 200, paddingTop: 24, minWidth: steps.length * 70 }}>
        {steps.map((step, i) => {
          const h = Math.max((Math.abs(step.value) / maxVal) * 160, 8);
          const isNeg = step.value < 0 || step.type === 'negative';
          const color = step.type === 'result'
            ? (step.value >= 0 ? C.green : C.red)
            : step.type === 'subtotal' ? C.cyan
            : isNeg ? C.red : C.green;
          return (
            <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: 56 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color }}>{fmt(step.value)}</div>
              <div style={{
                background: `linear-gradient(180deg, ${color}, ${color}60)`,
                width: '70%', height: h, margin: '0 auto', borderRadius: '4px 4px 0 0',
                opacity: step.type === 'subtotal' || step.type === 'total' || step.type === 'result' ? 1 : 0.7,
                border: (step.type === 'subtotal' || step.type === 'result') ? `1px solid ${color}` : 'none',
              }} />
              <div style={{ fontSize: 9, color: C.textMuted, marginTop: 6, lineHeight: 1.2 }}>{step.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Revenue Tab ───
function RevenueTab({ a }) {
  const gp = a.gross_profit || a.gross_profit_analysis || {};
  const rev = a.revenue || {};
  const wf = a.cash_flow_waterfall;

  return (<div>
    <div style={S.statGrid}>
      <div style={S.stat}>
        <div style={S.statLabel}>True Revenue</div>
        <div style={S.statValue(C.cyan)}>{fmt(rev.total_true_revenue || gp.avg_monthly_revenue)}</div>
        <div style={S.statSub}>Verified operating income only</div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>Cost of Goods Sold</div>
        <div style={S.statValue(C.orange)}>{fmt(gp.cogs_total || gp.avg_monthly_cogs)}</div>
        <div style={S.statSub}>Product / supplier costs</div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>Gross Profit</div>
        <div style={S.statValue(C.green)}>{fmt(gp.gross_profit_amount || gp.avg_gross_profit)}</div>
        <div style={S.statSub}>{fmtPct(gp.gross_margin_pct || gp.avg_gross_margin_pct)} margin</div>
      </div>
    </div>

    {wf && <WaterfallChart waterfall={wf} />}

    <div style={S.sectionTitle}>Revenue Breakdown</div>
    <div style={S.card}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, fontSize: 13 }}>
        <div><span style={{ color: C.textMuted, fontSize: 11 }}>Card Processing</span><br /><strong>{fmt(rev.card_processing)}</strong></div>
        <div><span style={{ color: C.textMuted, fontSize: 11 }}>Cash Deposits</span><br /><strong>{fmt(rev.cash_deposits)}</strong></div>
        <div><span style={{ color: C.textMuted, fontSize: 11 }}>ACH Credits</span><br /><strong>{fmt(rev.ach_credits)}</strong></div>
        <div><span style={{ color: C.textMuted, fontSize: 11 }}>Vendor Credits</span><br /><strong>{fmt(rev.vendor_credits)}</strong></div>
      </div>
    </div>

    {rev.excluded_items?.length > 0 && (<>
      <div style={S.sectionTitle}>Excluded from Revenue</div>
      <div style={S.card}>
        <table style={S.table}><thead><tr><th style={S.th}>Item</th><th style={S.th}>Amount</th><th style={S.th}>Reason</th></tr></thead>
          <tbody>{rev.excluded_items.map((x, i) => (
            <tr key={i}><td style={S.td}>{x.description}</td><td style={S.td}>{fmt(x.amount)}</td><td style={S.td}><span style={S.badge(C.red)}>{x.reason}</span></td></tr>
          ))}</tbody>
        </table>
      </div>
    </>)}

    {(gp.cogs_breakdown || []).length > 0 && (<>
      <div style={S.sectionTitle}>COGS Breakdown</div>
      <div style={S.card}>
        <table style={S.table}><thead><tr><th style={S.th}>Vendor</th><th style={S.th}>Amount</th></tr></thead>
          <tbody>{gp.cogs_breakdown.map((x, i) => (
            <tr key={i}><td style={S.td}>{x.vendor}</td><td style={S.td}>{fmt(x.amount)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </>)}
  </div>);
}

// ─── Trend Tab ───
function TrendTab({ a }) {
  const trend = a.revenue_trend || {};
  const monthly = trend.monthly_values || a.monthly_summary || [];

  return (<div>
    <div style={S.statGrid}>
      <div style={S.stat}>
        <div style={S.statLabel}>3-Month Avg Revenue</div>
        <div style={S.statValue(C.cyan)}>{fmt(trend.avg_3_month || trend.avg_all)}</div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>All-Period Average</div>
        <div style={S.statValue(C.gold)}>{fmt(trend.avg_all)}</div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>Revenue Trend</div>
        <div style={S.statValue(trend.direction === 'improving' ? C.green : trend.direction === 'declining' ? C.red : C.gold)}>
          {trend.direction === 'improving' ? '▲' : trend.direction === 'declining' ? '▼' : '►'} {trend.direction || 'stable'}
        </div>
        <div style={S.statSub}>{trend.detail || ''}</div>
      </div>
    </div>

    {trend.seasonal_note && (
      <div style={{ ...S.card, borderLeft: `3px solid ${C.gold}`, padding: '12px 16px', fontSize: 12, color: C.gold }}>
        ⚠ Seasonal Note: {trend.seasonal_note}
      </div>
    )}

    {monthly.length > 0 && (<>
      <div style={S.sectionTitle}>Monthly Revenue</div>
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: 180, padding: '24px 0 0' }}>
          {monthly.map((m, i) => {
            const val = m.revenue || m.true_revenue || 0;
            const max = Math.max(...monthly.map(x => x.revenue || x.true_revenue || 0));
            const h = max > 0 ? (val / max) * 130 : 0;
            return (
              <div key={i} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: C.cyan }}>{fmt(val)}</div>
                <div style={{
                  background: `linear-gradient(180deg, ${C.cyan}, ${C.cyan}30)`,
                  width: 36, height: h, margin: '0 auto', borderRadius: '5px 5px 0 0',
                }} />
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8 }}>{m.month}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 12, padding: '8px 0', borderTop: `1px solid ${C.cardBorder}` }}>
          Peak: <strong style={{ color: C.green }}>{trend.peak_month}</strong> &nbsp;|&nbsp; Low: <strong style={{ color: C.red }}>{trend.low_month}</strong>
        </div>
      </div>
    </>)}

    {a.monthly_summary?.length > 0 && (<>
      <div style={S.sectionTitle}>Month-by-Month Breakdown</div>
      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>Month</th><th style={S.th}>Revenue</th><th style={S.th}>Gross Profit</th>
            <th style={S.th}>MCA Pmts</th><th style={S.th}>ADB</th><th style={S.th}>End Bal</th><th style={S.th}>Neg Days</th><th style={S.th}>NSFs</th>
          </tr></thead>
          <tbody>{a.monthly_summary.map((m, i) => (
            <tr key={i}>
              <td style={S.td}>{m.month}</td>
              <td style={S.td}>{fmt(m.true_revenue)}</td>
              <td style={S.td}>{fmt(m.gross_profit)}</td>
              <td style={{ ...S.td, color: C.red }}>{fmt(m.mca_total)}</td>
              <td style={S.td}>{fmt(m.average_daily_balance)}</td>
              <td style={{ ...S.td, color: (m.ending_balance || 0) < 0 ? C.red : C.green }}>{fmt(m.ending_balance)}</td>
              <td style={{ ...S.td, color: (m.negative_days || 0) > 0 ? C.red : C.green }}>{m.negative_days || 0}</td>
              <td style={{ ...S.td, color: (m.nsf_events || 0) > 0 ? C.red : C.textMuted }}>{m.nsf_events || 0}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>)}
  </div>);
}

// ─── MCA Positions Tab ───
function MCATab({ a, positions, setPositions }) {
  // Calculate using GROSS PROFIT as denominator (not revenue)
  const gp = a.gross_profit?.gross_profit_amount || a.gross_profit_analysis?.avg_gross_profit || 0;
  const totalMCA = positions.filter(p => !p._excluded).reduce((s, p) => s + (p.monthly_estimate || p.monthly_total || 0), 0);
  const otherDebt = (a.other_debt_service || []).reduce((s, d) => s + (d.monthly_amount || 0), 0);
  const dsrMCA = gp > 0 ? (totalMCA / gp * 100) : 0;
  const dsrAll = gp > 0 ? ((totalMCA + otherDebt) / gp * 100) : 0;
  const totalWeekly = positions.filter(p => !p._excluded).reduce((s, p) => s + (p.current_payment_amount || p.payment_amount || 0), 0);
  const totalEstRemaining = positions.filter(p => !p._excluded).reduce((s, p) => s + (p.estimated_remaining_balance || 0), 0);

  const togglePosition = (i) => {
    setPositions(prev => prev.map((p, idx) => idx === i ? { ...p, _excluded: !p._excluded } : p));
  };

  return (<div>
    <div style={S.statGrid}>
      <div style={S.stat}>
        <div style={S.statLabel}>Active Positions</div>
        <div style={S.statValue()}>{positions.filter(p => !p._excluded).length}<span style={{ fontSize: 13, color: C.textMuted }}> / {positions.length}</span></div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>Weekly MCA Burden</div>
        <div style={S.statValue(C.red)}>{fmt(totalWeekly)}</div>
        <div style={S.statSub}>{fmt(totalMCA)}/mo</div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>Est. Total Remaining</div>
        <div style={S.statValue(C.orange)}>{totalEstRemaining > 0 ? fmt(totalEstRemaining) : '—'}</div>
        <div style={S.statSub}>Across all active positions</div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>DSR (vs Gross Profit)</div>
        <div style={S.statValue(tierColor[dsrAll >= 50 ? 'unsustainable' : dsrAll >= 35 ? 'critical' : dsrAll >= 25 ? 'stressed' : dsrAll >= 15 ? 'elevated' : 'healthy'])}>
          {fmtPct(dsrAll)}
        </div>
        <div style={S.statSub}>MCA {fmtPct(dsrMCA)} + Other {fmtPct(dsrAll - dsrMCA)}</div>
      </div>
    </div>

    <div style={S.sectionTitle}>MCA Positions</div>
    <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'right', marginBottom: 8 }}>Toggle positions to exclude from calculations & export</div>

    {positions.map((p, i) => (
      <div key={i} style={{
        ...S.card, opacity: p._excluded ? 0.35 : 1,
        borderLeft: `3px solid ${p.status === 'default' || p.status === 'returned' ? C.red : p.status === 'refinanced' ? C.orange : C.cyan}`,
        transition: 'opacity 0.2s',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{p.funder_name}</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{p.descriptor || ''}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {p.status && p.status !== 'active' && <span style={S.badge(p.status === 'default' || p.status === 'returned' ? C.red : C.orange)}>⚠ {p.status.toUpperCase()}</span>}
              <ConfidenceBadge level={p.confidence} />
              <span style={S.badge(C.textMuted)}>{(p.frequency || 'weekly').toUpperCase()}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 180 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.cyan }}>{fmt(p.monthly_estimate || p.monthly_total)}<span style={{ fontSize: 11, color: C.textMuted }}>/mo</span></div>
            <div style={{ fontSize: 12, color: C.textSoft }}>{fmt(p.current_payment_amount || p.payment_amount)} × {p.frequency || 'weekly'}</div>
            <button style={{ ...S.btn(), padding: '4px 14px', fontSize: 11, marginTop: 8 }} onClick={() => togglePosition(i)}>
              {p._excluded ? '↩ Include' : '✕ Exclude'}
            </button>
          </div>
        </div>

        {/* Financial Details Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 12, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
          {p.estimated_remaining_balance != null && (
            <div><div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase' }}>Est. Remaining</div><div style={{ fontSize: 14, fontWeight: 600, color: C.orange }}>{fmt(p.estimated_remaining_balance)}</div></div>
          )}
          {p.estimated_original_advance != null && (
            <div><div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase' }}>Original Advance</div><div style={{ fontSize: 14, fontWeight: 600 }}>{fmt(p.estimated_original_advance)}</div></div>
          )}
          {p.implied_factor_rate != null && (
            <div><div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase' }}>Factor Rate</div><div style={{ fontSize: 14, fontWeight: 600, color: p.implied_factor_rate > 1.45 ? C.red : C.gold }}>{fmtFactor(p.implied_factor_rate)}</div></div>
          )}
          {p.effective_annual_rate != null && (
            <div><div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase' }}>Eff. Annual Rate</div><div style={{ fontSize: 14, fontWeight: 600, color: p.effective_annual_rate > 100 ? C.red : C.orange }}>{fmtPct(p.effective_annual_rate)}</div></div>
          )}
          {p.estimated_weeks_remaining != null && (
            <div><div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase' }}>Weeks Left</div><div style={{ fontSize: 14, fontWeight: 600 }}>~{Math.round(p.estimated_weeks_remaining)}</div></div>
          )}
          {p.total_payments_observed != null && (
            <div><div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase' }}>Payments Observed</div><div style={{ fontSize: 14, fontWeight: 600 }}>{p.total_payments_observed} paid{p.total_returned_observed > 0 && <span style={{ color: C.red }}>, {p.total_returned_observed} returned</span>}</div></div>
          )}
        </div>

        {p.notes && <div style={{ marginTop: 8, padding: '8px 12px', background: C.orangeDim, borderRadius: 6, fontSize: 12, color: C.orange }}>{p.notes}</div>}
        {p.advance_deposit && <div style={{ marginTop: 6, padding: '8px 12px', background: C.cyanDim, borderRadius: 6, fontSize: 12, color: C.cyan }}>Advance deposit: {fmt(p.advance_deposit.amount)} on {p.advance_deposit.date}</div>}
        {p.returned_payments?.length > 0 && p.returned_payments.map((rp, ri) => (
          <div key={ri} style={{ marginTop: 4, padding: '6px 12px', background: C.redDim, borderRadius: 6, fontSize: 12, color: C.red }}>⚠ RETURNED: {fmt(rp.amount)} on {rp.date}</div>
        ))}

        {/* Payment trend across months */}
        {p.payment_trend?.length > 1 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Payment History by Month</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {p.payment_trend.map((pt, pi) => (
                <div key={pi} style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 11 }}>
                  <span style={{ color: C.textMuted }}>{pt.month}:</span> {fmt(pt.amount)} × {pt.payments_count}
                  {(pt.returned_count || 0) > 0 && <span style={{ color: C.red }}> ({pt.returned_count} ret)</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ))}

    {(a.other_debt_service || []).length > 0 && (<>
      <div style={S.sectionTitle}>Other Debt Service (Non-MCA)</div>
      {a.other_debt_service.map((d, i) => (
        <div key={i} style={{ ...S.card, borderLeft: `3px solid ${C.textMuted}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{d.creditor}</div>
              <div style={{ marginTop: 4 }}>
                <span style={S.badge(C.textMuted)}>{(d.type || '').replace(/_/g, ' ').toUpperCase()}</span>
                {d.payment_trend && <span style={S.badge(d.payment_trend === 'declining' ? C.green : C.textMuted)}>{d.payment_trend}</span>}
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(d.monthly_amount)}<span style={{ fontSize: 11, color: C.textMuted }}>/mo</span></div>
          </div>
          {d.notes && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>{d.notes}</div>}
        </div>
      ))}
    </>)}
  </div>);
}

// ─── Risk Tab ───
function RiskTab({ a }) {
  const rm = a.risk_metrics || {};
  const gp = a.gross_profit || a.gross_profit_analysis || {};
  const tier = rm.dsr_tier || 'critical';
  const tc = tierColor[tier] || C.red;
  const spa = a.sustainable_payment_analysis || {};
  const adb = rm.average_daily_balance || rm.avg_daily_balance || a.balance_summary?.average_daily_balance || 0;
  const weeklyMCA = rm.current_mca_weekly || 0;

  return (<div>
    {/* DSR Gauge */}
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={S.statLabel}>DEBT SERVICE RATIO (vs Gross Profit)</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: tc, lineHeight: 1 }}>{fmtPct(rm.dsr_mca_only)}</div>
          <div style={{ fontSize: 12, color: C.textSoft, marginTop: 4 }}>MCA only — {fmtPct(rm.dsr_all_debt)} all debt</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ ...S.badge(tc), fontSize: 13, padding: '6px 16px' }}>● {tierLabel[tier] || tier.toUpperCase()}</span>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 10 }}>
            {fmt(rm.current_mca_monthly || 0)} MCA<br />÷ {fmt(gp.gross_profit_amount || gp.avg_gross_profit)} gross profit
          </div>
        </div>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, marginTop: 20, position: 'relative', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min((rm.dsr_mca_only || 0) / 65 * 100, 100)}%`, height: '100%', background: `linear-gradient(90deg, ${C.green}, ${C.gold}, ${C.orange}, ${C.red})`, borderRadius: 4, transition: 'width 0.5s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.textMuted, marginTop: 6 }}>
        <span>0% Healthy</span><span>15%</span><span>25%</span><span>35%</span><span>50%+ Unsustainable</span>
      </div>
    </div>

    {/* Key Risk Metrics */}
    <div style={S.statGrid}>
      <div style={S.stat}>
        <div style={S.statLabel}>Gross Profit After MCA</div>
        <div style={S.statValue((rm.gross_profit_after_mca || gp.gross_profit_after_mca || 0) < 0 ? C.red : C.green)}>
          {fmt(rm.gross_profit_after_mca || gp.gross_profit_after_mca || 0)}
        </div>
        <div style={S.statSub}>{fmtPct(rm.mca_pct_of_gross_profit || gp.mca_as_pct_of_gross_profit)} of GP consumed</div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>Average Daily Balance</div>
        <div style={S.statValue(adb < (weeklyMCA / 5) ? C.red : C.green)}>{fmt(adb)}</div>
        <div style={S.statSub}>
          {weeklyMCA > 0
            ? `${(adb / (weeklyMCA / 5)).toFixed(1)}× daily MCA cost`
            : 'No MCA detected'}
          {rm.adb_coverage_ratio != null && rm.adb_coverage_ratio < 1 && (
            <span style={{ color: C.red }}> — INSUFFICIENT</span>
          )}
        </div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>NSF / Returned Events</div>
        <div style={S.statValue(C.orange)}>{rm.total_nsf_events || rm.nsf_events || 0}<span style={{ fontSize: 13 }}> NSFs</span></div>
        <div style={S.statSub}>{rm.total_returned_mca || rm.returned_mca_payments || 0} returned MCA payments</div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>Negative Balance Days</div>
        <div style={S.statValue((rm.total_negative_days || rm.negative_balance_days || 0) > 3 ? C.red : C.orange)}>
          {rm.total_negative_days || rm.negative_balance_days || 0}<span style={{ fontSize: 13 }}> days</span>
        </div>
        <div style={S.statSub}>{fmtPct(rm.negative_day_pct || 0)} of banking days</div>
      </div>
    </div>

    {/* Burden Increase */}
    {(rm.weekly_burden_increase != null && rm.weekly_burden_increase !== 0) && (
      <div style={{ ...S.card, borderLeft: `3px solid ${C.red}` }}>
        <div style={S.statLabel}>MCA BURDEN ESCALATION</div>
        <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
          Over the analysis period, total weekly MCA burden
          {rm.weekly_burden_increase > 0
            ? <span style={{ color: C.red }}> increased by {fmt(rm.weekly_burden_increase)} ({fmtPct(rm.burden_increase_pct)})</span>
            : <span style={{ color: C.green }}> decreased by {fmt(Math.abs(rm.weekly_burden_increase))}</span>
          }
          {rm.new_debt_in_period > 0 && (
            <span> — driven by {fmt(rm.new_debt_in_period)} in new MCA advances during this period.</span>
          )}
        </div>
      </div>
    )}

    {/* Sustainable Payment Analysis */}
    {spa.rationale && (
      <div style={{ ...S.card, borderLeft: `3px solid ${C.green}`, background: 'rgba(38,222,129,0.03)' }}>
        <div style={S.statLabel}>SUSTAINABLE PAYMENT CAPACITY</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase' }}>Current Weekly MCA</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.red }}>{fmt(spa.current_weekly_mca)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase' }}>Sustainable Weekly</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.green }}>{fmt(spa.sustainable_weekly_payment || spa.recommended_weekly_total)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase' }}>Recommended Reduction</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.gold }}>{fmtPct(spa.recommended_reduction_pct)}</div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: C.textSoft }}>
          {spa.rationale}
        </div>
      </div>
    )}

    {/* Stacking Timeline */}
    {(a.stacking_timeline || []).length > 0 && (<>
      <div style={S.sectionTitle}>Stacking Timeline</div>
      <div style={S.card}>
        {a.stacking_timeline.map((ev, i) => (
          <div key={i} style={{ padding: '14px 0', borderBottom: i < a.stacking_timeline.length - 1 ? `1px solid ${C.cardBorder}` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <span style={{ color: C.cyan, fontWeight: 600, marginRight: 12, fontSize: 12 }}>{ev.date}</span>
                <span style={{ fontSize: 13 }}>{ev.event}</span>
              </div>
              {ev.cumulative_weekly_burden != null && (
                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontSize: 10, color: C.textMuted }}>Cumulative Weekly</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.red }}>{fmt(ev.cumulative_weekly_burden)}</div>
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: C.orange, marginTop: 4 }}>{ev.impact}</div>
            {ev.weekly_mca_before != null && (
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                Weekly: {fmt(ev.weekly_mca_before)} → {fmt(ev.weekly_mca_after)}
              </div>
            )}
          </div>
        ))}
      </div>
    </>)}

    {/* Advance Deposits */}
    {(a.advance_deposits || a.advance_deposits_detected || []).length > 0 && (<>
      <div style={S.sectionTitle}>MCA Advance Deposits Detected</div>
      <div style={S.card}>
        <table style={S.table}>
          <thead><tr><th style={S.th}>Date</th><th style={S.th}>Funder</th><th style={S.th}>Amount</th><th style={S.th}>Evidence</th><th style={S.th}>Matched To</th></tr></thead>
          <tbody>{(a.advance_deposits || a.advance_deposits_detected || []).map((ad, i) => (
            <tr key={i}>
              <td style={S.td}>{ad.date}</td>
              <td style={S.td}>{ad.funder}</td>
              <td style={{ ...S.td, color: C.red, fontWeight: 600 }}>{fmt(ad.amount)}</td>
              <td style={{ ...S.td, fontSize: 10 }}>{ad.evidence || ad.payment_impact}</td>
              <td style={{ ...S.td, fontSize: 10 }}>{ad.matched_position || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        <div style={{ marginTop: 12, padding: '10px 14px', background: C.redDim, borderRadius: 8, fontSize: 13, color: C.red, fontWeight: 600 }}>
          Total new MCA debt: {fmt((a.advance_deposits || a.advance_deposits_detected || []).reduce((s, x) => s + (x.amount || 0), 0))}
          {' '}across {(a.advance_deposits || a.advance_deposits_detected || []).length} advance(s)
        </div>
      </div>
    </>)}
  </div>);
}

// ─── Negotiation Intel Tab ───
function NegotiationTab({ a }) {
  const ni = a.negotiation_intel || {};
  const spa = a.sustainable_payment_analysis || {};

  return (<div>
    <div style={{ ...S.card, borderLeft: `3px solid ${C.gold}`, background: 'rgba(234,208,104,0.03)' }}>
      <div style={S.statLabel}>HEADLINE — FUNDER COMMUNICATION SUMMARY</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 10, lineHeight: 1.6 }}>{ni.headline || 'Analysis pending...'}</div>
    </div>

    {ni.gross_profit_story && (
      <div style={{ ...S.card, borderLeft: `3px solid ${C.green}` }}>
        <div style={S.statLabel}>THE BUSINESS CASE — WHY THIS BUSINESS IS VIABLE</div>
        <div style={{ marginTop: 10, lineHeight: 1.7, fontSize: 14, color: C.textSoft }}>{ni.gross_profit_story}</div>
      </div>
    )}

    {spa.rationale && (
      <div style={{ ...S.card, borderLeft: `3px solid ${C.cyan}`, background: C.cyanDim }}>
        <div style={S.statLabel}>RECOMMENDED PAYMENT STRUCTURE — THE "NO BRAINER"</div>
        <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted }}>CURRENT</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.red, textDecoration: 'line-through' }}>{fmt(spa.current_weekly_mca)}<span style={{ fontSize: 12 }}>/wk</span></div>
          </div>
          <div style={{ fontSize: 28, color: C.textMuted, alignSelf: 'center' }}>→</div>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted }}>RECOMMENDED</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.green }}>{fmt(spa.sustainable_weekly_payment || spa.recommended_weekly_total)}<span style={{ fontSize: 12 }}>/wk</span></div>
          </div>
          <div style={{ alignSelf: 'center' }}>
            <span style={{ ...S.badge(C.green), fontSize: 13, padding: '6px 14px' }}>{fmtPct(spa.recommended_reduction_pct)} reduction</span>
          </div>
        </div>
        <div style={{ marginTop: 12, lineHeight: 1.7, fontSize: 13, color: C.textSoft }}>{spa.rationale}</div>
      </div>
    )}

    {ni.cost_of_capital_story && (
      <div style={{ ...S.card, borderLeft: `3px solid ${C.purple}` }}>
        <div style={S.statLabel}>COST OF CAPITAL ANALYSIS</div>
        <div style={{ marginTop: 10, lineHeight: 1.7, fontSize: 14, color: C.textSoft }}>{ni.cost_of_capital_story}</div>
      </div>
    )}

    {ni.stacking_narrative && (
      <div style={{ ...S.card, borderLeft: `3px solid ${C.orange}` }}>
        <div style={S.statLabel}>STACKING NARRATIVE — HOW DEBT ESCALATED</div>
        <div style={{ marginTop: 10, lineHeight: 1.7, fontSize: 14, color: C.textSoft }}>{ni.stacking_narrative}</div>
      </div>
    )}

    {ni.default_evidence && (
      <div style={{ ...S.card, borderLeft: `3px solid ${C.red}` }}>
        <div style={S.statLabel}>DEFAULT EVIDENCE</div>
        <div style={{ marginTop: 10, lineHeight: 1.7, fontSize: 14, color: C.textSoft }}>{ni.default_evidence}</div>
      </div>
    )}

    {ni.sustainability_case && (
      <div style={{ ...S.card, borderLeft: `3px solid ${C.green}` }}>
        <div style={S.statLabel}>SUSTAINABILITY CASE — 100% REPAYMENT PATH</div>
        <div style={{ marginTop: 10, lineHeight: 1.7, fontSize: 14, color: C.textSoft }}>{ni.sustainability_case}</div>
      </div>
    )}

    {ni.key_facts?.length > 0 && (
      <div style={S.card}>
        <div style={S.statLabel}>KEY NEGOTIATION FACTS</div>
        <div style={{ marginTop: 10 }}>
          {ni.key_facts.map((f, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: i < ni.key_facts.length - 1 ? `1px solid ${C.cardBorder}` : 'none', fontSize: 13, lineHeight: 1.5 }}>
              <span style={{ color: C.cyan, marginRight: 8 }}>●</span>{f}
            </div>
          ))}
        </div>
      </div>
    )}

    {ni.funder_specific?.length > 0 && (<>
      <div style={S.sectionTitle}>Funder-Specific Strategy</div>
      {ni.funder_specific.map((fs, i) => (
        <div key={i} style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{fs.funder}</div>
            {fs.estimated_remaining != null && fs.estimated_remaining > 0 && (
              <span style={S.badge(C.orange)}>Est. Remaining: {fmt(fs.estimated_remaining)}</span>
            )}
          </div>
          {fs.implied_factor_rate != null && (
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>Factor Rate: {fmtFactor(fs.implied_factor_rate)}</div>
          )}
          {fs.leverage_points?.map((lp, j) => (
            <div key={j} style={{ padding: '6px 0', fontSize: 13, lineHeight: 1.5 }}>
              <span style={{ color: C.gold, marginRight: 8 }}>→</span>{lp}
            </div>
          ))}
        </div>
      ))}
    </>)}
  </div>);
}

// ─── Confidence Tab ───
function ConfidenceTab({ a }) {
  const conf = a.analysis_confidence || {};
  const colorMap = { high: C.green, medium: C.gold, low: C.red };

  return (<div>
    <div style={S.statGrid}>
      <div style={S.stat}>
        <div style={S.statLabel}>Overall Confidence</div>
        <div style={S.statValue(colorMap[conf.overall] || C.gold)}>{(conf.overall || 'medium').toUpperCase()}</div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>Revenue Detection</div>
        <div style={S.statValue(colorMap[conf.revenue_confidence] || C.gold)}>{(conf.revenue_confidence || 'medium').toUpperCase()}</div>
      </div>
      <div style={S.stat}>
        <div style={S.statLabel}>MCA Detection</div>
        <div style={S.statValue(colorMap[conf.mca_detection_confidence] || C.gold)}>{(conf.mca_detection_confidence || 'medium').toUpperCase()}</div>
      </div>
      {conf.balance_estimation_confidence && (
        <div style={S.stat}>
          <div style={S.statLabel}>Balance Estimation</div>
          <div style={S.statValue(colorMap[conf.balance_estimation_confidence] || C.gold)}>{conf.balance_estimation_confidence.toUpperCase()}</div>
        </div>
      )}
    </div>

    {conf.uncertain_items?.length > 0 && (
      <div style={S.card}>
        <div style={S.statLabel}>ITEMS REQUIRING VERIFICATION</div>
        <div style={{ marginTop: 10 }}>
          {conf.uncertain_items.map((item, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: i < conf.uncertain_items.length - 1 ? `1px solid ${C.cardBorder}` : 'none', fontSize: 13, lineHeight: 1.5 }}>
              <span style={{ color: C.gold, marginRight: 8 }}>⚠</span>{item}
            </div>
          ))}
        </div>
      </div>
    )}

    {conf.notes && (
      <div style={{ ...S.card, borderLeft: `3px solid ${C.gold}` }}>
        <div style={S.statLabel}>ANALYST NOTES</div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, color: C.textSoft }}>{conf.notes}</div>
      </div>
    )}
  </div>);
}

// ─── Export Tab ───
function ExportTab({ a, positions, fileName }) {
  const activePositions = positions.filter(p => !p._excluded);
  const spa = a.sustainable_payment_analysis || {};
  const rm = a.risk_metrics || {};

  // CSV with proper escaping
  const escCSV = (val) => {
    const s = String(val == null ? '' : val);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csvRows = [['Funder', 'Weekly Payment', 'Monthly Estimate', 'Frequency', 'Confidence', 'Status', 'Est Remaining', 'Factor Rate']];
  activePositions.forEach(p => {
    csvRows.push([
      escCSV(p.funder_name),
      p.current_payment_amount || p.payment_amount || '',
      p.monthly_estimate || p.monthly_total || '',
      p.frequency || 'weekly',
      p.confidence || '',
      p.status || '',
      p.estimated_remaining_balance || '',
      p.implied_factor_rate || ''
    ]);
  });
  const csv = csvRows.map(r => r.join(',')).join('\n');

  const downloadCSV = () => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `ff-analysis-${(fileName || 'export').replace('.pdf', '')}.csv`;
    link.click(); URL.revokeObjectURL(url);
  };

  // Generate full funder packet as HTML for PDF printing
  const generateFunderPacket = () => {
    const ni = a.negotiation_intel || {};
    const gp = a.gross_profit || a.gross_profit_analysis || {};
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Debt Restructuring Analysis — ${a.business_name || 'Analysis'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; color: #1a1a2e; background: #fff; padding: 40px; max-width: 900px; margin: 0 auto; font-size: 13px; line-height: 1.6; }
  h1 { font-size: 22px; color: #0d1117; margin-bottom: 4px; }
  h2 { font-size: 16px; color: #00838f; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e0f7fa; text-transform: uppercase; letter-spacing: 0.5px; }
  h3 { font-size: 14px; margin: 16px 0 8px; }
  .subtitle { font-size: 12px; color: #666; margin-bottom: 20px; }
  .logo-line { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .ff-brand { font-size: 13px; color: #00838f; font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 12px 0; }
  .metric-box { background: #f8fffe; border: 1px solid #e0f2f1; border-radius: 8px; padding: 14px; }
  .metric-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: 700; }
  .metric-value { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .metric-sub { font-size: 11px; color: #888; margin-top: 2px; }
  .red { color: #c62828; } .green { color: #2e7d32; } .orange { color: #e65100; } .cyan { color: #00838f; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  th { text-align: left; padding: 8px; border-bottom: 2px solid #e0e0e0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; }
  td { padding: 8px; border-bottom: 1px solid #f0f0f0; }
  .section-box { background: #fafafa; border-left: 3px solid #00838f; padding: 16px; margin: 12px 0; border-radius: 0 8px 8px 0; }
  .highlight-box { background: #fff3e0; border-left: 3px solid #e65100; padding: 16px; margin: 12px 0; border-radius: 0 8px 8px 0; }
  .recommend-box { background: #e8f5e9; border-left: 3px solid #2e7d32; padding: 16px; margin: 12px 0; border-radius: 0 8px 8px 0; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #888; text-align: center; }
  @media print { body { padding: 20px; } .page-break { page-break-before: always; } }
</style></head><body>
<div class="logo-line"><h1>Debt Restructuring Analysis</h1><div class="ff-brand">FUNDERS FIRST INC.</div></div>
<div class="subtitle">${a.business_name || ''} • ${a.bank_name || ''} • ${a.analysis_period ? a.analysis_period.months_covered + ' Months Analyzed' : a.statement_period?.start || ''} • Prepared ${new Date().toLocaleDateString()}</div>

<h2>Executive Summary</h2>
<div class="section-box"><strong>${ni.headline || ''}</strong></div>
<div class="grid">
  <div class="metric-box"><div class="metric-label">True Revenue (Avg/Mo)</div><div class="metric-value cyan">${fmt(gp.avg_monthly_revenue || a.revenue?.total_true_revenue)}</div></div>
  <div class="metric-box"><div class="metric-label">Gross Profit</div><div class="metric-value green">${fmt(gp.gross_profit_amount || gp.avg_gross_profit)}</div><div class="metric-sub">${fmtPct(gp.gross_margin_pct || gp.avg_gross_margin_pct)} margin</div></div>
  <div class="metric-box"><div class="metric-label">Debt Service Ratio</div><div class="metric-value ${rm.dsr_mca_only > 35 ? 'red' : 'orange'}">${fmtPct(rm.dsr_mca_only)}</div><div class="metric-sub">${(rm.dsr_tier || '').toUpperCase()}</div></div>
</div>

<h2>The Business Case</h2>
<div class="section-box">${ni.gross_profit_story || 'This business generates sufficient gross profit to service restructured MCA obligations at sustainable payment levels.'}</div>

<h2>MCA Position Summary</h2>
<table><thead><tr><th>Funder</th><th>Weekly Pmt</th><th>Monthly</th><th>Est. Remaining</th><th>Factor Rate</th><th>Status</th></tr></thead><tbody>
${activePositions.map(p => `<tr><td><strong>${p.funder_name}</strong></td><td>${fmt(p.current_payment_amount || p.payment_amount)}</td><td>${fmt(p.monthly_estimate || p.monthly_total)}</td><td>${p.estimated_remaining_balance ? fmt(p.estimated_remaining_balance) : '—'}</td><td>${p.implied_factor_rate ? fmtFactor(p.implied_factor_rate) : '—'}</td><td>${(p.status || 'active').toUpperCase()}</td></tr>`).join('')}
<tr style="font-weight:700;border-top:2px solid #333"><td>TOTAL</td><td>${fmt(activePositions.reduce((s,p) => s + (p.current_payment_amount || p.payment_amount || 0), 0))}</td><td>${fmt(activePositions.reduce((s,p) => s + (p.monthly_estimate || p.monthly_total || 0), 0))}</td><td>${fmt(activePositions.reduce((s,p) => s + (p.estimated_remaining_balance || 0), 0))}</td><td></td><td></td></tr>
</tbody></table>

${ni.cost_of_capital_story ? `<h2>Cost of Capital Analysis</h2><div class="highlight-box">${ni.cost_of_capital_story}</div>` : ''}

${ni.stacking_narrative ? `<h2>Stacking Timeline</h2><div class="highlight-box">${ni.stacking_narrative}</div>` : ''}

${ni.default_evidence ? `<h2>Default Evidence</h2><div class="highlight-box">${ni.default_evidence}</div>` : ''}

<h2>Recommended Restructuring</h2>
<div class="recommend-box">
  <div class="grid" style="margin-bottom:12px">
    <div><div class="metric-label">Current Weekly</div><div class="metric-value red">${fmt(spa.current_weekly_mca)}</div></div>
    <div><div class="metric-label">Recommended Weekly</div><div class="metric-value green">${fmt(spa.sustainable_weekly_payment || spa.recommended_weekly_total)}</div></div>
    <div><div class="metric-label">Reduction</div><div class="metric-value orange">${fmtPct(spa.recommended_reduction_pct)}</div></div>
  </div>
  <p>${spa.rationale || ''}</p>
</div>

${ni.sustainability_case ? `<div class="section-box"><strong>100% Repayment Path:</strong> ${ni.sustainability_case}</div>` : ''}

<div class="footer">
  <strong>Funders First Inc.</strong> — Reducing Burdens, Not Obligations<br>
  2942 N 24th St. STE 115, Phoenix, AZ 85016 &nbsp;|&nbsp; 480-631-7691 &nbsp;|&nbsp; info@fundersfirst.com &nbsp;|&nbsp; fundersfirst.com<br>
  <em>This analysis is based on bank statement data provided and is intended for internal restructuring purposes.</em>
</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) {
      w.onload = () => { setTimeout(() => w.print(), 500); };
    }
  };

  return (<div>
    <div style={S.card}>
      <div style={S.statLabel}>FUNDER NEGOTIATION PACKET</div>
      <div style={{ marginTop: 10, fontSize: 13, color: C.textSoft }}>
        Generate a professional PDF-ready analysis packet to send directly to funders. Includes executive summary, position breakdown, cost analysis, and recommended restructuring terms.
      </div>
      <button style={{ ...S.btn('primary'), marginTop: 16 }} onClick={generateFunderPacket}>
        📋 Generate Funder Packet (Print/PDF)
      </button>
    </div>

    <div style={S.card}>
      <div style={S.statLabel}>EXPORT FOR UW CALCULATOR</div>
      <div style={{ marginTop: 10, fontSize: 13 }}>{activePositions.length} active MCA positions. {positions.length - activePositions.length} excluded.</div>
      <button style={{ ...S.btn(), marginTop: 12 }} onClick={downloadCSV}>📥 Download CSV</button>
    </div>

    <div style={S.sectionTitle}>Position Preview</div>
    <div style={S.card}>
      <table style={S.table}>
        <thead><tr><th style={S.th}>Funder</th><th style={S.th}>Weekly</th><th style={S.th}>Monthly</th><th style={S.th}>Freq</th><th style={S.th}>Est Remaining</th><th style={S.th}>Factor</th><th style={S.th}>Status</th></tr></thead>
        <tbody>{activePositions.map((p, i) => (
          <tr key={i}>
            <td style={S.td}>{p.funder_name}</td>
            <td style={S.td}>{fmt(p.current_payment_amount || p.payment_amount)}</td>
            <td style={S.td}>{fmt(p.monthly_estimate || p.monthly_total)}</td>
            <td style={S.td}>{p.frequency}</td>
            <td style={S.td}>{p.estimated_remaining_balance ? fmt(p.estimated_remaining_balance) : '—'}</td>
            <td style={S.td}>{p.implied_factor_rate ? fmtFactor(p.implied_factor_rate) : '—'}</td>
            <td style={S.td}>{p.status}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </div>);
}

// ─── Agreement Analysis Tab ───
function AgreementTab({ agreements }) {
  if (!agreements || agreements.length === 0) return (
    <div style={S.card}><div style={{ textAlign: 'center', padding: 24, color: C.textMuted }}>No MCA agreements analyzed yet. Upload agreement PDFs and re-analyze.</div></div>
  );

  return (<div>
    {agreements.map((ag, i) => {
      const a = ag.analysis || ag;
      const ft = a.financial_terms || {};
      const fees = a.fee_analysis || {};
      const rv = a.revenue_verification || {};
      const lev = a.negotiation_leverage || {};
      const tc = ft.factor_rate > 1.45 ? C.red : ft.factor_rate > 1.35 ? C.orange : C.gold;

      return (
        <div key={i} style={{ marginBottom: 24 }}>
          <div style={{ ...S.card, borderLeft: `3px solid ${C.cyan}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{a.funder_name || 'Unknown Funder'}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{a.agreement_date || ''} • {a.agreement_type || 'MCA'}</div>
              </div>
              {lev.overall_leverage_rating && (
                <span style={S.badge(lev.overall_leverage_rating === 'strong' ? C.green : lev.overall_leverage_rating === 'moderate' ? C.gold : C.red)}>
                  {lev.overall_leverage_rating.toUpperCase()} LEVERAGE
                </span>
              )}
            </div>
          </div>

          {/* Financial Terms */}
          <div style={S.statGrid}>
            <div style={S.stat}><div style={S.statLabel}>Purchase Price</div><div style={S.statValue(C.cyan)}>{fmt(ft.purchase_price)}</div><div style={S.statSub}>Amount funded</div></div>
            <div style={S.stat}><div style={S.statLabel}>Purchased Amount</div><div style={S.statValue(C.red)}>{fmt(ft.purchased_amount)}</div><div style={S.statSub}>Total payback</div></div>
            <div style={S.stat}><div style={S.statLabel}>Factor Rate</div><div style={S.statValue(tc)}>{fmtFactor(ft.factor_rate)}</div><div style={S.statSub}>{ft.factor_rate > 1.45 ? '⚠ Above market' : 'Market rate'}</div></div>
            <div style={S.stat}><div style={S.statLabel}>Net Proceeds</div><div style={S.statValue(C.gold)}>{fmt(fees.net_proceeds_to_merchant)}</div><div style={S.statSub}>After {fmt(fees.total_fees)} in fees ({fmtPct(fees.total_fees_pct_of_purchase)})</div></div>
          </div>

          {/* Revenue Verification - KEY */}
          {rv.stated_revenue > 0 && (
            <div style={{ ...S.card, borderLeft: `3px solid ${C.orange}`, background: C.orangeDim }}>
              <div style={S.statLabel}>REVENUE REPRESENTATION IN CONTRACT</div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 14 }}>
                  Funder stated merchant revenue: <strong style={{ color: C.orange, fontSize: 18 }}>{fmt(rv.stated_revenue)}</strong>
                  <span style={{ color: C.textMuted }}> ({rv.stated_revenue_type || 'unspecified'}, {rv.stated_revenue_period || 'monthly'})</span>
                </div>
                {rv.revenue_clause_text && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 12, color: C.textSoft, fontStyle: 'italic' }}>
                    "{rv.revenue_clause_text}"
                  </div>
                )}
                {rv.notes && <div style={{ marginTop: 6, fontSize: 12, color: C.gold }}>{rv.notes}</div>}
              </div>
            </div>
          )}

          {/* Fee Breakdown */}
          {fees.total_fees > 0 && (
            <div style={S.card}>
              <div style={S.statLabel}>FEE ANALYSIS — TRUE COST OF CAPITAL</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 10 }}>
                {fees.origination_fee > 0 && <div style={{ fontSize: 12 }}><span style={{ color: C.textMuted }}>Origination:</span> <strong>{fmt(fees.origination_fee)}</strong></div>}
                {fees.closing_fee > 0 && <div style={{ fontSize: 12 }}><span style={{ color: C.textMuted }}>Closing:</span> <strong>{fmt(fees.closing_fee)}</strong></div>}
                {fees.admin_fee > 0 && <div style={{ fontSize: 12 }}><span style={{ color: C.textMuted }}>Admin:</span> <strong>{fmt(fees.admin_fee)}</strong></div>}
                {fees.broker_commission > 0 && <div style={{ fontSize: 12 }}><span style={{ color: C.textMuted }}>Broker:</span> <strong>{fmt(fees.broker_commission)}</strong></div>}
                {fees.ach_fee > 0 && <div style={{ fontSize: 12 }}><span style={{ color: C.textMuted }}>ACH:</span> <strong>{fmt(fees.ach_fee)}</strong></div>}
                {fees.ucc_fee > 0 && <div style={{ fontSize: 12 }}><span style={{ color: C.textMuted }}>UCC:</span> <strong>{fmt(fees.ucc_fee)}</strong></div>}
                {(fees.other_fees || []).map((f, fi) => <div key={fi} style={{ fontSize: 12 }}><span style={{ color: C.textMuted }}>{f.name}:</span> <strong>{fmt(f.amount)}</strong></div>)}
              </div>
              <div style={{ marginTop: 10, padding: '8px 12px', background: C.redDim, borderRadius: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>True Factor Rate (after fees): <strong style={{ color: C.red }}>{fmtFactor(fees.true_factor_rate)}</strong></span>
                <span>Effective APR: <strong style={{ color: fees.effective_annual_rate > 100 ? C.red : C.orange }}>{fmtPct(fees.effective_annual_rate)}</strong></span>
              </div>
            </div>
          )}

          {/* Problematic Clauses */}
          {(a.problematic_clauses || []).length > 0 && (<>
            <div style={S.sectionTitle}>Problematic Clauses</div>
            {a.problematic_clauses.map((cl, ci) => (
              <div key={ci} style={{ ...S.card, borderLeft: `3px solid ${cl.leverage_rating === 'high' ? C.red : cl.leverage_rating === 'medium' ? C.orange : C.textMuted}`, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{(cl.clause_type || '').replace(/_/g, ' ').toUpperCase()}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={S.badge(cl.enforceability === 'unenforceable' ? C.red : cl.enforceability === 'questionable' ? C.orange : C.textMuted)}>{cl.enforceability}</span>
                    <span style={S.badge(cl.leverage_rating === 'high' ? C.green : C.gold)}>{cl.leverage_rating} leverage</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.textSoft, marginTop: 6 }}>{cl.clause_text_summary}</div>
                {cl.negotiation_notes && <div style={{ fontSize: 12, color: C.cyan, marginTop: 4 }}>{cl.negotiation_notes}</div>}
              </div>
            ))}
          </>)}

          {/* Merchant Protections */}
          {(a.merchant_protections || []).length > 0 && (<>
            <div style={S.sectionTitle}>Merchant Protections (Often Unknown)</div>
            {a.merchant_protections.map((mp, mi) => (
              <div key={mi} style={{ ...S.card, borderLeft: `3px solid ${C.green}`, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: C.green }}>{(mp.protection_type || '').replace(/_/g, ' ').toUpperCase()}</span>
                  <span style={S.badge(C.green)}>{mp.leverage_rating} leverage</span>
                </div>
                <div style={{ fontSize: 12, color: C.textSoft, marginTop: 6 }}>{mp.description}</div>
                {mp.merchant_action_required && <div style={{ fontSize: 12, color: C.gold, marginTop: 4 }}>Action needed: {mp.merchant_action_required}</div>}
              </div>
            ))}
          </>)}

          {/* Red Flags */}
          {(a.contract_red_flags || []).length > 0 && (<>
            <div style={S.sectionTitle}>Contract Red Flags</div>
            {a.contract_red_flags.map((rf, ri) => (
              <div key={ri} style={{ padding: '8px 0', borderBottom: ri < a.contract_red_flags.length - 1 ? `1px solid ${C.cardBorder}` : 'none', fontSize: 13 }}>
                <span style={S.badge(rf.severity === 'critical' ? C.red : rf.severity === 'warning' ? C.orange : C.textMuted)}>{rf.severity}</span>
                <strong>{rf.flag}</strong>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{rf.explanation}</div>
              </div>
            ))}
          </>)}

          {/* Leverage Summary */}
          {lev.top_leverage_points?.length > 0 && (
            <div style={{ ...S.card, borderLeft: `3px solid ${C.gold}` }}>
              <div style={S.statLabel}>NEGOTIATION LEVERAGE — {a.funder_name}</div>
              <div style={{ marginTop: 8 }}>
                {lev.top_leverage_points.map((lp, li) => (
                  <div key={li} style={{ padding: '6px 0', fontSize: 13 }}><span style={{ color: C.gold, marginRight: 8 }}>→</span>{lp}</div>
                ))}
              </div>
              {lev.recommended_approach && <div style={{ marginTop: 10, fontSize: 13, color: C.textSoft }}><strong>Approach:</strong> {lev.recommended_approach}</div>}
            </div>
          )}
        </div>
      );
    })}
  </div>);
}

// ─── Cross-Reference Tab ───
function CrossReferenceTab({ xref }) {
  if (!xref) return (
    <div style={S.card}><div style={{ textAlign: 'center', padding: 24, color: C.textMuted }}>Cross-reference analysis not yet run. Upload both statements AND agreements, then analyze.</div></div>
  );

  const x = xref.analysis || xref;
  const cascade = x.cascading_burden_analysis || {};
  const rec = x.restructuring_recommendation || {};

  return (<div>
    {/* Cascading Burden Headline */}
    <div style={{ ...S.card, borderLeft: `3px solid ${C.red}`, background: 'rgba(255,71,87,0.03)' }}>
      <div style={S.statLabel}>CASCADING BURDEN ANALYSIS</div>
      <div style={{ fontSize: 14, lineHeight: 1.7, marginTop: 10, color: C.textSoft }}>{cascade.narrative || ''}</div>
      <div style={S.statGrid}>
        <div style={S.stat}><div style={S.statLabel}>Total Funded</div><div style={S.statValue(C.cyan)}>{fmt(cascade.total_purchase_prices)}</div></div>
        <div style={S.stat}><div style={S.statLabel}>Total Payback Owed</div><div style={S.statValue(C.red)}>{fmt(cascade.total_purchased_amounts)}</div></div>
        <div style={S.stat}><div style={S.statLabel}>Total Fees Paid</div><div style={S.statValue(C.orange)}>{fmt(cascade.total_fees_across_all)}</div></div>
        <div style={S.stat}><div style={S.statLabel}>True DSR (All MCA)</div><div style={S.statValue(cascade.true_dsr_all_mca > 50 ? C.red : C.orange)}>{fmtPct(cascade.true_dsr_all_mca)}</div></div>
      </div>
      {cascade.viability_explanation && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: cascade.viable_without_mca ? C.greenDim : C.redDim, borderRadius: 8, fontSize: 13, color: cascade.viable_without_mca ? C.green : C.red }}>
          <strong>{cascade.viable_without_mca ? '✓ VIABLE BUSINESS' : '⚠ AT RISK'}:</strong> {cascade.viability_explanation}
        </div>
      )}
    </div>

    {/* Contract vs Reality Table */}
    {(x.contract_vs_reality || []).length > 0 && (<>
      <div style={S.sectionTitle}>Contract vs Reality — Per Funder</div>
      {x.contract_vs_reality.map((cvr, i) => (
        <div key={i} style={{ ...S.card, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{cvr.funder_name}</div>
            <span style={S.badge(cvr.underwriting_grade === 'F' || cvr.underwriting_grade === 'D' ? C.red : cvr.underwriting_grade === 'C' ? C.orange : C.green)}>
              UW Grade: {cvr.underwriting_grade}
            </span>
          </div>
          <table style={S.table}>
            <thead><tr><th style={S.th}>Metric</th><th style={S.th}>Contracted</th><th style={S.th}>Actual</th><th style={S.th}>Discrepancy</th></tr></thead>
            <tbody>
              <tr>
                <td style={S.td}>Revenue Used</td>
                <td style={S.td}>{fmt(cvr.stated_revenue)}</td>
                <td style={{ ...S.td, fontWeight: 600 }}>{fmt(cvr.actual_revenue)}</td>
                <td style={{ ...S.td, color: cvr.revenue_inflated ? C.red : C.green, fontWeight: 600 }}>
                  {cvr.revenue_inflated ? '↑' : '✓'} {fmtPct(Math.abs(cvr.revenue_discrepancy_pct))} {cvr.revenue_inflated ? 'INFLATED' : 'accurate'}
                </td>
              </tr>
              <tr>
                <td style={S.td}>Withhold %</td>
                <td style={S.td}>{fmtPct(cvr.contracted_withhold_pct)}</td>
                <td style={{ ...S.td, fontWeight: 600 }}>{fmtPct(cvr.actual_withhold_pct)}</td>
                <td style={{ ...S.td, color: cvr.withhold_discrepancy_points > 0 ? C.red : C.green }}>
                  {cvr.withhold_discrepancy_points > 0 ? '+' : ''}{cvr.withhold_discrepancy_points?.toFixed(1)} pts
                </td>
              </tr>
              <tr>
                <td style={S.td}>Available Revenue at Funding</td>
                <td style={{ ...S.td, color: C.textMuted }}>Assumed: {fmt(cvr.stated_revenue)}</td>
                <td style={{ ...S.td, fontWeight: 600, color: C.red }}>{fmt(cvr.available_revenue_at_funding)}</td>
                <td style={{ ...S.td, color: C.red, fontWeight: 600 }}>
                  True withhold: {fmtPct(cvr.true_withhold_of_available)}
                </td>
              </tr>
              <tr>
                <td style={S.td}>Factor Rate</td>
                <td style={S.td}>{fmtFactor(cvr.contracted_factor_rate)}</td>
                <td style={{ ...S.td, color: C.orange }}>{fmtFactor(cvr.true_factor_rate)} (after fees)</td>
                <td style={{ ...S.td, color: C.red }}>APR: {fmtPct(cvr.effective_apr)}</td>
              </tr>
            </tbody>
          </table>
          {cvr.underwriting_failures?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Underwriting Failures</div>
              {cvr.underwriting_failures.map((f, fi) => (
                <div key={fi} style={{ fontSize: 12, color: C.red, padding: '3px 0' }}>⚠ {f}</div>
              ))}
            </div>
          )}
          {cvr.leverage_points?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Leverage Points</div>
              {cvr.leverage_points.map((lp, li) => (
                <div key={li} style={{ fontSize: 12, color: C.gold, padding: '3px 0' }}>→ {lp}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>)}

    {/* Position Chronology */}
    {(x.position_chronology || []).length > 0 && (<>
      <div style={S.sectionTitle}>Stacking Chronology — How Each Position Changed the Picture</div>
      {x.position_chronology.map((pc, i) => (
        <div key={i} style={{ ...S.card, borderLeft: `3px solid ${i === 0 ? C.cyan : C.orange}`, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: C.cyan, fontWeight: 700, marginRight: 8 }}>#{pc.order}</span>
              <strong>{pc.funder_name}</strong>
              <span style={{ color: C.textMuted, fontSize: 12, marginLeft: 8 }}>{pc.funding_date}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: C.textMuted }}>Cumulative Weekly After</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.red }}>{fmt(pc.cumulative_weekly_burden_after)}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10, fontSize: 12 }}>
            <div><span style={{ color: C.textMuted }}>Funded:</span> <strong>{fmt(pc.purchase_price)}</strong> (net {fmt(pc.net_proceeds)})</div>
            <div><span style={{ color: C.textMuted }}>Existing MCA/mo:</span> <strong>{fmt(pc.existing_monthly_mca_at_funding)}</strong></div>
            <div><span style={{ color: C.textMuted }}>Available Revenue:</span> <strong style={{ color: C.orange }}>{fmt(pc.available_revenue_at_funding)}</strong></div>
          </div>
          <div style={{ fontSize: 12, color: C.textSoft, marginTop: 8, lineHeight: 1.6 }}>{pc.narrative}</div>
          <div style={{ marginTop: 6, padding: '6px 10px', background: C.redDim, borderRadius: 6, fontSize: 12 }}>
            <span style={{ color: C.red }}>{fmtPct(pc.pct_of_available_revenue_consumed)} of available revenue consumed after this position</span>
          </div>
        </div>
      ))}
    </>)}

    {/* Funder Scorecards */}
    {(x.funder_scorecards || []).length > 0 && (<>
      <div style={S.sectionTitle}>Funder Scorecards</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {x.funder_scorecards.map((sc, i) => (
          <div key={i} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{sc.funder_name}</div>
              <span style={S.badge(sc.underwriting_grade === 'F' || sc.underwriting_grade === 'D' ? C.red : sc.underwriting_grade === 'C' ? C.orange : C.green)}>
                Grade: {sc.underwriting_grade}
              </span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 2 }}>
              <div>Revenue Verified: <strong style={{ color: sc.revenue_verified ? C.green : C.red }}>{sc.revenue_verified ? 'Yes' : 'NO'}</strong></div>
              <div>Existing Positions Considered: <strong style={{ color: sc.existing_positions_accounted ? C.green : C.red }}>{sc.existing_positions_accounted ? 'Yes' : 'NO'}</strong></div>
              {sc.anti_stacking_hypocrite && <div style={{ color: C.red, fontWeight: 600 }}>⚠ Anti-Stacking Hypocrite</div>}
              <div>Factor Rate: <strong style={{ color: sc.factor_rate_assessment === 'predatory' ? C.red : sc.factor_rate_assessment === 'above_market' ? C.orange : C.green }}>{(sc.factor_rate_assessment || '').replace(/_/g, ' ')}</strong></div>
              {sc.has_reconciliation_rights && <div style={{ color: C.green }}>✓ Has Reconciliation Rights</div>}
            </div>
            {sc.recommended_approach && <div style={{ fontSize: 12, color: C.cyan, marginTop: 8 }}>{sc.recommended_approach}</div>}
          </div>
        ))}
      </div>
    </>)}

    {/* Restructuring Recommendation */}
    {rec.headline && (
      <div style={{ ...S.card, borderLeft: `3px solid ${C.green}`, background: 'rgba(38,222,129,0.03)', marginTop: 16 }}>
        <div style={S.statLabel}>RESTRUCTURING RECOMMENDATION</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8, lineHeight: 1.6 }}>{rec.headline}</div>
        <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
          <div><div style={{ fontSize: 10, color: C.textMuted }}>CURRENT WEEKLY</div><div style={{ fontSize: 24, fontWeight: 700, color: C.red, textDecoration: 'line-through' }}>{fmt(rec.current_total_weekly)}</div></div>
          <div style={{ fontSize: 28, color: C.textMuted, alignSelf: 'center' }}>→</div>
          <div><div style={{ fontSize: 10, color: C.textMuted }}>RECOMMENDED</div><div style={{ fontSize: 24, fontWeight: 700, color: C.green }}>{fmt(rec.sustainable_weekly)}</div></div>
          <div style={{ alignSelf: 'center' }}><span style={{ ...S.badge(C.green), fontSize: 13, padding: '6px 14px' }}>{fmtPct(rec.recommended_reduction_pct)} reduction</span></div>
        </div>
        {rec.repayment_guarantee && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: C.greenDim, borderRadius: 8, fontSize: 13, color: C.green }}>
            <strong>100% Repayment Path:</strong> {rec.repayment_guarantee}
          </div>
        )}
        {(rec.per_funder_recommendation || []).length > 0 && (
          <table style={{ ...S.table, marginTop: 16 }}>
            <thead><tr><th style={S.th}>Funder</th><th style={S.th}>Current /wk</th><th style={S.th}>Recommended /wk</th><th style={S.th}>Reduction</th><th style={S.th}>Remaining Bal</th><th style={S.th}>Term</th></tr></thead>
            <tbody>{rec.per_funder_recommendation.map((pf, i) => (
              <tr key={i}>
                <td style={S.td}><strong>{pf.funder}</strong></td>
                <td style={{ ...S.td, color: C.red, textDecoration: 'line-through' }}>{fmt(pf.current_weekly)}</td>
                <td style={{ ...S.td, color: C.green, fontWeight: 600 }}>{fmt(pf.recommended_weekly)}</td>
                <td style={S.td}>{fmtPct(pf.reduction_pct)}</td>
                <td style={S.td}>{fmt(pf.remaining_balance)}</td>
                <td style={S.td}>{pf.recommended_term_weeks}wks</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    )}
  </div>);
}

// ─── Safe JSON fetch (handles Vercel non-JSON errors) ───
async function safeFetchJson(url, options) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    return { ok: false, data: { error: `Server error (${res.status}): Request may be too large or timed out.` } };
  }
  const data = await res.json();
  return { ok: res.ok, data };
}

// ─── Main Component ───
const TABS = ['Revenue', 'Trend', 'MCA Positions', 'Risk & Capacity', 'Negotiation Intel', 'Agreements', 'Cross-Reference', 'Confidence', 'Export'];

export default function FFAnalyzer() {
  // File states: 'detecting' | 'text-ready' | 'needs-scan' | 'scanning' | 'scanned' | 'error'
  const [files, setFiles] = useState([]);
  const [agreementFiles, setAgreementFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [positions, setPositions] = useState([]);
  const [agreementResults, setAgreementResults] = useState([]);
  const [crossRefResult, setCrossRefResult] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [model, setModel] = useState('opus');
  const [dragging, setDragging] = useState(false);
  const [draggingAg, setDraggingAg] = useState(false);
  const fileRef = useRef(null);
  const agFileRef = useRef(null);

  const updateFile = (id, updates) => setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));

  // ─── Statement Upload + Auto-Detect ───
  const handleFiles = useCallback(async (newFiles) => {
    const pdfs = Array.from(newFiles).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    const currentNames = new Set();
    setFiles(prev => { prev.forEach(f => currentNames.add(f.name + '_' + f.file?.size)); return prev; });

    for (const pdf of pdfs) {
      if (currentNames.has(pdf.name + '_' + pdf.size)) continue;
      const fileId = Math.random().toString(36).slice(2);
      setFiles(prev => [...prev, {
        id: fileId, file: pdf, name: pdf.name, label: pdf.name.replace('.pdf', ''),
        status: 'detecting', text: null, images: null, info: null, scanModel: 'opus', error: null,
      }]);

      try {
        const text = await extractPDFText(pdf);
        if (text.trim().length > 100) {
          try {
            const detectRes = await fetch('/api/detect-statement', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, fileName: pdf.name })
            });
            const detectData = await detectRes.json();
            const info = detectData.success ? detectData.info : null;
            setFiles(prev => prev.map(f => f.id === fileId ? {
              ...f, status: 'text-ready', text, info,
              label: info?.account_name ? `${info.account_name} — ${info.statement_month || ''}` : f.label,
            } : f));
          } catch {
            setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'text-ready', text } : f));
          }
        } else {
          setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'needs-scan' } : f));
        }
      } catch (e) {
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error', error: e.message } : f));
      }
    }
  }, []);

  // ─── Scan Single File (sends raw PDF to Claude via FormData) ───
  const scanFile = async (fileId) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    updateFile(fileId, { status: 'scanning' });
    try {
      const fd = new FormData();
      fd.append('pdf', file.file);
      fd.append('model', file.scanModel || 'opus');

      const res = await fetch('/api/scan-statement', { method: 'POST', body: fd });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        updateFile(fileId, { status: 'error', error: `Server error (${res.status}). Try again or switch models.` });
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        updateFile(fileId, {
          status: 'scanned',
          text: data.text_content || '',
          preAnalysis: data.analysis,
          label: data.analysis?.business_name
            ? `${data.analysis.business_name} — ${data.analysis?.statement_month || data.analysis?.statement_period?.start || ''}`
            : file.label,
          info: {
            account_name: data.analysis?.business_name,
            statement_month: data.analysis?.statement_month || data.analysis?.statement_period?.start,
            bank_name: data.analysis?.bank_name,
            account_number: data.analysis?.account_last4
          }
        });
      } else {
        updateFile(fileId, { status: 'error', error: data.error || 'Scan failed' });
      }
    } catch (e) {
      updateFile(fileId, { status: 'error', error: e.message });
    }
  };

  const removeFile = (id) => setFiles(prev => prev.filter(f => f.id !== id));

  // ─── Agreement Files ───
  const handleAgreementFiles = useCallback(async (newFiles) => {
    const pdfs = Array.from(newFiles).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    for (const pdf of pdfs) {
      const fileId = Math.random().toString(36).slice(2);
      setAgreementFiles(prev => [...prev, { id: fileId, file: pdf, name: pdf.name, label: pdf.name.replace('.pdf', ''), status: 'detecting', text: null, images: null }]);
      try {
        const text = await extractPDFText(pdf);
        setAgreementFiles(prev => prev.map(f => f.id === fileId
          ? { ...f, status: text.trim().length >= 200 ? 'text-ready' : 'needs-scan', text: text.trim().length >= 200 ? text : null }
          : f));
      } catch {
        setAgreementFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'needs-scan' } : f));
      }
    }
  }, []);

  const scanAgreementFile = async (fileId) => {
    const file = agreementFiles.find(f => f.id === fileId);
    if (!file) return;
    setAgreementFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'scanning' } : f));
    try {
      // For agreements, we just mark as ready for FormData upload during analysis phase
      // The analyze-agreement route will handle the PDF natively
      setAgreementFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'scanned', useFormData: true } : f));
    } catch {
      setAgreementFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error' } : f));
    }
  };

  const removeAgreementFile = (id) => setAgreementFiles(prev => prev.filter(f => f.id !== id));

  // ─── Main Analysis ───
  const readyFiles = files.filter(f => f.status === 'text-ready' || f.status === 'scanned');
  const canAnalyze = readyFiles.length > 0 && !loading;

  const analyze = async () => {
    if (readyFiles.length === 0) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const statements = readyFiles.map(f => ({
        text: f.text || '', images: f.images || null,
        accountLabel: f.label || f.name, month: f.info?.statement_month || f.label || f.name,
      }));

      setLoadingMsg(`Analyzing ${statements.length} statement${statements.length > 1 ? 's' : ''} with ${model === 'opus' ? 'Opus' : 'Sonnet'}...`);

      const endpoint = statements.length > 1 ? '/api/analyze-multi' : '/api/analyze';
      const body = statements.length > 1
        ? { statements, model }
        : { text: statements[0].text || '', images: statements[0].images || null, fileName: readyFiles[0].name, model };

      const { ok, data } = await safeFetchJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!ok || data.error) { setError(data.error || 'Analysis failed'); setLoading(false); return; }

      setResult(data);
      setPositions((data.analysis?.mca_positions || []).map(p => ({ ...p, _excluded: false })));
      setActiveTab(0);

      // Phase 2: Agreements
      const readyAg = agreementFiles.filter(f => f.status === 'text-ready' || f.status === 'scanned');
      if (readyAg.length > 0) {
        const agResults = [];
        for (let i = 0; i < readyAg.length; i++) {
          const af = readyAg[i];
          setLoadingMsg(`Analyzing agreement ${i + 1}/${readyAg.length}: ${af.label}...`);
          try {
            let agRes;
            if (af.text) {
              // Text-based — send as JSON
              agRes = await safeFetchJson('/api/analyze-agreement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: af.text, fileName: af.name, model }) });
            } else if (af.useFormData && af.file) {
              // Scanned — send raw PDF via FormData
              const fd = new FormData();
              fd.append('pdf', af.file);
              fd.append('model', model);
              agRes = await safeFetchJson('/api/analyze-agreement', { method: 'POST', body: fd });
            } else {
              agResults.push({ file: af.name, error: 'No data available — scan or re-upload' });
              continue;
            }
            const { ok: agOk, data: agData } = agRes;
            agResults.push(agOk && agData.success ? { file: af.name, analysis: agData.analysis } : { file: af.name, error: agData.error || 'Failed' });
          } catch (e) { agResults.push({ file: af.name, error: e.message }); }
        }
        setAgreementResults(agResults);

        // Phase 3: Cross-reference
        const validAg = agResults.filter(a => a.analysis).map(a => a.analysis);
        if (validAg.length > 0 && data.analysis) {
          setLoadingMsg('Cross-referencing agreements against bank statements...');
          try {
            const { ok: xOk, data: xrefData } = await safeFetchJson('/api/cross-reference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bankAnalysis: data.analysis, agreementAnalyses: validAg, model }) });
            if (xOk && xrefData.success) setCrossRefResult(xrefData);
          } catch (e) { console.error('Cross-ref error:', e); }
        }
      }
    } catch (e) { setError(e.message || 'Unknown error'); }
    setLoading(false); setLoadingMsg('');
  };

  const reset = () => { setFiles([]); setAgreementFiles([]); setResult(null); setPositions([]); setAgreementResults([]); setCrossRefResult(null); setError(null); setActiveTab(0); };

  const statusBadge = (status) => {
    const map = {
      'detecting': { color: C.gold, label: 'DETECTING...' }, 'text-ready': { color: C.green, label: 'TEXT READY' },
      'needs-scan': { color: C.orange, label: 'NEEDS SCAN' }, 'scanning': { color: C.gold, label: 'SCANNING...' },
      'scanned': { color: C.green, label: 'SCANNED' }, 'error': { color: C.red, label: 'ERROR' },
    };
    const s = map[status] || { color: C.textMuted, label: status };
    return <span style={S.badge(s.color)}>{s.label}</span>;
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.logo}>FUNDERS FIRST ANALYZER</div>
          <div style={S.logoSub}>Bank Statement Intelligence Engine</div>
        </div>
        {!result && canAnalyze && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 3 }}>
              <button onClick={() => setModel('opus')} style={{ fontSize: 11, padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: model === 'opus' ? C.cyanGlow : 'transparent', color: model === 'opus' ? C.cyan : C.textMuted }}>Opus (Deep)</button>
              <button onClick={() => setModel('sonnet')} style={{ fontSize: 11, padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: model === 'sonnet' ? C.goldDim : 'transparent', color: model === 'sonnet' ? C.gold : C.textMuted }}>Sonnet (Fast)</button>
            </div>
            <button style={S.btn('primary')} onClick={analyze} disabled={loading}>
              {loading ? '⏳ Analyzing...' : `Analyze ${readyFiles.length} Statement${readyFiles.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>

      {error && <div style={{ ...S.card, borderLeft: `3px solid ${C.red}`, color: C.red, fontSize: 13 }}>{error}</div>}

      {loading && (
        <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}><span style={{ display: 'inline-block', animation: 'pulse 1.5s infinite' }}>⚡</span></div>
          <div style={{ fontSize: 14, color: C.textSoft }}>{loadingMsg}</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>{model === 'opus' ? 'Deep analysis typically takes 30-90 seconds' : 'Fast analysis typically takes 10-30 seconds'}</div>
          <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
      )}

      {/* ─── Upload View ─── */}
      {!result && !loading && (
        <div>
          <div style={S.dropzone(dragging)}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".pdf" multiple hidden onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
            <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.6 }}>📄</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Drop bank statements here</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>Upload 1-6 months of PDF bank statements</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 12 }}>Text extracted automatically • Scanned PDFs can be vision-scanned</div>
          </div>

          {/* ─── Statement File Cards ─── */}
          {files.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {files.map(f => (
                <div key={f.id} style={{
                  ...S.card, padding: '14px 18px', marginBottom: 10,
                  borderLeft: `3px solid ${f.status === 'text-ready' || f.status === 'scanned' ? C.green : f.status === 'needs-scan' ? C.orange : f.status === 'error' ? C.red : C.gold}`,
                  opacity: f.status === 'detecting' || f.status === 'scanning' ? 0.7 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <input type="text" value={f.label} onChange={e => updateFile(f.id, { label: e.target.value })}
                        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.cardBorder}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', width: '100%', outline: 'none' }}
                        onFocus={e => e.target.style.borderColor = C.cyan} onBlur={e => e.target.style.borderColor = C.cardBorder} />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                        {statusBadge(f.status)}
                        {f.info?.bank_name && <span style={{ fontSize: 11, color: C.textMuted }}>{f.info.bank_name}</span>}
                        {f.info?.statement_month && <span style={{ fontSize: 11, color: C.textMuted }}>• {f.info.statement_month}</span>}
                        {f.info?.account_number && <span style={{ fontSize: 11, color: C.textMuted }}>• ****{f.info.account_number}</span>}
                      </div>
                      {f.error && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{f.error}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      {f.status === 'needs-scan' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => updateFile(f.id, { scanModel: 'opus' })} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: f.scanModel === 'opus' ? C.cyanGlow : 'rgba(255,255,255,0.04)', color: f.scanModel === 'opus' ? C.cyan : C.textMuted }}>Opus</button>
                            <button onClick={() => updateFile(f.id, { scanModel: 'sonnet' })} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: f.scanModel === 'sonnet' ? C.goldDim : 'rgba(255,255,255,0.04)', color: f.scanModel === 'sonnet' ? C.gold : C.textMuted }}>Sonnet</button>
                          </div>
                          <button style={{ ...S.btn('primary'), padding: '6px 14px', fontSize: 11 }} onClick={() => scanFile(f.id)}>Scan with Claude</button>
                          <div style={{ fontSize: 10, color: C.textMuted }}>~{f.scanModel === 'opus' ? '$1.50-2.00' : '$0.25-0.40'}</div>
                        </div>
                      )}
                      {f.status === 'scanning' && <div style={{ fontSize: 12, color: C.gold }}>⏳ Scanning...</div>}
                      {f.status === 'error' && <button style={{ ...S.btn(), padding: '6px 12px', fontSize: 11 }} onClick={() => updateFile(f.id, { status: 'needs-scan', error: null })}>Retry</button>}
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 16, padding: '4px' }} onClick={() => removeFile(f.id)}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Agreement Upload ─── */}
          <div style={{ marginTop: 28 }}>
            <div style={S.sectionTitle}>MCA Agreements (Optional)</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>Upload original MCA purchase agreements to scan for bad terms, hidden fees, illegal clauses, and verify revenue representations.</div>
            <div style={{ ...S.dropzone(draggingAg), padding: '32px 24px' }}
              onDragOver={e => { e.preventDefault(); setDraggingAg(true); }} onDragLeave={() => setDraggingAg(false)}
              onDrop={e => { e.preventDefault(); setDraggingAg(false); handleAgreementFiles(e.dataTransfer.files); }}
              onClick={() => agFileRef.current?.click()}>
              <input ref={agFileRef} type="file" accept=".pdf" multiple hidden onChange={e => { handleAgreementFiles(e.target.files); e.target.value = ''; }} />
              <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Drop MCA agreements here</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>PDF contracts / purchase agreements from each funder</div>
            </div>
            {agreementFiles.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {agreementFiles.map(f => (
                  <div key={f.id} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderLeft: `3px solid ${f.status === 'text-ready' || f.status === 'scanned' ? C.green : f.status === 'needs-scan' ? C.orange : C.gold}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13 }}>📋 {f.label}</span>
                      {statusBadge(f.status)}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {f.status === 'needs-scan' && <button style={{ ...S.btn('primary'), padding: '4px 12px', fontSize: 10 }} onClick={() => scanAgreementFile(f.id)}>Scan with Claude</button>}
                      {f.status === 'scanning' && <span style={{ fontSize: 11, color: C.gold }}>Rendering...</span>}
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 16, padding: '4px' }} onClick={() => removeAgreementFile(f.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {files.length > 0 && (
            <div style={{ marginTop: 16, fontSize: 11, color: C.textMuted }}>
              {readyFiles.length} of {files.length} statement{files.length !== 1 ? 's' : ''} ready
              {files.some(f => f.status === 'needs-scan') && ` • ${files.filter(f => f.status === 'needs-scan').length} need scanning`}
              {agreementFiles.length > 0 && ` • ${agreementFiles.filter(f => f.status === 'text-ready' || f.status === 'scanned').length}/${agreementFiles.length} agreements ready`}
              {readyFiles.length > 0 && ` • Analysis: ${model === 'opus' ? 'Opus (~$0.45/stmt)' : 'Sonnet (~$0.06/stmt)'}`}
            </div>
          )}
        </div>
      )}

      {/* ─── Results View ─── */}
      {result && (
        <div>
          <div style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{result.analysis?.business_name || 'Analysis Complete'}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>
                {result.analysis?.bank_name}{' • '}{result.analysis?.analysis_period ? `${result.analysis.analysis_period.months_covered} months analyzed` : result.analysis?.statement_period?.start}{' • '}{result.model_used?.includes('opus') ? 'Opus' : 'Sonnet'}
                {agreementResults.length > 0 && <span> • {agreementResults.filter(a => a.analysis).length} agreement{agreementResults.filter(a => a.analysis).length !== 1 ? 's' : ''} analyzed</span>}
                {crossRefResult && <span style={{ color: C.green }}> • Cross-referenced</span>}
                {result.analysis?.analysis_confidence && <span> • Confidence: <span style={{ color: { high: C.green, medium: C.gold, low: C.red }[result.analysis.analysis_confidence.overall] || C.gold }}>{(result.analysis.analysis_confidence.overall || '').toUpperCase()}</span></span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={S.badge(tierColor[result.analysis?.risk_metrics?.dsr_tier] || C.red)}>{tierLabel[result.analysis?.risk_metrics?.dsr_tier] || 'ANALYZING'}</span>
              <button style={{ ...S.btn(), padding: '6px 14px', fontSize: 11 }} onClick={reset}>New Analysis</button>
              <button style={{ ...S.btn(), padding: '6px 14px', fontSize: 11 }} onClick={analyze}>Re-analyze</button>
            </div>
          </div>

          <div style={S.tabs}>
            {TABS.map((t, i) => <button key={i} style={S.tab(activeTab === i)} onClick={() => setActiveTab(i)}>{t}</button>)}
          </div>

          <div>
            {activeTab === 0 && <RevenueTab a={result.analysis} />}
            {activeTab === 1 && <TrendTab a={result.analysis} />}
            {activeTab === 2 && <MCATab a={result.analysis} positions={positions} setPositions={setPositions} />}
            {activeTab === 3 && <RiskTab a={result.analysis} />}
            {activeTab === 4 && <NegotiationTab a={result.analysis} />}
            {activeTab === 5 && <AgreementTab agreements={agreementResults} />}
            {activeTab === 6 && <CrossReferenceTab xref={crossRefResult} />}
            {activeTab === 7 && <ConfidenceTab a={result.analysis} />}
            {activeTab === 8 && <ExportTab a={result.analysis} positions={positions} fileName={files[0]?.name} />}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import { useState, useCallback, useRef } from 'react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (n) => (parseFloat(n) || 0).toFixed(1) + '%';

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100vh', padding: '24px 20px', maxWidth: 1100, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 12 },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoText: { fontSize: 22, fontWeight: 400, letterSpacing: 1, color: '#e8e8f0' },
  logoAccent: { color: '#EAD068' },
  badge: { background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: '#00e5ff', letterSpacing: 0.5 },
  card: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 24, marginBottom: 20 },
  cardTitle: { fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(232,232,240,0.5)', marginBottom: 16 },
  dropzone: (drag) => ({
    border: `2px dashed ${drag ? '#00e5ff' : 'rgba(255,255,255,0.18)'}`,
    borderRadius: 12,
    padding: '48px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: drag ? 'rgba(0,229,255,0.05)' : 'rgba(255,255,255,0.03)',
    marginBottom: 20,
  }),
  dropIcon: { fontSize: 40, marginBottom: 12 },
  dropTitle: { fontSize: 18, color: '#e8e8f0', marginBottom: 8 },
  dropSub: { fontSize: 13, color: 'rgba(232,232,240,0.5)', marginBottom: 16 },
  fileChip: { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#00e5ff', marginTop: 8 },
  btn: (variant = 'primary') => ({
    padding: '12px 28px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    letterSpacing: 0.5,
    fontFamily: 'inherit',
    transition: 'all 0.2s',
    ...(variant === 'primary' ? {
      background: 'linear-gradient(135deg, #00acc1, #00e5ff)',
      color: '#0a0a0f',
      fontWeight: 600,
    } : variant === 'gold' ? {
      background: 'linear-gradient(135deg, #CFA529, #EAD068)',
      color: '#0a0a0f',
      fontWeight: 600,
    } : {
      background: 'rgba(255,255,255,0.08)',
      color: '#e8e8f0',
      border: '1px solid rgba(255,255,255,0.15)',
    }),
  }),
  btnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  tabs: { display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 0 },
  tab: (active) => ({
    padding: '10px 18px',
    border: 'none',
    borderBottom: active ? '2px solid #00e5ff' : '2px solid transparent',
    background: 'transparent',
    color: active ? '#00e5ff' : 'rgba(232,232,240,0.55)',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    marginBottom: -1,
    letterSpacing: 0.3,
  }),
  stat: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '16px 18px', flex: 1, minWidth: 150 },
  statLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(232,232,240,0.45)', marginBottom: 6 },
  statValue: (color = '#e8e8f0') => ({ fontSize: 22, color, fontWeight: 400 }),
  statSub: { fontSize: 11, color: 'rgba(232,232,240,0.4)', marginTop: 3 },
  row: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 },
  label: { fontSize: 12, color: 'rgba(232,232,240,0.45)', letterSpacing: 0.5, marginBottom: 4 },
  value: { fontSize: 15, color: '#e8e8f0' },
  divider: { borderTop: '1px solid rgba(255,255,255,0.08)', margin: '16px 0' },
  tag: (color) => ({
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    ...(color === 'green' ? { background: 'rgba(76,175,80,0.15)', color: '#81c784', border: '1px solid rgba(76,175,80,0.25)' } :
      color === 'amber' ? { background: 'rgba(249,168,37,0.15)', color: '#ffd54f', border: '1px solid rgba(249,168,37,0.25)' } :
      color === 'red' ? { background: 'rgba(239,83,80,0.15)', color: '#ef9a9a', border: '1px solid rgba(239,83,80,0.3)' } :
      color === 'teal' ? { background: 'rgba(0,229,255,0.12)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.25)' } :
      color === 'gold' ? { background: 'rgba(234,208,104,0.12)', color: '#EAD068', border: '1px solid rgba(234,208,104,0.25)' } :
      { background: 'rgba(255,255,255,0.07)', color: 'rgba(232,232,240,0.6)', border: '1px solid rgba(255,255,255,0.12)' }),
  }),
  progressBar: (pct, color) => ({
    height: 6,
    borderRadius: 3,
    background: `linear-gradient(90deg, ${color}, ${color}88)`,
    width: `${Math.min(100, pct)}%`,
    transition: 'width 0.4s ease',
  }),
  progressTrack: { background: 'rgba(255,255,255,0.07)', borderRadius: 3, height: 6, overflow: 'hidden', marginTop: 6 },
  alert: (sev) => ({
    padding: '10px 14px',
    borderRadius: 8,
    marginBottom: 8,
    fontSize: 13,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    ...(sev === 'critical' ? { background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.25)', color: '#ef9a9a' } :
      sev === 'warning' ? { background: 'rgba(249,168,37,0.1)', border: '1px solid rgba(249,168,37,0.25)', color: '#ffd54f' } :
      { background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.2)', color: '#80deea' }),
  }),
  loadingOverlay: { textAlign: 'center', padding: '60px 24px' },
  spinner: { width: 48, height: 48, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #00e5ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' },
  exportBox: { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 16, fontFamily: 'monospace', fontSize: 12, color: '#80cbc4', lineHeight: 1.8, whiteSpace: 'pre-wrap', overflowX: 'auto' },
  sectionTitle: { fontSize: 14, color: '#00e5ff', letterSpacing: 0.5, marginBottom: 12, marginTop: 4 },
  funderCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 16, marginBottom: 10 },
  tableRow: (i) => ({ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, padding: '10px 12px', background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent', borderRadius: 6, alignItems: 'center' }),
  tableHeader: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, padding: '6px 12px', fontSize: 11, letterSpacing: 1, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', marginBottom: 4 },
};

// ─── DSR Posture ─────────────────────────────────────────────────────────────
function dsrColor(posture) {
  const map = { healthy: '#4caf50', elevated: '#ffd54f', stressed: '#ff9800', critical: '#ff5722', unsustainable: '#ef5350' };
  return map[posture] || '#e8e8f0';
}
function dsrLabel(posture) {
  const map = { healthy: '🟢 Healthy', elevated: '🟡 Elevated', stressed: '🟠 Stressed', critical: '🔴 Critical', unsustainable: '🔴 Unsustainable' };
  return map[posture] || posture;
}
function getTagColor(posture) {
  const map = { healthy: 'green', elevated: 'amber', stressed: 'amber', critical: 'red', unsustainable: 'red' };
  return map[posture] || 'grey';
}

// ─── CSV Export ──────────────────────────────────────────────────────────────
function buildCSV(a, activePositions, totalMCAMonthly, dsr, totalOtherDebt, totalDSR, trueFree, adjustedRevenue) {
  const m = { ...a.calculated_metrics, total_mca_monthly: totalMCAMonthly || a.calculated_metrics?.total_mca_monthly, dsr_percent: dsr || a.calculated_metrics?.dsr_percent };
  const r = a.revenue;
  const b = a.balance_summary;
  const rows = [
    ['field', 'value', 'notes'],
    ['business_name', a.business_name, ''],
    ['bank_name', a.bank_name, ''],
    ['statement_period', a.statement_month, ''],
    ['monthly_revenue', adjustedRevenue || r.monthly_average_revenue || r.net_verified_revenue, 'Monthly avg · bank-verified (adjusted if deposits excluded)'],
    ['gross_deposits', r.gross_deposits, 'Before exclusions'],
    ['excluded_mca_proceeds', r.excluded_mca_proceeds, ''],
    ['excluded_transfers', r.excluded_transfers, ''],
    ['monthly_outgo', a.expense_categories.total_operating_expenses, ''],
    ['avg_daily_balance', m.avg_daily_balance, ''],
    ['total_mca_debt_service', m.total_mca_monthly, 'Monthly MCA payments only'],
    ['total_debt_service_monthly', m.total_debt_service_monthly, 'MCA + loans + other'],
    ['free_cash_after_mca', m.free_cash_after_mca, ''],
    ['dsr_percent', m.dsr_percent, 'Debt Service Ratio'],
    ['dsr_posture', a.negotiation_intel?.dsr_posture, ''],
    ['nsf_count', a.nsf_analysis.nsf_count, ''],
    ['nsf_risk_score', a.nsf_analysis.nsf_risk_score, '0-100'],
    ['days_negative', b.days_negative, ''],
    ['ending_balance', b.ending_balance, ''],
    ['trend_direction', m.trend_direction, ''],
    ['weeks_to_insolvency', m.weeks_to_insolvency ?? 'N/A', ''],
    ['detected_mca_positions', (activePositions || a.mca_positions || []).length, 'Active positions included in UW Calc'],
    ['total_other_debt_monthly', totalOtherDebt || 0, 'SBA + equipment + credit cards (active)'],
    ['total_dsr_all_debt', totalDSR || 0, 'MCA + all other debt / revenue'],
    ['true_free_cash', trueFree || 0, 'Revenue - MCA - other debt - opex'],
    ['analysis_date', new Date().toISOString().split('T')[0], ''],
  ];
  return rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}


// ─── Revenue Adjustment Helper ────────────────────────────────────────────────
function calcAdjustedRevenue(a, excludedDepositIds) {
  const base = a.revenue?.monthly_average_revenue || a.revenue?.net_verified_revenue || 0;
  if (!excludedDepositIds || excludedDepositIds.length === 0) return base;
  const sources = a.revenue?.revenue_sources || [];
  let adj = base;
  sources.forEach((src, i) => {
    const amt = src.monthly_avg || (src.total / Math.max((a.monthly_breakdown||[]).length, 1)) || 0;
    if (excludedDepositIds.includes(i)) {
      if (!src.is_excluded) {
        // User is excluding a counted item — subtract it
        adj -= amt;
      }
      // If already excluded by Claude and user toggles it — they want to INCLUDE it back
    } else {
      if (src.is_excluded && (src.monthly_avg > 15000 || src.total > 15000)) {
        // Not in excluded list means user wants it included — but only if they've interacted
        // We only add back if user explicitly toggled it off (i.e. was in excludedDepositIds before)
        // For now, don't add back auto-excluded items unless toggled — keeps base clean
      }
    }
  });
  return Math.max(adj, 1);
}

// ─── Revenue Tab ─────────────────────────────────────────────────────────────
function RevenueTab({ a, excludedDepositIds, setExcludedDepositIds }) {
  const r = a.revenue;
  const m = a.calculated_metrics;
  const b = a.balance_summary;
  const adjustedRevenue = calcAdjustedRevenue(a, excludedDepositIds);
  const revenueAdjusted = excludedDepositIds && excludedDepositIds.length > 0;
  return (
    <div>
      <div style={S.row}>
        <div style={{ ...S.stat, flex: 1 }}>
          <div style={S.statLabel}>Gross Deposits</div>
          <div style={S.statValue('#e8e8f0')}>{fmt(r.gross_deposits)}</div>
          <div style={S.statSub}>{(a.monthly_breakdown || []).length > 1 ? `Total · ${(a.monthly_breakdown||[]).length} months` : 'All credits this month'}</div>
        </div>
        <div style={{ ...S.stat, flex: 1 }}>
          <div style={S.statLabel}>{(a.monthly_breakdown||[]).length > 1 ? 'Monthly Avg Revenue' : 'Net Verified Revenue'}{revenueAdjusted ? ' ✎' : ''}</div>
          <div style={S.statValue('#00e5ff')}>{fmt(adjustedRevenue)}</div>
          <div style={S.statSub}>{revenueAdjusted ? <span style={{color:'#ffd54f'}}>Adjusted · {excludedDepositIds.length} deposit{excludedDepositIds.length>1?'s':''} excluded</span> : (a.monthly_breakdown||[]).length > 1 ? 'Bank-verified avg across months' : 'After exclusions'}</div>
        </div>
        <div style={{ ...S.stat, flex: 1 }}>
          <div style={S.statLabel}>Avg Daily Balance</div>
          <div style={S.statValue((b.most_recent_ending_balance ?? b.ending_balance ?? 0) < 0 ? '#ef5350' : '#e8e8f0')}>{fmtD(m.avg_daily_balance)}</div>
          <div style={S.statSub}>Ending: {fmtD(b.most_recent_ending_balance ?? b.ending_balance ?? 0)}</div>
        </div>
      </div>

      {/* Revenue breakdown by type */}
      <div style={S.divider} />
      <div style={S.sectionTitle}>Revenue Breakdown</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={S.stat}><div style={S.statLabel}>Card Processing</div><div style={{ fontSize: 18, color: '#00e5ff' }}>{fmt(r.card_processing)}</div><div style={S.statSub}>Square / Cantaloupe / etc</div></div>
        <div style={S.stat}><div style={S.statLabel}>Cash Deposits</div><div style={{ fontSize: 18, color: '#81c784' }}>{fmt(r.cash_deposits)}</div><div style={S.statSub}>Route collections</div></div>
        <div style={S.stat}><div style={S.statLabel}>ACH Credits</div><div style={{ fontSize: 18, color: '#ce93d8' }}>{fmt(r.ach_credits)}</div><div style={S.statSub}>Customer ACH</div></div>
        <div style={S.stat}><div style={S.statLabel}>Vendor Credits</div><div style={{ fontSize: 18, color: '#ffd54f' }}>{fmt(r.vendor_credits)}</div><div style={S.statSub}>Rebates / credits</div></div>
      </div>

      <div style={S.divider} />
      <div style={S.sectionTitle}>Revenue Sources</div>
      <div style={S.tableHeader}><span>Source</span><span>Total</span><span>Type</span><span>Status</span></div>
      {(r.revenue_sources || []).map((s, i) => (
        <div key={i} style={S.tableRow(i)}>
          <span style={{ fontSize: 13 }}>{s.name}</span>
          <span style={{ fontSize: 13, color: s.is_excluded ? 'rgba(232,232,240,0.4)' : '#e8e8f0', textDecoration: s.is_excluded ? 'line-through' : 'none' }}>{fmt(s.total)}</span>
          <span><span style={S.tag('grey')}>{(s.type || '').replace(/_/g, ' ')}</span></span>
          <span>{s.is_excluded ? <span style={S.tag('red')}>excluded</span> : <span style={S.tag('green')}>counted</span>}</span>
        </div>
      ))}

      {(r.excluded_mca_proceeds > 0 || r.excluded_transfers > 0 || r.excluded_loan_proceeds > 0 || r.excluded_other > 0) && (
        <>
          <div style={S.divider} />
          <div style={S.sectionTitle}>Exclusion Breakdown</div>
          <div style={S.grid2}>
            {r.excluded_mca_proceeds > 0 && <div style={S.stat}><div style={S.statLabel}>MCA Proceeds</div><div style={{ fontSize: 16, color: '#ef9a9a' }}>{fmt(r.excluded_mca_proceeds)}</div></div>}
            {r.excluded_transfers > 0 && <div style={S.stat}><div style={S.statLabel}>Inter-Account Transfers</div><div style={{ fontSize: 16, color: '#ef9a9a' }}>{fmt(r.excluded_transfers)}</div></div>}
            {r.excluded_loan_proceeds > 0 && <div style={S.stat}><div style={S.statLabel}>Loan Proceeds</div><div style={{ fontSize: 16, color: '#ef9a9a' }}>{fmt(r.excluded_loan_proceeds)}</div></div>}
            {r.excluded_other > 0 && <div style={S.stat}><div style={S.statLabel}>Other Excluded</div><div style={{ fontSize: 16, color: '#ef9a9a' }}>{fmt(r.excluded_other)}</div></div>}
          </div>
        </>
      )}

      <div style={S.divider} />
      <div style={S.sectionTitle}>Balance Activity</div>
      <div style={S.grid3}>
        <div style={S.stat}><div style={S.statLabel}>{(a.monthly_breakdown||[]).length > 1 ? 'Most Recent End Balance' : 'Beginning Balance'}</div><div style={{ fontSize: 16, color: '#e8e8f0' }}>{fmtD(b.most_recent_ending_balance ?? b.ending_balance ?? b.beginning_balance ?? 0)}</div></div>
        <div style={S.stat}><div style={S.statLabel}>{(a.monthly_breakdown||[]).length > 1 ? 'Avg End Balance' : 'Total Withdrawals'}</div><div style={{ fontSize: 16, color: '#e8e8f0' }}>{(a.monthly_breakdown||[]).length > 1 ? fmtD(b.average_ending_balance ?? 0) : fmt(b.total_withdrawals ?? 0)}</div></div>
        <div style={S.stat}><div style={S.statLabel}>Days Negative</div><div style={{ fontSize: 16, color: (b.days_negative ?? b.total_days_negative ?? 0) > 0 ? '#ff9800' : '#4caf50' }}>{b.days_negative ?? b.total_days_negative ?? 0}</div></div>
      </div>
    </div>
  );
}

// ─── MCA Tab ─────────────────────────────────────────────────────────────────
function MCATab({ a, positions, setPositions, excludedIds, setExcludedIds, otherExcludedIds, setOtherExcludedIds, excludedDepositIds }) {
  const [addText, setAddText] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  const startEdit = (p) => {
    setEditingId(p._id);
    setEditValues({ funder_name: p.funder_name, payment_amount: p.payment_amount_current || p.payment_amount, frequency: p.frequency, payments_detected: p.payments_detected });
  };
  const saveEdit = (id) => {
    const v = editValues;
    const pa = parseFloat(v.payment_amount) || 0;
    const pd = parseInt(v.payments_detected) || 4;
    const freqMultiplier = v.frequency === 'daily' ? 22 : v.frequency === 'bi-weekly' ? 2.17 : v.frequency === 'monthly' ? 1 : 4.33;
    const monthly = pa * (v.frequency === 'monthly' ? 1 : freqMultiplier);
    setPositions(prev => prev.map(p => p._id === id ? {
      ...p,
      funder_name: v.funder_name,
      payment_amount: pa,
      payment_amount_current: pa,
      frequency: v.frequency,
      payments_detected: pd,
      estimated_monthly_total: monthly,
    } : p));
    setEditingId(null);
  };

  const activePositions = positions.filter(p => !excludedIds.includes(p._id));
  const excludedPositions = positions.filter(p => excludedIds.includes(p._id));
  const other = a.other_debt_service || [];
  const revenue = calcAdjustedRevenue(a, excludedDepositIds);

  const totalMCAMonthly = activePositions.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0);
  const activeOtherDebt = other.filter((_, i) => !(otherExcludedIds || []).includes(i));
  const totalOtherMonthly = activeOtherDebt.reduce((s, o) => s + (o.monthly_total || 0), 0);
  const totalAllDebt = totalMCAMonthly + totalOtherMonthly;
  const dsrPercent = (totalAllDebt / revenue) * 100;
  const mcaOnlyDSR = (totalMCAMonthly / revenue) * 100;

  const exclude = (id) => setExcludedIds(prev => [...prev, id]);
  const restore = (id) => setExcludedIds(prev => prev.filter(x => x !== id));

  const parseAndAdd = async () => {
    if (!addText.trim()) return;
    setAddLoading(true);
    setAddError(null);
    try {
      const res = await fetch('/api/parse-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: addText }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setAddError(data.error || 'Could not parse position'); setAddLoading(false); return; }
      const newPos = { ...data.position, _id: Date.now() };
      setPositions(prev => [...prev, newPos]);
      setAddText('');
    } catch (e) {
      setAddError(e.message);
    }
    setAddLoading(false);
  };

  return (
    <div>
      {/* Live metrics */}
      <div style={S.row}>
        <div style={{ ...S.stat, flex: 1 }}>
          <div style={S.statLabel}>Active Positions</div>
          <div style={S.statValue('#EAD068')}>{activePositions.length}<span style={{ fontSize: 13, color: 'rgba(232,232,240,0.4)' }}> / {positions.length} total</span></div>
        </div>
        <div style={{ ...S.stat, flex: 1 }}>
          <div style={S.statLabel}>Monthly MCA Total</div>
          <div style={S.statValue('#ef9a9a')}>{fmt(totalMCAMonthly)}</div>
          <div style={S.statSub}>Active positions only</div>
        </div>
        <div style={{ ...S.stat, flex: 1 }}>
          <div style={S.statLabel}>Total DSR (All Debt)</div>
          <div style={S.statValue(dsrPercent > 50 ? '#ef5350' : dsrPercent > 35 ? '#ff9800' : dsrPercent > 25 ? '#ffd54f' : '#4caf50')}>{fmtP(dsrPercent)}</div>
          <div style={S.statSub}>MCA {fmtP(mcaOnlyDSR)} + Other {fmtP(dsrPercent - mcaOnlyDSR)}</div>
        </div>
      </div>

      <div style={S.divider} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={S.sectionTitle}>MCA Positions</div>
        <span style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)' }}>Excluded positions are hidden from UW Calculator export</span>
      </div>

      {positions.length === 0 && (
        <div style={{ color: 'rgba(232,232,240,0.4)', fontSize: 13, padding: '16px 0' }}>No MCA positions detected</div>
      )}

      {activePositions.map((p) => (
        <div key={p._id} style={S.funderCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 16, color: '#e8e8f0', marginBottom: 4 }}>{p.funder_name}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={S.tag(p.flag === 'undisclosed' ? 'red' : p.flag === 'default_modified' ? 'red' : p.flag === 'modified' ? 'amber' : 'teal')}>{p.flag === 'default_modified' ? '⚠ default modified' : p.flag || 'standard'}</span>
                <span style={S.tag(p.confidence === 'high' ? 'green' : p.confidence === 'medium' ? 'amber' : 'grey')}>{p.confidence || 'medium'} confidence</span>
                <span style={S.tag('grey')}>{p.frequency}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {editingId === p._id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <input value={editValues.funder_name} onChange={e => setEditValues(v => ({...v, funder_name: e.target.value}))} placeholder="Funder name" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit', width: 180 }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={editValues.payment_amount} onChange={e => setEditValues(v => ({...v, payment_amount: e.target.value}))} placeholder="Payment $" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit', width: 90 }} />
                    <select value={editValues.frequency} onChange={e => setEditValues(v => ({...v, frequency: e.target.value}))} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit' }}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="bi-weekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => saveEdit(p._id)} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: 'rgba(0,229,255,0.2)', color: '#00e5ff', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>✓ Save</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(232,232,240,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, color: '#ef9a9a' }}>{fmt(p.estimated_monthly_total)}<span style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)' }}>/mo</span></div>
                  <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.5)' }}>{fmt(p.payment_amount_current || p.payment_amount)} × {p.payments_detected} pmts</div>
                </div>
              )}
              {editingId !== p._id && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={() => startEdit(p)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.25)', background: 'rgba(0,229,255,0.08)', color: '#00e5ff', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>✏ Edit</button>
                  <button onClick={() => exclude(p._id)} title="Exclude from UW Calculator" style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,83,80,0.3)', background: 'rgba(239,83,80,0.08)', color: '#ef9a9a', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>✕ Excl</button>
                </div>
              )}
            </div>
          </div>
          {/* Modification alert */}
          {p.payment_modified && (
            <div style={{ background: 'rgba(249,168,37,0.1)', border: '1px solid rgba(249,168,37,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>
              <span style={{ color: '#ffd54f' }}>⚠ Payment Modified</span>
              <span style={{ color: 'rgba(232,232,240,0.5)', marginLeft: 8 }}>
                Originally {fmt(p.payment_amount_original)}/{p.frequency === 'weekly' ? 'wk' : 'day'}
                {' → '}
                <span style={{ color: p.modification_direction === 'reduced' ? '#81c784' : '#ef9a9a' }}>
                  {fmt(p.payment_amount_current)}/{p.frequency === 'weekly' ? 'wk' : 'day'} current
                </span>
                {p.modification_date && <span style={{ color: 'rgba(232,232,240,0.4)' }}> (as of {p.modification_date})</span>}
              </span>
            </div>
          )}
          {/* Advance deposit correlation */}
          {p.advance_deposit_date && p.advance_deposit_amount > 0 && (
            <div style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: 'rgba(232,232,240,0.55)' }}>
              💰 Advance deposit: <span style={{ color: '#00e5ff' }}>{fmt(p.advance_deposit_amount)}</span> on {p.advance_deposit_date}
              {p.days_from_deposit_to_payments > 0 && <span> · payments started {p.days_from_deposit_to_payments} days later</span>}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6 }}>{p.pattern_description}</div>
          {(p.first_payment_date || p.last_payment_date) && (
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)', marginTop: 6 }}>{p.first_payment_date} → {p.last_payment_date}</div>
          )}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 4 }}>
              <span>% of verified revenue</span>
              <span>{fmtP((p.estimated_monthly_total / revenue) * 100)}</span>
            </div>
            <div style={S.progressTrack}><div style={S.progressBar((p.estimated_monthly_total / revenue) * 100, '#ef5350')} /></div>
          </div>
        </div>
      ))}

      {excludedPositions.length > 0 && (
        <>
          <div style={S.divider} />
          <div style={{ fontSize: 12, letterSpacing: 1, color: 'rgba(232,232,240,0.3)', textTransform: 'uppercase', marginBottom: 10 }}>Excluded from UW Calc ({excludedPositions.length})</div>
          {excludedPositions.map((p) => (
            <div key={p._id} style={{ ...S.funderCard, opacity: 0.45, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, color: '#e8e8f0', textDecoration: 'line-through' }}>{p.funder_name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)', marginTop: 2 }}>{fmt(p.estimated_monthly_total)}/mo · {p.frequency}</div>
                </div>
                <button
                  onClick={() => restore(p._id)}
                  style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.25)', background: 'rgba(0,229,255,0.08)', color: '#00e5ff', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                  ↩ Restore
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Add missing position */}
      <div style={S.divider} />
      <div style={S.sectionTitle}>Add Missing Position</div>
      <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)', marginBottom: 10, lineHeight: 1.6 }}>
        Describe a position Claude missed — e.g. "The Merchant Marketplace $8,500 weekly, first seen Oct 3"
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          value={addText}
          onChange={e => setAddText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && parseAndAdd()}
          placeholder="Funder name, payment amount, frequency..."
          style={{ flex: 1, minWidth: 260, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
        <button
          onClick={parseAndAdd}
          disabled={addLoading || !addText.trim()}
          style={{ ...S.btn('primary'), opacity: addLoading || !addText.trim() ? 0.5 : 1, padding: '10px 20px' }}>
          {addLoading ? '⏳ Parsing…' : '＋ Add Position'}
        </button>
      </div>
      {addError && <div style={{ ...S.alert('critical'), marginTop: 10 }}><span>⚠</span><div>{addError}</div></div>}

      {/* Other debt service */}
      {other.length > 0 && (
        <>
          <div style={S.divider} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={S.sectionTitle}>Other Debt Service</div>
            <span style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)' }}>Toggle items to include/exclude from True Free Cash</span>
          </div>
          {other.map((o, i) => {
            const isExcluded = otherExcludedIds.includes(i);
            return (
              <div key={i} style={{ ...S.funderCard, opacity: isExcluded ? 0.45 : 1, marginBottom: 8, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, color: isExcluded ? 'rgba(232,232,240,0.4)' : '#e8e8f0', textDecoration: isExcluded ? 'line-through' : 'none' }}>{o.name}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <span style={S.tag('grey')}>{(o.type || '').replace(/_/g, ' ')}</span>
                      {isExcluded && <span style={S.tag('amber')}>excluded</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 15, color: isExcluded ? 'rgba(239,154,154,0.4)' : '#ef9a9a' }}>{fmt(o.monthly_total)}/mo</span>
                    <button
                      onClick={() => setOtherExcludedIds(prev => isExcluded ? prev.filter(x => x !== i) : [...prev, i])}
                      style={{ padding: '4px 12px', borderRadius: 6, border: isExcluded ? '1px solid rgba(0,229,255,0.25)' : '1px solid rgba(239,83,80,0.3)', background: isExcluded ? 'rgba(0,229,255,0.08)' : 'rgba(239,83,80,0.08)', color: isExcluded ? '#00e5ff' : '#ef9a9a', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                      {isExcluded ? '↩ Include' : '✕ Exclude'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {/* True Free Cash Summary */}
          {(() => {
            const activeOther = other.filter((_, i) => !otherExcludedIds.includes(i));
            const totalOther = activeOther.reduce((s, o) => s + (o.monthly_total || 0), 0);
            const totalAll = totalMCAMonthly + totalOther + (a.expense_categories?.total_operating_expenses || 0);
            const trueFree = revenue - totalAll;
            const totalDebt = totalMCAMonthly + totalOther;
            const totalDSR = (totalDebt / revenue) * 100;
            return (
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 16, marginTop: 16 }}>
                <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(232,232,240,0.4)', marginBottom: 14 }}>True Cash Flow Summary (Active Positions)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>Net Revenue</div><div style={{ fontSize: 16, color: '#00e5ff' }}>{fmt(revenue)}</div></div>
                  <div><div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>MCA Payments</div><div style={{ fontSize: 16, color: '#ef9a9a' }}>− {fmt(totalMCAMonthly)}</div></div>
                  <div><div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>Other Debt Service</div><div style={{ fontSize: 16, color: '#ef9a9a' }}>− {fmt(totalOther)}</div></div>
                  <div><div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>Operating Expenses</div><div style={{ fontSize: 16, color: '#ef9a9a' }}>− {fmt(a.expense_categories?.total_operating_expenses || 0)}</div></div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>True Free Cash</div>
                    <div style={{ fontSize: 24, color: trueFree < 0 ? '#ef5350' : trueFree < 5000 ? '#ff9800' : '#4caf50', fontWeight: 400 }}>{fmt(trueFree)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>Total DSR (All Debt)</div>
                    <div style={{ fontSize: 24, color: totalDSR > 50 ? '#ef5350' : totalDSR > 35 ? '#ff9800' : '#ffd54f' }}>{fmtP(totalDSR)}</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}


// ─── Risk Tab ─────────────────────────────────────────────────────────────────
function RiskTab({ a, positions, excludedIds, otherExcludedIds, excludedDepositIds }) {
  const activePositions = (positions || []).filter(p => !(excludedIds || []).includes(p._id));
  const totalMCAMonthly = activePositions.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0);
  const activeOther = (a.other_debt_service || []).filter((_, i) => !(otherExcludedIds || []).includes(i));
  const totalOtherDebt = activeOther.reduce((s, o) => s + (o.monthly_total || 0), 0);
  const revenue = calcAdjustedRevenue(a, excludedDepositIds);
  const nsf = a.nsf_analysis;
  const flags = a.flags_and_alerts || [];
  const dsr = positions && positions.length > 0 ? (totalMCAMonthly / revenue) * 100 : (a.calculated_metrics?.dsr_percent || 0);
  const totalDSR = ((totalMCAMonthly + totalOtherDebt) / revenue) * 100;
  const posture = dsr > 50 ? 'unsustainable' : dsr > 35 ? 'critical' : dsr > 25 ? 'stressed' : dsr > 15 ? 'elevated' : 'healthy';
  const opex = a.expense_categories?.total_operating_expenses || 0;
  const trueFree = revenue - totalMCAMonthly - totalOtherDebt - opex;
  const m = { ...a.calculated_metrics, total_mca_monthly: totalMCAMonthly, dsr_percent: dsr, free_cash_after_mca: trueFree };
  return (
    <div>
      {/* DSR Meter */}
      <div style={{ ...S.card, background: 'rgba(0,0,0,0.2)', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.45)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Debt Service Ratio</div>
            <div style={{ fontSize: 36, color: dsrColor(posture) }}>{fmtP(dsr)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...S.tag(getTagColor(posture)), fontSize: 13, padding: '6px 16px' }}>{dsrLabel(posture)}</div>
            <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)', marginTop: 8 }}>
              {fmt(m.total_mca_monthly)} MCA / {fmt(a.revenue.monthly_average_revenue || a.revenue.net_verified_revenue)} revenue
            </div>
          </div>
        </div>
        <div style={S.progressTrack}>
          <div style={S.progressBar(Math.min(dsr, 100), dsrColor(posture))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(232,232,240,0.3)', marginTop: 4 }}>
          <span>0% Healthy</span><span>15%</span><span>25%</span><span>35%</span><span>50%+ Unsustainable</span>
        </div>
      </div>

      <div style={S.grid3}>
        <div style={S.stat}>
          <div style={S.statLabel}>Free Cash After MCA</div>
          <div style={S.statValue(m.free_cash_after_mca < 0 ? '#ef5350' : m.free_cash_after_mca < 5000 ? '#ff9800' : '#4caf50')}>{fmt(m.free_cash_after_mca)}</div>
          <div style={S.statSub}>Revenue − MCA − Expenses</div>
        </div>
        <div style={S.stat}>
          <div style={S.statLabel}>NSF Risk Score</div>
          <div style={S.statValue(nsf.nsf_risk_score > 50 ? '#ef5350' : nsf.nsf_risk_score > 20 ? '#ff9800' : '#4caf50')}>{nsf.nsf_risk_score}<span style={{ fontSize: 14 }}>/100</span></div>
          <div style={S.statSub}>{nsf.nsf_count} NSF events</div>
        </div>
        <div style={S.stat}>
          <div style={S.statLabel}>Weeks to Insolvency</div>
          <div style={S.statValue(m.weeks_to_insolvency && m.weeks_to_insolvency < 8 ? '#ef5350' : '#e8e8f0')}>
            {m.weeks_to_insolvency ? `${m.weeks_to_insolvency}w` : 'N/A'}
          </div>
          <div style={S.statSub}>{m.trend_direction} trend</div>
        </div>
      </div>

      {nsf.nsf_count > 0 && (
        <>
          <div style={S.divider} />
          <div style={S.sectionTitle}>NSF Events</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(nsf.nsf_dates || []).map((d, i) => (
              <span key={i} style={{ ...S.tag('red'), fontSize: 12 }}>{d}</span>
            ))}
          </div>
        </>
      )}

      {flags.length > 0 && (
        <>
          <div style={S.divider} />
          <div style={S.sectionTitle}>Flags & Alerts</div>
          {flags.map((f, i) => (
            <div key={i} style={S.alert(f.severity)}>
              <span>{f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : 'ℹ️'}</span>
              <div><strong>{f.category}</strong> — {f.message}</div>
            </div>
          ))}
        </>
      )}

      <div style={S.divider} />
      <div style={S.sectionTitle}>Expense Categories</div>
      <div style={S.grid2}>
        {Object.entries(a.expense_categories || {}).filter(([k, v]) => k !== 'total_operating_expenses' && v > 0).map(([k, v]) => (
          <div key={k} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.55)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: 13 }}>{fmt(v)}</span>
            </div>
            <div style={S.progressTrack}><div style={S.progressBar((v / (a.expense_categories.total_operating_expenses || 1)) * 100, '#00acc1')} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Negotiation Tab ──────────────────────────────────────────────────────────
function NegotiationTab({ a, positions, excludedIds, otherExcludedIds, excludedDepositIds }) {
  const intel = a.negotiation_intel || {};
  const activePositions = (positions || a.mca_positions || []).filter(p => !(excludedIds || []).includes(p._id));
  const totalMCAMonthly = activePositions.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0);
  const activeOther = (a.other_debt_service || []).filter((_, i) => !(otherExcludedIds || []).includes(i));
  const totalOtherDebt = activeOther.reduce((s, o) => s + (o.monthly_total || 0), 0);
  const revenue = calcAdjustedRevenue(a, excludedDepositIds);
  const freeCashAfterMCA = revenue - totalMCAMonthly;
  const dsr = (totalMCAMonthly / revenue) * 100;
  const posture = dsr > 50 ? 'unsustainable' : dsr > 35 ? 'critical' : dsr > 25 ? 'stressed' : dsr > 15 ? 'elevated' : 'healthy';
  const opexForNeg = a.expense_categories?.total_operating_expenses || 0;
  const trueFreeForNeg = freeCashAfterMCA - totalOtherDebt - opexForNeg;
  const m = { ...a.calculated_metrics, free_cash_after_mca: freeCashAfterMCA, total_mca_monthly: totalMCAMonthly, dsr_percent: dsr };
  const color = dsrColor(posture);
  return (
    <div>
      {/* Free Cash Headlines */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ ...S.card, borderColor: freeCashAfterMCA < 0 ? 'rgba(239,83,80,0.35)' : 'rgba(0,229,255,0.2)', background: freeCashAfterMCA < 0 ? 'rgba(239,83,80,0.06)' : 'rgba(0,229,255,0.04)' }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(232,232,240,0.45)', marginBottom: 6 }}>Free Cash After MCA Only</div>
          <div style={{ fontSize: 32, color: freeCashAfterMCA < 0 ? '#ef5350' : '#4caf50' }}>{fmt(freeCashAfterMCA)}</div>
          <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.45)', marginTop: 4 }}>{fmt(revenue)} rev − {fmt(m.total_mca_monthly)} MCA</div>
        </div>
        <div style={{ ...S.card, borderColor: trueFreeForNeg < 0 ? 'rgba(239,83,80,0.35)' : 'rgba(76,175,80,0.2)', background: trueFreeForNeg < 0 ? 'rgba(239,83,80,0.06)' : 'rgba(76,175,80,0.04)' }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(232,232,240,0.45)', marginBottom: 6 }}>True Free Cash (All Debt + OpEx)</div>
          <div style={{ fontSize: 32, color: trueFreeForNeg < 0 ? '#ef5350' : '#4caf50' }}>{fmt(trueFreeForNeg)}</div>
          <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.45)', marginTop: 4 }}>After MCA + other debt + operating expenses</div>
        </div>
      </div>

      {/* Cash Flow Reality Check */}
      {(() => {
        const monthly = a.monthly_breakdown || [];
        const endBal = a.balance_summary?.most_recent_ending_balance ?? a.balance_summary?.ending_balance ?? 0;
        const avgRev = revenue;
        const worstEndBal = a.balance_summary?.lowest_ending_balance ?? endBal;
        const totalDaysNeg = a.balance_summary?.total_days_negative ?? a.balance_summary?.days_negative ?? 0;
        const nsfCount = a.nsf_analysis?.nsf_count ?? 0;
        const hasHardshipSignals = endBal < 0 || totalDaysNeg > 3 || nsfCount > 1;
        if (!hasHardshipSignals && monthly.length < 2) return null;
        // Find month with highest and lowest MCA burden
        const mcaVariance = monthly.length > 1
          ? Math.max(...monthly.map(m => m.total_mca_payments||0)) - Math.min(...monthly.map(m => m.total_mca_payments||0))
          : 0;
        return (
          <div style={{ background: 'rgba(255,152,0,0.07)', border: '1px solid rgba(255,152,0,0.25)', borderRadius: 10, padding: 18, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>⚖️</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ffd54f', letterSpacing: 0.5 }}>CASH FLOW REALITY CHECK — Funder Hardship Defense</div>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)', lineHeight: 1.8, marginBottom: 14 }}>
              The "Free Cash After MCA" figure above is a <strong style={{ color: '#ffd54f' }}>multi-month average</strong> — it does not reflect the actual cash position at any single point in time. Funders may use this average to argue the merchant is not in hardship. The data below proves otherwise:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
              {endBal < 0 && (
                <div style={{ background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.25)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginBottom: 4 }}>Most Recent Ending Balance</div>
                  <div style={{ fontSize: 18, color: '#ef5350' }}>{fmtD(endBal)}</div>
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginTop: 3 }}>Account is currently overdrawn</div>
                </div>
              )}
              {totalDaysNeg > 0 && (
                <div style={{ background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.25)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginBottom: 4 }}>Days in Negative Territory</div>
                  <div style={{ fontSize: 18, color: '#ef9a9a' }}>{totalDaysNeg} days</div>
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginTop: 3 }}>Across statement period</div>
                </div>
              )}
              {nsfCount > 0 && (
                <div style={{ background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.25)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginBottom: 4 }}>NSF / Returned Items</div>
                  <div style={{ fontSize: 18, color: '#ef9a9a' }}>{nsfCount} events</div>
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginTop: 3 }}>Including returned MCA payments</div>
                </div>
              )}
              {mcaVariance > 10000 && (
                <div style={{ background: 'rgba(255,152,0,0.1)', border: '1px solid rgba(255,152,0,0.25)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginBottom: 4 }}>MCA Payment Variance</div>
                  <div style={{ fontSize: 18, color: '#ffd54f' }}>{fmt(mcaVariance)}</div>
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginTop: 3 }}>Month-to-month swing in MCA burden</div>
                </div>
              )}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,152,0,0.2)', paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Counter-Argument if Funder Claims No Hardship:</div>
              <div style={{ fontSize: 12, color: '#e8e8f0', lineHeight: 1.8, fontStyle: 'italic' }}>
                "The average free cash figure reflects gross revenue minus scheduled MCA payments. It does not account for extraordinary cash events, payment timing gaps, returned items, or the compounding effect of {(a.mca_positions||[]).length} simultaneous daily/weekly pulls. The bank statement ending balance of {fmtD(endBal)} and {totalDaysNeg} days in negative territory during the statement period is objective proof of operational insolvency — not a projection, but a documented reality. A merchant cannot be 'flush with cash' and simultaneously overdrawn."
              </div>
            </div>
          </div>
        );
      })()}

      {/* Posture & Approach */}
      <div style={S.grid2}>
        <div style={S.card}>
          <div style={S.sectionTitle}>Negotiation Posture</div>
          <div style={{ fontSize: 20, color, marginBottom: 10 }}>{dsrLabel(posture)}</div>
          <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.6)', lineHeight: 1.7 }}>{intel.recommended_approach}</div>
        </div>
        <div style={S.card}>
          <div style={S.sectionTitle}>Strongest Leverage Point</div>
          <div style={{ fontSize: 13, color: '#EAD068', lineHeight: 1.7 }}>{intel.strongest_leverage_point}</div>
        </div>
      </div>

      {intel.impossibility_statement && (
        <div style={{ ...S.alert('critical'), padding: '16px 18px', marginBottom: 20 }}>
          <span>🔴</span>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Impossibility Statement</div>
            <div style={{ lineHeight: 1.7 }}>{intel.impossibility_statement}</div>
          </div>
        </div>
      )}

      {/* Per-funder revenue take */}
      {(a.mca_positions || []).length > 0 && (
        <>
          <div style={S.divider} />
          <div style={S.sectionTitle}>Per-Funder Revenue Take</div>
          {a.mca_positions.map((p, i) => {
            const pct = (p.estimated_monthly_total / (a.revenue.monthly_average_revenue || a.revenue.net_verified_revenue || 1)) * 100;
            return (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span>{p.funder_name}</span>
                  <span style={{ color: '#ef9a9a' }}>{fmt(p.estimated_monthly_total)}/mo — {fmtP(pct)} of revenue</span>
                </div>
                <div style={S.progressTrack}><div style={S.progressBar(pct, pct > 25 ? '#ef5350' : pct > 15 ? '#ff9800' : '#00acc1')} /></div>
              </div>
            );
          })}
        </>
      )}

      {m.weeks_to_insolvency && (
        <>
          <div style={S.divider} />
          <div style={S.alert('critical')}>
            <span>⏱️</span>
            <div>
              <strong>Projection:</strong> At current burn rate, approximately <strong>{m.weeks_to_insolvency} weeks</strong> until account reaches zero. This is the restructuring window.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Agreements Tab (NEW) ────────────────────────────────────────────────────
function AgreementsTab({ agreementResults }) {
  if (!agreementResults || agreementResults.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(232,232,240,0.4)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 15, marginBottom: 8 }}>No agreements analyzed yet</div>
        <div style={{ fontSize: 13 }}>Upload MCA agreements using the controls above, then analyze them.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={S.sectionTitle}>Analyzed Agreements ({agreementResults.length})</div>
      {agreementResults.map((ag, i) => {
        // API returns nested structure — unwrap all sub-objects
        const d = ag.analysis || ag;
        const ft = d.financial_terms || {};
        const fa = d.fee_analysis || {};
        const sc = d.state_compliance || {};
        const sa = d.stacking_analysis || {};
        const nl = d.negotiation_leverage || {};
        const rv = d.revenue_verification || {};

        // Derive flat fields from nested structure
        const purchasePrice   = ft.purchase_price || 0;
        const purchasedAmt    = ft.purchased_amount || 0;
        const factorRate      = ft.factor_rate || d.factor_rate || 0;
        const weeklyPayment   = ft.specified_weekly_payment || ft.specified_daily_payment * 7 || 0;
        const specifiedPct    = ft.specified_receivable_percentage || rv.withhold_percentage_stated || 0;
        const originationFee  = fa.origination_fee || 0;
        const netProceeds     = fa.net_proceeds_to_merchant || (purchasePrice - (fa.total_fees || 0)) || 0;
        const priorBalance    = (fa.other_fees || []).find(f => /prior|buyout|payoff/i.test(f.name))?.amount || 0;
        const govLaw          = sc.governing_law_state || d.governing_law || '—';

        // Clause flags — search problematic_clauses array
        const clauses = d.problematic_clauses || [];
        const protections = d.merchant_protections || [];
        const hasRecon       = protections.some(p => p.protection_type === 'reconciliation') || sa.notes?.toLowerCase().includes('reconcil');
        const hasAntiStack   = sa.has_anti_stacking_clause || clauses.some(c => c.clause_type === 'anti_stacking');
        const hasCOJ         = clauses.some(c => c.clause_type === 'coj');
        const hasArbitration = clauses.some(c => c.clause_type === 'arbitration') || d.agreement_type?.includes('arbitration');
        const hasJuryWaiver  = clauses.some(c => c.clause_type === 'jury_waiver');
        const hasPG          = clauses.some(c => c.clause_type === 'personal_guarantee');
        const hasUCC         = clauses.some(c => /ucc/i.test(c.clause_type));

        // COJ enforceability
        const cojClause = clauses.find(c => c.clause_type === 'coj');
        const cojUnenforceable = cojClause?.enforceability === 'unenforceable' || (hasCOJ && ['NY','New York'].includes(govLaw));

        // Reconciliation details
        const reconProtection = protections.find(p => p.protection_type === 'reconciliation');
        const reconDetails = reconProtection?.description || reconProtection?.merchant_action_required || '';

        // Anti-stacking details
        const antiStackClause = clauses.find(c => c.clause_type === 'anti_stacking');
        const antiStackDetails = antiStackClause?.clause_text_summary || sa.anti_stacking_text_summary || '';

        // Leverage notes
        const leverageNotes = nl.top_leverage_points?.join(' · ') || nl.recommended_approach || '';

        // Red flags
        const redFlags = d.contract_red_flags || [];

        return (
          <div key={i} style={{ ...S.card, background: 'rgba(255,255,255,0.04)', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, color: '#e8e8f0', marginBottom: 4 }}>{d.funder_name || d.buyer_name || 'Unknown Funder'}</div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)' }}>Dated: {d.agreement_date || '—'} · {ag.fileName || ''}</div>
              </div>
              <span style={S.tag('gold')}>{govLaw} LAW</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div><div style={S.statLabel}>Purchase Price</div><div style={{ fontSize: 15, color: '#00e5ff' }}>{fmt(purchasePrice)}</div></div>
              <div><div style={S.statLabel}>Payback Amount</div><div style={{ fontSize: 15, color: '#ef9a9a' }}>{fmt(purchasedAmt)}</div></div>
              <div><div style={S.statLabel}>Factor Rate</div><div style={{ fontSize: 15, color: '#e8e8f0' }}>{factorRate ? factorRate.toFixed(2) : '—'}</div></div>
              <div><div style={S.statLabel}>Weekly Payment</div><div style={{ fontSize: 15, color: '#ffd54f' }}>{fmtD(weeklyPayment)}</div></div>
              <div><div style={S.statLabel}>Specified %</div><div style={{ fontSize: 15, color: '#e8e8f0' }}>{specifiedPct ? specifiedPct + '%' : '—'}</div></div>
              <div><div style={S.statLabel}>Origination Fee</div><div style={{ fontSize: 15, color: '#e8e8f0' }}>{fmt(originationFee)}</div></div>
              <div><div style={S.statLabel}>Net to Merchant</div><div style={{ fontSize: 15, color: '#81c784' }}>{fmt(netProceeds)}</div></div>
              <div><div style={S.statLabel}>Prior Balance</div><div style={{ fontSize: 15, color: priorBalance > 0 ? '#ff9800' : '#e8e8f0' }}>{fmt(priorBalance)}</div></div>
            </div>

            <div style={S.divider} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {hasRecon      && <span style={S.tag('green')}>✓ Reconciliation</span>}
              {hasAntiStack  && <span style={S.tag('amber')}>Anti-Stacking</span>}
              {hasCOJ        && <span style={cojUnenforceable ? { ...S.tag('red'), textDecoration: 'line-through', opacity: 0.7 } : S.tag('red')}>COJ{cojUnenforceable ? ' (VOID)' : ''}</span>}
              {hasArbitration && <span style={{ ...S.tag('grey'), background: 'rgba(156,39,176,0.15)', color: '#ce93d8', border: '1px solid rgba(156,39,176,0.25)' }}>Arbitration</span>}
              {hasJuryWaiver && <span style={S.tag('grey')}>Jury Waiver</span>}
              {hasPG         && <span style={S.tag('red')}>PG</span>}
              {hasUCC        && <span style={S.tag('grey')}>UCC Filed</span>}
            </div>

            {reconDetails && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 8, background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', marginBottom: 8, fontSize: 12, color: '#80deea', lineHeight: 1.6 }}>
                <span>📋</span><div><strong>Reconciliation:</strong> {reconDetails}</div>
              </div>
            )}
            {antiStackDetails && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 8, background: 'rgba(249,168,37,0.06)', border: '1px solid rgba(249,168,37,0.15)', marginBottom: 8, fontSize: 12, color: '#ffd54f', lineHeight: 1.6 }}>
                <span>⚠️</span><div><strong>Anti-Stacking:</strong> {antiStackDetails}</div>
              </div>
            )}
            {leverageNotes && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 8, background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', marginBottom: 8, fontSize: 12, color: '#80deea', lineHeight: 1.6 }}>
                <span>💡</span><div><strong>Leverage:</strong> {leverageNotes}</div>
              </div>
            )}
            {redFlags.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {redFlags.filter(f => f.severity === 'critical').map((f, j) => (
                  <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 14px', borderRadius: 8, background: 'rgba(239,83,80,0.06)', border: '1px solid rgba(239,83,80,0.2)', marginBottom: 6, fontSize: 12, color: '#ef9a9a', lineHeight: 1.5 }}>
                    <span>🚩</span><div><strong>{f.flag}:</strong> {f.explanation}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Cross-Reference Tab (NEW) ───────────────────────────────────────────────
function CrossReferenceTab({ crossRefResult }) {
  if (!crossRefResult) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(232,232,240,0.4)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔄</div>
        <div style={{ fontSize: 15, marginBottom: 8 }}>Cross-reference not yet run</div>
        <div style={{ fontSize: 13 }}>Analyze bank statements and agreements first, then click "Run Cross-Reference" in the header.</div>
      </div>
    );
  }
  const cr = crossRefResult.analysis || crossRefResult;
  const comparisons = cr.position_comparisons || cr.comparisons || [];
  const violations = cr.violations || cr.discrepancies || [];
  const narrative = cr.stacking_narrative || cr.narrative || '';

  return (
    <div>
      {narrative && (
        <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.7)', lineHeight: 1.8, padding: '14px 18px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 16, whiteSpace: 'pre-line' }}>{narrative}</div>
      )}
      {comparisons.length > 0 && (
        <>
          <div style={S.sectionTitle}>Contract vs Reality</div>
          {comparisons.map((c, i) => (
            <div key={i} style={{ ...S.card, background: 'rgba(255,255,255,0.04)', padding: 16 }}>
              <div style={{ fontSize: 15, color: '#e8e8f0', marginBottom: 10 }}>{c.funder_name || c.funder}</div>
              <div style={S.grid3}>
                <div><div style={S.statLabel}>Contract Payment</div><div style={{ fontSize: 15, color: '#ffd54f' }}>{fmtD(c.contracted_payment || c.contract_amount)}</div></div>
                <div><div style={S.statLabel}>Actual Payment</div><div style={{ fontSize: 15, color: '#00e5ff' }}>{fmtD(c.actual_payment || c.bank_amount)}</div></div>
                <div><div style={S.statLabel}>Difference</div><div style={{ fontSize: 15, color: Math.abs(c.difference || 0) > 1 ? '#ef5350' : '#4caf50' }}>{fmtD(c.difference || 0)}</div></div>
              </div>
              {c.notes && <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)', marginTop: 8 }}>{c.notes}</div>}
            </div>
          ))}
        </>
      )}
      {violations.length > 0 && (
        <>
          <div style={S.sectionTitle}>Violations & Discrepancies</div>
          {violations.map((v, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 8, fontSize: 13, lineHeight: 1.6, marginBottom: 8, ...(v.severity === 'critical' ? { background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.25)', color: '#ef9a9a' } : { background: 'rgba(249,168,37,0.1)', border: '1px solid rgba(249,168,37,0.25)', color: '#ffd54f' }) }}>
              <span>{v.severity === 'critical' ? '🔴' : '🟡'}</span>
              <div><strong>{v.funder || v.category}:</strong> {v.description || v.message}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Confidence Tab (NEW) ────────────────────────────────────────────────────
function ConfidenceTab({ a }) {
  const positions = a.mca_positions || [];
  const flags = a.flags_and_alerts || [];
  const highConf = positions.filter(p => p.confidence === 'high').length;
  const medConf = positions.filter(p => p.confidence === 'medium').length;
  const lowConf = positions.filter(p => p.confidence === 'low').length;
  const total = positions.length || 1;

  return (
    <div>
      <div style={S.row}>
        <div style={S.stat}>
          <div style={S.statLabel}>High Confidence</div>
          <div style={S.statValue('#4caf50')}>{highConf}/{total}</div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 8 }}><div style={S.progressBar((highConf/total)*100, '#4caf50')} /></div>
        </div>
        <div style={S.stat}>
          <div style={S.statLabel}>Medium Confidence</div>
          <div style={S.statValue('#ff9800')}>{medConf}/{total}</div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 8 }}><div style={S.progressBar((medConf/total)*100, '#ff9800')} /></div>
        </div>
        <div style={S.stat}>
          <div style={S.statLabel}>Low Confidence</div>
          <div style={S.statValue('#ef5350')}>{lowConf}/{total}</div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 8 }}><div style={S.progressBar((lowConf/total)*100, '#ef5350')} /></div>
        </div>
      </div>
      <div style={S.divider} />
      <div style={S.sectionTitle}>Position Confidence Detail</div>
      {positions.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: i%2===0 ? 'rgba(255,255,255,0.03)' : 'transparent', borderRadius: 6 }}>
          <div>
            <div style={{ fontSize: 13, color: '#e8e8f0' }}>{p.funder_name}</div>
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>{p.payments_detected || 0} payments detected · {p.status || 'active'}</div>
          </div>
          <span style={S.tag(p.confidence === 'high' ? 'green' : p.confidence === 'low' ? 'red' : 'amber')}>{p.confidence || 'unknown'}</span>
        </div>
      ))}
      {flags.length > 0 && (
        <>
          <div style={S.divider} />
          <div style={S.sectionTitle}>Analysis Alerts ({flags.length})</div>
          {flags.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 8, fontSize: 12, lineHeight: 1.6, marginBottom: 6, ...(f.severity === 'critical' ? { background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.25)', color: '#ef9a9a' } : f.severity === 'warning' ? { background: 'rgba(249,168,37,0.1)', border: '1px solid rgba(249,168,37,0.25)', color: '#ffd54f' } : { background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', color: '#80deea' }) }}>
              <span>{f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : 'ℹ️'}</span>
              <div><strong>{f.category}:</strong> {f.message}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Export Tab ───────────────────────────────────────────────────────────────
function ExportTab({ a, fileName, positions, excludedIds, otherExcludedIds, excludedDepositIds }) {
  const activePositions = (positions || a.mca_positions || []).filter(p => !(excludedIds || []).includes(p._id));
  const totalMCAMonthly = activePositions.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0);
  const activeOther = (a.other_debt_service || []).filter((_, i) => !(otherExcludedIds || []).includes(i));
  const totalOtherDebt = activeOther.reduce((s, o) => s + (o.monthly_total || 0), 0);
  const revenue = calcAdjustedRevenue(a, excludedDepositIds);
  const dsr = (totalMCAMonthly / revenue) * 100;
  const totalDSR = ((totalMCAMonthly + totalOtherDebt) / revenue) * 100;
  const trueFree = revenue - totalMCAMonthly - totalOtherDebt - (a.expense_categories?.total_operating_expenses || 0);
  const csv = buildCSV(a, activePositions, totalMCAMonthly, dsr, totalOtherDebt, totalDSR, trueFree, revenue);
  const uwParams = new URLSearchParams({
    monthly_revenue: Math.round(a.revenue.monthly_average_revenue || a.revenue.net_verified_revenue),
    avg_daily_balance: Math.round(a.calculated_metrics.avg_daily_balance),
    business_name: a.business_name,
    bank_verified: 'true',
  });
  const downloadCSV = () => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a2 = document.createElement('a');
    a2.href = url;
    a2.download = `FF-Analysis-${(a.business_name || 'export').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    a2.click();
    URL.revokeObjectURL(url);
  };
  const copyJSON = () => navigator.clipboard.writeText(JSON.stringify(a, null, 2));
  return (
    <div>
      <div style={S.sectionTitle}>UW Calculator Integration</div>
      <div style={{ ...S.alert('info'), marginBottom: 20 }}>
        <span>ℹ️</span>
        <div>These bank-verified numbers are ready to pre-populate the UW Calculator Bank tab. Monthly revenue of <strong>{fmt(a.revenue.monthly_average_revenue || a.revenue.net_verified_revenue)}</strong> replaces any merchant-reported figure.</div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <button style={S.btn('primary')} onClick={downloadCSV}>⬇ Download CSV</button>
        <button style={S.btn('secondary')} onClick={copyJSON}>📋 Copy Full JSON</button>
      </div>

      <div style={S.sectionTitle}>CSV Export Preview</div>
      <div style={S.exportBox}>{csv}</div>

      <div style={{ ...S.divider, marginTop: 24 }} />
      <div style={S.sectionTitle}>Analysis Metadata</div>
      <div style={S.grid2}>
        <div style={S.stat}><div style={S.statLabel}>Source File</div><div style={{ fontSize: 13, color: '#e8e8f0', wordBreak: 'break-all' }}>{fileName}</div></div>
        <div style={S.stat}><div style={S.statLabel}>Analyzed</div><div style={{ fontSize: 13, color: '#e8e8f0' }}>{new Date().toLocaleString()}</div></div>
        <div style={S.stat}><div style={S.statLabel}>Statement Period</div><div style={{ fontSize: 13, color: '#e8e8f0' }}>{a.statement_month}</div></div>
        <div style={S.stat}><div style={S.statLabel}>Transaction Count</div><div style={{ fontSize: 13, color: '#e8e8f0' }}>{(a.raw_transaction_summary?.total_credit_transactions || 0) + (a.raw_transaction_summary?.total_debit_transactions || 0)} total</div></div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Trend Tab ────────────────────────────────────────────────────────────────
function TrendTab({ a }) {
  const trend = a.revenue_trend;
  const monthly = a.monthly_breakdown || [];

  if (!trend && monthly.length === 0) {
    return (
      <div style={{ color: 'rgba(232,232,240,0.4)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
        Upload multiple months to see revenue trend analysis
      </div>
    );
  }

  const revenues = trend?.monthly_revenues || monthly.map(m => ({ month: m.month, amount: m.net_verified_revenue }));
  const maxRev = Math.max(...revenues.map(r => r.amount), 1);

  return (
    <div>
      {/* Summary stats */}
      <div style={S.row}>
        {trend?.three_month_avg > 0 && (
          <div style={{ ...S.stat, flex: 1 }}>
            <div style={S.statLabel}>3-Month Avg Revenue</div>
            <div style={S.statValue('#00e5ff')}>{fmt(trend.three_month_avg)}</div>
          </div>
        )}
        {trend?.six_month_avg > 0 && (
          <div style={{ ...S.stat, flex: 1 }}>
            <div style={S.statLabel}>6-Month Avg Revenue</div>
            <div style={S.statValue('#EAD068')}>{fmt(trend.six_month_avg)}</div>
          </div>
        )}
        {trend?.trend_direction && (
          <div style={{ ...S.stat, flex: 1 }}>
            <div style={S.statLabel}>Revenue Trend</div>
            <div style={S.statValue(trend.trend_direction === 'growing' ? '#4caf50' : trend.trend_direction === 'declining' ? '#ef5350' : '#e8e8f0')}>
              {trend.trend_direction === 'growing' ? '↑' : trend.trend_direction === 'declining' ? '↓' : '→'} {trend.trend_direction}
            </div>
            {trend.revenue_volatility && <div style={S.statSub}>{trend.revenue_volatility} volatility</div>}
          </div>
        )}
      </div>

      {/* Bar chart */}
      {revenues.length > 0 && (
        <>
          <div style={S.divider} />
          <div style={S.sectionTitle}>Monthly Revenue</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 160, marginBottom: 8, padding: '0 4px' }}>
            {revenues.map((r, i) => {
              const pct = (r.amount / maxRev) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)' }}>{fmt(r.amount)}</div>
                  <div style={{ width: '100%', background: `linear-gradient(180deg, #00e5ff, #00acc1)`, borderRadius: '4px 4px 0 0', height: `${Math.max(pct, 3)}%`, transition: 'height 0.4s ease', opacity: 0.8 + (i / revenues.length) * 0.2 }} />
                  <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', textAlign: 'center', lineHeight: 1.3 }}>{r.month}</div>
                </div>
              );
            })}
          </div>
          {(trend?.peak_month || trend?.lowest_month) && (
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'rgba(232,232,240,0.45)', marginTop: 4 }}>
              {trend.peak_month && <span>📈 Peak: {trend.peak_month}</span>}
              {trend.lowest_month && <span>📉 Low: {trend.lowest_month}</span>}
            </div>
          )}
        </>
      )}

      {/* Monthly breakdown table */}
      {monthly.length > 0 && (
        <>
          <div style={S.divider} />
          <div style={S.sectionTitle}>Month-by-Month Breakdown</div>
          <div style={{ ...S.tableHeader, gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 0.5fr 0.5fr' }}>
            <span>Month / Account</span><span>Revenue</span><span>MCA Pmts</span><span>End Balance</span><span>Deposits</span><span>NSF</span><span>Neg Days</span>
          </div>
          {monthly.map((m, i) => (
            <div key={i} style={{ ...S.tableRow(i), gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 0.5fr 0.5fr' }}>
              <div>
                <div style={{ fontSize: 13 }}>{m.month}</div>
                {m.account_label && <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>{m.account_label}</div>}
              </div>
              <span style={{ color: '#00e5ff' }}>{fmt(m.net_verified_revenue)}</span>
              <span style={{ color: '#ef9a9a' }}>{fmt(m.total_mca_payments)}</span>
              <span style={{ color: m.ending_balance < 0 ? '#ef5350' : '#e8e8f0' }}>{fmtD(m.ending_balance)}</span>
              <span>{fmt(m.gross_deposits)}</span>
              <span style={{ color: m.nsf_count > 0 ? '#ef5350' : 'rgba(232,232,240,0.4)' }}>{m.nsf_count || 0}</span>
              <span style={{ color: m.days_negative > 0 ? '#ff9800' : 'rgba(232,232,240,0.4)' }}>{m.days_negative || 0}</span>
            </div>
          ))}
        </>
      )}

      {/* Accounts */}
      {(a.accounts || []).length > 0 && (
        <>
          <div style={S.divider} />
          <div style={S.sectionTitle}>Accounts Analyzed</div>
          {a.accounts.map((acc, i) => (
            <div key={i} style={{ ...S.tableRow(i), gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{acc.account_label}</span>
              <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)' }}>{acc.bank_name}</span>
              <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)' }}>···{acc.account_number}</span>
              <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)' }}>{(acc.months_provided || []).join(', ')}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function FFAnalyzer() {
  // ─── Upload state ───────────────────────────────────────────────────────────
  const [uploadedFiles, setUploadedFiles] = useState([]); // [{id, file, text, accountLabel, month, bankName, acctNum, status, error}]
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [model, setModel] = useState('opus');
  const [positions, setPositions] = useState([]);
  const [excludedIds, setExcludedIds] = useState([]);
  const [otherExcludedIds, setOtherExcludedIds] = useState([]);
  const [excludedDepositIds, setExcludedDepositIds] = useState([]);
  const inputRef = useRef(null);

  const TABS = ['📊 Revenue', '📈 Trend', '🏦 MCA Positions', '⚠️ Risk', '🤝 Negotiation', '📋 Agreements', '🔄 Cross-Ref', '🎯 Confidence', '⬇️ Export'];

  // ─── Agreement state ─────────────────────────────────────────
  const [uploadedAgreements, setUploadedAgreements] = useState([]);
  const [agreementResults, setAgreementResults] = useState([]);
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [crossRefResult, setCrossRefResult] = useState(null);
  const [crossRefLoading, setCrossRefLoading] = useState(false);
  const agreementInputRef = useRef(null);

  // ─── PDF helpers ────────────────────────────────────────────────────────────
  const loadPDFJS = async () => {
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = resolve; script.onerror = reject;
        document.head.appendChild(script);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  };

  const extractPDFText = async (pdfFile) => {
    await loadPDFJS();
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text;
  };

  const renderPDFAsImages = async (pdfFile) => {
    await loadPDFJS();
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images = [];
    // Only render first 15 pages to control cost — check copies are at the end anyway
    const pagesToRender = Math.min(pdf.numPages, 12);
    for (let i = 1; i <= pagesToRender; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      images.push(canvas.toDataURL('image/jpeg', 0.55).split(',')[1]); // base64
    }
    return images;
  };

  const scanAsImages = async (id, file) => {
    setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'detecting', error: null } : f));
    try {
      const images = await renderPDFAsImages(file);
      // Quick detect on first page image
      const res = await fetch('/api/detect-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '', fileName: file.name, images: [images[0]] }),
      });
      const data = await res.json();
      setUploadedFiles(prev => prev.map(f => f.id === id ? {
        ...f,
        images,
        text: null,
        isScanned: true,
        accountLabel: data.info?.account_name || file.name.replace('.pdf',''),
        month: data.info?.statement_month || 'Unknown',
        bankName: data.info?.bank_name || '',
        acctNum: data.info?.account_number || '',
        status: 'ready',
      } : f));
    } catch (err) {
      setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: 'Image scan failed: ' + err.message } : f));
    }
  };

  const scanWithClaude = async (id, file, scanModel = 'sonnet') => {
    setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'detecting', error: null } : f));
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('model', scanModel);
      const res = await fetch('/api/scan-statement', { method: 'POST', body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status}). Try again or switch models.`);
      }
      const data = await res.json();
      const a = data.analysis || {};
      setUploadedFiles(prev => prev.map(f => f.id === id ? {
        ...f,
        text: data.text_content || a.text_content || '',
        isScanned: true,
        accountLabel: a.business_name || file.name.replace('.pdf',''),
        month: a.statement_month || 'Unknown',
        bankName: a.bank_name || '',
        acctNum: a.account_last4 || '',
        status: (data.text_content || a.text_content || '').length > 100 ? 'ready' : 'error',
        error: (data.text_content || a.text_content || '').length > 100 ? null : 'Scan returned insufficient text. Try Opus.',
      } : f));
    } catch (err) {
      setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: err.message } : f));
    }
  };

  const stripCheckImages = (text) => {
    const markers = ['CHECK IMAGES', 'Check Images', 'IMAGE OF CHECK', 'DEPOSITED ITEMS',
      'Deposited Items', 'CHECK COPIES', 'Check Copies', 'CHECKS PAID IMAGES', 'ITEM IMAGES'];
    let end = text.length;
    for (const m of markers) {
      const idx = text.indexOf(m);
      if (idx > 0 && idx < end) end = idx;
    }
    return text.slice(0, Math.min(end, 80000));
  };

  // ─── File drop handler ──────────────────────────────────────────────────────

  // ─── Agreement upload handler ──────────────────────────────────────────────
  const onAgreementDrop = useCallback(async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || e.target?.files || []);
    if (!files.length) return;
    const newEntries = files.map(f => ({ id: Date.now() + Math.random(), file: f, name: f.name, status: 'pending' }));
    setUploadedAgreements(prev => [...prev, ...newEntries]);
  }, []);

  const analyzeAgreements = async () => {
    const pending = uploadedAgreements.filter(a => a.status === 'pending' || a.status === 'ready');
    if (!pending.length) return;
    setAgreementLoading(true);
    for (const ag of pending) {
      try {
        setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'analyzing' } : a));
        let text = '';
        try { text = await extractPDFText(ag.file); } catch(e) { text = ''; }
        let res;
        if (text && text.trim().length > 200) {
          res = await fetch('/api/analyze-agreement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, fileName: ag.name, model }) });
        } else {
          const formData = new FormData();
          formData.append('pdf', ag.file);
          formData.append('model', model);
          res = await fetch('/api/analyze-agreement', { method: 'POST', body: formData });
        }
        const data = await res.json();
        if (data.analysis) {
          setAgreementResults(prev => [...prev, { fileName: ag.name, analysis: data.analysis }]);
          setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'done' } : a));
        } else {
          setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'error', error: data.error || 'Failed' } : a));
        }
      } catch (err) {
        setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'error', error: err.message } : a));
      }
    }
    setAgreementLoading(false);
  };

  const runCrossReference = async () => {
    if (!result?.analysis) { alert('Run bank statement analysis first.'); return; }
    if (agreementResults.length === 0) { alert('Analyze at least one MCA agreement first.'); return; }
    setCrossRefLoading(true);
    setCrossRefResult(null);
    try {
      const res = await fetch('/api/cross-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankAnalysis: result.analysis, agreements: agreementResults.map(a => a.analysis), model })
      });
      const data = await res.json();
      if (data.analysis) {
        setCrossRefResult(data);
        setActiveTab(6);
      } else {
        alert('Cross-reference failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Cross-reference request failed: ' + err.message);
    }
    setCrossRefLoading(false);
  };

  // ─── File drop handler ──────────────────────────────────────────────────────
  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer?.files || e.target?.files || []);
    if (!files.length) return;

    const newEntries = files.map(f => ({
      id: Date.now() + Math.random(),
      file: f,
      text: null,
      accountLabel: f.name.replace('.pdf','').replace(/-/g,' '),
      month: 'Detecting…',
      bankName: '',
      acctNum: '',
      status: 'detecting', // detecting | ready | error
      error: null,
    }));

    setUploadedFiles(prev => [...prev, ...newEntries]);
    setError(null);
    setResult(null);

    // Process each file: extract text + detect metadata
    for (const entry of newEntries) {
      try {
        const text = await extractPDFText(entry.file);
        const stripped = stripCheckImages(text);
        if (!stripped || stripped.trim().length < 100) {
          setUploadedFiles(prev => prev.map(f => f.id === entry.id
            ? { ...f, status: 'needs_scan', error: 'Scanned PDF — choose a scan method below' } : f));
          continue;
        }
        // Quick detect via Haiku
        const res = await fetch('/api/detect-statement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: stripped, fileName: entry.file.name }),
        });
        const data = await res.json();
        setUploadedFiles(prev => prev.map(f => f.id === entry.id ? {
          ...f,
          text: stripped,
          accountLabel: data.info?.account_name || entry.accountLabel,
          month: data.info?.statement_month || 'Unknown',
          bankName: data.info?.bank_name || '',
          acctNum: data.info?.account_number || '',
          status: 'ready',
        } : f));
      } catch (err) {
        setUploadedFiles(prev => prev.map(f => f.id === entry.id
          ? { ...f, status: 'error', error: err.message } : f));
      }
    }
  }, []);

  const removeFile = (id) => setUploadedFiles(prev => prev.filter(f => f.id !== id));
  const updateLabel = (id, val) => setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, accountLabel: val } : f));
  const updateMonth = (id, val) => setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, month: val } : f));

  // ─── Analyze ─────────────────────────────────────────────────────────────────
  const analyze = async () => {
    const ready = uploadedFiles.filter(f => f.status === 'ready' && (f.text || (f.images && f.images.length > 0)));
    if (!ready.length) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const msgs = [
      `Extracting data from ${ready.length} statement${ready.length > 1 ? 's' : ''}…`,
      'Detecting MCA positions across accounts…',
      'Deduplicating cross-account transfers…',
      'Building revenue trend…',
      'Calculating DSR and cash flow…',
      'Building negotiation intel…',
    ];
    let mi = 0;
    setLoadingMsg(msgs[0]);
    const interval = setInterval(() => { if (mi < msgs.length - 1) setLoadingMsg(msgs[++mi]); }, 3000);

    try {
      const statements = ready.map(f => ({
        accountLabel: f.accountLabel,
        month: f.month,
        text: f.text || null,
        images: f.images || null,
        isScanned: f.isScanned || false,
      }));
      const endpoint = statements.length === 1 ? '/api/analyze' : '/api/analyze-multi';
      const body = statements.length === 1
        ? { text: statements[0].text, fileName: ready[0].file.name, model }
        : { statements, model };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      clearInterval(interval);
      if (!res.ok || data.error) { setError(data.error || 'Analysis failed'); setLoading(false); return; }
      setResult(data);
      setPositions((data.analysis.mca_positions || []).map((p, i) => ({ ...p, _id: i })));
      setExcludedIds([]);
      setOtherExcludedIds([]);
      setActiveTab(0);
    } catch (e) {
      clearInterval(interval);
      setError(e.message);
    }
    setLoading(false);
  };

  const reset = () => {
    setUploadedFiles([]); setResult(null); setError(null);
    setPositions([]); setExcludedIds([]); setOtherExcludedIds([]); setExcludedDepositIds([]);
    setUploadedAgreements([]); setAgreementResults([]); setCrossRefResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const readyCount = uploadedFiles.filter(f => f.status === 'ready' && (f.text || (f.images && f.images.length > 0))).length;
  const detectingCount = uploadedFiles.filter(f => f.status === 'detecting').length;

  return (
    <div style={S.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

      {/* Header */}
      <div style={S.header}>
        <div style={S.logo}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="rgba(0,229,255,0.1)" stroke="rgba(0,229,255,0.25)" strokeWidth="1"/>
            <path d="M10 26 L18 10 L26 26" stroke="#00e5ff" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
            <path d="M13 22 L23 22" stroke="#EAD068" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <div>
            <div style={S.logoText}>Funders <span style={S.logoAccent}>First</span></div>
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)', letterSpacing: 1.5 }}>FF ANALYZER v2</div>
          </div>
        </div>
        <span style={S.badge}>BANK STATEMENT & MCA AGREEMENT ANALYSIS</span>
      </div>

      {!result && !loading && (
        <div>
          {/* Drop zone */}
          <div
            style={S.dropzone(dragging)}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => uploadedFiles.length === 0 && inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={onDrop} />
            <div style={S.dropIcon}>📂</div>
            <div style={S.dropTitle}>Drop bank statements here</div>
            <div style={S.dropSub}>Up to 6 months · Multiple accounts · PDFs only</div>
            <button style={{ ...S.btn('secondary'), fontSize: 12, marginTop: 8 }}
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
              Browse Files
            </button>
          </div>

          {/* File cards */}
          {uploadedFiles.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 16 }}>
                {uploadedFiles.map(f => (
                  <div key={f.id} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${f.status === 'error' ? 'rgba(239,83,80,0.3)' : f.status === 'needs_scan' ? 'rgba(249,168,37,0.3)' : f.status === 'ready' ? 'rgba(76,175,80,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📄 {f.file.name}
                      </div>
                      <button onClick={() => removeFile(f.id)} style={{ background: 'none', border: 'none', color: 'rgba(232,232,240,0.3)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
                    </div>
                    {f.status === 'detecting' && (
                      <div style={{ fontSize: 12, color: '#00e5ff', animation: 'pulse 1s infinite' }}>⏳ Detecting…</div>
                    )}
                    {f.status === 'error' && (
                      <div>
                        <div style={{ fontSize: 12, color: '#ef9a9a', marginBottom: 8 }}>⚠ {f.error}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button onClick={() => scanWithClaude(f.id, f.file, 'sonnet')} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.08)', color: '#00e5ff', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>🔍 Scan (Sonnet)</button>
                          <button onClick={() => scanWithClaude(f.id, f.file, 'opus')} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(76,175,80,0.3)', background: 'rgba(76,175,80,0.08)', color: '#4caf50', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>🔍 Scan (Opus)</button>
                          <button onClick={() => scanAsImages(f.id, f.file)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(234,208,104,0.3)', background: 'rgba(234,208,104,0.08)', color: '#EAD068', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>📷 As Images</button>
                        </div>
                      </div>
                    )}
                    {f.status === 'needs_scan' && (
                      <div>
                        <div style={{ fontSize: 12, color: '#ffd54f', marginBottom: 8 }}>📷 NEEDS SCAN — scanned PDF detected</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button onClick={() => scanWithClaude(f.id, f.file, 'sonnet')} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.08)', color: '#00e5ff', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>🔍 Scan with Claude (Sonnet)</button>
                          <button onClick={() => scanWithClaude(f.id, f.file, 'opus')} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(76,175,80,0.3)', background: 'rgba(76,175,80,0.08)', color: '#4caf50', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>🔍 Scan with Opus</button>
                          <button onClick={() => scanAsImages(f.id, f.file)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(234,208,104,0.3)', background: 'rgba(234,208,104,0.08)', color: '#EAD068', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>📷 Scan as Images</button>
                        </div>
                      </div>
                    )}
                    {f.status === 'ready' && (
                      <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <span style={S.tag('green')}>TEXT READY</span>
                          {f.isScanned && <span style={S.tag('gold')}>SCANNED</span>}
                        </div>
                        {f.isScanned && <div style={{ fontSize: 11, color: '#ffd54f', marginBottom: 6 }}>📷 Scanned · {(f.images||[]).length > 0 ? (f.images.length + ' pages rendered') : 'OCR complete'}</div>}
                        <input
                          value={f.accountLabel}
                          onChange={e => updateLabel(f.id, e.target.value)}
                          placeholder="Account name"
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit', marginBottom: 6, boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)' }}>📅</span>
                          <input
                            value={f.month}
                            onChange={e => updateMonth(f.id, e.target.value)}
                            placeholder="Month YYYY"
                            style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#e8e8f0', fontSize: 12, fontFamily: 'inherit' }}
                          />
                          {f.bankName && <span style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)' }}>{f.bankName}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#4caf50', marginTop: 8 }}>✓ Ready</div>
                      </>
                    )}
                  </div>
                ))}

                {/* Add more button */}
                {uploadedFiles.length < 12 && (
                  <div
                    onClick={() => inputRef.current?.click()}
                    style={{ border: '2px dashed rgba(255,255,255,0.12)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 120, color: 'rgba(232,232,240,0.3)', fontSize: 13 }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>＋</div>
                    Add more
                  </div>
                )}
              </div>

              {/* Action bar */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  style={{ ...S.btn('primary'), opacity: readyCount === 0 || detectingCount > 0 ? 0.5 : 1 }}
                  disabled={readyCount === 0 || detectingCount > 0}
                  onClick={analyze}>
                  🔍 Analyze {readyCount} Statement{readyCount !== 1 ? 's' : ''}
                </button>
                <button style={S.btn('secondary')} onClick={reset}>✕ Clear All</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px' }}>
                  <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)' }}>Model:</span>
                  <button onClick={() => setModel('opus')} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: model === 'opus' ? 'rgba(0,229,255,0.2)' : 'transparent', color: model === 'opus' ? '#00e5ff' : 'rgba(232,232,240,0.45)' }}>Opus</button>
                  <button onClick={() => setModel('sonnet')} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: model === 'sonnet' ? 'rgba(234,208,104,0.2)' : 'transparent', color: model === 'sonnet' ? '#EAD068' : 'rgba(232,232,240,0.45)' }}>Sonnet ⚡</button>
                </div>
                {detectingCount > 0 && <span style={{ fontSize: 12, color: '#00e5ff', animation: 'pulse 1s infinite' }}>Detecting {detectingCount} file{detectingCount > 1 ? 's' : ''}…</span>}
              </div>
            </div>
          )}

          {error && (
            <div style={{ ...S.alert('critical'), marginTop: 20 }}>
              <span>🔴</span><div><strong>Error:</strong> {error}</div>
            </div>
          )}

          {/* Agreement upload section */}
          {uploadedFiles.length > 0 && (
            <div style={{ marginTop: 16, marginBottom: 20 }}>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '16px 0' }} />
              <div style={{ fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(232,232,240,0.5)', marginBottom: 12 }}>📋 MCA Agreements (Optional)</div>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)', marginBottom: 12 }}>Upload MCA agreements for contract analysis & cross-referencing against bank data</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <input ref={agreementInputRef} type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={onAgreementDrop} />
                <button style={{ ...S.btn('secondary'), padding: '8px 16px', fontSize: 12 }} onClick={() => agreementInputRef.current?.click()}>📎 Add Agreements</button>
                {uploadedAgreements.length > 0 && <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)' }}>{uploadedAgreements.length} loaded</span>}
              </div>
              {uploadedAgreements.map(ag => (
                <span key={ag.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(234,208,104,0.08)', border: '1px solid rgba(234,208,104,0.2)', borderRadius: 6, padding: '3px 8px', marginRight: 6, marginBottom: 4, fontSize: 11 }}>
                  <span style={{ color: '#EAD068' }}>📋</span>
                  <span style={{ color: 'rgba(232,232,240,0.6)' }}>{ag.name.slice(0, 25)}{ag.name.length > 25 ? '…' : ''}</span>
                  <button onClick={() => setUploadedAgreements(prev => prev.filter(a => a.id !== ag.id))} style={{ background: 'none', border: 'none', color: 'rgba(232,232,240,0.3)', cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>
                </span>
              ))}
            </div>
          )}

          {/* Info cards */}
          {uploadedFiles.length === 0 && (
            <div style={{ ...S.grid3, marginTop: 32 }}>
              {[
                { icon: '🏦', title: 'Any Bank Format', body: 'Beverly Bank, Chase, BOA, credit unions — up to 6 months per account' },
                { icon: '📋', title: 'Agreement Analysis', body: 'Upload MCA contracts for clause extraction, reconciliation rights, and stacking detection' },
                { icon: '🔄', title: 'Cross-Reference Engine', body: 'Compares contract terms vs actual bank debits — catches overpayments, violations, and discrepancies' },
              ].map((c, i) => (
                <div key={i} style={S.card}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{c.icon}</div>
                  <div style={S.sectionTitle}>{c.title}</div>
                  <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.5)', lineHeight: 1.7 }}>{c.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div style={S.loadingOverlay}>
          <div style={S.spinner} />
          <div style={{ fontSize: 16, color: '#00e5ff', marginBottom: 8 }}>Analyzing…</div>
          <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.45)' }}>{loadingMsg}</div>
        </div>
      )}

      {result && result.analysis && (
        <div>
          {/* Business header */}
          <div style={{ ...S.card, background: 'rgba(0,0,0,0.2)', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 22, color: '#e8e8f0', marginBottom: 4 }}>{result.analysis.business_name}</div>
                <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.45)' }}>
                  {result.statement_count > 1
                    ? `${result.statement_count} statements analyzed · ${(result.analysis.accounts || []).length} account${(result.analysis.accounts||[]).length !== 1 ? 's' : ''}`
                    : `${result.analysis.bank_name} · ${result.analysis.account_number} · ${result.analysis.statement_month}`}
                </div>
                {result.analysis.analysis_summary && (
                  <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)', marginTop: 6, maxWidth: 600, lineHeight: 1.6 }}>{result.analysis.analysis_summary}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={S.tag(getTagColor(result.analysis.negotiation_intel?.dsr_posture))}>
                  {fmtP(
                    (positions.reduce((s,p) => !excludedIds.includes(p._id) ? s + (p.estimated_monthly_total||0) : s, 0) +
                    (result.analysis.other_debt_service||[]).reduce((s,o) => s + (o.monthly_total||0), 0)) /
                    ((result.analysis.revenue?.monthly_average_revenue || result.analysis.revenue?.net_verified_revenue) || 1) * 100
                  )} DSR
                </span>
                <span style={S.tag((result.analysis.balance_summary?.ending_balance ?? result.analysis.balance_summary?.most_recent_ending_balance) < 0 ? 'red' : 'green')}>
                  {(result.analysis.balance_summary?.ending_balance ?? result.analysis.balance_summary?.most_recent_ending_balance) < 0 ? '⚠ Negative Balance' : '✓ Positive Balance'}
                </span>
                <button style={{ ...S.btn('secondary'), padding: '6px 14px', fontSize: 12 }} onClick={reset}>↩ New Analysis</button>
                <button style={{ ...S.btn('secondary'), padding: '6px 14px', fontSize: 12 }} onClick={analyze}>🔄 Re-analyze</button>
              </div>
            </div>
            {/* Post-analysis agreement controls */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 16, paddingTop: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input ref={agreementInputRef} type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={onAgreementDrop} />
                <button style={{ ...S.btn('secondary'), padding: '6px 12px', fontSize: 11 }} onClick={() => agreementInputRef.current?.click()}>📎 Add Agreements</button>
                {uploadedAgreements.filter(a => a.status !== 'done').length > 0 && (
                  <button style={{ ...S.btn('gold'), padding: '6px 12px', fontSize: 11, opacity: agreementLoading ? 0.5 : 1 }} onClick={analyzeAgreements} disabled={agreementLoading}>
                    {agreementLoading ? '⏳ Analyzing…' : `📋 Analyze ${uploadedAgreements.filter(a => a.status !== 'done').length} Agreement${uploadedAgreements.filter(a => a.status !== 'done').length > 1 ? 's' : ''}`}
                  </button>
                )}
                {agreementResults.length > 0 && (
                  <button style={{ ...S.btn('primary'), padding: '6px 12px', fontSize: 11, opacity: crossRefLoading ? 0.5 : 1 }} onClick={runCrossReference} disabled={crossRefLoading}>
                    {crossRefLoading ? '⏳ Cross-referencing…' : '🔄 Run Cross-Reference'}
                  </button>
                )}
                {uploadedAgreements.map(ag => (
                  <span key={ag.id} style={{ fontSize: 10, color: ag.status === 'done' ? '#81c784' : ag.status === 'error' ? '#ef9a9a' : 'rgba(232,232,240,0.4)' }}>
                    {ag.name.slice(0,18)}{ag.name.length>18?'…':''} [{ag.status}]
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={S.tabs}>
            {TABS.map((t, i) => <button key={i} style={S.tab(activeTab === i)} onClick={() => setActiveTab(i)}>{t}</button>)}
          </div>

          <div style={S.card}>
            {activeTab === 0 && <RevenueTab a={result.analysis} excludedDepositIds={excludedDepositIds} setExcludedDepositIds={setExcludedDepositIds} />}
            {activeTab === 1 && <TrendTab a={result.analysis} />}
            {activeTab === 2 && <MCATab a={result.analysis} positions={positions} setPositions={setPositions} excludedIds={excludedIds} setExcludedIds={setExcludedIds} otherExcludedIds={otherExcludedIds} setOtherExcludedIds={setOtherExcludedIds} excludedDepositIds={excludedDepositIds} />}
            {activeTab === 3 && <RiskTab a={result.analysis} positions={positions} excludedIds={excludedIds} otherExcludedIds={otherExcludedIds} excludedDepositIds={excludedDepositIds} />}
            {activeTab === 4 && <NegotiationTab a={result.analysis} positions={positions} excludedIds={excludedIds} otherExcludedIds={otherExcludedIds} excludedDepositIds={excludedDepositIds} />}
            {activeTab === 5 && <AgreementsTab agreementResults={agreementResults} />}
            {activeTab === 6 && <CrossReferenceTab crossRefResult={crossRefResult} />}
            {activeTab === 7 && <ConfidenceTab a={result.analysis} />}
            {activeTab === 8 && <ExportTab a={result.analysis} fileName={result.file_name || 'analysis'} positions={positions} excludedIds={excludedIds} otherExcludedIds={otherExcludedIds} excludedDepositIds={excludedDepositIds} />}
          </div>
        </div>
      )}
    </div>
  );
}

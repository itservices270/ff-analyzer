'use client';
import React, { useState, useMemo } from 'react';

// ─── Formatting helpers (mirrors page.jsx) ───────────────────────────────────
const fmt = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (n) => (parseFloat(n) || 0).toFixed(1) + '%';

function toWeeklyEquiv(payment, frequency) {
  if (frequency === 'daily') return payment * 5;
  if (frequency === 'bi-weekly') return payment / 2;
  return payment;
}

function calcAdjustedRevenue(a, depositOverrides) {
  const periods = a.statement_periods || a.monthly_breakdown || [];
  if (!depositOverrides || Object.keys(depositOverrides).length === 0) {
    return a.calculated_metrics?.avg_monthly_revenue || a.revenue?.monthly_average || 0;
  }
  let totalAdj = 0; let count = 0;
  periods.forEach((p, pi) => {
    const base = p.total_deposits || p.deposits || 0;
    const overrides = depositOverrides[pi] || {};
    let adj = base;
    Object.values(overrides).forEach(v => { adj += (v - 0); });
    totalAdj += adj; count++;
  });
  return count > 0 ? totalAdj / count : (a.calculated_metrics?.avg_monthly_revenue || 0);
}

function matchAgreementToPosition(positionName, agreementResults) {
  if (!positionName || !agreementResults || agreementResults.length === 0) return null;
  const pName = (positionName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const pTokens = (positionName || '').toLowerCase().split(/\s+/).filter(t => t.length > 2);
  return (agreementResults || []).find(ag => {
    const agName = (ag?.analysis?.funder_name || '').toLowerCase();
    if (!agName) return false;
    const agNorm = agName.replace(/[^a-z0-9]/g, '');
    if (agNorm && pName && (agNorm.includes(pName.slice(0, 8)) || pName.includes(agNorm.slice(0, 8)))) return true;
    const agTokens = agName.split(/\s+/).filter(t => t.length > 2);
    const overlap = pTokens.filter(t => agTokens.some(at => at.includes(t) || t.includes(at)));
    if (agTokens.length > 0 && overlap.length / Math.max(agTokens.length, pTokens.length) >= 0.5) return true;
    const pFirst = pTokens[0] || '';
    const agFirst = agTokens[0] || '';
    return pFirst.length > 3 && agFirst.length > 3 && (agFirst.includes(pFirst) || pFirst.includes(agFirst));
  }) || null;
}

function getContractWeekly(agMatch) {
  if (!agMatch?.analysis) return null;
  const ag = agMatch.analysis;
  const w = ag.weekly_payment || ag.financial_terms?.specified_weekly_payment || 0;
  if (w > 0) return w;
  const d = ag.daily_payment || ag.financial_terms?.specified_daily_payment || 0;
  if (d > 0) return d * 5;
  return null;
}

// ─── Graduated ISO Commission Rate ───────────────────────────────────────────
// Points 1-5: 0.75% per point, 6-10: 1.00% per point, 11-15: 1.25% per point
function getGraduatedCommissionRate(points) {
  if (points <= 0) return 0;
  if (points > 15) points = 15;
  let rate = 0;
  const tier1Points = Math.min(points, 5);
  rate += tier1Points * 0.0075;
  if (points > 5) {
    const tier2Points = Math.min(points - 5, 5);
    rate += tier2Points * 0.01;
  }
  if (points > 10) {
    const tier3Points = Math.min(points - 10, 5);
    rate += tier3Points * 0.0125;
  }
  return rate;
}

// ─── Position Deduplication ──────────────────────────────────────────────────
function normalizeFunderKey(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/advance\d*|position[a-z]?|pos[a-z]?|\(.*?\)/g, '').trim();
}

function deduplicatePositions(allPositions, balances, positionStatuses, agreementResults) {
  const groups = {};
  const groupOrder = [];
  allPositions.forEach((p, i) => {
    const key = normalizeFunderKey(p.funder_name);
    const firstWord = (p.funder_name || '').toLowerCase().split(/\s+/)[0];
    const matchKey = key.length >= 6 ? key : (firstWord.length >= 4 ? firstWord : `_pos_${i}`);
    let foundGroup = null;
    for (const gk of groupOrder) {
      const gKey = normalizeFunderKey(groups[gk].positions[0].funder_name);
      if (matchKey.length >= 6 && gKey.length >= 6 && (matchKey.includes(gKey.slice(0, 6)) || gKey.includes(matchKey.slice(0, 6)))) {
        foundGroup = gk;
        break;
      }
    }
    if (foundGroup) {
      groups[foundGroup].positions.push(p);
      groups[foundGroup].indices.push(i);
    } else {
      groups[matchKey] = { positions: [p], indices: [i] };
      groupOrder.push(matchKey);
    }
  });
  return groupOrder.map(gk => {
    const g = groups[gk];
    if (g.positions.length === 1) {
      const i = g.indices[0];
      return {
        ...g.positions[0], _dedupId: gk, _sourceIndices: [i], _advanceCount: 1,
        _consolidatedBalance: parseFloat(balances[i]) || 0,
        _consolidatedStatus: positionStatuses[i] || 'include',
        _consolidatedWeekly: toWeeklyEquiv(g.positions[0].payment_amount_current || g.positions[0].payment_amount || 0, g.positions[0].frequency),
      };
    }
    const primary = g.positions[0];
    const cleanName = primary.funder_name.replace(/\s*\(Advance\s*\d+\)/i, '').replace(/\s*\(Position\s*[A-Z]\)/i, '').trim();
    const totalBalance = g.indices.reduce((s, i) => s + (parseFloat(balances[i]) || 0), 0);
    const totalWeekly = g.positions.reduce((s, p) => s + toWeeklyEquiv(p.payment_amount_current || p.payment_amount || 0, p.frequency), 0);
    const statuses = g.indices.map(i => positionStatuses[i] || 'include');
    const consolidatedStatus = statuses.includes('include') ? 'include' : statuses.includes('buyout') ? 'buyout' : statuses[0];
    const agMatch = (agreementResults || []).find(ag => {
      const agName = (ag?.analysis?.funder_name || '').toLowerCase();
      const pName = cleanName.toLowerCase();
      return agName && pName && (agName.includes(pName.split(' ')[0]) || pName.includes(agName.split(' ')[0]));
    });
    const agBalance = agMatch?.analysis?.financial_terms?.purchased_amount;
    const finalBalance = agBalance ? Math.round(agBalance) : totalBalance;
    return {
      ...primary, funder_name: cleanName, _dedupId: gk, _sourceIndices: g.indices, _advanceCount: g.positions.length,
      _advances: g.positions.map(p => ({
        name: p.funder_name, payment: p.payment_amount_current || p.payment_amount || 0, frequency: p.frequency,
        weekly: toWeeklyEquiv(p.payment_amount_current || p.payment_amount || 0, p.frequency),
        depositAmount: p.advance_deposit_amount || 0, depositDate: p.advance_deposit_date || null,
      })),
      _consolidatedBalance: finalBalance, _consolidatedStatus: consolidatedStatus, _consolidatedWeekly: totalWeekly,
      payment_amount_current: totalWeekly, frequency: 'weekly', estimated_monthly_total: totalWeekly * 4.33,
    };
  });
}

// ─── TAD-Isolated Waterfall ──────────────────────────────────────────────────
// TAD = merchant weekly minus FF fee ONLY. ISO commission layered ON TOP.
function calcWaterfall({ merchantWeeklyToFF, totalDebtStack, ffFeePct, isoPoints, maxTermWeeks }) {
  const ffFeePerWeek = maxTermWeeks > 0 ? (totalDebtStack * ffFeePct) / maxTermWeeks : 0;
  const tad = merchantWeeklyToFF - ffFeePerWeek;
  const isoCommRate = getGraduatedCommissionRate(isoPoints);
  const isoCommPerWeek = maxTermWeeks > 0 ? (totalDebtStack * isoCommRate) / maxTermWeeks : 0;
  const merchantTotalWeekly = Math.max(tad, 0) + ffFeePerWeek + isoCommPerWeek;
  return { merchantWeeklyToFF, ffFeePerWeek, isoCommPerWeek, isoCommRate, tad: Math.max(tad, 0), totalDebtStack, maxTermWeeks, merchantTotalWeekly };
}

// ─── Per-funder tier calculations (from TAD only — ISO-independent) ──────────
function calcFunderTiers(funders, tad, agreementResults) {
  const totalBalance = funders.reduce((s, f) => s + f.balance, 0);
  if (totalBalance <= 0 || tad <= 0) return [];

  const tierDefs = [
    { key: 'email1', label: 'Opening Proposal', pct: 0.80 },
    { key: 'email2', label: 'Revised Proposal', pct: 0.90 },
    { key: 'email3', label: 'Final Proposal', pct: 1.00 },
  ];

  const funderData = funders.map(f => {
    const actualWeekly = toWeeklyEquiv(f.payment, f.frequency);
    const agMatch = matchAgreementToPosition(f.name, agreementResults);
    const contractWeekly = getContractWeekly(agMatch);
    const effectiveWeekly = (contractWeekly && contractWeekly > 0) ? contractWeekly : actualWeekly;
    const originalRemainingWeeks = effectiveWeekly > 0 ? f.balance / effectiveWeekly : 52;
    return { ...f, actualWeekly, contractWeekly, effectiveWeekly, originalRemainingWeeks, agMatch };
  });

  const totalOriginalWeeklyBurden = funderData.reduce((s, fd) => s + fd.effectiveWeekly, 0);

  return funderData.map(fd => {
    const allocation = tad * (fd.balance / totalBalance);
    const originalTermWeeks = Math.round(fd.originalRemainingWeeks);

    const tiers = tierDefs.map(td => {
      const tierTAD = tad * td.pct;
      const multiplier = tierTAD > 0 ? totalOriginalWeeklyBurden / tierTAD : 9999;
      const proposedTermWeeks = Math.ceil(fd.originalRemainingWeeks * multiplier);
      const weeklyPayment = proposedTermWeeks > 0 ? fd.balance / proposedTermWeeks : 0;
      const extensionWeeks = proposedTermWeeks - originalTermWeeks;
      const extensionPct = originalTermWeeks > 0 ? ((proposedTermWeeks / originalTermWeeks) - 1) * 100 : 0;
      const reductionDollars = fd.effectiveWeekly - weeklyPayment;
      const reductionPct = fd.effectiveWeekly > 0 ? (reductionDollars / fd.effectiveWeekly) * 100 : 0;
      return { ...td, weeklyPayment, proposedTermWeeks, extensionWeeks, extensionPct, reductionDollars, reductionPct, totalRepayment: fd.balance, multiplier };
    });

    return { ...fd, allocation, originalWeekly: fd.actualWeekly, originalTermWeeks, tiers };
  });
}

// ─── Shared Styles ───────────────────────────────────────────────────────────
const sectionTitle = { fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(232,232,240,0.5)', marginBottom: 16 };
const divider = { borderTop: '1px solid rgba(255,255,255,0.08)', margin: '16px 0' };

// ═════════════════════════════════════════════════════════════════════════════
// PricingTab Component
// ═════════════════════════════════════════════════════════════════════════════
export default function PricingTab({ a, positions, excludedIds, otherExcludedIds, depositOverrides, agreementResults, enrolledPositions }) {
  const allPositions = (positions || a.mca_positions || []).filter(p => !(excludedIds || []).includes(p._id));
  const revenue = calcAdjustedRevenue(a, depositOverrides);

  // ── Deal Economics state ──
  const [isoPoints, setIsoPoints] = useState(11);
  const [ffFeePct, setFfFeePct] = useState(0.119);
  const [merchantWeeklyOverride, setMerchantWeeklyOverride] = useState('');

  // ── Position status: 'include' | 'buyout' | 'exclude' ──
  const [positionStatuses, setPositionStatuses] = useState(() => {
    const init = {};
    allPositions.forEach((p, i) => {
      const status = (p.status || '').toLowerCase().replace(/[_\s]+/g, '');
      init[i] = (status === 'paidoff') ? 'exclude' : 'include';
    });
    return init;
  });

  // ── Balance overrides ──
  const [balances, setBalances] = useState(() => {
    const init = {};
    allPositions.forEach((p, i) => {
      const agMatch = (agreementResults || []).find(ag => {
        if (!ag?.analysis?.funder_name) return false;
        const agName = ag.analysis.funder_name.toLowerCase();
        const pName = (p.funder_name || '').toLowerCase();
        return agName.includes(pName.split(' ')[0]) || pName.includes(agName.split(' ')[0]);
      });
      const weekly = toWeeklyEquiv(p.payment_amount_current || p.payment_amount || 0, p.frequency);
      const agBalance = agMatch?.analysis?.financial_terms?.purchased_amount;
      init[i] = agBalance ? Math.round(agBalance) : Math.round(weekly * 52);
    });
    return init;
  });

  // Deduplicate positions
  const dedupedPositions = useMemo(
    () => deduplicatePositions(allPositions, balances, positionStatuses, agreementResults),
    [JSON.stringify(allPositions.map(p => p.funder_name)), JSON.stringify(balances), JSON.stringify(positionStatuses)]
  );

  // Enrollment check
  const isPositionEnrolled = (dp) => {
    if (dp._consolidatedStatus === 'paid_off' || dp._consolidatedStatus === 'exclude') return false;
    const mcaStatus = (dp.status || '').toLowerCase().replace(/[_\s]+/g, '');
    if (mcaStatus === 'paidoff') return false;
    if (enrolledPositions === null) return true;
    if (!(enrolledPositions instanceof Set)) return true;
    return dp._sourceIndices.some(idx => enrolledPositions.has(allPositions[idx]?._id));
  };

  const uwFunders = dedupedPositions.map((dp, i) => ({
    id: i,
    name: dp.funder_name || `Funder ${i + 1}`,
    payment: dp._consolidatedWeekly,
    frequency: 'weekly',
    balance: dp._consolidatedBalance > 0 ? dp._consolidatedBalance : (parseFloat(balances[dp._sourceIndices[0]]) || 0),
    status: dp._consolidatedStatus,
    enrolled: isPositionEnrolled(dp),
    _advanceCount: dp._advanceCount,
    _advances: dp._advances || null,
    _sourceIndices: dp._sourceIndices,
  }));

  const includedFunders = uwFunders.filter(f => f.status === 'include' && f.balance > 0 && f.enrolled);
  const includedDebt = includedFunders.reduce((s, f) => s + f.balance, 0);
  const includedCurrentWeekly = includedFunders.reduce((s, f) => s + toWeeklyEquiv(f.payment, f.frequency), 0);

  // ── Graduated commission ──
  const commissionRate = getGraduatedCommissionRate(isoPoints);
  const commissionTotal = includedDebt * commissionRate;

  // ── Merchant weekly to FF (default = 50% of current burden) ──
  const defaultMerchantWeekly = includedCurrentWeekly * 0.5;
  const merchantWeeklyToFF = merchantWeeklyOverride ? parseFloat(merchantWeeklyOverride) : defaultMerchantWeekly;

  // ── Max term for fee amortization ──
  const maxTermForFees = useMemo(() => {
    if (includedFunders.length === 0 || merchantWeeklyToFF <= 0) return 52;
    const estimatedTad = merchantWeeklyToFF * 0.85;
    const totalBurden = includedFunders.reduce((s, f) => s + toWeeklyEquiv(f.payment, f.frequency), 0);
    const multiplier = estimatedTad > 0 ? totalBurden / estimatedTad : 1;
    const longestTerm = Math.max(...includedFunders.map(f => {
      const weekly = toWeeklyEquiv(f.payment, f.frequency);
      const remaining = weekly > 0 ? f.balance / weekly : 52;
      return Math.ceil(remaining * multiplier);
    }));
    return Math.max(longestTerm, 4);
  }, [JSON.stringify(includedFunders), merchantWeeklyToFF]);

  // ── Waterfall (TAD isolated from ISO) ──
  const waterfall = useMemo(() =>
    calcWaterfall({ merchantWeeklyToFF, totalDebtStack: includedDebt, ffFeePct, isoPoints, maxTermWeeks: maxTermForFees }),
    [merchantWeeklyToFF, includedDebt, ffFeePct, isoPoints, maxTermForFees]
  );

  // ── Per-funder tier calculations (derived from TAD only) ──
  const funderTiers = useMemo(() =>
    calcFunderTiers(includedFunders, waterfall.tad, agreementResults),
    [JSON.stringify(includedFunders), waterfall.tad, JSON.stringify(agreementResults)]
  );

  // Reserves
  const reserveAt80 = waterfall.tad * 0.20;
  const reserveAt90 = waterfall.tad * 0.10;

  // Proposed DSR (what merchant pays total)
  const proposedMerchantMonthly = waterfall.merchantTotalWeekly * 4.33;
  const proposedDSR = revenue > 0 ? (proposedMerchantMonthly / revenue) * 100 : 0;
  const currentDSR = revenue > 0 ? ((includedCurrentWeekly * 4.33) / revenue) * 100 : 0;
  const reductionPct = includedCurrentWeekly > 0 ? ((includedCurrentWeekly - waterfall.merchantTotalWeekly) / includedCurrentWeekly) * 100 : 0;

  // Tier colors
  const tierColors = ['#00bcd4', '#f59e0b', '#ef5350'];
  const tierLabels = ['Opening (80%)', 'Revised (90%)', 'Final (100%)'];

  const statusColors = { include: '#00e5ff', buyout: '#CFA529', exclude: 'rgba(232,232,240,0.3)', paid_off: '#4caf50' };
  const statusLabels = { include: 'Include', buyout: 'Buyout', exclude: 'Exclude', paid_off: 'Paid Off' };

  return (
    <div>
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 1. DEAL ECONOMICS (internal only)                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div style={sectionTitle}>Deal Economics (Internal — Never Exported)</div>
      <div style={{ background: 'rgba(207,165,41,0.06)', border: '1px solid rgba(207,165,41,0.2)', borderRadius: 12, padding: 20, marginBottom: 20 }}>

        {/* ISO Points Slider */}
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)' }}>ISO Commission Points</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#EAD068' }}>{isoPoints} pts</div>
          </div>
          <input type="range" min={0} max={15} step={1} value={isoPoints} onChange={e => setIsoPoints(Number(e.target.value))} style={{ width: '100%', accentColor: '#EAD068' }} />
          <div style={{ fontSize: 11, color: '#EAD068', fontWeight: 700, textAlign: 'center', marginTop: 4 }}>
            Commission: {(commissionRate * 100).toFixed(2)}% ({fmt(commissionTotal)})
          </div>
          {/* Graduated tier breakdown */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 6 }}>
            {[
              { range: '1-5', rate: '0.75%', active: isoPoints >= 1 },
              { range: '6-10', rate: '1.00%', active: isoPoints >= 6 },
              { range: '11-15', rate: '1.25%', active: isoPoints >= 11 },
            ].map((t, i) => (
              <div key={i} style={{ fontSize: 10, color: t.active ? 'rgba(234,208,104,0.7)' : 'rgba(232,232,240,0.25)', textAlign: 'center' }}>
                Pts {t.range}: {t.rate}/pt
              </div>
            ))}
          </div>
        </div>

        {/* FF Fee + Merchant Weekly + Total Debt */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>FF Fee %</label>
            <input type="number" value={ffFeePct} onChange={e => setFfFeePct(Number(e.target.value) || 0)} min={0} max={1} step={0.001} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(207,165,41,0.3)', background: 'rgba(0,0,0,0.3)', color: '#EAD068', fontSize: 16, fontFamily: 'inherit', fontWeight: 700, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Merchant Wkly to FF</label>
            <input type="number" value={merchantWeeklyOverride} onChange={e => setMerchantWeeklyOverride(e.target.value)} placeholder={fmt(defaultMerchantWeekly)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(207,165,41,0.3)', background: 'rgba(0,0,0,0.3)', color: '#EAD068', fontSize: 16, fontFamily: 'inherit', fontWeight: 700, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Total Included Debt</label>
            <div style={{ fontSize: 16, color: '#ef5350', fontWeight: 700, padding: '8px 0' }}>{fmt(includedDebt)}</div>
          </div>
        </div>

        {/* Waterfall KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 12 }}>
          {[
            { label: 'TAD / Week', value: fmtD(waterfall.tad), color: '#00e5ff' },
            { label: 'ISO Comm / Wk', value: fmtD(waterfall.isoCommPerWeek), color: '#CFA529' },
            { label: 'FF Fee / Wk', value: fmtD(waterfall.ffFeePerWeek), color: '#CFA529' },
            { label: 'Reserve @80%', value: fmtD(reserveAt80 > 0 ? reserveAt80 : 0), color: '#4caf50' },
            { label: 'Reserve @90%', value: fmtD(reserveAt90 > 0 ? reserveAt90 : 0), color: '#4caf50' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Waterfall explanation */}
        <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)' }}>
          TAD (isolated): {fmt(merchantWeeklyToFF)} merchant weekly → −{fmtD(waterfall.ffFeePerWeek)} FF fee = {fmtD(waterfall.tad)} TAD
          {' · '}Merchant total: {fmtD(waterfall.tad)} TAD + {fmtD(waterfall.ffFeePerWeek)} FF + {fmtD(waterfall.isoCommPerWeek)} ISO = {fmtD(waterfall.merchantTotalWeekly)}/wk
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 2. MERCHANT IMPACT SUMMARY                                    */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div style={divider} />
      <div style={sectionTitle}>Merchant Impact Summary</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Current Weekly', value: fmt(includedCurrentWeekly), color: '#ef5350' },
          { label: 'Proposed Weekly', value: fmtD(waterfall.merchantTotalWeekly), color: '#00e5ff' },
          { label: 'Payment Reduction', value: fmtP(reductionPct), color: reductionPct > 0 ? '#4caf50' : '#ef5350' },
          { label: 'Proposed DSR', value: fmtP(proposedDSR), sub: `(was ${fmtP(currentDSR)})`, color: proposedDSR < currentDSR ? '#4caf50' : '#f59e0b' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 3. POSITION MANAGEMENT                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div style={divider} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={sectionTitle}>Positions ({includedFunders.length} enrolled)</div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {uwFunders.map((f, i) => {
          const st = f.status;
          const isExcluded = st !== 'include';
          const isPaidOff = st === 'paid_off';
          const isEnrolled = f.enrolled;
          const nameColor = isPaidOff ? '#4caf50' : isExcluded ? 'rgba(232,232,240,0.4)' : '#e8e8f0';
          const borderColor = isPaidOff ? 'rgba(76,175,80,0.3)' : isExcluded ? 'rgba(255,255,255,0.06)' : isEnrolled ? 'rgba(0,229,255,0.2)' : 'rgba(255,200,50,0.2)';
          return (
            <div key={i} style={{ flex: '1 1 200px', background: isExcluded ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)', border: `1px solid ${borderColor}`, borderRadius: 10, padding: '12px 14px', opacity: isExcluded && !isPaidOff ? 0.5 : isPaidOff ? 0.65 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: nameColor, fontWeight: 600 }}>{f.name}</span>
                {isPaidOff && <span style={{ fontSize: 9, background: 'rgba(76,175,80,0.2)', color: '#4caf50', padding: '1px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>PAID OFF</span>}
                {f._advanceCount > 1 && <span style={{ fontSize: 9, background: 'rgba(0,229,255,0.15)', color: '#00e5ff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{f._advanceCount} advances</span>}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 4 }}>{fmt(toWeeklyEquiv(f.payment, f.frequency))}/wk · {fmt(f.balance)} bal</div>
              <input type="number" value={(() => { const idx = f._sourceIndices[0]; return balances[idx] || ''; })()} onChange={e => { const updates = {}; f._sourceIndices.forEach(idx => { updates[idx] = e.target.value; }); setBalances(b => ({ ...b, ...updates })); }} placeholder="Balance $" style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 6 }} />
              {st === 'include' && (
                <div style={{ fontSize: 10, marginBottom: 4, color: isEnrolled ? '#00e5ff' : '#ffd54f', fontWeight: 600, letterSpacing: 0.3 }}>
                  {isEnrolled ? '✓ Enrolled' : 'DSR only — enroll in MCA tab'}
                </div>
              )}
              <div style={{ display: 'flex', gap: 3 }}>
                {['include', 'buyout', 'exclude', 'paid_off'].map(s2 => (
                  <button key={s2} onClick={() => { const updates = {}; f._sourceIndices.forEach(idx => { updates[idx] = s2; }); setPositionStatuses(prev => ({ ...prev, ...updates })); }} style={{ flex: 1, padding: '4px 1px', borderRadius: 5, fontSize: 9, fontWeight: 600, cursor: 'pointer', border: `1px solid ${st === s2 ? statusColors[s2] : 'rgba(255,255,255,0.08)'}`, background: st === s2 ? `${statusColors[s2]}22` : 'transparent', color: st === s2 ? statusColors[s2] : 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.2, fontFamily: 'inherit' }}>
                    {statusLabels[s2]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 4. TERM COMPARISON TABLE                                      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {funderTiers.length > 0 && (
        <>
          <div style={divider} />
          <div style={sectionTitle}>Per-Position Breakdown — Original vs Proposed Terms</div>
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 16, marginBottom: 20, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {['Funder', 'Balance', 'Current Pmt', 'Orig Term', '80% TAD', '90% TAD', '100% TAD'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Funder' ? 'left' : 'right', fontSize: 10, color: 'rgba(232,232,240,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {funderTiers.map((ft, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px 8px', color: '#e8e8f0', fontWeight: 600 }}>{ft.name}</td>
                    <td style={{ padding: '8px 8px', color: '#ef9a9a', textAlign: 'right' }}>{fmt(ft.balance)}</td>
                    <td style={{ padding: '8px 8px', color: 'rgba(232,232,240,0.5)', textAlign: 'right' }}>{fmt(ft.originalWeekly)}/wk</td>
                    <td style={{ padding: '8px 8px', color: 'rgba(232,232,240,0.4)', textAlign: 'right' }}>
                      {ft.originalTermWeeks} wks
                      <br /><span style={{ fontSize: 9, color: 'rgba(232,232,240,0.3)' }}>~{Math.round(ft.originalTermWeeks / 4.33)} mo</span>
                    </td>
                    {ft.tiers.map((t, ti) => (
                      <td key={ti} style={{ padding: '8px 8px', color: tierColors[ti], textAlign: 'right', fontWeight: ti === 2 ? 700 : 400 }}>
                        <div>{fmtD(t.weeklyPayment)}/wk</div>
                        <div>{ft.originalTermWeeks} → {t.proposedTermWeeks} wks</div>
                        <div style={{ fontSize: 9, color: '#888' }}>+{t.extensionWeeks} wks ({(parseFloat(t.extensionPct) || 0).toFixed(0)}%)</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 5. FUNDER DETAIL CARDS                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {funderTiers.length > 0 && (
        <>
          <div style={divider} />
          <div style={sectionTitle}>Funder Position Cards</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {funderTiers.map((ft, fi) => (
              <div key={fi} style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 15, color: '#00e5ff', fontWeight: 700 }}>{ft.name}</span>
                    <span style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginLeft: 10 }}>{fmt(ft.balance)} bal · {fmt(ft.originalWeekly)}/wk current</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>
                    Share: {(ft.balance / includedDebt * 100).toFixed(1)}% · Alloc: {fmtD(ft.allocation)}/wk
                  </div>
                </div>

                {/* Original term display */}
                <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', marginBottom: 10, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                  Original Term: <strong style={{ color: 'rgba(232,232,240,0.8)' }}>{ft.originalTermWeeks} wks</strong> (~{Math.round(ft.originalTermWeeks / 4.33)} months)
                  {ft.contractWeekly > 0 && <span> · Contract: {fmtD(ft.contractWeekly)}/wk</span>}
                </div>

                {/* 3-tier grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {ft.tiers.map((t, ti) => (
                    <div key={ti} style={{ background: `${tierColors[ti]}08`, border: `1px solid ${tierColors[ti]}33`, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: tierColors[ti], marginBottom: 8 }}>{tierLabels[ti]}</div>
                      <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.6)', lineHeight: 1.8 }}>
                        <div>Payment: <strong style={{ color: tierColors[ti] }}>{fmtD(t.weeklyPayment)}/wk</strong></div>
                        <div>Reduction: <strong>{(parseFloat(t.reductionPct) || 0).toFixed(1)}%</strong> ({fmtD(t.reductionDollars)} less)</div>
                        <div>Term: <strong>{ft.originalTermWeeks} → {t.proposedTermWeeks} wks</strong></div>
                        <div style={{ color: '#888' }}>+{t.extensionWeeks} wks extension ({(parseFloat(t.extensionPct) || 0).toFixed(0)}%)</div>
                        <div>Repayment: <strong style={{ color: '#4caf50' }}>{fmt(t.totalRepayment)}</strong> (100%)</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 6. GRADUATED COMMISSION REFERENCE TABLE                       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div style={divider} />
      <div style={sectionTitle}>Graduated Commission Reference</div>
      <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 16, marginBottom: 20, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {['Points', 'Tier', 'Rate', `Commission on ${fmt(includedDebt)}`].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Points' || h === 'Tier' ? 'left' : 'right', fontSize: 10, color: 'rgba(232,232,240,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 16 }, (_, pts) => {
              const rate = getGraduatedCommissionRate(pts);
              const isActive = pts === isoPoints;
              const tier = pts === 0 ? '—' : pts <= 5 ? '1 (0.75%/pt)' : pts <= 10 ? '2 (1.00%/pt)' : '3 (1.25%/pt)';
              return (
                <tr key={pts} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isActive ? 'rgba(234,208,104,0.08)' : 'transparent' }}>
                  <td style={{ padding: '6px 10px', color: isActive ? '#EAD068' : '#e8e8f0', fontWeight: isActive ? 700 : 400 }}>{pts}</td>
                  <td style={{ padding: '6px 10px', color: isActive ? '#EAD068' : 'rgba(232,232,240,0.5)' }}>{tier}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: isActive ? '#EAD068' : 'rgba(232,232,240,0.6)', fontWeight: isActive ? 700 : 400 }}>{(rate * 100).toFixed(2)}%</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', color: isActive ? '#EAD068' : 'rgba(232,232,240,0.5)', fontWeight: isActive ? 700 : 400 }}>{fmt(includedDebt * rate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

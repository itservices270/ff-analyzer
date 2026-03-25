'use client';
import React, { useState, useMemo } from 'react';
import { scoreAllPositions, calculateAdjustedTAD } from '../../lib/scoringEngine';

// ─── Formatting helpers ──────────────────────────────────────────────────────
const fmt = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (n) => (parseFloat(n) || 0).toFixed(1) + '%';

function toWeeklyEquiv(payment, frequency) {
  if (frequency === 'daily') return payment * 5;
  if (frequency === 'bi-weekly') return payment / 2;
  return payment;
}

function calcAdjustedRevenue(a, depositOverrides) {
  const sources = a.revenue?.revenue_sources || [];
  const months = Math.max((a.monthly_breakdown || []).length, 1);
  if (!depositOverrides || Object.keys(depositOverrides).length === 0) {
    return a.revenue?.monthly_average_revenue || a.revenue?.net_verified_revenue || 1;
  }
  let total = 0;
  sources.forEach((src, i) => {
    const amt = src.monthly_avg || (src.total / months) || 0;
    const aiIncluded = !src.is_excluded;
    if (depositOverrides.hasOwnProperty(i)) {
      if (depositOverrides[i]) total += amt;
    } else {
      if (aiIncluded) total += amt;
    }
  });
  return Math.max(total, 1);
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
function getGraduatedCommissionRate(points) {
  if (points <= 0) return 0;
  if (points > 15) points = 15;
  let rate = 0;
  rate += Math.min(points, 5) * 0.0075;
  if (points > 5) rate += Math.min(points - 5, 5) * 0.01;
  if (points > 10) rate += Math.min(points - 10, 5) * 0.0125;
  return rate;
}

// ─── Position dedup helper ───────────────────────────────────────────────────
function normalizeFunderKey(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/advance\d*|position[a-z]?|pos[a-z]?|\(.*?\)/g, '').trim();
}

// ─── Shared inline style helpers ─────────────────────────────────────────────
const S = {
  section: { fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(232,232,240,0.5)', marginBottom: 12 },
  divider: { borderTop: '1px solid rgba(255,255,255,0.08)', margin: '16px 0' },
  kpiBox: (color) => ({ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', flex: 1, minWidth: 100 }),
  kpiLabel: { fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  kpiValue: (color) => ({ fontSize: 15, fontWeight: 700, color }),
};

// ═════════════════════════════════════════════════════════════════════════════
// PricingTab
// ═════════════════════════════════════════════════════════════════════════════
export default function PricingTab({ a, positions, excludedIds, otherExcludedIds, depositOverrides, agreementResults, enrolledPositions }) {
  // ── Get ALL positions, then filter to enrolled only ──
  // This mirrors how NegotiationTab finds enrolled positions
  const allPositions = (positions || a.mca_positions || []).filter(p => !(excludedIds || []).includes(p._id));
  const activePositions = allPositions.filter(p => {
    const status = (p.status || '').toLowerCase().replace(/[_\s]+/g, '');
    return status !== 'paidoff';
  });

  // Filter to enrolled positions using the same logic as MCA tab
  const enrolledActive = activePositions.filter(p => {
    if (enrolledPositions === null) return true; // null = all enrolled
    if (!(enrolledPositions instanceof Set)) return true;
    return enrolledPositions.has(p._id);
  });

  // ── Deduplicate enrolled positions (same-funder consolidation) ──
  const dedupEnrolled = useMemo(() => {
    const result = [];
    enrolledActive.forEach(p => {
      const key = normalizeFunderKey(p.funder_name);
      const matchKey = key.length >= 6 ? key : (p.funder_name || '').toLowerCase().split(/\s+/)[0];
      let found = false;
      for (const dp of result) {
        const dpKey = normalizeFunderKey(dp.funder_name);
        if (matchKey.length >= 6 && dpKey.length >= 6 && (matchKey.includes(dpKey.slice(0, 6)) || dpKey.includes(matchKey.slice(0, 6)))) {
          const advWeekly = toWeeklyEquiv(p.payment_amount_current || p.payment_amount || 0, p.frequency);
          const advAgMatch = matchAgreementToPosition(p.funder_name, agreementResults);
          const advBalance = advAgMatch?.analysis?.financial_terms?.purchased_amount
            ? Math.round(advAgMatch.analysis.financial_terms.purchased_amount)
            : (p.estimated_balance || Math.round(advWeekly * 52));
          dp._totalWeekly += advWeekly;
          dp._balance += advBalance;
          dp._advCount++;
          dp._advances.push({ label: p.funder_name, balance: advBalance, weekly: advWeekly });
          dp._sourcePositions.push(p);
          found = true;
          break;
        }
      }
      if (!found) {
        const agMatch = matchAgreementToPosition(p.funder_name, agreementResults);
        const weekly = toWeeklyEquiv(p.payment_amount_current || p.payment_amount || 0, p.frequency);
        const bal = agMatch?.analysis?.financial_terms?.purchased_amount
          ? Math.round(agMatch.analysis.financial_terms.purchased_amount)
          : (p.estimated_balance || Math.round(weekly * 52));
        result.push({
          ...p,
          funder_name: p.funder_name.replace(/\s*\(Advance\s*\d+\)/i, '').replace(/\s*\(Position\s*[A-Z]\)/i, '').trim(),
          _totalWeekly: weekly,
          _advCount: 1,
          _balance: bal,
          _advances: [{ label: p.funder_name, balance: bal, weekly }],
          _sourcePositions: [p],
          _agMatch: agMatch,
        });
      }
    });
    return result;
  }, [JSON.stringify(enrolledActive.map(p => p._id)), JSON.stringify(agreementResults?.map(a => a?.analysis?.funder_name))]);

  // ── Revenue & business metrics ──
  const revenue = calcAdjustedRevenue(a, depositOverrides);
  const cogs = a.expense_categories?.inventory_cogs || 0;
  const grossProfit = revenue - cogs;
  const opex = a.expense_categories?.total_operating_expenses || 0;
  const adb = a.balance_summary?.avg_daily_balance || a.calculated_metrics?.avg_daily_balance || 0;
  const biz = a.business_name || 'Business';

  // ── Totals ──
  const totalBalance = dedupEnrolled.reduce((s, dp) => s + dp._balance, 0);
  const totalCurrentWeekly = dedupEnrolled.reduce((s, dp) => s + dp._totalWeekly, 0);
  const currentDSR = revenue > 0 ? ((totalCurrentWeekly * 4.33) / revenue) * 100 : 0;

  // ── Deal Controls state ──
  const [isoPoints, setIsoPoints] = useState(11);
  const [targetDSR, setTargetDSR] = useState(22);
  const [ffMarginWeekly, setFfMarginWeekly] = useState('');
  const [enforcementWeighting, setEnforcementWeighting] = useState(false);

  // ── Score positions (for enforceability weighting) ──
  const scoredPositions = useMemo(() => {
    if (!enforcementWeighting) return null;
    const agMap = {};
    (agreementResults || []).forEach(ar => {
      const d = ar.analysis || ar;
      if (d.funder_name) agMap[d.funder_name] = d;
    });
    return scoreAllPositions(enrolledActive, agMap);
  }, [enforcementWeighting, JSON.stringify(enrolledActive.map(p => p._id)), JSON.stringify(agreementResults?.map(a => a?.analysis?.funder_name))]);

  // Score map by funder name
  const scoreMap = useMemo(() => {
    if (!scoredPositions) return {};
    const map = {};
    scoredPositions.forEach(sp => {
      const key = normalizeFunderKey(sp.funder_name);
      if (!map[key] && sp.funderIntel) map[key] = sp.funderIntel;
    });
    return map;
  }, [scoredPositions]);

  // ── Graduated commission ──
  const commissionRate = getGraduatedCommissionRate(isoPoints);
  const commissionTotal = totalBalance * commissionRate;
  const commissionWeekly = (ffMarginWeekly ? 78 : 78); // amortized below with maxTerm

  // ── TAD calculation (from target DSR) ──
  // Target DSR determines merchant weekly → TAD = merchant weekly - FF margin - (ISO comm amortized)
  const targetMerchantWeekly = (revenue * (targetDSR / 100)) / 4.33;
  const ffMargin = ffMarginWeekly ? parseFloat(ffMarginWeekly) : 0;

  // ── Tier definitions ──
  const tierDefs = [
    { key: 'opening', label: 'Opening', pct: 0.80 },
    { key: 'middle1', label: 'Middle 1', pct: 0.90 },
    { key: 'middle2', label: 'Middle 2', pct: 0.95 },
    { key: 'final', label: 'Final', pct: 1.00 },
  ];
  const tierColors = ['#00bcd4', '#7c3aed', '#f59e0b', '#22c55e'];

  // ── Per-funder tiers (TAD isolated from ISO) ──
  const pricingResult = useMemo(() => {
    if (dedupEnrolled.length === 0 || totalBalance <= 0) return { tad: 0, funderTiers: [], maxTerm: 0 };

    const totalOrigWeeklyBurden = dedupEnrolled.reduce((s, dp) => s + dp._totalWeekly, 0);

    // TAD = targetMerchantWeekly - FF margin (ISO sits on top, never reduces TAD)
    const tad = Math.max(targetMerchantWeekly - ffMargin, 0);

    // Per-funder tier calculations
    const funderTiers = dedupEnrolled.map(dp => {
      const agMatch = dp._agMatch || matchAgreementToPosition(dp.funder_name, agreementResults);
      const contractWeekly = getContractWeekly(agMatch);
      const effectiveWeekly = (contractWeekly && contractWeekly > 0) ? contractWeekly : dp._totalWeekly;
      const originalTermWeeks = effectiveWeekly > 0 ? Math.ceil(dp._balance / effectiveWeekly) : 52;
      const sharePct = dp._balance / totalBalance;

      // If enforceability weighting enabled, adjust share
      const fKey = normalizeFunderKey(dp.funder_name);
      const intel = scoreMap[fKey] || null;
      let adjustedShare = sharePct;
      if (enforcementWeighting && intel) {
        const totalComposite = dedupEnrolled.reduce((s, d2) => {
          const k2 = normalizeFunderKey(d2.funder_name);
          return s + (scoreMap[k2]?.composite || 5);
        }, 0);
        const normalizedScore = (intel.composite || 5) / totalComposite;
        adjustedShare = (sharePct * 0.60) + (normalizedScore * 0.40);
      }

      const tiers = tierDefs.map(td => {
        const tierTAD = tad * td.pct;
        const allocation = tierTAD * adjustedShare;
        const proposedTermWeeks = allocation > 0 ? Math.ceil(dp._balance / allocation) : 9999;
        const weeklyPayment = allocation;
        const extensionWeeks = proposedTermWeeks - originalTermWeeks;
        const extensionPct = originalTermWeeks > 0 ? ((proposedTermWeeks / originalTermWeeks) - 1) * 100 : 0;
        const reductionDollars = effectiveWeekly - weeklyPayment;
        const reductionPct = effectiveWeekly > 0 ? (reductionDollars / effectiveWeekly) * 100 : 0;
        return { ...td, weeklyPayment, proposedTermWeeks, extensionWeeks, extensionPct, reductionDollars, reductionPct, allocation };
      });

      return {
        name: dp.funder_name, balance: dp._balance, originalWeekly: dp._totalWeekly,
        effectiveWeekly, contractWeekly, originalTermWeeks, sharePct, adjustedShare,
        tiers, _advCount: dp._advCount, _advances: dp._advances, intel,
      };
    });

    const maxTerm = Math.max(...funderTiers.flatMap(ft => ft.tiers.map(t => t.proposedTermWeeks)).filter(t => t < 9999), 0);

    return { tad, funderTiers, maxTerm };
  }, [JSON.stringify(dedupEnrolled.map(dp => dp._balance + dp.funder_name)), targetMerchantWeekly, ffMargin, enforcementWeighting, JSON.stringify(scoreMap), totalBalance]);

  const { tad, funderTiers, maxTerm } = pricingResult;

  // ISO commission amortized over max term
  const isoCommWeekly = maxTerm > 0 ? commissionTotal / maxTerm : 0;
  const ffFeeWeekly = ffMargin;

  // Merchant pays = TAD + FF margin + ISO commission/wk
  const merchantPaysWeekly = tad + ffFeeWeekly + isoCommWeekly;
  const proposedDSR = revenue > 0 ? ((merchantPaysWeekly * 4.33) / revenue) * 100 : 0;
  const reductionPct = totalCurrentWeekly > 0 ? ((totalCurrentWeekly - merchantPaysWeekly) / totalCurrentWeekly) * 100 : 0;

  // Effective factor rate
  const totalMerchantPays = merchantPaysWeekly * maxTerm;
  const effectiveFactorRate = totalBalance > 0 ? totalMerchantPays / totalBalance : 0;

  if (enrolledActive.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(232,232,240,0.4)', fontSize: 14 }}>
        No positions enrolled in restructuring program.<br />
        <span style={{ fontSize: 12 }}>Enroll positions in the MCA Positions tab to start pricing.</span>
      </div>
    );
  }

  return (
    <div>
      {/* ═══════════════ MERCHANT SNAPSHOT BAR ═══════════════ */}
      <div style={{ background: 'linear-gradient(135deg, rgba(0,172,193,0.12), rgba(0,229,255,0.06))', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e8e8f0' }}>{biz}</div>
          <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>ISO: Funders First Inc.</div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Monthly Revenue', value: fmt(revenue), color: '#00e5ff' },
            { label: 'Gross Profit', value: fmt(grossProfit), color: '#4caf50' },
            { label: 'Avg Daily Bal', value: fmt(adb), color: '#e8e8f0' },
            { label: 'Current DSR', value: fmtP(currentDSR), color: currentDSR > 40 ? '#ef5350' : currentDSR > 25 ? '#f59e0b' : '#4caf50' },
            { label: 'Active Positions', value: String(dedupEnrolled.length), color: '#00e5ff' },
            { label: 'Weekly Burden', value: fmt(totalCurrentWeekly), color: '#ef5350' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════ DEAL CONTROLS ═══════════════ */}
      <div style={S.section}>Deal Controls</div>
      <div style={{ background: 'rgba(207,165,41,0.06)', border: '1px solid rgba(207,165,41,0.2)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 12 }}>
          {/* ISO Commission Points Slider */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)' }}>ISO Commission Points</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#EAD068' }}>{isoPoints} pts</div>
            </div>
            <input type="range" min={0} max={15} step={1} value={isoPoints} onChange={e => setIsoPoints(Number(e.target.value))} style={{ width: '100%', accentColor: '#EAD068' }} />
            <div style={{ fontSize: 11, color: '#EAD068', fontWeight: 700, textAlign: 'center', marginTop: 4 }}>
              Commission: {(commissionRate * 100).toFixed(2)}% ({fmt(commissionTotal)})
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
              {[
                { range: '1-5', rate: '0.75%', active: isoPoints >= 1 },
                { range: '6-10', rate: '1.00%', active: isoPoints >= 6 },
                { range: '11-15', rate: '1.25%', active: isoPoints >= 11 },
              ].map((t, i) => (
                <div key={i} style={{ fontSize: 9, color: t.active ? 'rgba(234,208,104,0.7)' : 'rgba(232,232,240,0.2)' }}>
                  Pts {t.range}: {t.rate}/pt
                </div>
              ))}
            </div>
          </div>

          {/* Target DSR Slider */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)' }}>Target DSR</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#00bcd4' }}>{targetDSR}%</div>
            </div>
            <input type="range" min={10} max={35} step={1} value={targetDSR} onChange={e => setTargetDSR(Number(e.target.value))} style={{ width: '100%', accentColor: '#00bcd4' }} />
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', textAlign: 'center', marginTop: 4 }}>
              Merchant weekly: {fmtD(targetMerchantWeekly)} ({fmt(targetMerchantWeekly * 4.33)}/mo)
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* FF Net Margin */}
          <div>
            <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>FF Net Margin / Week</label>
            <input type="number" value={ffMarginWeekly} onChange={e => setFfMarginWeekly(e.target.value)} placeholder="$0" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(207,165,41,0.3)', background: 'rgba(0,0,0,0.3)', color: '#EAD068', fontSize: 16, fontFamily: 'inherit', fontWeight: 700, boxSizing: 'border-box' }} />
          </div>
          {/* Enforceability Weighting */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={enforcementWeighting} onChange={e => setEnforcementWeighting(e.target.checked)} style={{ accentColor: '#EAD068', width: 16, height: 16 }} />
              <div>
                <div style={{ fontSize: 12, color: enforcementWeighting ? '#EAD068' : 'rgba(232,232,240,0.5)', fontWeight: 600 }}>Enable Enforceability Weighting</div>
                <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.35)' }}>Adjusts TAD allocation using 3-axis composite scores</div>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* ═══════════════ PRICING SUMMARY ═══════════════ */}
      <div style={S.section}>Pricing Summary</div>
      <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        {/* Current → Proposed arrow */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Current Weekly Burden</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#ef5350' }}>{fmt(totalCurrentWeekly)}</div>
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>DSR: {fmtP(currentDSR)}</div>
          </div>
          <div style={{ fontSize: 28, color: reductionPct > 0 ? '#4caf50' : '#ef5350' }}>→</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Merchant Pays FF</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#00e5ff' }}>{fmtD(merchantPaysWeekly)}</div>
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>DSR: {fmtP(proposedDSR)}</div>
          </div>
        </div>

        {/* Breakdown boxes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {[
            { label: 'TAD to Funders/wk', value: fmtD(tad), color: '#00e5ff' },
            { label: 'ISO Commission/wk', value: fmtD(isoCommWeekly), color: '#EAD068' },
            { label: 'FF Margin/wk', value: fmtD(ffFeeWeekly), color: '#CFA529' },
            { label: 'ISO Total', value: fmt(commissionTotal), color: '#EAD068' },
            { label: 'Max Term', value: maxTerm < 9999 ? `${maxTerm} wks` : '—', color: '#e8e8f0' },
            { label: 'Eff Factor Rate', value: effectiveFactorRate > 0 ? effectiveFactorRate.toFixed(3) : '—', color: '#7c3aed' },
            { label: 'Payment Reduction', value: fmtP(reductionPct), color: reductionPct > 0 ? '#4caf50' : '#ef5350' },
          ].map((s, i) => (
            <div key={i} style={S.kpiBox(s.color)}>
              <div style={S.kpiLabel}>{s.label}</div>
              <div style={S.kpiValue(s.color)}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Waterfall explanation */}
        <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.3)', marginTop: 10, textAlign: 'center' }}>
          TAD (isolated): {fmtD(targetMerchantWeekly)} target − {fmtD(ffFeeWeekly)} FF margin = {fmtD(tad)} TAD · Merchant total: TAD + FF + ISO = {fmtD(merchantPaysWeekly)}/wk
        </div>
      </div>

      {/* ═══════════════ OFFER TIER GRID ═══════════════ */}
      <div style={S.section}>Offer Tier Grid</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {tierDefs.map((td, ti) => {
          const tierTotalToFunders = funderTiers.reduce((s, ft) => s + ft.tiers[ti].weeklyPayment, 0);
          const tierMaxTerm = Math.max(...funderTiers.map(ft => ft.tiers[ti].proposedTermWeeks).filter(t => t < 9999), 0);
          return (
            <div key={ti} style={{ background: `${tierColors[ti]}0a`, border: `1px solid ${tierColors[ti]}44`, borderRadius: 10, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: tierColors[ti], marginBottom: 4 }}>{td.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 10 }}>{(td.pct * 100).toFixed(0)}% TAD</div>
              <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.35)', textTransform: 'uppercase', marginBottom: 2 }}>Total to Funders</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: tierColors[ti], marginBottom: 8 }}>{fmtD(tierTotalToFunders)}/wk</div>
              <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.35)', textTransform: 'uppercase', marginBottom: 2 }}>Max Term</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(232,232,240,0.7)' }}>{tierMaxTerm} wks <span style={{ fontSize: 10, color: 'rgba(232,232,240,0.35)' }}>~{Math.round(tierMaxTerm / 4.33)} mo</span></div>
            </div>
          );
        })}
      </div>

      {/* ═══════════════ PER-POSITION BREAKDOWN ═══════════════ */}
      <div style={S.section}>Per-Position Breakdown</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {funderTiers.map((ft, fi) => (
          <div key={fi} style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 10, padding: 16 }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, color: '#00e5ff', fontWeight: 700 }}>{ft.name}</span>
                {ft._advCount > 1 && <span style={{ fontSize: 9, background: 'rgba(0,229,255,0.15)', color: '#00e5ff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{ft._advCount} advances</span>}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>
                <span>Balance: <strong style={{ color: '#ef9a9a' }}>{fmt(ft.balance)}</strong></span>
                <span>Current: <strong style={{ color: 'rgba(232,232,240,0.7)' }}>{fmt(ft.originalWeekly)}/wk</strong></span>
                <span>Share: <strong style={{ color: '#00e5ff' }}>{(ft.adjustedShare * 100).toFixed(1)}%</strong>{enforcementWeighting && ft.sharePct !== ft.adjustedShare && <span style={{ color: '#EAD068', fontSize: 9 }}> (was {(ft.sharePct * 100).toFixed(1)}%)</span>}</span>
              </div>
            </div>

            {/* Original term bar */}
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', marginBottom: 10, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
              Original Term: <strong style={{ color: 'rgba(232,232,240,0.8)' }}>{ft.originalTermWeeks} wks</strong> (~{Math.round(ft.originalTermWeeks / 4.33)} months)
              {ft.contractWeekly > 0 && <span style={{ marginLeft: 8 }}>· Contract: {fmtD(ft.contractWeekly)}/wk</span>}
            </div>

            {/* 4-tier grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {ft.tiers.map((t, ti) => (
                <div key={ti} style={{ background: `${tierColors[ti]}08`, border: `1px solid ${tierColors[ti]}33`, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: tierColors[ti], marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.6)', lineHeight: 1.9 }}>
                    <div><strong style={{ color: tierColors[ti], fontSize: 13 }}>{fmtD(t.weeklyPayment)}/wk</strong></div>
                    <div>{ft.originalTermWeeks} → <strong>{t.proposedTermWeeks} wks</strong></div>
                    <div style={{ color: '#888', fontSize: 10 }}>+{t.extensionWeeks} wks ({(parseFloat(t.extensionPct) || 0).toFixed(0)}%)</div>
                    <div>Reduction: <strong>{(parseFloat(t.reductionPct) || 0).toFixed(1)}%</strong></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Three-axis scoring (when enforceability weighting enabled) */}
            {enforcementWeighting && ft.intel && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(234,208,104,0.06)', border: '1px solid rgba(234,208,104,0.15)', borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: '#EAD068', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Three-Axis Score</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
                  <div style={{ color: 'rgba(232,232,240,0.5)' }}>Enforceability: <strong style={{ color: ft.intel.enforceability >= 6 ? '#ef9a9a' : '#81c784' }}>{ft.intel.enforceability}/10</strong></div>
                  <div style={{ color: 'rgba(232,232,240,0.5)' }}>Aggressiveness: <strong style={{ color: ft.intel.aggressiveness >= 6 ? '#ef9a9a' : '#81c784' }}>{ft.intel.aggressiveness}/10</strong></div>
                  <div style={{ color: 'rgba(232,232,240,0.5)' }}>Recovery Stake: <strong style={{ color: '#e8e8f0' }}>{ft.intel.recoveryStake}/10</strong></div>
                  <div style={{ color: 'rgba(232,232,240,0.5)' }}>Composite: <strong style={{ color: '#EAD068' }}>{ft.intel.composite.toFixed(1)}</strong></div>
                  <div style={{ color: 'rgba(232,232,240,0.5)' }}>Quadrant: <strong style={{ color: '#7c3aed' }}>{ft.intel.quadrant}</strong></div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ═══════════════ GRADUATED COMMISSION REFERENCE TABLE ═══════════════ */}
      <div style={S.divider} />
      <div style={S.section}>Graduated Commission Reference</div>
      <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 16, marginBottom: 20, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {['Points', 'Tier', 'Rate', `Commission on ${fmt(totalBalance)}`].map(h => (
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
                  <td style={{ padding: '5px 10px', color: isActive ? '#EAD068' : '#e8e8f0', fontWeight: isActive ? 700 : 400 }}>{pts}</td>
                  <td style={{ padding: '5px 10px', color: isActive ? '#EAD068' : 'rgba(232,232,240,0.5)' }}>{tier}</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: isActive ? '#EAD068' : 'rgba(232,232,240,0.6)', fontWeight: isActive ? 700 : 400 }}>{(rate * 100).toFixed(2)}%</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: isActive ? '#EAD068' : 'rgba(232,232,240,0.5)', fontWeight: isActive ? 700 : 400 }}>{fmt(totalBalance * rate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ═══════════════ DEAL ACTIONS BAR ═══════════════ */}
      <div style={S.divider} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button style={{ padding: '10px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: 'linear-gradient(135deg, #00acc1, #00e5ff)', color: '#0a0a0f', letterSpacing: 0.5 }}>
          Save Deal
        </button>
        <button style={{ padding: '10px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: 'linear-gradient(135deg, #CFA529, #EAD068)', color: '#0a0a0f', letterSpacing: 0.5 }}>
          Save &amp; Price
        </button>
        <button style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', background: 'rgba(255,255,255,0.08)', color: '#e8e8f0', letterSpacing: 0.5 }}>
          Load Deal
        </button>
        <button style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', background: 'rgba(255,255,255,0.08)', color: '#e8e8f0', letterSpacing: 0.5 }}>
          Import from Analysis
        </button>
      </div>
    </div>
  );
}

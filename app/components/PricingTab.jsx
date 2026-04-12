'use client';
import React, { useState, useMemo, useCallback } from 'react';
import { scoreAllPositions } from '../../lib/scoringEngine';
import { autoScorePosition, getCompositeScore, getRecoveryStakeScore } from '../../lib/funder-intel';
import { getGraduatedCommissionRate, calculateTierAllocations } from '../../lib/pricing-engine';

// ─── Formatting helpers ──────────────────────────────────────────────────────
const fmt = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (n) => (parseFloat(n) || 0).toFixed(1) + '%';

function toWeeklyEquiv(payment, frequency) {
  if (frequency === 'daily') return payment * 5;
  if (frequency === 'bi-weekly') return payment / 2;
  if (frequency === 'monthly') return payment / 4.33;
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

// ─── Position dedup helper ───────────────────────────────────────────────────
function normalizeFunderKey(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/advance\d*|position[a-z]?|pos[a-z]?|\(.*?\)/g, '').trim();
}

// ─── Grade color helper ──────────────────────────────────────────────────────
function gradeColor(grade) {
  if (!grade) return 'rgba(232,232,240,0.5)';
  const g = grade.toUpperCase();
  if (g.startsWith('A')) return '#4caf50';
  if (g.startsWith('B')) return '#00bcd4';
  if (g.startsWith('C')) return '#f59e0b';
  if (g.startsWith('D')) return '#ef5350';
  return 'rgba(232,232,240,0.5)';
}

function tierLabel(tier) {
  const map = { a_tier: 'A', b_tier: 'B', c_tier: 'C', d_tier: 'D', reverse_mca: 'R-MCA' };
  return map[tier] || '?';
}

// ─── Shared inline style helpers ─────────────────────────────────────────────
const S = {
  section: { fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(232,232,240,0.5)', marginBottom: 12 },
  divider: { borderTop: '1px solid rgba(255,255,255,0.08)', margin: '16px 0' },
  kpiBox: () => ({ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', flex: 1, minWidth: 100 }),
  kpiLabel: { fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  kpiValue: (color) => ({ fontSize: 15, fontWeight: 700, color }),
};

// ═════════════════════════════════════════════════════════════════════════════
// PricingTab
// ═════════════════════════════════════════════════════════════════════════════
export default function PricingTab({ a, positions, excludedIds, otherExcludedIds, depositOverrides, agreementResults, enrolledPositions }) {
  // ── Safety guard ──
  if (!a) return <div style={{ padding: 40, textAlign: 'center', color: 'rgba(232,232,240,0.4)' }}>No analysis data available.</div>;

  // ── Get ALL positions, then filter to enrolled only ──
  const allPositions = (positions || a.mca_positions || []).filter(p => !(excludedIds || []).includes(p._id));
  const activePositions = allPositions.filter(p => {
    const status = (p.status || '').toLowerCase().replace(/[_\s]+/g, '');
    return status !== 'paidoff';
  });

  // Filter to enrolled positions using the same logic as MCA tab
  const enrolledActive = activePositions.filter(p => {
    if (enrolledPositions === null) return true;
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
          const advBalance = p.estimated_balance
            || (advAgMatch?.analysis?.financial_terms?.purchased_amount
              ? Math.round(advAgMatch.analysis.financial_terms.purchased_amount)
              : Math.round(advWeekly * 52));
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
        // Priority: 1) manual override / cross-ref enriched, 2) agreement purchased_amount, 3) fallback
        const bal = p.estimated_balance
          || (agMatch?.analysis?.financial_terms?.purchased_amount
            ? Math.round(agMatch.analysis.financial_terms.purchased_amount)
            : Math.round(weekly * 52));
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
  const cogsRate = a.revenue?.cogs_rate || 0.40;
  const cogs = a.expense_categories?.inventory_cogs || (revenue * cogsRate);
  const grossProfit = revenue - cogs;
  const adb = a.balance_summary?.avg_daily_balance || a.calculated_metrics?.avg_daily_balance || 0;
  const biz = a.business_name || 'Business';

  // ── Deal Controls state ──
  const [isoPoints, setIsoPoints] = useState(11);
  const [ffFactorOverride, setFfFactorOverride] = useState(''); // blank = auto from term tiers
  const [ffFeeOverride, setFfFeeOverride] = useState(''); // blank = auto from debt tiers
  const [enforcementWeighting, setEnforcementWeighting] = useState(false);
  const [selectedTierIdx, setSelectedTierIdx] = useState(0); // 0=Opening, 1=Mid1, 2=Mid2, 3=Final

  // ── FF Factor term-based tiers ──
  const FF_FACTOR_TIERS = [
    { maxWeeks: 26, factor: 1.119, label: '≤6 months' },
    { maxWeeks: 43, factor: 1.129, label: '6-10 months' },
    { maxWeeks: 65, factor: 1.139, label: '11-15 months' },
    { maxWeeks: Infinity, factor: 1.149, label: '16+ months' },
  ];
  const getFFFactorForTerm = (weeks) => {
    for (const tier of FF_FACTOR_TIERS) {
      if (weeks <= tier.maxWeeks) return tier;
    }
    return FF_FACTOR_TIERS[FF_FACTOR_TIERS.length - 1];
  };

  // ── Enrollment fee tiers ──
  const getEnrollmentFee = (debt) => {
    if (debt >= 2000000) return 5000;
    if (debt >= 1000000) return 4000;
    if (debt >= 500000) return 3000;
    if (debt >= 250000) return 2000;
    return 1500;
  };

  // ── Retention pricing (ISO drops below 3 pts → FF drops rate) ──
  const getRetentionAdjustment = (pts) => {
    if (pts >= 3) return 0;
    if (pts === 2) return -0.01;
    return -0.02; // 0-1 points
  };

  // ── Locked positions state: { [funderKey]: { locked: true, payment: number } } ──
  const [lockedPositions, setLockedPositions] = useState({});

  // ── Position overrides state: { [funderKey]: { balance?: string, weekly?: string } } ──
  const [positionOverrides, setPositionOverrides] = useState({});

  const setOverride = useCallback((funderName, field, value) => {
    const key = normalizeFunderKey(funderName);
    setPositionOverrides(prev => {
      const existing = prev[key] || {};
      const next = { ...existing, [field]: value };
      // If both fields are empty/cleared, remove the override entirely
      if (!next.balance && !next.weekly) {
        const rest = { ...prev };
        delete rest[key];
        return rest;
      }
      return { ...prev, [key]: next };
    });
  }, []);

  // ── Apply overrides to deduplicated positions ──
  const effectivePositions = useMemo(() => {
    return dedupEnrolled.map(dp => {
      const key = normalizeFunderKey(dp.funder_name);
      const overrides = positionOverrides[key];
      const origBalance = dp._balance || 0;
      const origWeekly = dp._totalWeekly || 0;
      if (!overrides) return { ...dp, _origBalance: origBalance, _origWeekly: origWeekly, _hasBalanceOverride: false, _hasWeeklyOverride: false };
      const hasBal = !!(overrides.balance && parseFloat(overrides.balance) > 0);
      const hasWk = !!(overrides.weekly && parseFloat(overrides.weekly) > 0);
      return {
        ...dp,
        _balance: hasBal ? parseFloat(overrides.balance) : origBalance,
        _totalWeekly: hasWk ? parseFloat(overrides.weekly) : origWeekly,
        _hasBalanceOverride: hasBal,
        _hasWeeklyOverride: hasWk,
        _origBalance: origBalance,
        _origWeekly: origWeekly,
      };
    });
  }, [dedupEnrolled, positionOverrides]);

  // ── Totals (from effective positions with overrides applied) ──
  const totalBalance = effectivePositions.reduce((s, dp) => s + dp._balance, 0);
  const totalCurrentWeekly = effectivePositions.reduce((s, dp) => s + dp._totalWeekly, 0);
  const currentDSR = revenue > 0 ? ((totalCurrentWeekly * 4.33) / revenue) * 100 : 0;

  const toggleLock = useCallback((funderName) => {
    const key = normalizeFunderKey(funderName);
    setLockedPositions(prev => {
      const existing = prev[key];
      if (existing?.locked) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { locked: true, payment: '' } };
    });
  }, []);

  const setLockedPayment = useCallback((funderName, value) => {
    const key = normalizeFunderKey(funderName);
    setLockedPositions(prev => ({
      ...prev,
      [key]: { locked: true, payment: value },
    }));
  }, []);

  // ── Funder Intel auto-scoring ──
  const [scoreOverrides, setScoreOverrides] = useState({});

  const funderIntelMap = useMemo(() => {
    const map = {};
    effectivePositions.forEach(dp => {
      const key = normalizeFunderKey(dp.funder_name);
      const overrides = scoreOverrides[key];
      if (overrides) {
        // User has overridden scores
        const rs = overrides.recovery_stake ?? getRecoveryStakeScore(dp._balance);
        const enf = overrides.enforceability ?? 5;
        const agg = overrides.aggressiveness ?? 5;
        map[key] = {
          enforceability: enf,
          aggressiveness: agg,
          recovery_stake: rs,
          composite: getCompositeScore(enf, agg, rs),
          grade: overrides.grade || 'Unknown',
          tier: overrides.tier || 'unknown',
          display_name: overrides.display_name || dp.funder_name,
          notes: overrides.notes || '',
          auto_scored: overrides.auto_scored ?? false,
        };
      } else {
        map[key] = autoScorePosition(dp.funder_name, dp._balance);
      }
    });
    return map;
  }, [JSON.stringify(effectivePositions.map(dp => dp.funder_name + dp._balance)), JSON.stringify(scoreOverrides)]);

  const updateScore = useCallback((funderName, field, value) => {
    const key = normalizeFunderKey(funderName);
    setScoreOverrides(prev => {
      const existing = prev[key] || funderIntelMap[key] || {};
      return { ...prev, [key]: { ...existing, [field]: value } };
    });
  }, [funderIntelMap]);

  // ── Score positions (for enforceability weighting — uses scoringEngine) ──
  const scoredPositions = useMemo(() => {
    if (!enforcementWeighting) return null;
    const agMap = {};
    (agreementResults || []).forEach(ar => {
      const d = ar.analysis || ar;
      if (d.funder_name) agMap[d.funder_name] = d;
    });
    return scoreAllPositions(enrolledActive, agMap);
  }, [enforcementWeighting, JSON.stringify(enrolledActive.map(p => p._id)), JSON.stringify(agreementResults?.map(a => a?.analysis?.funder_name))]);

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

  // ── TAD locked at 0-point reduction (72.86%) ──
  const BASE_REDUCTION = 0.7286;
  const tad0 = totalCurrentWeekly * (1 - BASE_REDUCTION); // What funders get per week at final
  const ffMargin = 0; // FF margin is now handled via factor, not separate weekly

  // ── Tier definitions ──
  const tierDefs = [
    { key: 'opening', label: 'Opening', pct: 0.80 },
    { key: 'middle1', label: 'Middle 1', pct: 0.90 },
    { key: 'middle2', label: 'Middle 2', pct: 0.95 },
    { key: 'final', label: 'Final', pct: 1.00 },
  ];
  const tierColors = ['#00bcd4', '#7c3aed', '#f59e0b', '#22c55e'];

  // ── Pricing with locked position carve-out ──
  const pricingResult = useMemo(() => {
    if (effectivePositions.length === 0 || totalBalance <= 0) return { tad: 0, funderTiers: [], maxTerm: 0, warnings: [], totalLocked: 0 };

    // TAD = locked at 0-point reduction
    const tad = tad0;

    // Prepare positions with lock status and effective weekly
    const preparedPositions = effectivePositions.map(dp => {
      const agMatch = dp._agMatch || matchAgreementToPosition(dp.funder_name, agreementResults);
      const contractWeekly = getContractWeekly(agMatch);
      const effectiveWeekly = (contractWeekly && contractWeekly > 0) ? contractWeekly : dp._totalWeekly;
      const fKey = normalizeFunderKey(dp.funder_name);
      const lockInfo = lockedPositions[fKey];
      const isLocked = lockInfo?.locked && lockInfo?.payment && parseFloat(lockInfo.payment) > 0;
      const lockedPayment = isLocked ? parseFloat(lockInfo.payment) : 0;

      return {
        ...dp,
        _effectiveWeekly: effectiveWeekly,
        _contractWeekly: contractWeekly,
        _isLocked: isLocked,
        _lockedPayment: lockedPayment,
        _agMatch: agMatch,
      };
    });

    const tierPcts = tierDefs.map(td => td.pct);
    const { funderTiers: rawTiers, warnings, totalLocked } = calculateTierAllocations(
      preparedPositions, tad, tierPcts,
      { enforcementWeighting, scoreMap }
    );

    // Attach labels and extra display data
    const funderTiers = rawTiers.map(ft => {
      const fKey = normalizeFunderKey(ft.funder_name);
      const intel = funderIntelMap[fKey] || null;
      const scoringIntel = scoreMap[fKey] || null;
      const sharePct = totalBalance > 0 ? ft._balance / totalBalance : 0;

      // Add tier labels
      const tiers = ft.tiers.map((t, i) => ({
        ...t,
        ...tierDefs[i],
      }));

      return {
        name: ft.funder_name,
        balance: ft._balance,
        originalWeekly: ft._totalWeekly,
        effectiveWeekly: ft._effectiveWeekly || ft._totalWeekly,
        contractWeekly: ft._contractWeekly || null,
        originalTermWeeks: ft.originalTermWeeks,
        sharePct,
        adjustedShare: ft.adjustedShare || sharePct,
        tiers,
        _advCount: ft._advCount || 1,
        _advances: ft._advances || [],
        intel,
        scoringIntel,
        isLocked: ft.isLocked || false,
        lockedPayment: ft.lockedPayment || 0,
        _hasBalanceOverride: ft._hasBalanceOverride || false,
        _hasWeeklyOverride: ft._hasWeeklyOverride || false,
        _origBalance: ft._origBalance || ft._balance,
        _origWeekly: ft._origWeekly || ft._totalWeekly,
      };
    });

    const maxTerm = Math.max(...funderTiers.flatMap(ft => (ft.tiers || []).map(t => t.proposedTermWeeks || 0)).filter(t => t > 0 && t < 9999), 0);

    return { tad, funderTiers, maxTerm, warnings, totalLocked };
  }, [
    JSON.stringify(effectivePositions.map(dp => dp._balance + dp._totalWeekly + dp.funder_name)),
    tad0, ffMargin, enforcementWeighting,
    JSON.stringify(scoreMap), JSON.stringify(lockedPositions),
    JSON.stringify(funderIntelMap), totalBalance,
  ]);

  const { tad, funderTiers, maxTerm, warnings, totalLocked } = pricingResult;

  // ── FF Factor calculation (term-based + retention pricing) ──
  const retentionAdj = getRetentionAdjustment(isoPoints);
  const autoFactor = getFFFactorForTerm(maxTerm);
  const effectiveFFRate = ffFactorOverride
    ? parseFloat(ffFactorOverride)
    : autoFactor.factor + retentionAdj;
  const ffFeeTotal = totalBalance * (effectiveFFRate - 1);
  const ffFeeWeekly = maxTerm > 0 ? ffFeeTotal / maxTerm : 0;

  // ── ISO commission amortized over max funder term ──
  const isoCommWeekly = maxTerm > 0 ? commissionTotal / maxTerm : 0;

  // ── Enrollment fee (tiered by debt load) ──
  const autoEnrollmentFee = getEnrollmentFee(totalBalance);
  const enrollmentFee = ffFeeOverride ? parseFloat(ffFeeOverride) : autoEnrollmentFee;

  // ── Merchant pays = TAD + FF factor fee/wk + ISO commission/wk ──
  const merchantPaysWeekly = tad + ffFeeWeekly + isoCommWeekly;
  const proposedDSR = revenue > 0 ? ((merchantPaysWeekly * 4.33) / revenue) * 100 : 0;
  const reductionPct = totalCurrentWeekly > 0 ? ((totalCurrentWeekly - merchantPaysWeekly) / totalCurrentWeekly) * 100 : 0;
  const isRetentionPricing = isoPoints < 3;

  // Effective factor rate
  const totalMerchantPays = merchantPaysWeekly * maxTerm;
  const effectiveFactorRate = totalBalance > 0 ? totalMerchantPays / totalBalance : 0;

  // Selected tier computed values
  const selectedPct = tierDefs[selectedTierIdx]?.pct || 1.0;
  const selectedTAD = tad * selectedPct;
  const selectedMerchantWeekly = selectedTAD + ffFeeWeekly + isoCommWeekly;
  const selectedDSR = revenue > 0 ? ((selectedMerchantWeekly * 4.33) / revenue) * 100 : 0;
  const selectedReduction = totalCurrentWeekly > 0
    ? ((totalCurrentWeekly - selectedMerchantWeekly) / totalCurrentWeekly) * 100 : 0;
  const selectedTotalPays = selectedMerchantWeekly * maxTerm;
  const selectedFactorRate = totalBalance > 0 ? selectedTotalPays / totalBalance : 0;

  // Locked summary
  const lockedCount = funderTiers.filter(ft => ft.isLocked).length;
  const unlockedCount = funderTiers.filter(ft => !ft.isLocked).length;
  const remainingTAD = Math.max(0, tad - totalLocked);

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
            { label: 'Active Positions', value: String(effectivePositions.length), color: '#00e5ff' },
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
        {/* Retention pricing banner */}
        {isRetentionPricing && (
          <div style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>💎</span>
            <div>
              <div style={{ fontSize: 12, color: '#a78bfa', fontWeight: 700 }}>RETENTION PRICING ACTIVE</div>
              <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)' }}>FF rate reduced by {Math.abs(retentionAdj * 100).toFixed(0)}pts ({effectiveFFRate.toFixed(3)}). Conditional on full financial verification.</div>
            </div>
          </div>
        )}

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

          {/* FF Factor & Overrides */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)' }}>FF Factor{isRetentionPricing ? ' (Retention)' : ''}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: isRetentionPricing ? '#a78bfa' : '#EAD068' }}>{effectiveFFRate.toFixed(3)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', display: 'block', marginBottom: 2 }}>MANUAL OVERRIDE</label>
                <input type="text" value={ffFactorOverride} onChange={e => setFfFactorOverride(e.target.value)} placeholder={`e.g. ${autoFactor.factor}`} style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', display: 'block', marginBottom: 2 }}>ENROLLMENT FEE</label>
                <input type="text" value={ffFeeOverride} onChange={e => setFfFeeOverride(e.target.value)} placeholder={`$${autoEnrollmentFee.toLocaleString()}`} style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {FF_FACTOR_TIERS.map(t => (
                <span key={t.factor} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: autoFactor.factor === t.factor ? 'rgba(234,208,104,0.2)' : 'rgba(255,255,255,0.05)', color: autoFactor.factor === t.factor ? '#EAD068' : 'rgba(232,232,240,0.35)', border: `1px solid ${autoFactor.factor === t.factor ? 'rgba(234,208,104,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                  {t.label}: {t.factor}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Enforceability Weighting */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={enforcementWeighting} onChange={e => setEnforcementWeighting(e.target.checked)} style={{ accentColor: '#EAD068', width: 16, height: 16 }} />
            <div>
              <div style={{ fontSize: 12, color: enforcementWeighting ? '#EAD068' : 'rgba(232,232,240,0.5)', fontWeight: 600 }}>Enable Enforceability Weighting</div>
              <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.35)' }}>Adjusts TAD allocation using 3-axis composite scores + funder intel</div>
            </div>
          </label>
        </div>
      </div>

      {/* ═══════════════ WARNINGS ═══════════════ */}
      {warnings.length > 0 && warnings.map((w, wi) => (
        <div key={wi} style={{
          background: w.level === 'critical' ? 'rgba(239,83,80,0.1)' : 'rgba(245,158,11,0.1)',
          border: `1px solid ${w.level === 'critical' ? 'rgba(239,83,80,0.4)' : 'rgba(245,158,11,0.4)'}`,
          borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12,
          color: w.level === 'critical' ? '#ef5350' : '#f59e0b', fontWeight: 600,
        }}>
          {w.level === 'critical' ? '🚨' : '⚠️'} {w.message}
        </div>
      ))}

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
          <div style={{ fontSize: 28, color: selectedReduction > 0 ? '#4caf50' : '#ef5350' }}>{'\u2192'}</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Merchant Pays FF ({tierDefs[selectedTierIdx]?.label})</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: tierColors[selectedTierIdx] }}>{fmtD(selectedMerchantWeekly)}</div>
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>DSR: {fmtP(selectedDSR)}</div>
          </div>
        </div>

        {/* Breakdown boxes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {[
            { label: 'TAD to Funders/wk', value: fmtD(selectedTAD), color: tierColors[selectedTierIdx], final: selectedTierIdx !== 3 ? fmtD(tad) : null },
            { label: 'ISO Commission/wk', value: fmtD(isoCommWeekly), color: '#EAD068' },
            { label: 'FF Factor Fee/wk', value: fmtD(ffFeeWeekly), color: '#CFA529' },
            { label: 'Enrollment Fee', value: fmt(enrollmentFee), color: '#00bcd4' },
            { label: 'Max Term', value: maxTerm < 9999 ? `${maxTerm} wks` : '\u2014', color: '#e8e8f0' },
            { label: 'FF Factor Rate', value: effectiveFFRate.toFixed(3), color: isRetentionPricing ? '#a78bfa' : '#7c3aed' },
            { label: 'Payment Reduction', value: fmtP(selectedReduction), color: selectedReduction > 0 ? '#4caf50' : '#ef5350', final: selectedTierIdx !== 3 ? fmtP(reductionPct) : null },
          ].map((s, i) => (
            <div key={i} style={S.kpiBox()}>
              <div style={S.kpiLabel}>{s.label}</div>
              <div style={S.kpiValue(s.color)}>{s.value}</div>
              {s.final && <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>Final: {s.final}</div>}
            </div>
          ))}
        </div>

        {/* Locked position summary */}
        {lockedCount > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, textAlign: 'center', color: 'rgba(232,232,240,0.5)' }}>
            <span style={{ color: '#EAD068' }}>{'🔒'} Locked: {lockedCount} ({fmtD(totalLocked)}/wk)</span>
            <span style={{ margin: '0 10px' }}>|</span>
            <span>Unlocked: {unlockedCount} ({fmtD(remainingTAD)}/wk remaining TAD)</span>
          </div>
        )}

        {/* Waterfall explanation */}
        <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.3)', marginTop: 8, textAlign: 'center' }}>
          TAD (0-pt locked): {fmtD(tad)}/wk to funders {'\u00b7'} FF Factor: {effectiveFFRate.toFixed(3)} ({fmtD(ffFeeWeekly)}/wk) {'\u00b7'} ISO: {fmtD(isoCommWeekly)}/wk ({fmt(commissionTotal)} over {maxTerm}wk) {'\u00b7'} Merchant: {fmtD(merchantPaysWeekly)}/wk
        </div>
      </div>

      {/* ═══════════════ OFFER TIERS (CLICKABLE) ═══════════════ */}
      <div style={S.divider} />
      <div style={S.section}>Select Offer Tier</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {tierDefs.map((td, i) => {
          const isSelected = selectedTierIdx === i;
          const tierTAD = tad * td.pct;
          return (
            <div
              key={td.key}
              onClick={() => setSelectedTierIdx(i)}
              style={{
                background: isSelected ? `${tierColors[i]}15` : 'rgba(0,0,0,0.2)',
                border: `2px solid ${isSelected ? tierColors[i] : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 10, padding: '14px 12px', textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              <div style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                color: isSelected ? tierColors[i] : 'rgba(232,232,240,0.5)', marginBottom: 6,
              }}>
                {td.label} ({(td.pct * 100).toFixed(0)}%)
              </div>
              <div style={{
                fontSize: 18, fontWeight: 800,
                color: isSelected ? tierColors[i] : 'rgba(232,232,240,0.4)',
              }}>
                {fmtD(tierTAD)}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)' }}>to funders/wk</div>
              {isSelected && (
                <div style={{
                  marginTop: 6, fontSize: 10, fontWeight: 700,
                  color: tierColors[i], textTransform: 'uppercase',
                }}>
                  &#9656; Selected
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══════════════ BEFORE vs AFTER COMPARISON ═══════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Before */}
        <div style={{ background: 'rgba(239,83,80,0.06)', border: '1px solid rgba(239,83,80,0.2)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ef5350', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef5350', display: 'inline-block' }} />
            Current (Before FF)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}>Total Debt</div><div style={{ fontSize: 16, fontWeight: 700, color: '#ef5350' }}>{fmt(totalBalance)}</div></div>
            <div><div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}>Weekly Payment</div><div style={{ fontSize: 16, fontWeight: 700, color: '#ef5350' }}>{fmtD(totalCurrentWeekly)}</div></div>
            <div><div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}>Withhold %</div><div style={{ fontSize: 16, fontWeight: 700, color: '#ef5350' }}>{fmtP(currentDSR)}</div></div>
            <div><div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}># Positions</div><div style={{ fontSize: 16, fontWeight: 700, color: '#e8e8f0' }}>{effectivePositions.length}</div></div>
          </div>
        </div>

        {/* After */}
        <div style={{ background: 'rgba(76,175,80,0.06)', border: '1px solid rgba(76,175,80,0.2)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4caf50', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4caf50', display: 'inline-block' }} />
            After FF Restructure ({tierDefs[selectedTierIdx]?.label})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}>Payback Amount</div><div style={{ fontSize: 16, fontWeight: 700, color: '#4caf50' }}>{fmt(totalBalance)}</div></div>
            <div><div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}>New Weekly</div><div style={{ fontSize: 16, fontWeight: 700, color: '#4caf50' }}>{fmtD(selectedMerchantWeekly)}</div></div>
            <div><div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}>New Withhold %</div><div style={{ fontSize: 16, fontWeight: 700, color: '#4caf50' }}>{fmtP(selectedDSR)}</div></div>
            <div><div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}>Reduction</div><div style={{ fontSize: 16, fontWeight: 700, color: '#4caf50' }}>{selectedReduction.toFixed(1)}%</div></div>
          </div>
        </div>
      </div>

      {/* Weekly reduction callout */}
      <div style={{
        background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.2)',
        borderRadius: 10, padding: '12px 20px', marginBottom: 20,
        display: 'flex', justifyContent: 'space-around', textAlign: 'center',
      }}>
        <div>
          <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}>Weekly Reduction</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#4caf50' }}>{fmtD(totalCurrentWeekly - selectedMerchantWeekly)}</div>
          <div style={{ fontSize: 10, color: '#4caf50' }}>{selectedReduction.toFixed(1)}% less</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}>FF Fee</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#EAD068' }}>{fmtD(ffFeeWeekly)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}>Est. Term</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#e8e8f0' }}>{maxTerm} wks</div>
          <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.3)' }}>~{Math.round(maxTerm / 4.33)} months</div>
        </div>
      </div>

      {/* ISO/Merchant Quote */}
      <div style={{
        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10, padding: '14px 20px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 10, color: '#00e5ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          ISO/Merchant Quote
        </div>
        <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.7)', lineHeight: 1.6, fontStyle: 'italic' }}>
          {'"'}Your new payment is <strong style={{ color: '#4caf50' }}>{fmtD(selectedMerchantWeekly)}/week</strong>.
          The estimated term is <strong style={{ color: '#e8e8f0' }}>{Math.round(maxTerm / 4.33)} months</strong> depending
          on how negotiations go with your funders. Some funders may accept shorter terms, which means you
          could be done sooner.{'"'}
        </div>
      </div>

      {/* ═══════════════ PER-POSITION BREAKDOWN ═══════════════ */}
      <div style={S.section}>Per-Position Breakdown</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {funderTiers.map((ft, fi) => {
          const fKey = normalizeFunderKey(ft.name);
          const lockInfo = lockedPositions[fKey];
          const isLocked = ft.isLocked;
          const intel = ft.intel;
          const isUnknownFunder = intel && !intel.auto_scored;

          return (
            <div key={fi} style={{
              background: isLocked ? 'rgba(234,208,104,0.06)' : 'rgba(0,229,255,0.04)',
              border: `1px solid ${isLocked ? 'rgba(234,208,104,0.25)' : 'rgba(0,229,255,0.12)'}`,
              borderRadius: 10, padding: 16,
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isLocked && <span style={{ fontSize: 14 }}>{'🔒'}</span>}
                  <span style={{ fontSize: 15, color: isLocked ? '#EAD068' : '#00e5ff', fontWeight: 700 }}>{ft.name}</span>
                  {ft._advCount > 1 && <span style={{ fontSize: 9, background: 'rgba(0,229,255,0.15)', color: '#00e5ff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{ft._advCount} advances</span>}
                  {isLocked && <span style={{ fontSize: 9, background: 'rgba(234,208,104,0.2)', color: '#EAD068', padding: '2px 8px', borderRadius: 4, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Locked</span>}
                  {enforcementWeighting && intel && (
                    <span style={{ fontSize: 9, background: `${gradeColor(intel.grade)}22`, color: gradeColor(intel.grade), padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                      {intel.grade} {'\u00b7'} Tier {tierLabel(intel.tier)}
                    </span>
                  )}
                  {enforcementWeighting && isUnknownFunder && (
                    <span style={{ fontSize: 9, background: 'rgba(245,158,11,0.2)', color: '#f59e0b', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>Manual Review</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'rgba(232,232,240,0.4)', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Editable Balance */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    Balance:
                    <input
                      type="number"
                      value={positionOverrides[fKey]?.balance ?? ''}
                      onChange={e => setOverride(ft.name, 'balance', e.target.value)}
                      placeholder={String(Math.round(ft._origBalance || 0))}
                      style={{
                        width: 95, padding: '2px 5px', borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                        background: ft._hasBalanceOverride ? 'rgba(124,58,237,0.12)' : 'rgba(0,0,0,0.25)',
                        border: `1px solid ${ft._hasBalanceOverride ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        color: ft._hasBalanceOverride ? '#b388ff' : '#ef9a9a',
                      }}
                    />
                    {ft._hasBalanceOverride && <span style={{ fontSize: 8, color: '#7c3aed', fontWeight: 700, letterSpacing: 0.3 }} title={`Analyzer: ${fmt(ft._origBalance)}`}>{'✎'}</span>}
                  </span>
                  {/* Editable Current Weekly */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    Current:
                    <input
                      type="number"
                      value={positionOverrides[fKey]?.weekly ?? ''}
                      onChange={e => setOverride(ft.name, 'weekly', e.target.value)}
                      placeholder={String(Math.round(ft._origWeekly || 0))}
                      style={{
                        width: 80, padding: '2px 5px', borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                        background: ft._hasWeeklyOverride ? 'rgba(124,58,237,0.12)' : 'rgba(0,0,0,0.25)',
                        border: `1px solid ${ft._hasWeeklyOverride ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        color: ft._hasWeeklyOverride ? '#b388ff' : 'rgba(232,232,240,0.7)',
                      }}
                    />/wk
                    {ft._hasWeeklyOverride && <span style={{ fontSize: 8, color: '#7c3aed', fontWeight: 700, letterSpacing: 0.3 }} title={`Analyzer: ${fmt(ft._origWeekly)}/wk`}>{'✎'}</span>}
                  </span>
                  {!isLocked && <span>Share: <strong style={{ color: '#00e5ff' }}>{(((ft.adjustedShare || ft.sharePct || 0)) * 100).toFixed(1)}%</strong></span>}
                  {(ft._hasBalanceOverride || ft._hasWeeklyOverride) && (
                    <span style={{ fontSize: 8, background: 'rgba(124,58,237,0.15)', color: '#b388ff', padding: '1px 6px', borderRadius: 3, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}>manual override</span>
                  )}
                  {/* Lock toggle button */}
                  <button
                    onClick={() => toggleLock(ft.name)}
                    style={{
                      fontSize: 10, padding: '3px 10px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                      background: isLocked ? 'rgba(234,208,104,0.15)' : 'rgba(255,255,255,0.08)',
                      border: `1px solid ${isLocked ? 'rgba(234,208,104,0.4)' : 'rgba(255,255,255,0.15)'}`,
                      color: isLocked ? '#EAD068' : 'rgba(232,232,240,0.5)',
                    }}
                  >
                    {isLocked ? '🔓 Unlock' : '🔒 Lock Payment'}
                  </button>
                </div>
              </div>

              {/* Lock payment input (when toggled) */}
              {lockInfo?.locked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 12px', background: 'rgba(234,208,104,0.06)', border: '1px solid rgba(234,208,104,0.15)', borderRadius: 6 }}>
                  <label style={{ fontSize: 11, color: '#EAD068', fontWeight: 600, whiteSpace: 'nowrap' }}>Locked Weekly Payment:</label>
                  <input
                    type="number"
                    value={lockInfo.payment}
                    onChange={e => setLockedPayment(ft.name, e.target.value)}
                    placeholder="$0.00"
                    style={{ width: 160, padding: '6px 10px', borderRadius: 5, border: '1px solid rgba(234,208,104,0.3)', background: 'rgba(0,0,0,0.3)', color: '#EAD068', fontSize: 14, fontFamily: 'inherit', fontWeight: 700 }}
                  />
                  <span style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)' }}>/wk</span>
                  {isLocked && ft.lockedPayment > 0 && (
                    <span style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginLeft: 8 }}>
                      Term: {Math.ceil(ft.balance / ft.lockedPayment)} wks (~{Math.round(Math.ceil(ft.balance / ft.lockedPayment) / 4.33)} mo)
                    </span>
                  )}
                </div>
              )}

              {/* Original term bar */}
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', marginBottom: 10, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                Original Term: <strong style={{ color: 'rgba(232,232,240,0.8)' }}>{ft.originalTermWeeks || 0} wks</strong> (~{Math.round((ft.originalTermWeeks || 0) / 4.33)} months)
                {ft.contractWeekly > 0 && <span style={{ marginLeft: 8 }}>{'\u00b7'} Contract: {fmtD(ft.contractWeekly)}/wk</span>}
              </div>

              {/* Funder intel + three-axis scoring (when EW enabled) */}
              {enforcementWeighting && intel && (
                <div style={{ marginBottom: 10, padding: '10px 12px', background: isUnknownFunder ? 'rgba(245,158,11,0.06)' : 'rgba(234,208,104,0.06)', border: `1px solid ${isUnknownFunder ? 'rgba(245,158,11,0.2)' : 'rgba(234,208,104,0.15)'}`, borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: '#EAD068', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Funder Intelligence {isUnknownFunder ? '(Unmatched)' : '(Auto-Scored)'}
                    </div>
                    <div style={{ fontSize: 11, color: '#EAD068', fontWeight: 700 }}>
                      Composite: {(intel.composite || 0).toFixed(2)}
                    </div>
                  </div>

                  {/* Score dropdowns */}
                  <div style={{ display: 'flex', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Enforceability', field: 'enforceability', value: intel.enforceability, highBad: true },
                      { label: 'Aggressiveness', field: 'aggressiveness', value: intel.aggressiveness, highBad: true },
                      { label: 'Recovery Stake', field: 'recovery_stake', value: intel.recovery_stake, highBad: false },
                    ].map((axis, ai) => (
                      <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)' }}>{axis.label}:</span>
                        <select
                          value={axis.value}
                          onChange={e => updateScore(ft.name, axis.field, Number(e.target.value))}
                          style={{
                            background: 'rgba(0,0,0,0.3)', border: `1px solid ${isUnknownFunder ? 'rgba(245,158,11,0.4)' : 'rgba(234,208,104,0.2)'}`,
                            color: axis.highBad ? (axis.value >= 7 ? '#ef9a9a' : axis.value >= 5 ? '#f59e0b' : '#81c784') : '#e8e8f0',
                            fontSize: 12, fontWeight: 700, padding: '2px 4px', borderRadius: 4, fontFamily: 'inherit',
                          }}
                        >
                          {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Intel notes */}
                  {intel.notes && (
                    <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.45)', lineHeight: 1.5, fontStyle: 'italic' }}>
                      {intel.notes}
                    </div>
                  )}
                </div>
              )}

              {/* Selected tier — prominent display */}
              {(() => {
                const selectedTier = (ft.tiers || [])[selectedTierIdx];
                if (!selectedTier) return null;
                return (
                  <div style={{
                    background: isLocked ? 'rgba(234,208,104,0.06)' : `${tierColors[selectedTierIdx]}10`,
                    border: `1px solid ${isLocked ? 'rgba(234,208,104,0.2)' : `${tierColors[selectedTierIdx]}40`}`,
                    borderRadius: 10, padding: '14px 16px', marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: isLocked ? '#EAD068' : tierColors[selectedTierIdx], textTransform: 'uppercase' }}>
                        {selectedTier.label} ({(selectedTier.pct * 100).toFixed(0)}%)
                        {isLocked && ' (locked)'}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: isLocked ? '#EAD068' : tierColors[selectedTierIdx] }}>
                        {fmtD(selectedTier.weeklyPayment)}/wk
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'rgba(232,232,240,0.6)' }}>
                      <span>Term: <strong>{(selectedTier.proposedTermWeeks || 0) < 9999 ? (selectedTier.proposedTermWeeks || 0) : '\u221E'} wks</strong></span>
                      {!isLocked && <span>Extension: +{selectedTier.extensionWeeks || 0} wks ({(parseFloat(selectedTier.extensionPct) || 0).toFixed(0)}%)</span>}
                      <span>Reduction: <strong style={{ color: isLocked ? '#EAD068' : tierColors[selectedTierIdx] }}>{(parseFloat(selectedTier.reductionPct) || 0).toFixed(1)}%</strong></span>
                    </div>
                  </div>
                );
              })()}

              {/* All tiers — compact reference row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                {(ft.tiers || []).map((t, ti) => (
                  <div
                    key={ti}
                    onClick={() => setSelectedTierIdx(ti)}
                    style={{
                      background: ti === selectedTierIdx ? `${tierColors[ti]}12` : 'rgba(0,0,0,0.15)',
                      border: `1px solid ${ti === selectedTierIdx ? `${tierColors[ti]}40` : 'rgba(255,255,255,0.04)'}`,
                      borderRadius: 6, padding: '6px 8px', textAlign: 'center', cursor: 'pointer',
                      fontSize: 10, color: ti === selectedTierIdx ? tierColors[ti] : 'rgba(232,232,240,0.35)',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{t.label}</div>
                    <div style={{ fontWeight: 700 }}>{fmtD(t.weeklyPayment)}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
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
              const tier = pts === 0 ? '\u2014' : pts <= 5 ? '1 (0.75%/pt)' : pts <= 10 ? '2 (1.00%/pt)' : '3 (1.25%/pt)';
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

'use client';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
export default function PricingTab({ a, positions, excludedIds, otherExcludedIds, depositOverrides, agreementResults, enrolledPositions, fileName, initialDealId = null }) {
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
  // Each position stays separate — no merging (each has its own balance, term, negotiation leverage)
  const dedupEnrolled = useMemo(() => {
    return enrolledActive.map(p => {
      const agMatch = matchAgreementToPosition(p.funder_name, agreementResults);
      const weekly = toWeeklyEquiv(p.payment_amount_current || p.payment_amount || 0, p.frequency);
      const bal = p.estimated_balance
        || (agMatch?.analysis?.financial_terms?.purchased_amount
          ? Math.round(agMatch.analysis.financial_terms.purchased_amount)
          : Math.round(weekly * 52));
      return {
        ...p,
        _totalWeekly: weekly,
        _advCount: 1,
        _balance: bal,
        _advances: [{ label: p.funder_name, balance: bal, weekly }],
        _sourcePositions: [p],
        _agMatch: agMatch,
      };
    });
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
  const [negotiationBuffer, setNegotiationBuffer] = useState(4);
  const [tailWeeks, setTailWeeks] = useState(4);
  const [negFunderId, setNegFunderId] = useState(null);
  const [copiedEmail, setCopiedEmail] = useState(null);
  const [copiedOffer, setCopiedOffer] = useState(false);
  const [showNegEmails, setShowNegEmails] = useState(false);

  // ── Supabase Save/Load state ──
  const [savedDealId, setSavedDealId] = useState(initialDealId);

  // When the parent loads a deal from the Deal Queue, adopt its id so
  // Save/Update/Approve all reference the existing deal instead of
  // creating a fresh one.
  useEffect(() => {
    if (initialDealId && initialDealId !== savedDealId) {
      setSavedDealId(initialDealId);
    }
    // intentionally not depending on savedDealId — we only react to
    // external deal-id changes coming from the parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDealId]);
  const [dealStatus, setDealStatus] = useState(null); // null | 'analysis' | 'priced' | 'approved' | 'enrolled'
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState(null);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [dealList, setDealList] = useState([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);

  const isApproved = dealStatus === 'approved' || dealStatus === 'enrolled';

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

  // ── Email generator variables ──
  const opex = a.expense_categories?.total_operating_expenses || 0;
  const includedMonthly = totalCurrentWeekly * 4.33;
  const monthlyDeficit = revenue - cogs - opex - includedMonthly;
  const adbDays = includedMonthly > 0 ? Math.round(adb / (includedMonthly / 30)) : 0;
  const daysToDefault = monthlyDeficit < 0 ? Math.round(Math.abs(adb / (monthlyDeficit / 30))) : 999;
  const withholdPct = revenue > 0 ? ((includedMonthly / revenue) * 100).toFixed(1) : '0';

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

  // ── Reduction formula (drives merchant's total weekly payment) ──
  const BASE_REDUCTION = 0.7286;
  const REDUCTION_PER_POINT = 0.02857;
  const reductionPct = BASE_REDUCTION - (isoPoints * REDUCTION_PER_POINT);
  const merchantWeeklyAtFinal = totalCurrentWeekly * (1 - reductionPct);

  // ── FF Factor (term-based + retention pricing) ──
  // Use preliminary term (debt / merchant weekly) to pick factor tier
  const prelimTerm = totalBalance > 0 && merchantWeeklyAtFinal > 0
    ? totalBalance / merchantWeeklyAtFinal : 0;
  const retentionAdj = getRetentionAdjustment(isoPoints);
  const autoFactor = getFFFactorForTerm(prelimTerm);
  const effectiveFFRate = ffFactorOverride
    ? parseFloat(ffFactorOverride)
    : autoFactor.factor + retentionAdj;
  const isRetentionPricing = isoPoints < 3;

  // ── Total payback and actual term ──
  const ffFeeTotal = totalBalance * (effectiveFFRate - 1);
  const totalPayback = totalBalance + ffFeeTotal + commissionTotal;
  const actualTerm = merchantWeeklyAtFinal > 0 ? Math.ceil(totalPayback / merchantWeeklyAtFinal) : 0;

  // ── Enrollment fee (tiered by debt load) ──
  const autoEnrollmentFee = getEnrollmentFee(totalBalance);
  const enrollmentFee = ffFeeOverride ? parseFloat(ffFeeOverride) : autoEnrollmentFee;

  // ── Tier definitions ──
  const tierDefs = [
    { key: 'opening', label: 'Opening', pct: 0.80 },
    { key: 'middle1', label: 'Middle 1', pct: 0.90 },
    { key: 'middle2', label: 'Middle 2', pct: 0.95 },
    { key: 'final', label: 'Final', pct: 1.00 },
  ];
  const tierColors = ['#00bcd4', '#7c3aed', '#f59e0b', '#22c55e'];

  // ── Pricing with locked position carve-out (two-pass TAD calc) ──
  const pricingResult = useMemo(() => {
    if (effectivePositions.length === 0 || totalBalance <= 0) return { tad: 0, funderTiers: [], maxTerm: 0, warnings: [], totalLocked: 0, isoCommWeekly: 0, ffFeeWeekly: 0, tadFinal: 0 };

    // Pass 1: estimate TAD using actualTerm to get initial tier allocations
    const isoCommWeeklyEst = actualTerm > 0 ? commissionTotal / actualTerm : 0;
    const ffFeeWeeklyEst = actualTerm > 0 ? ffFeeTotal / actualTerm : 0;
    const tadEst = merchantWeeklyAtFinal - isoCommWeeklyEst - ffFeeWeeklyEst;

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
      preparedPositions, tadEst, tierPcts,
      { enforcementWeighting, scoreMap }
    );

    // Pass 2: derive maxFunderTerm from PROPORTIONAL allocation (not EW-weighted)
    // This ensures agreement term never changes when EW is toggled — EW only affects per-funder splits
    const totalEffectiveWeekly = preparedPositions.reduce((s, p) => s + (p._effectiveWeekly || p._totalWeekly), 0);
    let longestTermProportional = 0;
    preparedPositions.forEach(p => {
      const proportionalShare = totalEffectiveWeekly > 0 ? (p._effectiveWeekly || p._totalWeekly) / totalEffectiveWeekly : 0;
      const proportionalAlloc = tadEst * proportionalShare;
      if (proportionalAlloc > 0) {
        const funderTerm = Math.ceil(p._balance / proportionalAlloc);
        if (funderTerm > longestTermProportional) longestTermProportional = funderTerm;
      }
    });
    const maxFunderTerm = longestTermProportional || actualTerm;
    const agreementTerm = negotiationBuffer + maxFunderTerm + tailWeeks;

    // Weekly splits: both ISO and FF fee spread evenly over full agreement term
    const isoCommWeekly = agreementTerm > 0 ? commissionTotal / agreementTerm : 0;
    const ffFeeWeekly = agreementTerm > 0 ? ffFeeTotal / agreementTerm : 0;
    const tadFinal = merchantWeeklyAtFinal - isoCommWeekly - ffFeeWeekly;

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

    return { tad: tadFinal, funderTiers, maxTerm: agreementTerm, maxFunderTerm, warnings, totalLocked, isoCommWeekly, ffFeeWeekly, tadFinal };
  }, [
    JSON.stringify(effectivePositions.map(dp => dp._balance + dp._totalWeekly + dp.funder_name)),
    merchantWeeklyAtFinal, enforcementWeighting, actualTerm, commissionTotal, ffFeeTotal,
    JSON.stringify(scoreMap), JSON.stringify(lockedPositions),
    JSON.stringify(funderIntelMap), totalBalance, negotiationBuffer, tailWeeks,
  ]);

  const { tad, funderTiers, maxTerm, maxFunderTerm, warnings, totalLocked, isoCommWeekly, ffFeeWeekly, tadFinal } = pricingResult;

  // ── Merchant pays (at final tier = full TAD) ──
  const merchantPaysWeekly = merchantWeeklyAtFinal;
  const proposedDSR = revenue > 0 ? ((merchantPaysWeekly * 4.33) / revenue) * 100 : 0;
  const reductionPct_display = totalCurrentWeekly > 0 ? ((totalCurrentWeekly - merchantPaysWeekly) / totalCurrentWeekly) * 100 : 0;

  // Selected tier computed values
  const selectedPct = tierDefs[selectedTierIdx]?.pct || 1.0;
  const selectedTAD = tad * selectedPct;
  const selectedMerchantWeekly = merchantWeeklyAtFinal; // merchant payment fixed across tiers
  const selectedDSR = revenue > 0 ? ((selectedMerchantWeekly * 4.33) / revenue) * 100 : 0;
  const selectedReduction = totalCurrentWeekly > 0
    ? ((totalCurrentWeekly - selectedMerchantWeekly) / totalCurrentWeekly) * 100 : 0;
  const selectedTotalPays = selectedMerchantWeekly * maxTerm;
  const selectedFactorRate = totalBalance > 0 ? selectedTotalPays / totalBalance : 0;

  // Locked summary
  const lockedCount = funderTiers.filter(ft => ft.isLocked).length;
  const unlockedCount = funderTiers.filter(ft => !ft.isLocked).length;
  const remainingTAD = Math.max(0, tad - totalLocked);

  // ═══════════════════════════════════════════════════════════════
  // SUPABASE SAVE / LOAD HANDLERS
  // ═══════════════════════════════════════════════════════════════

  const buildDealPayload = useCallback(() => {
    const positionRows = effectivePositions.map((dp, idx) => ({
      funder_name: dp.funder_name,
      funder_legal_name: dp._agMatch?.analysis?.funder_legal_name || dp.funder_name,
      account_number: dp._agMatch?.analysis?.account_number || dp.account_number || '',
      agreement_date: dp._agMatch?.analysis?.agreement_date || dp.agreement_date || null,
      position_order: idx + 1,
      purchase_price: parseFloat(dp._agMatch?.analysis?.financial_terms?.purchase_price) || 0,
      purchased_amount: parseFloat(dp._agMatch?.analysis?.financial_terms?.purchased_amount) || 0,
      factor_rate: parseFloat(dp._agMatch?.analysis?.financial_terms?.factor_rate) || parseFloat(dp.factor_rate) || 0,
      specified_percentage: parseFloat(dp._agMatch?.analysis?.financial_terms?.specified_receivable_percentage) || parseFloat(dp.specified_percentage) || 0,
      origination_fee: parseFloat(dp._agMatch?.analysis?.financial_terms?.origination_fee) || 0,
      prior_balance_payoff: parseFloat(dp._agMatch?.analysis?.financial_terms?.prior_balance_payoff) || 0,
      net_funding: parseFloat(dp._agMatch?.analysis?.financial_terms?.net_funding) || 0,
      current_weekly_payment: dp._totalWeekly,
      payment_frequency: dp.frequency || 'weekly',
      daily_payment: dp.frequency === 'daily' ? dp.payment_amount : (dp._totalWeekly / 5),
      estimated_balance: dp._balance,
      funder_claimed_balance: parseFloat(dp.funder_claimed_balance) || 0,
      ach_descriptor: dp.ach_descriptor || dp._agMatch?.analysis?.ach_descriptor || '',
      status: 'active',
      source: 'analyzer',
      notes: dp.notes || '',
    }));

    return {
      merchant_name: a.business_name || biz,
      merchant_dba: a.business_name || biz,
      merchant_ein: a.ein || '',
      merchant_state: a.state || '',
      merchant_industry: a.industry || '',
      merchant_contact_name: a.owner_name || '',
      merchant_contact_email: a.owner_email || '',
      merchant_contact_phone: a.owner_phone || '',
      iso_name: '',
      iso_contact: '',
      iso_commission_points: isoPoints,
      monthly_revenue: revenue,
      monthly_cogs: cogs,
      gross_profit: grossProfit,
      avg_daily_balance: adb,
      notes: `Saved from Analyzer — ${fileName || 'analysis'}`,
      positions: positionRows,
    };
  }, [effectivePositions, a, biz, isoPoints, revenue, cogs, grossProfit, adb, fileName]);

  const buildPricingSnapshot = useCallback(() => ({
    iso_points: isoPoints,
    ff_factor_override: ffFactorOverride,
    ff_fee_override: ffFeeOverride,
    enforcement_weighting: enforcementWeighting,
    selected_tier_idx: selectedTierIdx,
    negotiation_buffer: negotiationBuffer,
    tail_weeks: tailWeeks,
    locked_positions: lockedPositions,
    position_overrides: positionOverrides,
    score_overrides: scoreOverrides,
    // Computed outputs
    total_balance: totalBalance,
    total_current_weekly: totalCurrentWeekly,
    merchant_weekly: merchantWeeklyAtFinal,
    tad_final: tadFinal,
    agreement_term: maxTerm,
    max_funder_term: maxFunderTerm,
    effective_ff_rate: effectiveFFRate,
    commission_rate: commissionRate,
    commission_total: commissionTotal,
    ff_fee_total: ffFeeTotal,
    enrollment_fee: enrollmentFee,
    proposed_dsr: proposedDSR,
    reduction_pct: reductionPct_display,
    funder_tiers: funderTiers.map(ft => ({
      name: ft.name,
      balance: ft.balance,
      share_pct: ft.sharePct,
      adjusted_share: ft.adjustedShare,
      tiers: ft.tiers.map(t => ({ label: t.label, pct: t.pct, payment: t.payment, term_weeks: t.termWeeks })),
      is_locked: ft.isLocked,
      locked_payment: ft.lockedPayment,
    })),
  }), [isoPoints, ffFactorOverride, ffFeeOverride, enforcementWeighting, selectedTierIdx,
    negotiationBuffer, tailWeeks, lockedPositions, positionOverrides, scoreOverrides,
    totalBalance, totalCurrentWeekly, merchantWeeklyAtFinal, tadFinal, maxTerm, maxFunderTerm,
    effectiveFFRate, commissionRate, commissionTotal, ffFeeTotal, enrollmentFee, proposedDSR,
    reductionPct_display, funderTiers]);

  const handleSaveDeal = useCallback(async (alsoPrice = false) => {
    setSaveStatus('saving');
    setSaveError(null);
    try {
      let dealId = savedDealId;

      if (!dealId) {
        // Create new deal
        const payload = buildDealPayload();
        const res = await fetch('/api/deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create deal');
        }
        const deal = await res.json();
        dealId = deal.id;
        setSavedDealId(dealId);
      } else {
        // Update existing deal
        const payload = buildDealPayload();
        const { positions: posRows, ...dealFields } = payload;
        dealFields.updated_at = new Date().toISOString();
        const res = await fetch(`/api/deals/${dealId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dealFields),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update deal');
        }
      }

      // Save analyzer session data + pricing snapshot
      const sessionData = {
        analysis: a,
        pricing_snapshot: buildPricingSnapshot(),
        saved_at: new Date().toISOString(),
        file_name: fileName,
      };
      await fetch(`/api/deals/${dealId}/save-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analyzer_session_data: sessionData }),
      });

      // Optionally run server-side pricing
      if (alsoPrice) {
        const priceRes = await fetch(`/api/deals/${dealId}/price`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            iso_commission_points: isoPoints,
            use_enforceability_weighting: enforcementWeighting,
          }),
        });
        if (!priceRes.ok) {
          const err = await priceRes.json();
          throw new Error(err.error || 'Pricing failed');
        }
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Save deal error:', err);
      setSaveError(err.message);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 5000);
    }
  }, [savedDealId, buildDealPayload, buildPricingSnapshot, a, fileName, isoPoints, enforcementWeighting]);

  const handleLoadDealList = useCallback(async () => {
    setShowLoadModal(true);
    setLoadingDeals(true);
    try {
      const res = await fetch('/api/deals?status=');
      if (!res.ok) throw new Error('Failed to fetch deals');
      const deals = await res.json();
      setDealList(Array.isArray(deals) ? deals : []);
    } catch (err) {
      console.error('Load deals error:', err);
      setDealList([]);
    } finally {
      setLoadingDeals(false);
    }
  }, []);

  const handleSelectDeal = useCallback(async (dealId) => {
    setShowLoadModal(false);
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/deals/${dealId}`);
      if (!res.ok) throw new Error('Failed to load deal');
      const deal = await res.json();
      setSavedDealId(deal.id);
      setDealStatus(deal.status || null);

      // Restore pricing state from analyzer_session_data if available
      const session = deal.analyzer_session_data;
      if (session?.pricing_snapshot) {
        const snap = session.pricing_snapshot;
        if (snap.iso_points != null) setIsoPoints(snap.iso_points);
        if (snap.ff_factor_override != null) setFfFactorOverride(snap.ff_factor_override);
        if (snap.ff_fee_override != null) setFfFeeOverride(snap.ff_fee_override);
        if (snap.enforcement_weighting != null) setEnforcementWeighting(snap.enforcement_weighting);
        if (snap.selected_tier_idx != null) setSelectedTierIdx(snap.selected_tier_idx);
        if (snap.negotiation_buffer != null) setNegotiationBuffer(snap.negotiation_buffer);
        if (snap.tail_weeks != null) setTailWeeks(snap.tail_weeks);
        if (snap.locked_positions) setLockedPositions(snap.locked_positions);
        if (snap.position_overrides) setPositionOverrides(snap.position_overrides);
        if (snap.score_overrides) setScoreOverrides(snap.score_overrides);
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Load deal error:', err);
      setSaveError(err.message);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 5000);
    }
  }, []);

  const handleApproveDeal = useCallback(async () => {
    setShowApproveConfirm(false);
    setSaveStatus('saving');
    setSaveError(null);
    try {
      // Step 1: Save deal first (creates if needed)
      let dealId = savedDealId;
      if (!dealId) {
        const payload = buildDealPayload();
        const res = await fetch('/api/deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to create deal');
        const deal = await res.json();
        dealId = deal.id;
        setSavedDealId(dealId);
      }

      // Step 2: Run server-side pricing to lock position-level numbers
      const priceRes = await fetch(`/api/deals/${dealId}/price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          iso_commission_points: isoPoints,
          use_enforceability_weighting: enforcementWeighting,
        }),
      });
      if (!priceRes.ok) throw new Error((await priceRes.json()).error || 'Pricing failed');

      // Step 3: Save full analyzer session + pricing snapshot
      const sessionData = {
        analysis: a,
        pricing_snapshot: buildPricingSnapshot(),
        approved_at: new Date().toISOString(),
        file_name: fileName,
      };
      await fetch(`/api/deals/${dealId}/save-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analyzer_session_data: sessionData }),
      });

      // Step 4: Set status to approved + write locked pricing fields
      const approvalPayload = {
        status: 'approved',
        merchant_weekly_payment: merchantWeeklyAtFinal,
        max_funder_term_weeks: maxFunderTerm,
        proposed_dsr: proposedDSR,
        effective_factor_rate: effectiveFFRate,
        iso_commission_points: isoPoints,
        total_balance: totalBalance,
        total_weekly_burden: totalCurrentWeekly,
        tad_100: tadFinal,
        approved_at: new Date().toISOString(),
        approved_by: 'analyzer',
        // Locked pricing fields — these won't change after approval
        locked_merchant_weekly: merchantWeeklyAtFinal,
        locked_agreement_term: maxTerm,
        locked_ff_factor: effectiveFFRate,
        locked_iso_points: isoPoints,
        locked_commission_total: commissionTotal,
        locked_ff_fee_total: ffFeeTotal,
        locked_enrollment_fee: enrollmentFee,
        locked_total_payback: totalPayback,
      };

      const approveRes = await fetch(`/api/deals/${dealId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approvalPayload),
      });
      if (!approveRes.ok) throw new Error((await approveRes.json()).error || 'Approval failed');

      setDealStatus('approved');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 5000);
    } catch (err) {
      console.error('Approve deal error:', err);
      setSaveError(err.message);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 5000);
    }
  }, [savedDealId, buildDealPayload, buildPricingSnapshot, a, fileName, isoPoints,
    enforcementWeighting, merchantWeeklyAtFinal, maxFunderTerm, proposedDSR, effectiveFFRate,
    totalBalance, totalCurrentWeekly, tadFinal, maxTerm, commissionTotal, ffFeeTotal,
    enrollmentFee, totalPayback]);

  // ═══════════════════════════════════════════════════════════════
  // EXPORT FUNCTIONS (merged from ExportTab)
  // ═══════════════════════════════════════════════════════════════

  function confidentialityCheck(text) {
    const lower = (text || '').toLowerCase();
    const forbidden = ['iso commission', 'iso points', 'iso fee', 'ff fee', 'ff revenue', 'funders first fee', 'iso_points', 'ff_fee', 'iso_comm'];
    for (const term of forbidden) {
      if (lower.includes(term)) {
        console.error('CONFIDENTIALITY BLOCK: ISO/FF data detected in funder output');
        return false;
      }
    }
    return true;
  }

  const generateBriefHTML = (selectedIdx, tierIdx = 0) => {
    const ft = funderTiers[selectedIdx];
    if (!ft) return '';
    const tier = ft.tiers[tierIdx] || ft.tiers[0];
    const bank = a.bank_name || 'Bank';
    const periods = (a.statement_periods || a.monthly_breakdown || []);
    const monthRange = periods.length > 1
      ? `${periods[0]?.month || ''} – ${periods[periods.length-1]?.month || ''}`
      : (a.statement_month || '');
    const proposedWeekly = tier.weeklyPayment;
    const termWeeks = tier.proposedTermWeeks;
    const termMonths = Math.round(termWeeks / 4.33);
    const proposedBiWeekly = proposedWeekly * 2;
    const defaultRecovery = Math.round(ft.balance * 0.35);
    const defaultNet = Math.round(defaultRecovery * 0.7);
    const rev = revenue;
    const totalMCAMo = includedMonthly;
    const f$ = (n) => '$' + Math.round(n).toLocaleString('en-US');
    const fK = (n) => Math.abs(n) >= 1000 ? '$' + Math.round(Math.abs(n) / 1000) + 'K' : f$(Math.abs(n));
    const totalIncWeekly = effectivePositions.reduce((s, dp) => s + dp._totalWeekly, 0);
    const totalIncBalance = effectivePositions.reduce((s, dp) => s + dp._balance, 0);
    const stackRows = effectivePositions.map((dp) => {
      const isTarget = dp.funder_name === ft.name;
      return `<tr${isTarget ? ' class="highlight-row"' : ''}>
        <td><span class="funder-name">${dp.funder_name}</span>${isTarget ? ' <span class="position-tag tag-you">You</span>' : ''}</td>
        <td>${f$(dp._totalWeekly)}</td>
        <td>${f$(dp._balance)}</td>
      </tr>`;
    }).join('\n');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Funders First | Position Analysis Brief — ${ft.name}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<link href="https://fonts.googleapis.com/css2?family=Questrial&family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--ff-gold:#CFA529;--ff-gold-light:#EAD068;--ff-teal:#00acc1;--ff-teal-dark:#00838f;--ff-teal-light:#4dd0e1;--ff-green:#2e7d32;--ff-red:#c62828;--ff-orange:#e65100;--ff-text:#1a1a1a;--ff-text-light:#333;--ff-text-muted:#555;--glass-bg:rgba(255,255,255,0.72);--glass-bg-strong:rgba(255,255,255,0.88);--glass-border:rgba(255,255,255,0.6);--glass-shadow:rgba(0,0,0,0.06)}
*{margin:0;padding:0;box-sizing:border-box}@page{size:8.5in 11in;margin:0}
body{font-family:'Outfit',sans-serif;background:#e8e8e8;color:var(--ff-text);line-height:1.5;-webkit-font-smoothing:antialiased}
.page{width:8.5in;min-height:11in;margin:0 auto 0.25in;position:relative;overflow:hidden;page-break-after:always;box-shadow:0 4px 20px rgba(0,0,0,0.15);background:#f5f5f0}
.page::before{content:'';position:absolute;inset:0;background-image:url('https://fundersfirst.com/wp-content/uploads/2026/01/Funders-First-BG.png');background-size:cover;background-position:center;opacity:0.4;pointer-events:none}
.content{position:relative;z-index:1;padding:0.38in 0.45in;min-height:11in;display:flex;flex-direction:column}
.doc-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.22in;padding-bottom:0.18in;border-bottom:2px solid var(--ff-teal)}
.doc-header-left img{height:32px;margin-bottom:6px}.doc-type{font-size:0.55rem;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:var(--ff-teal-dark)}
.doc-header-right{text-align:right}.doc-title{font-size:1.1rem;font-weight:800;color:var(--ff-text);line-height:1.2}
.doc-subtitle{font-size:0.62rem;color:var(--ff-text-muted);margin-top:3px}
.confidential-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:rgba(0,172,193,0.1);border:1px solid rgba(0,172,193,0.3);border-radius:20px;font-size:0.5rem;font-weight:700;color:var(--ff-teal-dark);text-transform:uppercase;letter-spacing:1px;margin-top:6px}
.merchant-strip{background:linear-gradient(135deg,var(--ff-teal-dark),var(--ff-teal));border-radius:10px;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:0.18in}
.merchant-strip-left .merchant-name{font-size:0.95rem;font-weight:800;color:#fff}.merchant-strip-left .merchant-meta{font-size:0.55rem;color:rgba(255,255,255,0.7);margin-top:2px}
.merchant-strip-right{display:flex;gap:20px}.strip-stat{text-align:center}.strip-stat-value{font-size:1rem;font-weight:800;color:#fff;line-height:1}.strip-stat-label{font-size:0.48rem;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}
.glass-card{background:var(--glass-bg-strong);border:1px solid var(--glass-border);border-radius:12px;padding:16px 18px;box-shadow:0 4px 16px var(--glass-shadow);margin-bottom:0.14in}
.card-eyebrow{font-size:0.5rem;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--ff-teal-dark);margin-bottom:8px;display:flex;align-items:center;gap:6px}.card-eyebrow i{font-size:0.55rem}
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:0.12in;margin-bottom:0.14in}
.stat-box{background:var(--glass-bg-strong);border:1px solid var(--glass-border);border-radius:10px;padding:12px 10px;text-align:center;box-shadow:0 2px 8px var(--glass-shadow)}
.stat-box-value{font-size:1.25rem;font-weight:800;line-height:1;margin-bottom:4px}.stat-box-value.teal{color:var(--ff-teal-dark)}.stat-box-value.red{color:var(--ff-red)}.stat-box-value.gold{color:var(--ff-gold)}.stat-box-value.orange{color:var(--ff-orange)}
.stat-box-label{font-size:0.5rem;color:var(--ff-text-muted);text-transform:uppercase;letter-spacing:0.5px;line-height:1.3}
.math-table{width:100%;border-collapse:collapse}.math-table tr{border-bottom:1px solid rgba(0,0,0,0.06)}.math-table tr:last-child{border-bottom:none}.math-table td{padding:7px 8px;font-size:0.66rem;color:var(--ff-text-light)}.math-table td:last-child{text-align:right;font-weight:600;color:var(--ff-text)}.math-table .total-row td{padding-top:10px;font-weight:700;color:var(--ff-text);font-size:0.72rem;border-top:2px solid rgba(0,0,0,0.1)}.math-table .deficit-row td{color:var(--ff-red);font-weight:700;font-size:0.72rem}.math-table .label-col{color:var(--ff-text-muted);font-weight:400}
.stack-table{width:100%;border-collapse:collapse}.stack-table th{font-size:0.5rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--ff-text-muted);padding:6px 8px;text-align:left;border-bottom:2px solid rgba(0,0,0,0.08)}.stack-table th:not(:first-child){text-align:right}.stack-table td{padding:8px 8px;font-size:0.63rem;color:var(--ff-text-light);border-bottom:1px solid rgba(0,0,0,0.05)}.stack-table td:not(:first-child){text-align:right}.stack-table tr.highlight-row td{background:rgba(0,172,193,0.06);font-weight:700;color:var(--ff-teal-dark)}.stack-table .total-row td{font-weight:700;color:var(--ff-text);border-top:2px solid rgba(0,0,0,0.1);border-bottom:none;font-size:0.66rem}
.funder-name{font-weight:600;color:var(--ff-text)}.position-tag{display:inline-block;padding:2px 6px;border-radius:4px;font-size:0.45rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-left:4px;vertical-align:middle}.tag-you{background:rgba(0,172,193,0.15);color:var(--ff-teal-dark)}
.flags-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.flag-item{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,0.7);border:1px solid rgba(0,0,0,0.06)}.flag-icon{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:0.7rem;flex-shrink:0}.flag-icon.green{background:rgba(46,125,50,0.12);color:var(--ff-green)}.flag-icon.orange{background:rgba(230,81,0,0.12);color:var(--ff-orange)}.flag-icon.teal{background:rgba(0,172,193,0.12);color:var(--ff-teal-dark)}.flag-icon.gold{background:rgba(207,165,41,0.15);color:var(--ff-gold)}.flag-content h4{font-size:0.6rem;font-weight:700;color:var(--ff-text);margin-bottom:2px}.flag-content p{font-size:0.55rem;color:var(--ff-text-muted);line-height:1.4}
.comparison-table{width:100%;border-collapse:collapse}.comparison-table th{padding:10px 14px;font-size:0.58rem;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:1px}.comparison-table th.accept-col{background:linear-gradient(135deg,var(--ff-teal-dark),var(--ff-teal));color:#fff;border-radius:8px 8px 0 0}.comparison-table th.decline-col{background:rgba(198,40,40,0.08);color:var(--ff-red);border-radius:8px 8px 0 0}.comparison-table td{padding:9px 14px;font-size:0.63rem;text-align:center;border-bottom:1px solid rgba(0,0,0,0.05)}.comparison-table td.row-label{text-align:left;font-weight:600;color:var(--ff-text-muted);font-size:0.58rem;text-transform:uppercase;letter-spacing:0.5px;background:rgba(255,255,255,0.5)}.comparison-table td.accept-val{background:rgba(0,172,193,0.05);font-weight:700;color:var(--ff-teal-dark)}.comparison-table td.decline-val{background:rgba(198,40,40,0.03);color:var(--ff-red);font-weight:600}.comparison-table .net-row td{font-weight:800;font-size:0.72rem;padding-top:12px;padding-bottom:12px;border-top:2px solid rgba(0,0,0,0.1)}.comparison-table .net-row td.accept-val{color:var(--ff-green);font-size:0.85rem}.comparison-table .net-row td.decline-val{color:var(--ff-red)}
.proposal-box{background:linear-gradient(135deg,#f0fafa,#e8f7f9);border:2px solid var(--ff-teal);border-radius:12px;padding:16px 20px;margin-bottom:0.14in}.proposal-box-header{font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--ff-teal-dark);margin-bottom:12px;display:flex;align-items:center;gap:8px}.proposal-terms{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.proposal-term{text-align:center}.proposal-term-value{font-size:1.05rem;font-weight:800;color:var(--ff-teal-dark);line-height:1;margin-bottom:3px}.proposal-term-label{font-size:0.5rem;color:var(--ff-text-muted);text-transform:uppercase;letter-spacing:0.5px}
.notice-box{background:rgba(207,165,41,0.08);border-left:4px solid var(--ff-gold);border-radius:0 8px 8px 0;padding:10px 14px;margin-bottom:0.12in}.notice-box p{font-size:0.6rem;color:var(--ff-text-light);line-height:1.5}.notice-box strong{color:var(--ff-text)}
.section-divider{display:flex;align-items:center;gap:10px;margin-bottom:0.12in}.section-divider-label{font-size:0.52rem;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--ff-teal-dark);white-space:nowrap}.section-divider-line{flex:1;height:1px;background:linear-gradient(to right,rgba(0,172,193,0.4),transparent)}
.page-footer{margin-top:auto;padding-top:0.12in;border-top:1px solid rgba(0,0,0,0.07);display:flex;justify-content:space-between;align-items:center}.footer-contact{display:flex;gap:18px}.footer-contact-item{font-size:0.52rem;color:var(--ff-text-muted);display:flex;align-items:center;gap:5px}.footer-contact-item i{color:var(--ff-teal);font-size:0.48rem}.footer-right{font-size:0.48rem;color:var(--ff-text-muted);text-align:right;line-height:1.5}
.rbfc-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:rgba(0,172,193,0.08);border:1px solid rgba(0,172,193,0.2);border-radius:12px;font-size:0.45rem;color:var(--ff-teal-dark);font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:0.14in;margin-bottom:0.14in}.two-col .glass-card{margin-bottom:0}
@media print{body{background:none}.page{margin:0;box-shadow:none;page-break-after:always}}
</style>
</head>
<body>
<!-- PAGE 1 -->
<div class="page"><div class="content">
<div class="doc-header">
  <div class="doc-header-left">
    <img src="https://fundersfirst.com/wp-content/uploads/2026/01/Funders-First-Inc.png" alt="Funders First">
    <div class="doc-type"><i class="fas fa-file-alt"></i> &nbsp;Funder Position Analysis Brief</div>
  </div>
  <div class="doc-header-right">
    <div class="doc-title">${biz}</div>
    <div class="doc-subtitle">${bank} &middot; ${monthRange} &middot; Bank-Verified Analysis</div>
    <div class="confidential-badge"><i class="fas fa-lock"></i> Confidential &middot; Prepared by Funders First Inc.</div>
  </div>
</div>
<div class="merchant-strip">
  <div class="merchant-strip-left">
    <div class="merchant-name">${biz}</div>
    <div class="merchant-meta">Analysis Date: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
  </div>
  <div class="merchant-strip-right">
    <div class="strip-stat"><div class="strip-stat-value">${fK(rev)}</div><div class="strip-stat-label">Monthly Revenue</div></div>
    <div class="strip-stat"><div class="strip-stat-value">${withholdPct}%</div><div class="strip-stat-label">MCA Withhold</div></div>
    <div class="strip-stat"><div class="strip-stat-value">${adbDays} days</div><div class="strip-stat-label">ADB Coverage</div></div>
    <div class="strip-stat"><div class="strip-stat-value">${daysToDefault < 999 ? daysToDefault + ' days' : 'N/A'}</div><div class="strip-stat-label">Est. To Default</div></div>
  </div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-box-value teal">${f$(rev)}</div><div class="stat-box-label">True Monthly Revenue<br>(Bank-Verified)</div></div>
  <div class="stat-box"><div class="stat-box-value red">${f$(totalMCAMo)}</div><div class="stat-box-label">Monthly MCA<br>Debt Service</div></div>
  <div class="stat-box"><div class="stat-box-value orange">${f$(opex)}</div><div class="stat-box-label">Verified Monthly<br>Operating Expenses</div></div>
  <div class="stat-box"><div class="stat-box-value red">${monthlyDeficit < 0 ? '(' + f$(Math.abs(monthlyDeficit)) + ')' : f$(monthlyDeficit)}</div><div class="stat-box-label">Monthly Cash<br>${monthlyDeficit < 0 ? 'Deficit' : 'Surplus'}</div></div>
</div>
<div class="section-divider"><div class="section-divider-label"><i class="fas fa-calculator"></i> &nbsp;Bank-Verified Cash Flow Reality</div><div class="section-divider-line"></div></div>
<div class="two-col">
  <div class="glass-card">
    <div class="card-eyebrow"><i class="fas fa-chart-bar"></i> Monthly Revenue Breakdown</div>
    <table class="math-table">
      <tr><td class="label-col">Gross Monthly Revenue</td><td>${f$(rev)}</td></tr>
      ${cogs > 0 ? `<tr><td class="label-col">Less: COGS / Inventory</td><td style="color:var(--ff-red)">(${f$(cogs)})</td></tr>` : ''}
      <tr class="total-row"><td>Gross Profit</td><td>${f$(grossProfit)}</td></tr>
      <tr><td class="label-col">Less: Verified Operating Expenses</td><td style="color:var(--ff-red)">(${f$(opex)})</td></tr>
      <tr><td class="label-col">Less: Total MCA Debt Service</td><td style="color:var(--ff-red)">(${f$(totalMCAMo)})</td></tr>
      <tr class="deficit-row"><td>Net Monthly Position</td><td>${monthlyDeficit < 0 ? '(' + f$(Math.abs(monthlyDeficit)) + ')' : f$(monthlyDeficit)}</td></tr>
    </table>
  </div>
  <div class="glass-card">
    <div class="card-eyebrow"><i class="fas fa-layer-group"></i> Full MCA Stack &mdash; All ${effectivePositions.length} Positions</div>
    <table class="stack-table">
      <thead><tr><th>Funder</th><th>Weekly Pmt</th><th>Est. Balance</th></tr></thead>
      <tbody>
        ${stackRows}
        <tr class="total-row"><td>Total Stack</td><td>${f$(totalIncWeekly)}/wk</td><td>${f$(totalIncBalance)}</td></tr>
      </tbody>
    </table>
  </div>
</div>
<div class="notice-box">
  <p><strong>Mathematical Impossibility Notice:</strong> Bank statement analysis confirms ${f$(totalMCAMo)} in monthly MCA debt service against ${f$(grossProfit)} in monthly gross profit after ${f$(opex)} in verified operating expenses. ${daysToDefault < 999 ? `At current trajectory, account balances become critically depleted within ${daysToDefault} days &mdash; at which point all ${effectivePositions.length} funders lose recovery priority simultaneously.` : ''} This analysis is based on bank-verified transaction data, not merchant-reported estimates.</p>
</div>
<div class="section-divider"><div class="section-divider-label"><i class="fas fa-file-contract"></i> &nbsp;Agreement Provisions of Note</div><div class="section-divider-line"></div></div>
<div class="flags-grid">
  <div class="flag-item"><div class="flag-icon teal"><i class="fas fa-sync-alt"></i></div><div class="flag-content"><h4>Reconciliation Rights &mdash; Active Across Multiple Positions</h4><p>Several agreements contain reconciliation provisions allowing payment adjustment based on actual monthly revenue. Current payments have not been reconciled to verified revenue levels.</p></div></div>
  <div class="flag-item"><div class="flag-icon orange"><i class="fas fa-layer-group"></i></div><div class="flag-content"><h4>Anti-Stacking Provisions &mdash; Present in Multiple Agreements</h4><p>Multiple funding agreements in this stack contain anti-stacking clauses. All positions were funded with concurrent exposure to other MCA obligations.</p></div></div>
  <div class="flag-item"><div class="flag-icon green"><i class="fas fa-handshake"></i></div><div class="flag-content"><h4>100% Principal Recovery &mdash; Our Commitment</h4><p>Funders First does not negotiate principal reduction. Our proposal guarantees 100% repayment of your verified balance &mdash; we seek only modification of payment cadence and term length.</p></div></div>
  <div class="flag-item"><div class="flag-icon gold"><i class="fas fa-gavel"></i></div><div class="flag-content"><h4>Enforcement Landscape &mdash; Evolving Regulatory Environment</h4><p>Recent legislative developments have affected the enforceability of certain MCA collection mechanisms. A negotiated resolution eliminates exposure to legal proceedings and ensures predictable recovery.</p></div></div>
</div>
<div class="page-footer">
  <div class="footer-contact">
    <div class="footer-contact-item"><i class="fas fa-phone"></i> 480-631-7691</div>
    <div class="footer-contact-item"><i class="fas fa-envelope"></i> resolutions@fundersfirst.com</div>
    <div class="footer-contact-item"><i class="fas fa-globe"></i> fundersfirst.com</div>
  </div>
  <div class="footer-right">
    <div class="rbfc-badge"><i class="fas fa-certificate"></i> RBFC Advocate &mdash; Revenue Based Finance Coalition</div><br>
    <span>Page 1 of 2 &middot; Confidential &mdash; Prepared for ${ft.name} Collections/Servicing</span>
  </div>
</div>
</div></div>

<!-- PAGE 2 -->
<div class="page"><div class="content">
<div class="doc-header">
  <div class="doc-header-left">
    <img src="https://fundersfirst.com/wp-content/uploads/2026/01/Funders-First-Inc.png" alt="Funders First">
    <div class="doc-type"><i class="fas fa-file-alt"></i> &nbsp;Funder Position Analysis Brief &mdash; Page 2</div>
  </div>
  <div class="doc-header-right">
    <div class="doc-title">Restructuring Proposal</div>
    <div class="doc-subtitle">${ft.name} &middot; ${biz}</div>
  </div>
</div>
<div class="section-divider"><div class="section-divider-label"><i class="fas fa-file-signature"></i> &nbsp;Our Opening Proposal &mdash; Your Position</div><div class="section-divider-line"></div></div>
<div class="proposal-box" style="margin-bottom:0.14in;">
  <div class="proposal-box-header"><i class="fas fa-check-circle"></i> Proposed Restructuring Terms &mdash; ${ft.name}</div>
  <div class="proposal-terms">
    <div class="proposal-term"><div class="proposal-term-value">${f$(ft.balance)}</div><div class="proposal-term-label">Total Repayment<br>(100% of Balance)</div></div>
    <div class="proposal-term"><div class="proposal-term-value">${f$(proposedBiWeekly)}</div><div class="proposal-term-label">Bi-Weekly Payment<br>(Proposed)</div></div>
    <div class="proposal-term"><div class="proposal-term-value">${termWeeks} weeks</div><div class="proposal-term-label">Proposed Term<br>(~${termMonths} months)</div></div>
    <div class="proposal-term"><div class="proposal-term-value">72 hrs</div><div class="proposal-term-label">Payments Begin<br>Upon Agreement</div></div>
  </div>
</div>
<div class="section-divider"><div class="section-divider-label"><i class="fas fa-balance-scale"></i> &nbsp;Recovery Scenario Comparison</div><div class="section-divider-line"></div></div>
<div class="glass-card" style="padding:0;overflow:hidden;margin-bottom:0.14in;">
  <table class="comparison-table">
    <thead><tr>
      <th style="width:30%;text-align:left;padding:12px 14px;background:rgba(255,255,255,0.6);font-size:0.52rem;color:var(--ff-text-muted);text-transform:uppercase;letter-spacing:1px;">Outcome Factor</th>
      <th class="accept-col" style="width:35%;">&check; &nbsp;Accept Restructuring</th>
      <th class="decline-col" style="width:35%;">Pursue Default / Collections</th>
    </tr></thead>
    <tbody>
      <tr><td class="row-label">Total Recovery</td><td class="accept-val">${f$(ft.balance)} &nbsp;(100%)</td><td class="decline-val">~${f$(defaultRecovery)} &nbsp;(~35%)</td></tr>
      <tr><td class="row-label">Recovery Timeline</td><td class="accept-val">${termMonths} months, structured</td><td class="decline-val">12&ndash;18+ months, contested</td></tr>
      <tr><td class="row-label">Legal / Collection Costs</td><td class="accept-val">$0</td><td class="decline-val">$5,000 &ndash; $15,000+</td></tr>
      <tr><td class="row-label">Collection Fees</td><td class="accept-val">$0</td><td class="decline-val">25% &ndash; 35% of recovery</td></tr>
      <tr><td class="row-label">First Payment</td><td class="accept-val">Within 72 hours</td><td class="decline-val">6+ months from litigation start</td></tr>
      <tr><td class="row-label">Regulatory Exposure</td><td class="accept-val">None &mdash; negotiated resolution</td><td class="decline-val">Heightened &mdash; enforcement climate</td></tr>
      <tr><td class="row-label">Priority vs. Other ${effectivePositions.length - 1} Funders</td><td class="accept-val">Secured &mdash; structured first</td><td class="decline-val">Race to courthouse &mdash; uncertain</td></tr>
      <tr class="net-row"><td class="row-label" style="font-size:0.65rem;">Net Recovery Difference</td><td class="accept-val">+${f$(ft.balance)}</td><td class="decline-val">~${f$(defaultNet)} net of fees &amp; costs</td></tr>
    </tbody>
  </table>
</div>
<div class="section-divider"><div class="section-divider-label"><i class="fas fa-info-circle"></i> &nbsp;Why This Structure Works For You</div><div class="section-divider-line"></div></div>
<div class="two-col">
  <div class="glass-card">
    <div class="card-eyebrow"><i class="fas fa-shield-alt"></i> Our Commitment to Funders</div>
    <p style="font-size:0.63rem;color:var(--ff-text-light);line-height:1.55;margin-bottom:8px;">Funders First operates under a single governing principle: <strong style="color:var(--ff-teal-dark);">100% repayment, always.</strong> We are not a debt settlement firm and we do not advise merchants to stop paying or dispute their obligations.</p>
    <p style="font-size:0.63rem;color:var(--ff-text-light);line-height:1.55;margin-bottom:8px;">Our program works because it is mathematically honest: we extend the term, reduce the periodic payment, and ensure the merchant can continue operating &mdash; which is the only scenario where you receive 100 cents on the dollar.</p>
    <p style="font-size:0.63rem;color:var(--ff-text-light);line-height:1.55;">We are advocates of the Revenue Based Finance Coalition and believe MCA is a legitimate and valuable funding tool.</p>
  </div>
  <div class="glass-card">
    <div class="card-eyebrow"><i class="fas fa-clock"></i> The Default Scenario &mdash; What the Numbers Say</div>
    <table class="math-table">
      <tr><td class="label-col">Current monthly deficit</td><td style="color:var(--ff-red)">${monthlyDeficit < 0 ? '(' + f$(Math.abs(monthlyDeficit)) + ')' : f$(monthlyDeficit)}</td></tr>
      <tr><td class="label-col">Est. days to critical depletion</td><td style="color:var(--ff-red)">${daysToDefault < 999 ? daysToDefault + ' days' : 'N/A'}</td></tr>
      <tr><td class="label-col">Competing creditors (funders)</td><td>${effectivePositions.length} positions</td></tr>
      <tr><td class="label-col">Typical MCA default recovery</td><td style="color:var(--ff-orange)">25&ndash;40%</td></tr>
      <tr><td class="label-col">After collection fees (30%)</td><td style="color:var(--ff-red)">17&ndash;28%</td></tr>
      <tr class="total-row"><td>Your net recovery (default path)</td><td style="color:var(--ff-red)">~${f$(Math.round(ft.balance * 0.17))}&ndash;${f$(Math.round(ft.balance * 0.28))}</td></tr>
    </table>
  </div>
</div>
<div class="notice-box">
  <p><strong>Next Steps:</strong> We are prepared to begin ACH payments within 72 hours of reaching a written agreement. Please direct all communications to our office per the enclosed LNAA. To discuss terms or request modifications to this proposal, contact Gavin Roberts at <strong>480-631-7691</strong> or <strong>resolutions@fundersfirst.com</strong>. We are available Monday&ndash;Friday, 9AM&ndash;5PM MST and can accommodate calls outside these hours by appointment.</p>
</div>
<div style="margin-top:0.1in;padding:14px 18px;background:linear-gradient(135deg,var(--ff-teal-dark),var(--ff-teal));border-radius:10px;text-align:center;">
  <p style="font-size:0.65rem;color:#fff;font-style:italic;line-height:1.6;">&ldquo;We believe revenue-based finance is a legitimate and valuable tool for small business growth. Our role is not to work against funders &mdash; it is to ensure merchants survive long enough to honor their obligations in full.&rdquo;</p>
  <p style="font-size:0.52rem;color:rgba(255,255,255,0.7);margin-top:6px;text-transform:uppercase;letter-spacing:1px;">&mdash; Funders First Inc. &middot; Reducing Burdens, Not Obligations</p>
</div>
<div class="page-footer" style="margin-top:0.15in;">
  <div class="footer-contact">
    <div class="footer-contact-item"><i class="fas fa-phone"></i> 480-631-7691</div>
    <div class="footer-contact-item"><i class="fas fa-envelope"></i> resolutions@fundersfirst.com</div>
    <div class="footer-contact-item"><i class="fas fa-globe"></i> fundersfirst.com</div>
  </div>
  <div class="footer-right">
    <div class="rbfc-badge"><i class="fas fa-certificate"></i> RBFC Advocate &mdash; Revenue Based Finance Coalition</div><br>
    <span>Page 2 of 2 &middot; Confidential &mdash; Prepared for ${ft.name} Collections/Servicing</span>
  </div>
</div>
</div></div>
</body></html>`;
  };

  const generateNegotiationEmail = (funderIdx, tierIdx) => {
    const ft2 = funderTiers[funderIdx];
    if (!ft2) return '';
    const tier = ft2.tiers[tierIdx];
    if (!tier) return '';
    const f$ = (n) => '$' + Math.round(n).toLocaleString('en-US');
    const agMatch = matchAgreementToPosition(ft2.name, agreementResults);
    const originDateStr = agMatch?.analysis?.funding_date || agMatch?.analysis?.effective_date || agMatch?.analysis?.contract_date || null;
    const monthsSinceOrig = originDateStr ? Math.max(1, Math.round((Date.now() - new Date(originDateStr).getTime()) / (1000 * 60 * 60 * 24 * 30.44))) : null;
    const originNote = originDateStr ? `\nNote: This merchant's position was originated on ${originDateStr}. Current cash flow trajectory reflects ${monthsSinceOrig} month${monthsSinceOrig !== 1 ? 's' : ''} of compounding debt service.` : '';
    const statsBlock = `BANK-VERIFIED FINANCIAL OVERVIEW:\nBusiness: ${biz}\nTrue Monthly Revenue (bank-verified): ${fmt(revenue)}\nTotal Active Positions: ${effectivePositions.length}\nCombined Weekly Burden: ${fmt(totalCurrentWeekly)} (${effectivePositions.length} positions)\nWithhold % of Revenue: ${withholdPct}%\nADB Coverage: ${adbDays} days\nDays Until Likely Default: ${daysToDefault < 999 ? daysToDefault + ' days' : 'N/A'}${originNote}\n\nNOTE: All revenue figures are bank-statement verified — not merchant-reported estimates.`;
    const contractWeekly = getContractWeekly(agMatch);
    const currentWeeklyLabel = contractWeekly && contractWeekly > 0
      ? `${f$(contractWeekly)} (per agreement)` : f$(ft2.originalWeekly);
    const overpullDelta = contractWeekly && contractWeekly > 0
      ? ft2.originalWeekly - contractWeekly : 0;
    const hasOverpull = overpullDelta > contractWeekly * 0.01;
    const overpullNote = hasOverpull
      ? `\nNote: Recent debits of ${f$(ft2.originalWeekly)} exceed your contractual installment — this has been noted in our analysis.` : '';
    const proposalBlock = `YOUR POSITION:\nYour Current Weekly Payment:    ${currentWeeklyLabel}\nProposed Weekly Payment:        ${f$(tier.weeklyPayment)}\nWeekly Reduction:               ${f$(tier.reductionDollars)} less per week\nPayment Reduction:              ${(parseFloat(tier.reductionPct) || 0).toFixed(1)}%\nYour Original Term:             ${ft2.originalTermWeeks} weeks\nProposed Term:                  ${tier.proposedTermWeeks} weeks\nTerm Extension:                 +${(parseFloat(tier.extensionPct) || 0).toFixed(1)}% longer\nTotal Repayment:                ${f$(ft2.balance)} — 100% of your balance\nPayments Begin:                 Within 72 hours of agreement${overpullNote}`;
    const defaultRecovery = Math.round(ft2.balance * 0.35);
    const defaultNet = Math.round(defaultRecovery * 0.7);
    const comparisonBlock = `════════════════════════════════════════════════════════════════\n                     YOUR OPTIONS COMPARED\n════════════════════════════════════════════════════════════════\n   ACCEPT PROPOSAL                │  PURSUE DEFAULT/COLLECTIONS\n───────────────────────────────────────────────────────────────\n   Total Recovery:                │\n     ${f$(ft2.balance)} (100%)          │  ~${f$(defaultRecovery)} (~35%)\n   Your Weekly Payment:           │\n     ${f$(tier.weeklyPayment)}/wk             │  $0 (frozen/litigation)\n   Your Term:                     │\n     ${tier.proposedTermWeeks} weeks                │  12-18+ months contested\n   Legal Costs: $0                │  $5,000 - $15,000+\n   Collection Fees: $0            │  25-35% of recovery\n   First Payment: 72 hours        │  6+ months from litigation\n   Regulatory Exposure: None      │  Heightened\n───────────────────────────────────────────────────────────────\n   NET RECOVERY: +${f$(ft2.balance - defaultNet)} by accepting\n════════════════════════════════════════════════════════════════`;
    const signature = `Best regards,\nGavin Roberts\nResolutions Manager\n480-631-7691\nresolutions@fundersfirst.com\nPhoenix, AZ\n\nRBFC Advocate | Revenue Based Finance Coalition`;
    const lnaaNotice = `Per the enclosed LNAA, all communications regarding this account must now be directed to our office. Please do not contact the merchant directly.`;
    let emailText = '';
    if (tierIdx === 0) {
      emailText = `Subject: Payment Modification Request – ${biz} – ${ft2.name}\n\nDear ${ft2.name} Collections/Servicing Team,\n\nWe are reaching out on behalf of ${biz} regarding their merchant cash advance position with your organization.\n\nIMPORTANT — WHO WE ARE:\nFunders First is NOT a debt settlement company. We do not advise merchants that MCAs are predatory, unfair, or that they don't owe what they contracted for. We believe in and support revenue-based finance as a legitimate funding tool for small businesses.\n\nThe issue here is over-stacking. This merchant is servicing ${effectivePositions.length} concurrent funding positions, consuming ${withholdPct}% of weekly revenue. This level of debt service is mathematically unsustainable and, without intervention, leads to default — which benefits no one.\n\nOur solution protects your investment by ensuring 100% repayment while giving the merchant breathing room to operate their business.\n\n${statsBlock}\n\n${proposalBlock}\n\n${comparisonBlock}\n\nWe are prepared to begin payments within 72 hours of reaching agreement.\n\nATTACHMENT: Please find enclosed our Limited Negotiation Authorization Agreement (LNAA), executed by ${biz}, authorizing Funders First to negotiate on their behalf.\n\n${lnaaNotice}\n\n${signature}`;
    } else if (tierIdx === 1) {
      const email1Tier = ft2.tiers[0];
      emailText = `Subject: Revised Proposal – ${biz} – Improved Terms Available\n\nDear ${ft2.name} Collections/Servicing Team,\n\nFollowing our previous communication regarding ${biz}, we are presenting significantly improved terms for your consideration.\n\nNote: Cash position has continued to decline since our initial outreach. Estimated days to default: ${daysToDefault < 999 ? daysToDefault : 'critical'}.\n\n${statsBlock}\n\n${proposalBlock}\n\nThis offer represents a ${(parseFloat((tier.weeklyPayment - email1Tier.weeklyPayment) / email1Tier.weeklyPayment * 100) || 0).toFixed(0)}% increase in weekly payment over our opening proposal and reduces your term from ${email1Tier.proposedTermWeeks} to ${tier.proposedTermWeeks} weeks.\n\n${comparisonBlock}\n\nWe remain committed to ensuring you receive 100% of what is owed. Please respond so we can finalize terms and begin remittance immediately.\n\n${lnaaNotice}\n\n${signature}`;
    } else {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const deadlineStr = futureDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      emailText = `Subject: Final Proposal – ${biz} – Maximum Allocation\n\nDear ${ft2.name} Collections/Servicing Team,\n\nThis represents our final proposal for the ${biz} restructuring. This is our maximum weekly allocation for your position.\n\n${statsBlock}\n\n${proposalBlock}\n\nThis is our maximum weekly allocation for your position. Your term at full allocation is ${tier.proposedTermWeeks} weeks — the shortest possible timeline under this program.\n\n${comparisonBlock}\n\nBased on current cash flow trajectory, this is the final opportunity to participate in a structured repayment. Positions not accommodated by ${deadlineStr} will be removed from the structured payment pool.\n\n${lnaaNotice}\n\n${signature}`;
    }
    if (!confidentialityCheck(emailText)) {
      return 'ERROR: CONFIDENTIALITY BLOCK — ISO/FF data detected in funder output. This email cannot be generated.';
    }
    return emailText;
  };

  const copyOffer = () => {
    if (funderTiers.length === 0) return;
    const selTier = tierDefs[selectedTierIdx];
    const termMonths = Math.round(maxTerm / 4.33);
    const lines = [
      `FUNDERS FIRST — ISO OFFER PITCH`,
      `Merchant: ${biz}`,
      `Total Debt Stack: ${fmt(totalBalance)} across ${effectivePositions.length} enrolled positions`,
      `Current Weekly Burden: ${fmt(totalCurrentWeekly)}/wk`,
      ``,
      `Proposed Terms (${selTier.label} — ${(selTier.pct * 100).toFixed(0)}%):`,
      `Merchant Weekly Payment: ${fmtD(merchantPaysWeekly)}/wk`,
      `Payment Reduction: ${reductionPct_display.toFixed(1)}%`,
      `Est. Term: ~${termMonths} months`,
      `Total Payback: ${fmt(totalBalance + ffFeeTotal + commissionTotal)} (${(totalBalance > 0 ? ((totalBalance + ffFeeTotal + commissionTotal) / totalBalance) : 0).toFixed(2)}\u00d7 factor)`,
      `Enrollment Fee: ${fmt(enrollmentFee)}`,
      ``,
      `ISO Commission (${isoPoints} pts): ${fmt(commissionTotal)} (${(commissionRate * 100).toFixed(1)}%)`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedOffer(true);
    setTimeout(() => setCopiedOffer(false), 2000);
  };

  const downloadCSV = () => {
    const csvRows = [
      ['field', 'value', 'notes'],
      ['business_name', a.business_name, ''],
      ['bank_name', a.bank_name, ''],
      ['monthly_revenue', revenue, 'Bank-verified adjusted'],
      ['total_mca_debt_service', includedMonthly, 'Monthly'],
      ['avg_daily_balance', adb, ''],
      ['dsr_percent', currentDSR.toFixed(1), ''],
      ['total_positions', effectivePositions.length, 'Enrolled'],
      ['total_balance', totalBalance, ''],
      ['total_weekly_burden', totalCurrentWeekly, ''],
      ['analysis_date', new Date().toISOString().split('T')[0], ''],
    ].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a2 = document.createElement('a');
    a2.href = url;
    a2.download = `FF-Analysis-${(a.business_name || 'export').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    a2.click();
    URL.revokeObjectURL(url);
  };

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
            <div style={{ fontSize: 9, color: 'rgba(234,208,104,0.7)', textAlign: 'center', marginTop: 4 }}>
              Linear: 1% per point (0–15 pts)
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

        {/* Negotiation Buffer & Tail Weeks */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 12 }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)' }}>Negotiation Buffer</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#00e5ff' }}>{negotiationBuffer} wks</div>
            </div>
            <input type="range" min={0} max={8} step={1} value={negotiationBuffer} onChange={e => setNegotiationBuffer(Number(e.target.value))} style={{ width: '100%', accentColor: '#00e5ff' }} />
            <div style={{ fontSize: 9, color: 'rgba(0,229,255,0.7)', textAlign: 'center', marginTop: 4 }}>
              {fmtD(negotiationBuffer * merchantWeeklyAtFinal)} collected before funders accept
            </div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)' }}>Tail Weeks</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f97316' }}>{tailWeeks} wks</div>
            </div>
            <input type="range" min={0} max={16} step={1} value={tailWeeks} onChange={e => setTailWeeks(Number(e.target.value))} style={{ width: '100%', accentColor: '#f97316' }} />
            <div style={{ fontSize: 9, color: 'rgba(249,115,22,0.7)', textAlign: 'center', marginTop: 4 }}>
              {fmtD(tailWeeks * merchantWeeklyAtFinal)} after funders paid off
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

      {/* Current → Proposed arrow */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 12, background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Current Weekly Burden</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ef5350' }}>{fmt(totalCurrentWeekly)}</div>
          <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>DSR: {fmtP(currentDSR)}</div>
        </div>
        <div style={{ fontSize: 32, color: selectedReduction > 0 ? '#4caf50' : '#ef5350' }}>{'\u2192'}</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Merchant Pays FF (Fixed)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#22c55e' }}>{fmtD(merchantPaysWeekly)}</div>
          <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>DSR: {fmtP(proposedDSR)}</div>
        </div>
      </div>

      {/* Two-column layout */}
      {(() => {
        const disclosedPayback = totalBalance + ffFeeTotal + commissionTotal;
        const disclosedCost = ffFeeTotal + commissionTotal;
        const disclosedFactor = totalBalance > 0 ? (disclosedPayback / totalBalance) : 0;
        const agreementYears = maxTerm / 52;
        const aprEquiv = totalBalance > 0 && agreementYears > 0 ? (disclosedCost / totalBalance / agreementYears) * 100 : 0;
        const actualCollections = merchantPaysWeekly * maxTerm;
        const actualTermWeeks = merchantPaysWeekly > 0 ? Math.ceil(disclosedPayback / merchantPaysWeekly) : 0;
        // Hybrid cost display — APR for terms >= 52 weeks, Total Cost % for shorter terms
        const useAPR = (maxTerm || 0) >= 52;
        const disclosedCostPct = totalBalance > 0 ? ((disclosedCost / totalBalance) * 100) : 0;
        const costDisplayValue = useAPR ? aprEquiv.toFixed(1) + '%' : disclosedCostPct.toFixed(1) + '%';
        const costDisplayLabel = useAPR ? 'APR Equivalent' : 'Total Cost';
        const costDisplayColor = useAPR
          ? (aprEquiv <= 24 ? '#4caf50' : aprEquiv <= 30 ? '#f59e0b' : '#ef5350')
          : (disclosedCostPct <= 25 ? '#4caf50' : disclosedCostPct <= 35 ? '#f59e0b' : '#ef5350');
        const costDisplayNote = useAPR
          ? (aprEquiv <= 19 ? 'Below market' : aprEquiv <= 24 ? 'Competitive' : aprEquiv <= 30 ? 'Above market' : 'High')
          : ('vs 30-45% avg MCA cost');
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {/* LEFT — ISO / Merchant Facing */}
            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: 20, border: '1px solid rgba(76,175,80,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4caf50' }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4caf50', textTransform: 'uppercase', letterSpacing: 0.8 }}>ISO / Merchant Facing</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: 'Weekly Payment', value: fmtD(merchantPaysWeekly), color: '#4caf50', hero: true },
                  { label: 'Est. Term', value: `~${Math.round(maxTerm / 4.33)} months`, color: '#e8e8f0' },
                  { label: 'Total Payback', value: fmt(disclosedPayback), color: '#e8e8f0', note: disclosedFactor.toFixed(2) + '\u00d7 factor' },
                  { label: 'Payment Reduction', value: fmtP(selectedReduction), color: selectedReduction > 0 ? '#4caf50' : '#ef5350', hero: true },
                  { label: costDisplayLabel, value: costDisplayValue, color: costDisplayColor, note: costDisplayNote },
                  { label: 'Enrollment Fee', value: fmt(enrollmentFee), color: '#00bcd4' },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: s.hero ? 24 : 20, fontWeight: s.hero ? 800 : 700, color: s.color }}>{s.value}</div>
                    {s.note && <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>{s.note}</div>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.25)', fontStyle: 'italic', textAlign: 'center', marginTop: 10 }}>
                This is what the ISO and merchant see on dashboards + offer preview
              </div>
            </div>

            {/* RIGHT — FF Internal Only */}
            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: 20, border: '1px solid rgba(207,165,41,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#CFA529' }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#CFA529', textTransform: 'uppercase', letterSpacing: 0.8 }}>FF Internal Only</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: 'Total Debt', value: fmt(totalBalance), color: '#ef5350', hero: true },
                  { label: 'Disclosed Payback', value: fmt(disclosedPayback), color: '#e8e8f0', note: disclosedFactor.toFixed(2) + '\u00d7' },
                  { label: 'Actual Collections', value: fmt(actualCollections), color: '#4caf50', note: fmtD(merchantPaysWeekly) + ' \u00d7 ' + maxTerm + 'wk' },
                  { label: 'Agreement Term', value: maxTerm < 9999 ? `${maxTerm} wks` : '\u2014', color: '#e8e8f0', note: `${negotiationBuffer}+${maxFunderTerm}+${tailWeeks}` },
                  { label: 'Actual Term', value: `${actualTermWeeks} wks`, color: '#e8e8f0', note: `~${Math.round(actualTermWeeks / 4.33)} months` },
                  { label: 'TAD to Funders/wk', value: fmtD(selectedTAD), color: tierColors[selectedTierIdx], final: selectedTierIdx !== 3 ? fmtD(tad) : null },
                  { label: 'ISO Commission/wk', value: fmtD(isoCommWeekly), color: '#EAD068', note: fmt(commissionTotal) + ' total' },
                  { label: 'FF Factor Fee/wk', value: fmtD(ffFeeWeekly), color: '#CFA529', note: fmt(ffFeeTotal) + ' total' },
                  { label: 'FF Buffer/wk', value: fmtD(Math.max(0, tad - selectedTAD)), color: selectedTierIdx === 3 ? 'rgba(232,232,240,0.3)' : '#a78bfa', note: selectedTierIdx === 3 ? 'None at Final' : ((1 - selectedPct) * 100).toFixed(0) + '% of TAD' },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: s.hero ? 22 : 18, fontWeight: s.hero ? 800 : 700, color: s.color }}>{s.value}</div>
                    {s.final && <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>Final: {s.final}</div>}
                    {s.note && <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>{s.note}</div>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.3)', textAlign: 'center', marginTop: 10 }}>
                Funders: {fmtD(selectedTAD)} + ISO: {fmtD(isoCommWeekly)} + FF: {fmtD(ffFeeWeekly)} + Buffer: {fmtD(Math.max(0, tad - selectedTAD))} = {fmtD(merchantPaysWeekly)}/wk
              </div>
            </div>
          </div>
        );
      })()}

      {/* Negative TAD warning */}
      {tad < 0 && (
        <div style={{ marginBottom: 10, padding: '8px 14px', borderRadius: 8, background: 'rgba(239,83,80,0.12)', border: '1px solid rgba(239,83,80,0.3)', fontSize: 12, color: '#ef5350', textAlign: 'center' }}>
          {'\uD83D\uDEA8'} Negative TAD: FF Factor fee + ISO commission exceed merchant capacity.
        </div>
      )}

      {/* Locked position summary */}
      {lockedCount > 0 && (
        <div style={{ marginBottom: 12, fontSize: 11, textAlign: 'center', color: 'rgba(232,232,240,0.5)' }}>
          <span style={{ color: '#EAD068' }}>{'🔒'} Locked: {lockedCount} ({fmtD(totalLocked)}/wk)</span>
          <span style={{ margin: '0 10px' }}>|</span>
          <span>Unlocked: {unlockedCount} ({fmtD(remainingTAD)}/wk remaining TAD)</span>
        </div>
      )}

      {/* ═══════════════ FF REVENUE ANALYSIS ═══════════════ */}
      <div style={S.divider} />
      <div style={S.section}>FF Revenue Analysis</div>
      {(() => {
        const frontRev = negotiationBuffer * merchantPaysWeekly;
        const ffFeeTotalRev = ffFeeTotal;
        const tierBufferRev = Math.max(0, tad - selectedTAD) * maxFunderTerm;
        const tailRev = tailWeeks * merchantPaysWeekly;
        const totalFFRev = frontRev + ffFeeTotalRev + tierBufferRev + tailRev;
        const agreementTermWks = maxTerm;
        const agreementYears = agreementTermWks / 52;
        const totalMerchantCost = commissionTotal + ffFeeTotalRev + frontRev + tailRev;
        const aprEquiv = totalBalance > 0 && agreementYears > 0 ? (totalMerchantCost / totalBalance / agreementYears) * 100 : 0;
        const useAPRRev = (agreementTermWks || 0) >= 52;
        const totalCostPct = totalBalance > 0 ? ((totalMerchantCost / totalBalance) * 100) : 0;
        const revCostValue = useAPRRev ? aprEquiv.toFixed(1) + '%' : totalCostPct.toFixed(1) + '%';
        const revCostLabel = useAPRRev ? 'APR Equivalent' : 'Total Cost';
        const revCostColor = useAPRRev
          ? (aprEquiv <= 24 ? '#4caf50' : aprEquiv <= 30 ? '#f59e0b' : '#ef5350')
          : (totalCostPct <= 25 ? '#4caf50' : totalCostPct <= 35 ? '#f59e0b' : '#ef5350');
        const revCostNote = useAPRRev
          ? (aprEquiv <= 19 ? 'Below market' : aprEquiv <= 24 ? 'Competitive' : aprEquiv <= 30 ? 'Above market' : 'High')
          : ('vs 30-45% avg MCA cost');
        return (
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            {/* Row 1: Revenue components */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Front Buffer', value: fmt(frontRev), color: '#00e5ff', note: `${negotiationBuffer} wks \u00d7 ${fmtD(merchantPaysWeekly)}` },
                { label: 'FF Factor Fee', value: fmt(ffFeeTotalRev), color: '#CFA529', note: `${effectiveFFRate.toFixed(3)} on ${fmt(totalBalance)}` },
                { label: 'Tier Buffer Held', value: fmt(tierBufferRev), color: '#a78bfa', note: `tier % \u00d7 ${maxFunderTerm}wk` },
                { label: 'Tail Revenue', value: fmt(tailRev), color: '#f97316', note: `${tailWeeks} wks \u00d7 ${fmtD(merchantPaysWeekly)}` },
              ].map((s, i) => (
                <div key={i} style={S.kpiBox()}>
                  <div style={S.kpiLabel}>{s.label}</div>
                  <div style={S.kpiValue(s.color)}>{s.value}</div>
                  {s.note && <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>{s.note}</div>}
                </div>
              ))}
            </div>
            {/* Row 2: Summary metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              <div style={{ background: 'linear-gradient(135deg, rgba(76,175,80,0.15), rgba(76,175,80,0.05))', border: '1px solid rgba(76,175,80,0.2)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Total FF Revenue</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#4caf50' }}>{fmt(totalFFRev)}</div>
                <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>{fmt(totalFFRev / (agreementTermWks / 4.33))}/mo avg</div>
              </div>
              <div style={{ background: `linear-gradient(135deg, ${revCostColor}22, ${revCostColor}0d)`, border: `1px solid ${revCostColor}33`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{revCostLabel}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: revCostColor }}>{revCostValue}</div>
                <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>{revCostNote}{useAPRRev ? ' (19-24% benchmark)' : ''}</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Agreement Term</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#e8e8f0' }}>{agreementTermWks} wks</div>
                <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>~{Math.round(agreementTermWks / 4.33)} months</div>
              </div>
            </div>
            {/* Waterfall */}
            <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.3)', textAlign: 'center' }}>
              Front: {fmt(frontRev)} + Fee: {fmt(ffFeeTotalRev)} + Buffer: {fmt(tierBufferRev)} + Tail: {fmt(tailRev)} = {fmt(totalFFRev)} total FF revenue {'\u00b7'} + Enrollment: {fmt(enrollmentFee)}
            </div>
          </div>
        );
      })()}

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

      {/* ═══════════════ LINEAR COMMISSION REFERENCE TABLE ═══════════════ */}
      <div style={S.divider} />
      <div style={S.section}>Linear Commission Reference</div>
      <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 16, marginBottom: 20, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {['Points', 'Rate (1%/pt)', `Commission on ${fmt(totalBalance)}`].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Points' ? 'left' : 'right', fontSize: 10, color: 'rgba(232,232,240,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 16 }, (_, pts) => {
              const rate = getGraduatedCommissionRate(pts);
              const isActive = pts === isoPoints;
              return (
                <tr key={pts} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isActive ? 'rgba(234,208,104,0.08)' : 'transparent' }}>
                  <td style={{ padding: '5px 10px', color: isActive ? '#EAD068' : '#e8e8f0', fontWeight: isActive ? 700 : 400 }}>{pts}</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: isActive ? '#EAD068' : 'rgba(232,232,240,0.6)', fontWeight: isActive ? 700 : 400 }}>{(rate * 100).toFixed(1)}%</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', color: isActive ? '#EAD068' : 'rgba(232,232,240,0.5)', fontWeight: isActive ? 700 : 400 }}>{fmt(totalBalance * rate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ═══════════════ APPROVED BANNER ═══════════════ */}
      {isApproved && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(207,165,41,0.12), rgba(234,208,104,0.08))',
          border: '1px solid rgba(207,165,41,0.3)',
          borderRadius: 12, padding: '14px 20px', marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#EAD068', marginBottom: 2 }}>
              ✓ Deal Approved {dealStatus === 'enrolled' ? '& Enrolled' : ''}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)' }}>
              Pricing is locked. {dealStatus === 'approved' ? 'Enroll this deal in the CRM to begin onboarding.' : 'Merchant onboarding is active.'}
            </div>
          </div>
          <div style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: dealStatus === 'enrolled' ? 'rgba(0,172,193,0.15)' : 'rgba(207,165,41,0.15)',
            color: dealStatus === 'enrolled' ? '#00e5ff' : '#EAD068',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {dealStatus}
          </div>
        </div>
      )}

      {/* ═══════════════ DEAL ACTIONS BAR ═══════════════ */}
      <div style={S.divider} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => handleSaveDeal(false)}
          disabled={saveStatus === 'saving' || isApproved}
          style={{ padding: '10px 22px', borderRadius: 8, border: 'none', cursor: saveStatus === 'saving' || isApproved ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: 'linear-gradient(135deg, #00acc1, #00e5ff)', color: '#0a0a0f', letterSpacing: 0.5, opacity: saveStatus === 'saving' || isApproved ? 0.4 : 1 }}>
          {saveStatus === 'saving' ? 'Saving...' : savedDealId ? 'Update Deal' : 'Save Deal'}
        </button>
        <button
          onClick={() => handleSaveDeal(true)}
          disabled={saveStatus === 'saving' || isApproved}
          style={{ padding: '10px 22px', borderRadius: 8, border: 'none', cursor: saveStatus === 'saving' || isApproved ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: 'linear-gradient(135deg, #CFA529, #EAD068)', color: '#0a0a0f', letterSpacing: 0.5, opacity: saveStatus === 'saving' || isApproved ? 0.4 : 1 }}>
          {saveStatus === 'saving' ? 'Saving...' : 'Save & Price'}
        </button>
        <button
          onClick={handleLoadDealList}
          style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', background: 'rgba(255,255,255,0.08)', color: '#e8e8f0', letterSpacing: 0.5 }}>
          Load Deal
        </button>
        {/* ── Approve Button ── */}
        {!isApproved && (
          <button
            onClick={() => setShowApproveConfirm(true)}
            disabled={saveStatus === 'saving' || effectivePositions.length === 0}
            style={{
              padding: '10px 22px', borderRadius: 8, cursor: saveStatus === 'saving' || effectivePositions.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit', letterSpacing: 0.5,
              background: 'linear-gradient(135deg, rgba(207,165,41,0.15), rgba(234,208,104,0.1))',
              border: '2px solid rgba(207,165,41,0.5)',
              color: '#EAD068',
              opacity: saveStatus === 'saving' || effectivePositions.length === 0 ? 0.4 : 1,
            }}>
            ✓ Approve Deal
          </button>
        )}
        {savedDealId && (
          <span style={{ fontSize: 11, color: 'rgba(0,229,255,0.6)', fontFamily: 'monospace' }}>
            ID: {savedDealId.slice(0, 8)}…
          </span>
        )}
        {saveStatus === 'saved' && (
          <span style={{ fontSize: 12, color: '#4caf50', fontWeight: 600 }}>✓ {isApproved ? 'Approved & Locked' : 'Saved'}</span>
        )}
        {saveStatus === 'error' && (
          <span style={{ fontSize: 12, color: '#ef5350', fontWeight: 500 }}>✗ {saveError || 'Error'}</span>
        )}
      </div>

      {/* ═══════════════ APPROVE CONFIRMATION MODAL ═══════════════ */}
      {showApproveConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowApproveConfirm(false)}>
          <div style={{ background: '#12121a', border: '1px solid rgba(207,165,41,0.3)', borderRadius: 16, padding: 28, width: '90%', maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#EAD068', marginBottom: 16 }}>Approve Deal?</div>
            <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.7)', lineHeight: 1.7, marginBottom: 20 }}>
              This will <strong style={{ color: '#e8e8f0' }}>lock all pricing values</strong> and set the deal status to <strong style={{ color: '#EAD068' }}>Approved</strong>.
              After approval, the deal can be enrolled in the CRM to begin merchant onboarding.
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                <div><span style={{ color: 'rgba(232,232,240,0.4)' }}>Merchant:</span> <strong>{biz}</strong></div>
                <div><span style={{ color: 'rgba(232,232,240,0.4)' }}>Positions:</span> <strong>{effectivePositions.length}</strong></div>
                <div><span style={{ color: 'rgba(232,232,240,0.4)' }}>Total Debt:</span> <strong>{fmt(totalBalance)}</strong></div>
                <div><span style={{ color: 'rgba(232,232,240,0.4)' }}>Weekly:</span> <strong style={{ color: '#00e5ff' }}>{fmt(merchantWeeklyAtFinal)}</strong></div>
                <div><span style={{ color: 'rgba(232,232,240,0.4)' }}>Term:</span> <strong>{maxTerm} wks</strong></div>
                <div><span style={{ color: 'rgba(232,232,240,0.4)' }}>ISO Pts:</span> <strong>{isoPoints}</strong></div>
                <div><span style={{ color: 'rgba(232,232,240,0.4)' }}>FF Factor:</span> <strong>{(effectiveFFRate || 0).toFixed(3)}</strong></div>
                <div><span style={{ color: 'rgba(232,232,240,0.4)' }}>DSR:</span> <strong>{proposedDSR.toFixed(1)}%</strong></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowApproveConfirm(false)} style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#e8e8f0', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={handleApproveDeal} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #CFA529, #EAD068)', color: '#0a0a0f', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', letterSpacing: 0.5 }}>
                Approve & Lock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ LOAD DEAL MODAL ═══════════════ */}
      {showLoadModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowLoadModal(false)}>
          <div style={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 600, maxHeight: '70vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e8f0' }}>Load Saved Deal</div>
              <button onClick={() => setShowLoadModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(232,232,240,0.5)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            {loadingDeals ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(232,232,240,0.4)' }}>Loading deals…</div>
            ) : dealList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(232,232,240,0.4)' }}>No saved deals found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dealList.map(d => (
                  <button key={d.id} onClick={() => handleSelectDeal(d.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,229,255,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0' }}>{d.merchant_name || d.merchant_dba || 'Unnamed'}</div>
                      <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginTop: 2 }}>
                        {d.position_count || 0} positions · {fmt(d.total_balance || 0)} · {d.status}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: d.merchant_weekly_payment ? '#00e5ff' : 'rgba(232,232,240,0.3)' }}>
                        {d.merchant_weekly_payment ? `${fmt(d.merchant_weekly_payment)}/wk` : 'Not priced'}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.3)', marginTop: 2 }}>
                        {d.updated_at ? new Date(d.updated_at).toLocaleDateString() : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ FUNDER NEGOTIATION EMAILS ═══════════════ */}
      <div style={S.divider} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={S.section}>Funder Negotiation Emails</div>
        <button onClick={() => setShowNegEmails(v => !v)} style={{ padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#e8e8f0', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
          {showNegEmails ? '\u25B2 Collapse' : '\u25BC Expand'}
        </button>
      </div>

      {showNegEmails && (
        <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Select Funder:</label>
              <select value={negFunderId ?? ''} onChange={e => setNegFunderId(e.target.value === '' ? null : Number(e.target.value))} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit', minWidth: 280 }}>
                <option value="">Select a funder…</option>
                {funderTiers.map((ft3, i) => <option key={i} value={i}>{ft3.name} — {fmt(ft3.balance)} bal — {fmtD(ft3.tiers[selectedTierIdx]?.weeklyPayment || 0)}/wk</option>)}
              </select>
            </div>
          </div>

          {negFunderId !== null && funderTiers[negFunderId] && (() => {
            const selFt = funderTiers[negFunderId];
            return (
              <div>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 12, color: 'rgba(232,232,240,0.7)', lineHeight: 1.8 }}>
                  <div style={{ fontSize: 16, color: '#00e5ff', fontWeight: 700, marginBottom: 6 }}>{selFt.name}</div>
                  <div>Balance: <strong style={{ color: '#e8e8f0' }}>{fmt(selFt.balance)}</strong> · Original: <strong style={{ color: '#ef9a9a' }}>{fmt(selFt.originalWeekly)}/wk</strong> · Allocation: <strong style={{ color: '#00e5ff' }}>{fmtD(selFt.tiers[selectedTierIdx]?.weeklyPayment || 0)}/wk</strong></div>
                  <div>Total Repayment (all tiers): <strong style={{ color: '#4caf50' }}>{fmt(selFt.balance)}</strong> (100%)</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                  {[0, 1, 2, 3].map(ti => {
                    const t = selFt.tiers[ti];
                    if (!t) return null;
                    return (
                      <div key={ti} style={{ background: `${tierColors[ti]}08`, border: `1px solid ${tierColors[ti]}44`, borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: tierColors[ti], marginBottom: 8 }}>{tierDefs[ti].label} ({(tierDefs[ti].pct * 100).toFixed(0)}%)</div>
                        <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.6)', lineHeight: 1.8, marginBottom: 10 }}>
                          <div>Payment: <strong style={{ color: tierColors[ti] }}>{fmtD(t.weeklyPayment)}/wk</strong></div>
                          <div>Reduction: <strong>{(parseFloat(t.reductionPct) || 0).toFixed(1)}%</strong> ({fmtD(t.reductionDollars)} less)</div>
                          <div>Term: <strong>{t.proposedTermWeeks} wks</strong> ({Math.round(t.proposedTermWeeks / 4.33)} mo)</div>
                          <div>Extension: +{(parseFloat(t.extensionPct) || 0).toFixed(0)}%</div>
                          <div>Repayment: <strong style={{ color: '#4caf50' }}>{fmt(t.totalRepayment)}</strong></div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { const txt = generateNegotiationEmail(negFunderId, ti); navigator.clipboard.writeText(txt); setCopiedEmail(`${negFunderId}-${ti}`); setTimeout(() => setCopiedEmail(null), 2000); }} style={{ flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', background: 'linear-gradient(135deg, #00acc1, #00e5ff)', color: '#0a0a0f' }}>
                            {copiedEmail === `${negFunderId}-${ti}` ? '\u2713 Copied!' : 'Copy Email'}
                          </button>
                          <button onClick={() => { const html = generateBriefHTML(negFunderId, ti); const w = window.open('', '_blank'); w.document.write(html); w.document.close(); }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 10, fontFamily: 'inherit', background: 'rgba(255,255,255,0.08)', color: '#e8e8f0' }}>
                            PDF
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 16, maxHeight: 500, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {[0, 1, 2, 3].map(ti => (
                      <button key={ti} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'default', border: `1px solid ${tierColors[ti]}`, background: `${tierColors[ti]}22`, color: tierColors[ti], fontFamily: 'inherit' }}>
                        {tierDefs[ti].label} — {selFt.tiers[ti]?.proposedTermWeeks || '—'} wks
                      </button>
                    ))}
                  </div>
                  <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 11, color: 'rgba(232,232,240,0.85)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {generateNegotiationEmail(negFunderId, 0)}
                  </pre>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════ EXPORT ═══════════════ */}
      <div style={S.divider} />
      <div style={S.section}>Export</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={downloadCSV} style={{ padding: '10px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: 'linear-gradient(135deg, #00acc1, #00e5ff)', color: '#0a0a0f', letterSpacing: 0.5 }}>
          {'\u2B07'} Download CSV
        </button>
        <button onClick={copyOffer} style={{ padding: '10px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: 'linear-gradient(135deg, #CFA529, #EAD068)', color: '#0a0a0f', letterSpacing: 0.5 }}>
          {copiedOffer ? '\u2713 Copied!' : '\uD83D\uDCCB Copy ISO Pitch'}
        </button>
        <button onClick={() => navigator.clipboard.writeText(JSON.stringify(a, null, 2))} style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', background: 'rgba(255,255,255,0.08)', color: '#e8e8f0', letterSpacing: 0.5 }}>
          {'\uD83D\uDCCB'} Copy Full JSON
        </button>
      </div>

      {/* ═══════════════ ANALYSIS METADATA ═══════════════ */}
      <div style={S.section}>Analysis Metadata</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Source File', value: fileName || '\u2014' },
          { label: 'Analyzed', value: new Date().toLocaleString() },
          { label: 'Statement Period', value: a.statement_month
              ? a.statement_month
              : a.statement_periods?.length > 1
                ? `${a.statement_periods[0]?.month || ''} \u2014 ${a.statement_periods[a.statement_periods.length - 1]?.month || ''}`
                : a.statement_periods?.[0]?.month
                  || (a.monthly_breakdown?.length > 1
                    ? `${a.monthly_breakdown[0]?.month || ''} \u2014 ${a.monthly_breakdown[a.monthly_breakdown.length - 1]?.month || ''}`
                    : a.monthly_breakdown?.[0]?.month || '\u2014') },
          { label: 'Positions Enrolled', value: `${effectivePositions.length} positions` },
        ].map((s, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 13, color: '#e8e8f0', wordBreak: 'break-all' }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

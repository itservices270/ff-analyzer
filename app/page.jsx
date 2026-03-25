'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { INDUSTRY_PROFILES, buildIndustryPromptBlock } from './data/industry-profiles';
import NegotiationChat from './components/NegotiationChat';
import PricingTab from './components/PricingTab';
import { scoreAllPositions, detectSameDayStack, calculateAdjustedTAD } from '../lib/scoringEngine';

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

// ─── Agreement ↔ Position Matching & Payment Compliance ─────────────────────
function matchAgreementToPosition(positionName, agreementResults) {
  if (!positionName || !agreementResults || agreementResults.length === 0) return null;
  const pName = (positionName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const pTokens = (positionName || '').toLowerCase().split(/\s+/).filter(t => t.length > 2);
  return (agreementResults || []).find(ag => {
    const agName = (ag?.analysis?.funder_name || '').toLowerCase();
    if (!agName) return false;
    const agNorm = agName.replace(/[^a-z0-9]/g, '');
    // Exact normalized match
    if (agNorm && pName && (agNorm.includes(pName.slice(0, 8)) || pName.includes(agNorm.slice(0, 8)))) return true;
    // Token overlap
    const agTokens = agName.split(/\s+/).filter(t => t.length > 2);
    const overlap = pTokens.filter(t => agTokens.some(at => at.includes(t) || t.includes(at)));
    if (agTokens.length > 0 && overlap.length / Math.max(agTokens.length, pTokens.length) >= 0.5) return true;
    // First-word match (fallback)
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
  // Fall back to daily × 5 if only daily exists
  const d = ag.daily_payment || ag.financial_terms?.specified_daily_payment || 0;
  if (d > 0) return d * 5;
  return null;
}

function buildPaymentCompliance(positions, agreementResults, monthlyBreakdown) {
  if (!positions || positions.length === 0) return [];
  const months = (monthlyBreakdown || []).map(m => m.month).sort();
  const latestMonth = months.length > 0 ? months[months.length - 1] : null;

  return positions.map(p => {
    const agMatch = matchAgreementToPosition(p.funder_name, agreementResults);
    const contractWeekly = getContractWeekly(agMatch);
    const latestActual = p.payment_amount_current || p.payment_amount || 0;
    const priorActual = p.payment_amount_original || latestActual;
    const toWeekly = (amt, freq) => freq === 'daily' ? amt * 5 : freq === 'bi-weekly' ? amt / 2 : freq === 'monthly' ? amt / 4.33 : amt;
    const latestWeekly = toWeekly(latestActual, p.frequency);
    const priorWeekly = toWeekly(priorActual, p.frequency);

    let contractStatus = null, contractDelta = 0, contractDeltaPct = 0;
    if (contractWeekly && contractWeekly > 0) {
      contractDelta = latestWeekly - contractWeekly;
      contractDeltaPct = (contractDelta / contractWeekly) * 100;
      if (Math.abs(contractDeltaPct) <= 1) contractStatus = 'match';
      else if (contractDeltaPct > 1) contractStatus = 'overpull';
      else contractStatus = 'underpull';
    }

    let paymentChanged = false, paymentChangeDelta = 0, paymentChangePct = 0;
    if (priorWeekly > 0 && Math.abs(latestWeekly - priorWeekly) / priorWeekly > 0.01) {
      paymentChanged = true;
      paymentChangeDelta = latestWeekly - priorWeekly;
      paymentChangePct = (paymentChangeDelta / priorWeekly) * 100;
    }

    return {
      funder_name: p.funder_name,
      _id: p._id,
      contractWeekly,
      priorWeekly,
      latestWeekly,
      frequency: p.frequency,
      contractStatus,
      contractDelta,
      contractDeltaPct,
      paymentChanged,
      paymentChangeDelta,
      paymentChangePct,
      agMatch: agMatch?.analysis || null,
    };
  });
}

// ─── Post-process analysis from Claude (dedup, fix fields, recalc) ──────────
function postProcessAnalysis(analysis) {
  if (!analysis) return analysis;

  // 1. Filter and deduplicate MCA positions
  // - Remove sub-$500/wk positions (not MCA — operating expenses)
  // - Remove positions with <3 occurrences (one-off debits) unless paid_off
  // - Merge same funder + same amount (within $500)
  // - Merge overcharges as overpull flags on existing positions
  if (analysis.mca_positions?.length > 0) {
    const normalize = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const toWeekly = (amt, freq) => {
      const f = (freq || '').toLowerCase();
      if (f === 'daily') return amt * 5;
      if (f === 'bi-weekly') return amt / 2;
      if (f === 'monthly') return amt / 4.33;
      return amt;
    };

    // Filter below-threshold positions (keep potential overcharges for merge step)
    const allPositions = analysis.mca_positions;
    const funderNames = allPositions.map(p => normalize(p.funder_name));
    const filtered = allPositions.filter((p, idx) => {
      const amt = p.payment_amount_current || p.payment_amount || 0;
      const weeklyAmt = toWeekly(amt, p.frequency);
      const occurrences = p.payments_detected || 0;
      const isPaidOff = (p.status || '').toLowerCase() === 'paid_off';
      const nameNorm = funderNames[idx];
      if (weeklyAmt < 500 && weeklyAmt > 0) return false;
      if (occurrences > 0 && occurrences < 3 && !isPaidOff) {
        // Keep if same funder exists (potential overcharge to merge)
        const prefixLen = Math.max(3, Math.min(nameNorm.length, 6));
        const hasSibling = funderNames.some((fn, j) => j !== idx &&
          fn.length >= prefixLen && nameNorm.length >= prefixLen &&
          (fn.includes(nameNorm.slice(0, prefixLen)) || nameNorm.includes(fn.slice(0, prefixLen))));
        if (!hasSibling) return false;
      }
      return true;
    });

    // Group by normalized funder name
    const groups = [];
    const assigned = new Set();
    for (let i = 0; i < filtered.length; i++) {
      if (assigned.has(i)) continue;
      const group = [i];
      assigned.add(i);
      const nameI = normalize(filtered[i].funder_name);
      for (let j = i + 1; j < filtered.length; j++) {
        if (assigned.has(j)) continue;
        const nameJ = normalize(filtered[j].funder_name);
        const isSameFunder =
          (nameI.length >= 6 && nameJ.length >= 6 &&
           (nameI.includes(nameJ.slice(0, 6)) || nameJ.includes(nameI.slice(0, 6)))) ||
          nameI === nameJ;
        if (isSameFunder) { group.push(j); assigned.add(j); }
      }
      groups.push(group);
    }

    const deduped = [];
    for (const group of groups) {
      if (group.length === 1) { deduped.push(filtered[group[0]]); continue; }
      const subPositions = group.map(i => filtered[i]);
      const kept = [];
      for (const pos of subPositions) {
        const amt = pos.payment_amount_current || pos.payment_amount || 0;
        const posStatus = (pos.status || 'active').toLowerCase();
        const posFreq = (pos.frequency || '').toLowerCase().replace(/[-_\s]/g, '');
        const match = kept.find(k => {
          const kAmt = k.payment_amount_current || k.payment_amount || 0;
          const kStatus = (k.status || 'active').toLowerCase();
          const kFreq = (k.frequency || '').toLowerCase().replace(/[-_\s]/g, '');
          // Biweekly positions: only merge if amounts are exactly equal (within $1)
          const threshold = (posFreq === 'biweekly' || kFreq === 'biweekly') ? 1 : 500;
          return Math.abs(amt - kAmt) <= threshold && kStatus === posStatus;
        });
        if (match) {
          const matchPayments = match.payments_detected || 0;
          const posPayments = pos.payments_detected || 0;
          if (posPayments > matchPayments) { kept[kept.indexOf(match)] = pos; }
        } else {
          // Check if overcharge on existing position (1-15% higher, >$500 diff)
          const overchargeTarget = kept.find(k => {
            const kAmt = k.payment_amount_current || k.payment_amount || 0;
            return amt > kAmt && amt < kAmt * 1.15 && (amt - kAmt) > 500;
          });
          if (overchargeTarget) {
            overchargeTarget.double_pull = true;
            overchargeTarget.double_pull_amounts = [...(overchargeTarget.double_pull_amounts || []), amt];
            overchargeTarget.double_pull_dates = [...(overchargeTarget.double_pull_dates || []), ...(pos.double_pull_dates || [pos.first_payment_date || 'unknown'])];
            overchargeTarget.notes = (overchargeTarget.notes || '') + ` | Overpull: $${(parseFloat(amt) || 0).toFixed(2)} vs expected $${(parseFloat(overchargeTarget.payment_amount_current || overchargeTarget.payment_amount) || 0).toFixed(2)}`;
          } else {
            kept.push(pos);
          }
        }
      }
      deduped.push(...kept);
    }
    analysis.mca_positions = deduped;
  }

  // 2. Fix excluded_mca_proceeds — ONLY funder wires/advances stay excluded
  if (analysis.revenue?.revenue_sources) {
    const knownFunders = [
      'tbf', 'rowan', 'merchant market', 'ondeck', 'newtek', 'fundkite',
      'libertas', 'forward fin', 'merchant marketplace', 'tmm',
      'bizfi', 'credibly', 'kapitus', 'yellowstone', 'rapid', 'can capital',
      'itria', 'suncoast',
      // Reverse MCA funders
      'ufce', 'greenbox', 'sos capital', 'stream capital', 'expansion cap',
      '1west', 'mantis', 'everest', 'velocity cap', 'cresthill', 'reliant funding',
    ];

    // Reverse MCA funders — their credits are ALWAYS advance proceeds
    const reverseMCAFunders = [
      'ufce', 'greenbox', 'sos capital', 'stream capital', 'expansion cap',
      '1west', 'mantis', 'everest', 'velocity cap', 'cresthill', 'reliant funding',
    ];

    // PASS 1: Force-exclude any reverse MCA funder credits that LLM left as revenue
    for (const src of analysis.revenue.revenue_sources) {
      const name = (src.name || '').toLowerCase();
      const note = (src.note || '').toLowerCase();
      const isReverseMCAFunder = reverseMCAFunders.some(f => name.includes(f));
      if (isReverseMCAFunder && !src.is_excluded) {
        // Any credit from a reverse MCA funder is an advance, not revenue
        const isAdvanceCredit = note.includes('advance') || note.includes('reverse') ||
          note.includes('dc') || note.includes('disburs') || note.includes('loan') ||
          src.type === 'reverse_mca_advance' || src.type === 'ach_credit' ||
          (src.total || 0) > 3000;
        if (isAdvanceCredit) {
          src.is_excluded = true;
          src.type = 'reverse_mca_advance';
          src.note = (src.note || '') + ' [CORRECTED: reverse MCA advance — forced exclusion]';
        }
      }
    }

    // PASS 2: Scan excluded sources — reclassify non-funder items as revenue
    for (const src of analysis.revenue.revenue_sources) {
      if (!src.is_excluded) continue;
      const name = (src.name || '').toLowerCase();
      const isFunder = knownFunders.some(f => name.includes(f));
      // Also keep excluded if type is explicitly reverse_mca_advance or returned_item
      const isSpecialExclusion = src.type === 'reverse_mca_advance' || src.type === 'returned_item' || src.type === 'owner_loan';
      if (!isFunder && !isSpecialExclusion) {
        src.is_excluded = false;
        src.type = 'ach_credit';
        src.note = (src.note || '') + ' [CORRECTED: not a known MCA funder — reclassified as revenue]';
      }
    }

    // Recalculate excluded_mca_proceeds from what remains excluded
    const months = Math.max((analysis.monthly_breakdown || []).length, 1);
    analysis.revenue.excluded_mca_proceeds = analysis.revenue.revenue_sources
      .filter(s => s.is_excluded)
      .reduce((sum, s) => sum + (s.total || 0), 0);
    const grossDeposits = analysis.revenue.gross_deposits || 0;
    const excludedTotal = (analysis.revenue.excluded_mca_proceeds || 0) +
      (analysis.revenue.excluded_nsf_returns || 0) +
      (analysis.revenue.excluded_transfers || 0) +
      (analysis.revenue.excluded_other || 0);
    analysis.revenue.net_verified_revenue = grossDeposits - excludedTotal;
    analysis.revenue.monthly_average_revenue = analysis.revenue.net_verified_revenue / months;
  }

  // 3. Fix balance fields — ensure ending_balance, days_negative, avg_daily_balance are set
  const balance = analysis.balance_summary || {};
  const monthly = analysis.monthly_breakdown || [];
  const adbByMonth = analysis.adb_by_month || [];

  if (!balance.ending_balance && balance.most_recent_ending_balance) {
    balance.ending_balance = balance.most_recent_ending_balance;
  }
  if (!balance.ending_balance && monthly.length > 0) {
    balance.ending_balance = monthly[monthly.length - 1].ending_balance || 0;
  }
  if (!balance.days_negative && balance.total_days_negative) {
    balance.days_negative = balance.total_days_negative;
  }
  if (!balance.days_negative && monthly.length > 0) {
    balance.days_negative = monthly.reduce((sum, m) => sum + (m.days_negative || 0), 0);
  }
  if (!balance.avg_daily_balance && adbByMonth.length > 0) {
    const validAdbs = adbByMonth.filter(m => m.adb > 0);
    if (validAdbs.length > 0) {
      balance.avg_daily_balance = Math.round(validAdbs.reduce((s, m) => s + m.adb, 0) / validAdbs.length);
    }
  }
  if (!balance.avg_daily_balance && monthly.length > 0) {
    const avgBalances = monthly
      .filter(m => m.beginning_balance || m.ending_balance)
      .map(m => ((m.beginning_balance || 0) + (m.ending_balance || 0)) / 2);
    if (avgBalances.length > 0) {
      balance.avg_daily_balance = Math.round(avgBalances.reduce((a, b) => a + b, 0) / avgBalances.length);
    }
  }
  analysis.balance_summary = balance;

  // 4. Build statement_month from statement_periods if missing
  if (!analysis.statement_month && analysis.statement_periods?.length > 0) {
    const periods = [...analysis.statement_periods].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    analysis.statement_month = `${periods[0].month || ''} – ${periods[periods.length - 1].month || ''}`.trim();
  }

  // 5. Recalculate MCA metrics from deduped positions — STRICTLY active only
  const activePositions = (analysis.mca_positions || []).filter(p => {
    const status = (p.status || '').toLowerCase().replace(/[_\s]+/g, '');
    return status === 'active' || status === '';
  });
  const totalWeekly = activePositions.reduce((sum, p) => {
    const amt = p.payment_amount_current || p.payment_amount || 0;
    const freq = (p.frequency || '').toLowerCase().replace(/[-_\s]/g, '');
    if (freq === 'daily') return sum + amt * 5;
    if (freq === 'biweekly') return sum + amt / 2;
    if (freq === 'monthly') return sum + amt / 4.33;
    return sum + amt;
  }, 0);

  const metrics = analysis.calculated_metrics || {};
  metrics.total_mca_weekly = Math.round(totalWeekly * 100) / 100;
  metrics.total_mca_monthly = Math.round(totalWeekly * 4.33 * 100) / 100;

  const monthlyRevenue = analysis.revenue?.monthly_average_revenue || analysis.revenue?.net_verified_revenue || 1;
  const cogsRate = analysis.revenue?.cogs_rate || 0.40;
  const grossProfit = monthlyRevenue * (1 - cogsRate);
  metrics.dsr_percent = Math.round((metrics.total_mca_monthly / grossProfit) * 10000) / 100;

  if (metrics.dsr_percent < 20) metrics.dsr_posture = 'healthy';
  else if (metrics.dsr_percent < 35) metrics.dsr_posture = 'elevated';
  else if (metrics.dsr_percent < 50) metrics.dsr_posture = 'stressed';
  else if (metrics.dsr_percent < 65) metrics.dsr_posture = 'critical';
  else metrics.dsr_posture = 'unsustainable';

  const opex = analysis.expense_categories?.total_operating_expenses || 0;
  const otherDebt = (analysis.other_debt_service || []).reduce((s, d) => s + (d.monthly_total || 0), 0);
  metrics.free_cash_after_mca = Math.round((monthlyRevenue - metrics.total_mca_monthly) * 100) / 100;
  metrics.true_free_cash = Math.round((monthlyRevenue - metrics.total_mca_monthly - otherDebt - opex) * 100) / 100;
  metrics.total_debt_service_monthly = Math.round((metrics.total_mca_monthly + otherDebt) * 100) / 100;

  // 6. Fix weeks_to_insolvency — only calculate if truly cash-flow negative
  const avgDailyBalance = balance.avg_daily_balance || 0;
  if (metrics.true_free_cash < 0) {
    const monthlyBurn = metrics.total_mca_monthly - monthlyRevenue;
    if (monthlyBurn > 0 && avgDailyBalance > 0) {
      const monthsToInsolvency = (avgDailyBalance * 30) / monthlyBurn;
      metrics.weeks_to_insolvency = Math.round(monthsToInsolvency * 4.33 * 10) / 10;
    } else {
      metrics.weeks_to_insolvency = null;
    }
  } else {
    metrics.weeks_to_insolvency = null;
  }

  // Also copy avg_daily_balance into calculated_metrics for CSV export
  metrics.avg_daily_balance = balance.avg_daily_balance || 0;

  analysis.calculated_metrics = metrics;
  return analysis;
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
    ['total_mca_debt_service', m.total_mca_monthly, 'Monthly MCA payments only (excludes LOC)'],
    ['total_loc_debt_service', m.total_loc_monthly || 0, 'Monthly LOC payments'],
    ['total_debt_service_monthly', m.total_debt_service_monthly, 'MCA + LOC + loans + other'],
    ['free_cash_after_mca', m.free_cash_after_mca, ''],
    ['dsr_percent', m.dsr_percent, 'Debt Service Ratio'],
    ['dsr_posture', a.negotiation_intel?.dsr_posture, ''],
    ['nsf_count', a.nsf_analysis.nsf_count, ''],
    ['nsf_risk_score', a.nsf_analysis.nsf_risk_score, '0-100'],
    ['days_negative', b.days_negative, ''],
    ['ending_balance', b.ending_balance, ''],
    ['trend_direction', m.trend_direction, ''],
    ['weeks_to_insolvency', m.weeks_to_insolvency ?? 'N/A', ''],
    ['detected_mca_positions', (activePositions || a.mca_positions || []).filter(p => (p.position_type || 'mca').toLowerCase() !== 'loc').length, 'Active MCA positions included in UW Calc'],
    ['detected_loc_positions', (activePositions || a.mca_positions || []).filter(p => (p.position_type || 'mca').toLowerCase() === 'loc').length, 'Active LOC positions'],
    ['total_other_debt_monthly', totalOtherDebt || 0, 'SBA + equipment + credit cards (active)'],
    ['total_dsr_all_debt', totalDSR || 0, 'MCA + all other debt / revenue'],
    ['true_free_cash', trueFree || 0, 'Revenue - MCA - other debt - opex'],
    ['analysis_date', new Date().toISOString().split('T')[0], ''],
  ];
  return rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}


// ─── Revenue Adjustment Helper ────────────────────────────────────────────────
function calcAdjustedRevenue(a, depositOverrides) {
  const sources = a.revenue?.revenue_sources || [];
  const months = Math.max((a.monthly_breakdown || []).length, 1);

  // If no overrides, return the AI's base revenue
  if (!depositOverrides || Object.keys(depositOverrides).length === 0) {
    return a.revenue?.monthly_average_revenue || a.revenue?.net_verified_revenue || 1;
  }

  let total = 0;
  sources.forEach((src, i) => {
    const amt = src.monthly_avg || (src.total / months) || 0;
    const aiIncluded = !src.is_excluded;

    if (depositOverrides.hasOwnProperty(i)) {
      // User override: true = include, false = exclude
      if (depositOverrides[i]) total += amt;
    } else {
      // No override — use AI classification
      if (aiIncluded) total += amt;
    }
  });

  return Math.max(total, 1);
}

// ─── Revenue Tab ─────────────────────────────────────────────────────────────
function RevenueTab({ a, depositOverrides, setDepositOverrides }) {
  const r = a.revenue;
  const m = a.calculated_metrics;
  const b = a.balance_summary;
  const adjustedRevenue = calcAdjustedRevenue(a, depositOverrides);
  const overrideCount = Object.keys(depositOverrides || {}).length;
  const revenueAdjusted = overrideCount > 0;

  // Determine effective inclusion state for each source
  const isIncluded = (src, i) => {
    if (depositOverrides && depositOverrides.hasOwnProperty(i)) return depositOverrides[i];
    return !src.is_excluded;
  };

  const toggleSource = (i) => {
    const src = (r.revenue_sources || [])[i];
    if (!src) return;
    const current = isIncluded(src, i);
    setDepositOverrides(prev => ({ ...prev, [i]: !current }));
  };

  const confColor = (c) => c >= 80 ? '#4caf50' : c >= 60 ? '#ffd54f' : '#ef5350';

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
          <div style={S.statSub}>{revenueAdjusted ? <span style={{color:'#ffd54f'}}>Adjusted · {overrideCount} override{overrideCount>1?'s':''}</span> : (a.monthly_breakdown||[]).length > 1 ? 'Bank-verified avg across months' : 'After exclusions'}</div>
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
      <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr 0.6fr 0.6fr', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {['Source', 'Total', 'Type', 'Confidence', 'Include'].map(h => (
            <span key={h} style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: h === 'Source' ? 'left' : 'center' }}>{h}</span>
          ))}
        </div>
        {/* Rows */}
        {(r.revenue_sources || []).map((s, i) => {
          const included = isIncluded(s, i);
          const conf = s.confidence ?? (s.is_excluded ? 90 : 90);
          const hasOverride = depositOverrides && depositOverrides.hasOwnProperty(i);
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr 0.6fr 0.6fr', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', background: hasOverride ? 'rgba(255,213,77,0.04)' : 'transparent' }}>
              <span style={{ fontSize: 12, color: included ? '#e8e8f0' : 'rgba(232,232,240,0.4)' }}>
                {s.name}
                {s.note && <span title={s.note} style={{ marginLeft: 6, fontSize: 10, color: 'rgba(232,232,240,0.3)', cursor: 'help' }}>ⓘ</span>}
              </span>
              <span style={{ fontSize: 12, textAlign: 'center', color: included ? '#e8e8f0' : 'rgba(232,232,240,0.4)', textDecoration: included ? 'none' : 'line-through' }}>{fmt(s.total)}</span>
              <span style={{ textAlign: 'center' }}><span style={S.tag('grey')}>{(s.type || '').replace(/_/g, ' ')}</span></span>
              <span style={{ textAlign: 'center' }}>
                <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${confColor(conf)}22`, color: confColor(conf) }}>{conf}</span>
              </span>
              <span style={{ textAlign: 'center' }}>
                <button onClick={() => toggleSource(i)} style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative', background: included ? '#00e5ff' : '#ef5350', transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: 2, left: included ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                </button>
              </span>
            </div>
          );
        })}
      </div>

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
function MCATab({ a, positions, setPositions, excludedIds, setExcludedIds, otherExcludedIds, setOtherExcludedIds, depositOverrides, agreementResults, enrolledPositions, setEnrolledPositions }) {
  const [addText, setAddText] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [showDirectForm, setShowDirectForm] = useState(false);
  const [directForm, setDirectForm] = useState({ funder_name: '', payment_amount: '', frequency: 'weekly', estimated_balance: '', notes: '' });
  const [paidOffCollapsed, setPaidOffCollapsed] = useState(true);

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
      isEdited: true,
    } : p));
    setEditingId(null);
  };

  const addDirect = () => {
    const pa = parseFloat(directForm.payment_amount) || 0;
    const freqMultiplier = directForm.frequency === 'daily' ? 22 : directForm.frequency === 'bi-weekly' ? 2.17 : directForm.frequency === 'monthly' ? 1 : 4.33;
    const monthly = pa * (directForm.frequency === 'monthly' ? 1 : freqMultiplier);
    const newPos = {
      _id: Date.now(),
      funder_name: directForm.funder_name || 'Unknown Funder',
      payment_amount: pa,
      payment_amount_current: pa,
      frequency: directForm.frequency,
      estimated_monthly_total: monthly,
      estimated_balance: parseFloat(directForm.estimated_balance) || null,
      payments_detected: directForm.frequency === 'weekly' ? 4 : directForm.frequency === 'daily' ? 22 : 4,
      pattern_description: directForm.notes || 'Manually added position',
      confidence: 'manual',
      status: 'active',
      flag: 'manual',
      isManual: true,
    };
    setPositions(prev => [...prev, newPos]);
    setDirectForm({ funder_name: '', payment_amount: '', frequency: 'weekly', estimated_balance: '', notes: '' });
    setShowDirectForm(false);
  };

  const nonExcluded = positions.filter(p => !excludedIds.includes(p._id));
  const activePositions = nonExcluded.filter(p => p.status !== 'paid_off');
  const paidOffPositions = nonExcluded.filter(p => p.status === 'paid_off');
  const activeMCAPositions = activePositions.filter(p => { const t = (p.position_type || 'mca').toLowerCase(); return t !== 'loc' && t !== 'true_split' && t !== 'reverse_mca'; });
  const activeLOCPositions = activePositions.filter(p => (p.position_type || 'mca').toLowerCase() === 'loc');
  const activeTrueSplitPositions = activePositions.filter(p => (p.position_type || 'mca').toLowerCase() === 'true_split');
  const activeReverseMCAPositions = activePositions.filter(p => (p.position_type || 'mca').toLowerCase() === 'reverse_mca');
  const excludedPositions = positions.filter(p => excludedIds.includes(p._id));
  const other = a.other_debt_service || [];
  const revenue = calcAdjustedRevenue(a, depositOverrides);

  const totalMCAMonthly = activeMCAPositions.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0)
    + activeTrueSplitPositions.reduce((s, p) => s + (p.estimated_monthly_total || (p.avg_daily_payment || 0) * 22 || 0), 0)
    + activeReverseMCAPositions.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0);
  const totalLOCMonthly = activeLOCPositions.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0);
  const activeOtherDebt = other.filter((_, i) => !(otherExcludedIds || []).includes(i));
  const totalOtherMonthly = activeOtherDebt.reduce((s, o) => s + (o.monthly_total || 0), 0);
  const totalAllDebt = totalMCAMonthly + totalLOCMonthly + totalOtherMonthly;
  const dsrPercent = (totalAllDebt / revenue) * 100;
  const mcaOnlyDSR = (totalMCAMonthly / revenue) * 100;
  const locDSR = (totalLOCMonthly / revenue) * 100;

  // Funder intelligence scoring
  const scoredPositions = useMemo(() => {
    const agMap = {};
    (agreementResults || []).forEach(ar => {
      const d = ar.analysis || ar;
      if (d.funder_name) agMap[d.funder_name] = d;
    });
    return scoreAllPositions(activePositions, agMap);
  }, [activePositions, agreementResults]);
  const sameDayStacks = useMemo(() => detectSameDayStack(activePositions), [activePositions]);

  // Build funder intel lookup by _id
  const funderIntelMap = useMemo(() => {
    const map = {};
    scoredPositions.forEach(sp => { if (sp._id && sp.funderIntel) map[sp._id] = sp.funderIntel; });
    return map;
  }, [scoredPositions]);

  // Payment compliance: contract vs actual cross-reference (MCA only — LOCs have variable payments)
  const compliance = buildPaymentCompliance(activeMCAPositions, agreementResults, a.monthly_breakdown);
  const complianceMap = {};
  compliance.forEach(c => { complianceMap[c._id] = c; });

  // Origination dates from agreements
  const originationMap = {};
  const originationDates = [];
  activePositions.forEach(p => {
    const agMatch = matchAgreementToPosition(p.funder_name, agreementResults);
    if (agMatch?.analysis) {
      const d = agMatch.analysis;
      const dateStr = d.funding_date || d.effective_date || d.contract_date;
      if (dateStr) {
        originationMap[p._id] = dateStr;
        originationDates.push({ id: p._id, date: new Date(dateStr), funder: p.funder_name });
      }
    }
  });
  // Detect rapid stacking: positions originated within 30 days of each other
  const rapidStackIds = new Set();
  originationDates.sort((a, b) => a.date - b.date);
  for (let i = 0; i < originationDates.length; i++) {
    for (let j = i + 1; j < originationDates.length; j++) {
      const diff = Math.abs(originationDates[j].date - originationDates[i].date) / (1000 * 60 * 60 * 24);
      if (diff <= 30) { rapidStackIds.add(originationDates[i].id); rapidStackIds.add(originationDates[j].id); }
    }
  }

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
          <div style={S.statValue('#EAD068')}>{activeMCAPositions.length} MCA{activeReverseMCAPositions.length > 0 && <span style={{ color: '#ffb74d' }}> · {activeReverseMCAPositions.length} Rev</span>}{activeTrueSplitPositions.length > 0 && <span style={{ color: '#ce93d8' }}> · {activeTrueSplitPositions.length} Split</span>}{activeLOCPositions.length > 0 && <span style={{ color: '#64b5f6' }}> · {activeLOCPositions.length} LOC</span>}{paidOffPositions.length > 0 && <span style={{ fontSize: 13, color: 'rgba(232,232,240,0.4)' }}> · {paidOffPositions.length} paid off</span>}</div>
        </div>
        <div style={{ ...S.stat, flex: 1 }}>
          <div style={S.statLabel}>Monthly MCA Total</div>
          <div style={S.statValue('#ef9a9a')}>{fmt(totalMCAMonthly)}</div>
          <div style={S.statSub}>{activeLOCPositions.length > 0 ? `MCA only · LOC ${fmt(totalLOCMonthly)}` : 'Active positions only'}</div>
        </div>
        <div style={{ ...S.stat, flex: 1 }}>
          <div style={S.statLabel}>Total DSR (All Debt)</div>
          <div style={S.statValue(dsrPercent > 50 ? '#ef5350' : dsrPercent > 35 ? '#ff9800' : dsrPercent > 25 ? '#ffd54f' : '#4caf50')}>{fmtP(dsrPercent)}</div>
          <div style={S.statSub}>MCA {fmtP(mcaOnlyDSR)}{locDSR > 0 && ` + LOC ${fmtP(locDSR)}`} + Other {fmtP(dsrPercent - mcaOnlyDSR - locDSR)}</div>
        </div>
      </div>

      <div style={S.divider} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={S.sectionTitle}>MCA Positions</div>
        <span style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)' }}>Excluded positions are hidden from UW Calculator export</span>
      </div>

      {/* Same-Day Stack Warning */}
      {sameDayStacks.length > 0 && sameDayStacks.map((stack, i) => (
        <div key={i} style={{ background: 'rgba(255,183,77,0.08)', border: '1px solid rgba(255,183,77,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
          <div style={{ color: '#ffb74d', fontWeight: 600, marginBottom: 4 }}>⚠️ SAME-DAY STACK DETECTED</div>
          <div style={{ color: 'rgba(232,232,240,0.6)', lineHeight: 1.6 }}>
            <strong>{stack.funderA}</strong> and <strong>{stack.funderB}</strong> both advanced funds within {stack.daysDiff} business day{stack.daysDiff !== 1 ? 's' : ''} ({stack.dateA} and {stack.dateB}).
          </div>
          <div style={{ color: 'rgba(232,232,240,0.4)', fontSize: 11, marginTop: 6, lineHeight: 1.5, fontStyle: 'italic' }}>
            Internal intelligence (not for funder communication):<br/>
            • Neither funder had accurate DSR at underwriting<br/>
            • Both anti-stacking clauses potentially void — mutual violation<br/>
            • ISO conduct flag — simultaneous approvals suggest coordinated timing<br/>
            • Enforceability reduced for both positions
          </div>
        </div>
      ))}

      {activePositions.length === 0 && paidOffPositions.length === 0 && (
        <div style={{ color: 'rgba(232,232,240,0.4)', fontSize: 13, padding: '16px 0' }}>No MCA positions detected</div>
      )}

      {activePositions.map((p) => (
        <div key={p._id} style={{ ...S.funderCard, ...(p.status === 'paid_off' ? { opacity: 0.6, borderColor: 'rgba(150,150,150,0.3)', background: 'rgba(80,80,80,0.15)' } : {}) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 16, color: '#e8e8f0', marginBottom: 2 }}>{p.funder_name}</div>
              {originationMap[p._id] && (
                <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginBottom: 4 }}>Originated: {originationMap[p._id]}</div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(p.position_type || 'mca').toLowerCase() === 'loc'
                  ? <span style={{ ...S.tag('cyan'), background: 'rgba(100,181,246,0.15)', color: '#64b5f6', borderColor: 'rgba(100,181,246,0.4)' }}>LINE OF CREDIT</span>
                  : (p.position_type || 'mca').toLowerCase() === 'true_split'
                  ? <span style={{ ...S.tag('cyan'), background: 'rgba(206,147,216,0.15)', color: '#ce93d8', borderColor: 'rgba(206,147,216,0.4)' }}>TRUE SPLIT</span>
                  : (p.position_type || 'mca').toLowerCase() === 'reverse_mca'
                  ? <span style={{ ...S.tag('amber'), background: 'rgba(255,183,77,0.15)', color: '#ffb74d', borderColor: 'rgba(255,183,77,0.4)' }}>⚠️ REVERSE MCA</span>
                  : <span style={S.tag(p.flag === 'undisclosed' ? 'red' : p.flag === 'default_modified' ? 'red' : p.flag === 'modified' ? 'amber' : p.flag === 'manual' ? 'cyan' : 'teal')}>{p.flag === 'default_modified' ? '⚠ default modified' : p.flag === 'manual' ? '＋ manual' : p.flag || 'standard'}</span>
                }
                {(p.isEdited || p.isManual) && <span style={S.tag('cyan')}>(edited)</span>}
                <span style={S.tag(p.confidence === 'high' ? 'green' : p.confidence === 'medium' ? 'amber' : p.confidence === 'manual' ? 'cyan' : 'grey')}>{p.confidence === 'manual' ? 'manual entry' : (p.confidence || 'medium') + ' confidence'}</span>
                <span style={S.tag('grey')}>{p.frequency}</span>
                {p.fuzzy_match && <span style={S.tag('amber')}>fuzzy match</span>}
                {p.double_pull && <span style={S.tag('red')}>DOUBLE PULL</span>}
                {rapidStackIds.has(p._id) && <span style={S.tag('amber')}>RAPID STACK</span>}
                {p.status === 'paid_off' && <span style={S.tag('grey')}>PAID OFF - Verify</span>}
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
                  <div style={{ fontSize: 20, color: (p.position_type || 'mca').toLowerCase() === 'loc' ? '#64b5f6' : (p.position_type || 'mca').toLowerCase() === 'true_split' ? '#ce93d8' : (p.position_type || 'mca').toLowerCase() === 'reverse_mca' ? '#ffb74d' : '#ef9a9a' }}>{fmt(p.estimated_monthly_total)}<span style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)' }}>/mo{(p.position_type || 'mca').toLowerCase() === 'true_split' ? ' (est)' : ''}</span></div>
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
          {/* Double-pull alert */}
          {p.double_pull && p.double_pull_dates && p.double_pull_dates.length > 0 && (
            <div style={{ background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>
              <span style={{ color: '#ef9a9a' }}>🚨 Double Pull Detected</span>
              <span style={{ color: 'rgba(232,232,240,0.5)', marginLeft: 8 }}>
                {(p.double_pull_amounts || []).map((amt, i) => (
                  <span key={i}>{i > 0 ? ' and ' : ''}{fmt(amt)} on {(p.double_pull_dates || [])[i]}</span>
                ))}
                <span style={{ color: 'rgba(232,232,240,0.4)' }}> — possible unauthorized extra pull or overlapping advances</span>
              </span>
            </div>
          )}
          {/* Fuzzy match info */}
          {p.fuzzy_match && p.fuzzy_match_source && (
            <div style={{ background: 'rgba(249,168,37,0.06)', border: '1px solid rgba(249,168,37,0.15)', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: 'rgba(232,232,240,0.5)' }}>
              <span style={{ color: '#ffd54f' }}>⚡ Fuzzy Match</span>
              <span style={{ marginLeft: 8 }}>Bank descriptor: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{p.fuzzy_match_source}</code></span>
            </div>
          )}
          {/* LOC draw balance */}
          {(p.position_type || 'mca').toLowerCase() === 'loc' && (
            <div style={{ background: 'rgba(100,181,246,0.08)', border: '1px solid rgba(100,181,246,0.2)', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: 'rgba(232,232,240,0.55)' }}>
              <span style={{ color: '#64b5f6' }}>📋 Line of Credit</span>
              <span style={{ marginLeft: 8 }}>
                {p.current_draw_balance ? <>Draw balance: <span style={{ color: '#64b5f6' }}>{fmt(p.current_draw_balance)}</span></> : 'Draw balance not detected'}
                {' · '}Not included in MCA debt service · Tracked separately in DSR
              </span>
            </div>
          )}
          {/* True Split info */}
          {(p.position_type || 'mca').toLowerCase() === 'true_split' && (
            <div style={{ background: 'rgba(206,147,216,0.08)', border: '1px solid rgba(206,147,216,0.2)', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: 'rgba(232,232,240,0.55)' }}>
              <span style={{ color: '#ce93d8' }}>📊 True Split — Revenue-Based MCA</span>
              <span style={{ marginLeft: 8 }}>
                {p.estimated_split_percentage ? <><span style={{ color: '#ce93d8' }}>~{p.estimated_split_percentage}%</span> of daily receipts</> : 'Split % not detected'}
                {p.avg_daily_payment ? <> · Avg daily: <span style={{ color: '#ce93d8' }}>{fmt(p.avg_daily_payment)}</span></> : ''}
                {' · '}Payment varies with revenue · Built-in reconciliation
              </span>
            </div>
          )}
          {/* Reverse MCA info */}
          {(p.position_type || 'mca').toLowerCase() === 'reverse_mca' && (
            <div style={{ background: 'rgba(255,183,77,0.08)', border: '1px solid rgba(255,183,77,0.2)', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: 'rgba(232,232,240,0.55)' }}>
              <span style={{ color: '#ffb74d' }}>⚠️ Reverse MCA — Revenue Loan</span>
              <span style={{ marginLeft: 8 }}>
                {p.total_advances_received ? <>Advances received: <span style={{ color: '#ffb74d' }}>{fmt(p.total_advances_received)}</span></> : ''}
                {p.total_payments_made ? <> · Paid back: <span style={{ color: '#81c784' }}>{fmt(p.total_payments_made)}</span></> : ''}
                {p.advance_stopped ? <> · <span style={{ color: '#ef9a9a' }}>Advances STOPPED</span></> : <> · <span style={{ color: '#ffb74d' }}>Advances active</span></>}
                {' · '}No reconciliation clause · Funder credits excluded from revenue
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
          {/* Contract vs Actual payment compliance */}
          {(() => {
            const pc = complianceMap[p._id];
            if (!pc || !pc.contractWeekly) return null;
            const statusColor = pc.contractStatus === 'match' ? '#4caf50' : pc.contractStatus === 'overpull' ? '#ef5350' : '#ffd54f';
            const statusIcon = pc.contractStatus === 'match' ? '✓' : pc.contractStatus === 'overpull' ? '🚨' : '⚠';
            const statusLabel = pc.contractStatus === 'match' ? 'MATCH' : pc.contractStatus === 'overpull' ? 'OVERPULL' : 'UNDERPULL';
            return (
              <div style={{ background: pc.contractStatus === 'overpull' ? 'rgba(239,83,80,0.08)' : pc.contractStatus === 'underpull' ? 'rgba(249,168,37,0.06)' : 'rgba(76,175,80,0.06)', border: `1px solid ${pc.contractStatus === 'overpull' ? 'rgba(239,83,80,0.25)' : pc.contractStatus === 'underpull' ? 'rgba(249,168,37,0.2)' : 'rgba(76,175,80,0.2)'}`, borderRadius: 6, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: statusColor, fontWeight: 600, letterSpacing: 0.5 }}>{statusIcon} {statusLabel}</span>
                  <span style={S.tag(pc.contractStatus === 'match' ? 'green' : pc.contractStatus === 'overpull' ? 'red' : 'amber')}>agreement cross-ref</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 2 }}>Contract Payment</div>
                    <div style={{ fontSize: 13, color: '#e8e8f0' }}>{fmt(pc.contractWeekly)}<span style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)' }}>/wk</span></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 2 }}>Prior Actual</div>
                    <div style={{ fontSize: 13, color: '#e8e8f0' }}>{fmt(pc.priorWeekly)}<span style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)' }}>/wk</span></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 2 }}>Latest Actual</div>
                    <div style={{ fontSize: 13, color: statusColor }}>{fmt(pc.latestWeekly)}<span style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)' }}>/wk</span>
                      {Math.abs(pc.contractDelta) > 0.01 && (
                        <span style={{ color: statusColor, marginLeft: 6, fontSize: 11 }}>
                          {pc.contractDelta > 0 ? '+' : ''}{fmt(pc.contractDelta)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {pc.contractStatus === 'overpull' && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#ef9a9a', lineHeight: 1.5 }}>
                    Funder is pulling {fmt(Math.abs(pc.contractDelta))} ({(parseFloat(Math.abs(pc.contractDeltaPct)) || 0).toFixed(1)}%) more than contractual amount
                  </div>
                )}
                {pc.contractStatus === 'underpull' && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#ffd54f', lineHeight: 1.5 }}>
                    Funder is pulling {fmt(Math.abs(pc.contractDelta))} ({(parseFloat(Math.abs(pc.contractDeltaPct)) || 0).toFixed(1)}%) less than contractual amount — may indicate reconciliation
                  </div>
                )}
                {pc.paymentChanged && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#ffd54f' }}>
                    Payment changed from {fmt(pc.priorWeekly)}/wk to {fmt(pc.latestWeekly)}/wk ({pc.paymentChangePct > 0 ? '+' : ''}{(parseFloat(pc.paymentChangePct) || 0).toFixed(1)}%)
                  </div>
                )}
              </div>
            );
          })()}
          <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.45)', lineHeight: 1.6 }}>{p.pattern_description}</div>
          {(p.first_payment_date || p.last_payment_date) && (
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)', marginTop: 6 }}>{p.first_payment_date} → {(!p.last_payment_date || p.last_payment_date === p.first_payment_date || p.last_payment_date === 'present') && p.status !== 'paid_off' ? 'present' : p.last_payment_date}</div>
          )}
          {/* Funder Intelligence */}
          {(() => {
            const fi = funderIntelMap[p._id];
            if (!fi) return null;
            const q = fi.quadrant;
            const qColors = { red: '#ef5350', orange: '#ff9800', amber: '#ffd54f', green: '#4caf50' };
            return (
              <details style={{ marginTop: 8, marginBottom: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'rgba(232,232,240,0.5)', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
                  <span>Funder Intelligence</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${qColors[q.color]}22`, color: qColors[q.color], border: `1px solid ${qColors[q.color]}44` }}>{q.label}</span>
                </summary>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '10px 12px', marginTop: 6, fontSize: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 2 }}>Enforceability</div>
                      <div style={{ fontSize: 16, color: fi.enforceability >= 6 ? '#ef9a9a' : '#81c784' }}>{fi.enforceability}<span style={{ fontSize: 11, color: 'rgba(232,232,240,0.3)' }}>/10</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 2 }}>Aggressiveness</div>
                      <div style={{ fontSize: 16, color: fi.aggressiveness >= 6 ? '#ef9a9a' : '#81c784' }}>{fi.aggressiveness}<span style={{ fontSize: 11, color: 'rgba(232,232,240,0.3)' }}>/10</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 2 }}>Recovery Stake</div>
                      <div style={{ fontSize: 16, color: fi.recoveryStake >= 6 ? '#ef9a9a' : '#81c784' }}>{fi.recoveryStake}<span style={{ fontSize: 11, color: 'rgba(232,232,240,0.3)' }}>/10</span></div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: qColors[q.color], marginBottom: 6 }}>{q.description}</div>
                  {fi.funderRecord?.funderIntelGrade && (
                    <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 4 }}>FunderIntel Grade: {fi.funderRecord.funderIntelGrade}</div>
                  )}
                  {fi.knownBehavior && fi.knownBehavior.length > 0 && (
                    <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', lineHeight: 1.5, marginTop: 4 }}>
                      {fi.knownBehavior.map((b, i) => <div key={i}>• {b}</div>)}
                    </div>
                  )}
                </div>
              </details>
            );
          })()}
          {/* Enrollment checkbox */}
          {p.status !== 'paid_off' && (
            <div style={{ marginTop: 10, background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 6, padding: '8px 12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={enrolledPositions === null || (enrolledPositions instanceof Set ? enrolledPositions.has(p._id) : true)}
                  onChange={e => {
                    setEnrolledPositions(prev => {
                      const current = prev === null ? new Set(activePositions.filter(ap => ap.status !== 'paid_off').map(ap => ap._id)) : new Set(prev);
                      if (e.target.checked) current.add(p._id);
                      else current.delete(p._id);
                      return current;
                    });
                  }}
                  style={{ accentColor: '#00e5ff', width: 15, height: 15, cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontSize: 11, color: (enrolledPositions === null || (enrolledPositions instanceof Set && enrolledPositions.has(p._id))) ? '#00e5ff' : 'rgba(232,232,240,0.4)', fontWeight: 600, letterSpacing: 0.3 }}>
                    Enroll in Restructuring Program
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.35)', marginTop: 1 }}>
                    {(enrolledPositions === null || (enrolledPositions instanceof Set && enrolledPositions.has(p._id)))
                      ? 'Receives TAD allocation · appears in negotiation emails'
                      : 'DSR-only — not included in negotiation or TAD distribution'}
                  </div>
                </div>
              </label>
            </div>
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

      {paidOffPositions.length > 0 && (
        <>
          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <button
              onClick={() => setPaidOffCollapsed(!paidOffCollapsed)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: '1px solid rgba(150,150,150,0.2)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}
            >
              <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)', transition: 'transform 0.2s', transform: paidOffCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▼</span>
              <span style={{ fontSize: 12, letterSpacing: 1, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase' }}>Paid Off / Inactive ({paidOffPositions.length})</span>
              <span style={{ fontSize: 11, color: 'rgba(232,232,240,0.25)', marginLeft: 'auto' }}>Not included in DSR or UW calculations</span>
            </button>
          </div>
          {!paidOffCollapsed && paidOffPositions.map((p) => (
            <div key={p._id} style={{ ...S.funderCard, opacity: 0.55, borderColor: 'rgba(150,150,150,0.2)', background: 'rgba(80,80,80,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, color: 'rgba(232,232,240,0.7)', marginBottom: 2 }}>{p.funder_name}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={S.tag('grey')}>PAID OFF</span>
                    <span style={S.tag('grey')}>{p.frequency}</span>
                    {p.fuzzy_match && <span style={S.tag('amber')}>fuzzy match</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, color: 'rgba(232,232,240,0.45)', textDecoration: 'line-through' }}>{fmt(p.estimated_monthly_total)}<span style={{ fontSize: 11, color: 'rgba(232,232,240,0.3)' }}>/mo</span></div>
                  <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)' }}>{fmt(p.payment_amount_current || p.payment_amount)} × {p.payments_detected} pmts</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)', marginTop: 6 }}>{p.pattern_description}</div>
              {(p.first_payment_date || p.last_payment_date) && (
                <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.25)', marginTop: 4 }}>{p.first_payment_date} → {p.last_payment_date || 'unknown'}</div>
              )}
            </div>
          ))}
        </>
      )}

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={S.sectionTitle}>Add Missing Position</div>
        <button onClick={() => setShowDirectForm(!showDirectForm)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.25)', background: 'rgba(0,229,255,0.08)', color: '#00e5ff', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
          {showDirectForm ? '← Use text input' : '📝 Direct form'}
        </button>
      </div>

      {showDirectForm ? (
        <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Funder Name *</label>
              <input value={directForm.funder_name} onChange={e => setDirectForm(v => ({...v, funder_name: e.target.value}))} placeholder="e.g. The Merchant Marketplace" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Payment Amount *</label>
              <input value={directForm.payment_amount} onChange={e => setDirectForm(v => ({...v, payment_amount: e.target.value}))} placeholder="8500" type="number" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Frequency</label>
              <select value={directForm.frequency} onChange={e => setDirectForm(v => ({...v, frequency: e.target.value}))} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit' }}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Estimated Balance (optional)</label>
              <input value={directForm.estimated_balance} onChange={e => setDirectForm(v => ({...v, estimated_balance: e.target.value}))} placeholder="50000" type="number" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit' }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
            <input value={directForm.notes} onChange={e => setDirectForm(v => ({...v, notes: e.target.value}))} placeholder="Any additional notes about this position..." style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={addDirect} disabled={!directForm.funder_name || !directForm.payment_amount} style={{ ...S.btn('primary'), opacity: !directForm.funder_name || !directForm.payment_amount ? 0.5 : 1, padding: '10px 20px' }}>＋ Add Position</button>
            <button onClick={() => setShowDirectForm(false)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(232,232,240,0.6)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}

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
        </>
      )}

      {/* True Cash Flow Summary — always visible */}
      {(() => {
        const activeOther = other.filter((_, i) => !otherExcludedIds.includes(i));
        const totalOther = activeOther.reduce((s, o) => s + (o.monthly_total || 0), 0);
        const totalAll = totalMCAMonthly + totalOther + (a.expense_categories?.total_operating_expenses || 0);
        const trueFree = revenue - totalAll;
        const totalDebt = totalMCAMonthly + totalOther;
        const totalDSR = (totalDebt / revenue) * 100;
        const mcaOnlyDSR = (totalMCAMonthly / revenue) * 100;
        return (
          <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(232,232,240,0.4)', marginBottom: 14 }}>True Cash Flow Summary (Active Positions)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>Net Revenue</div><div style={{ fontSize: 18, color: '#00e5ff' }}>{fmt(revenue)}</div></div>
              <div><div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>MCA Payments ({activePositions.length} positions)</div><div style={{ fontSize: 18, color: '#ef9a9a' }}>− {fmt(totalMCAMonthly)}</div></div>
              {totalOther > 0 && <div><div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>Other Debt Service</div><div style={{ fontSize: 18, color: '#ef9a9a' }}>− {fmt(totalOther)}</div></div>}
              {(a.expense_categories?.total_operating_expenses || 0) > 0 && <div><div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>Operating Expenses</div><div style={{ fontSize: 18, color: '#ef9a9a' }}>− {fmt(a.expense_categories.total_operating_expenses)}</div></div>}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>True Free Cash</div>
                <div style={{ fontSize: 28, color: trueFree < 0 ? '#ef5350' : trueFree < 5000 ? '#ff9800' : '#4caf50', fontWeight: 400 }}>{fmt(trueFree)}</div>
                <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)', marginTop: 3 }}>Available for payroll &amp; liabilities</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>MCA Burden of Revenue</div>
                <div style={{ fontSize: 28, color: mcaOnlyDSR > 50 ? '#ef5350' : mcaOnlyDSR > 35 ? '#ff9800' : '#ffd54f' }}>{fmtP(mcaOnlyDSR)}</div>
                {totalOther > 0 && <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginTop: 3 }}>Total DSR w/ all debt: {fmtP(totalDSR)}</div>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}


// ─── Risk Tab ─────────────────────────────────────────────────────────────────
function RiskTab({ a, positions, excludedIds, otherExcludedIds, depositOverrides }) {
  const activePositions = (positions || []).filter(p => !(excludedIds || []).includes(p._id) && p.status !== 'paid_off');
  const totalMCAMonthly = activePositions.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0);
  const activeOther = (a.other_debt_service || []).filter((_, i) => !(otherExcludedIds || []).includes(i));
  const totalOtherDebt = activeOther.reduce((s, o) => s + (o.monthly_total || 0), 0);
  const revenue = calcAdjustedRevenue(a, depositOverrides);
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
            {m.weeks_to_insolvency != null && m.weeks_to_insolvency !== '' ? `${m.weeks_to_insolvency}w` : <span style={{fontSize:12,color:'rgba(232,232,240,0.35)'}}>Calculate →</span>}
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
function NegotiationTab({ a, positions, excludedIds, otherExcludedIds, depositOverrides, agreementResults, enrolledPositions }) {
  const intel = a.negotiation_intel || {};
  const activePositions = (positions || a.mca_positions || []).filter(p => !(excludedIds || []).includes(p._id) && p.status !== 'paid_off');
  const totalMCAMonthly = activePositions.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0);
  const activeOther = (a.other_debt_service || []).filter((_, i) => !(otherExcludedIds || []).includes(i));
  const totalOtherDebt = activeOther.reduce((s, o) => s + (o.monthly_total || 0), 0);
  const revenue = calcAdjustedRevenue(a, depositOverrides);
  const cogs = a.expense_categories?.inventory_cogs || 0;
  const grossProfit = revenue - cogs;
  const freeCashAfterMCA = revenue - totalMCAMonthly;
  // DSR using gross profit as denominator (FF method per knowledge base)
  const dsr = grossProfit > 0 ? (totalMCAMonthly / grossProfit) * 100 : 0;
  const dsrRevenue = revenue > 0 ? (totalMCAMonthly / revenue) * 100 : 0; // Traditional DSR for comparison
  const posture = dsr > 50 ? 'unsustainable' : dsr > 35 ? 'critical' : dsr > 25 ? 'stressed' : dsr > 15 ? 'elevated' : 'healthy';
  const opexForNeg = a.expense_categories?.total_operating_expenses || 0;
  const trueFreeForNeg = freeCashAfterMCA - totalOtherDebt - opexForNeg;
  const m = { ...a.calculated_metrics, free_cash_after_mca: freeCashAfterMCA, total_mca_monthly: totalMCAMonthly, dsr_percent: dsr };
  const color = dsrColor(posture);

  // Build stacking violation narrative from agreement data
  const stackingViolations = useMemo(() => {
    if (!agreementResults || agreementResults.length === 0) return null;
    const violations = [];
    const fundingTimeline = [];

    // Build funding timeline from agreements and bank-detected positions
    agreementResults.forEach(ar => {
      const d = ar.analysis || ar;
      const fundingDate = d.funding_date || d.purchase_date || d.contract_date;
      const hasAntiStack = d.stacking_analysis?.has_anti_stacking_clause ||
        (d.key_clauses || []).some(c => c.clause_type === 'anti_stacking');
      if (fundingDate && d.funder_name) {
        fundingTimeline.push({
          funder: d.funder_name,
          date: new Date(fundingDate),
          dateStr: fundingDate,
          amount: d.purchase_amount || d.funding_amount || 0,
          hasAntiStack,
          antiStackText: d.stacking_analysis?.anti_stacking_text_summary ||
            (d.key_clauses || []).find(c => c.clause_type === 'anti_stacking')?.clause_text_summary || ''
        });
      }
    });

    // Also add bank-detected advance deposits
    activePositions.forEach(p => {
      if (p.advance_deposit_date && !fundingTimeline.find(f => f.funder === p.funder_name)) {
        fundingTimeline.push({
          funder: p.funder_name,
          date: new Date(p.advance_deposit_date),
          dateStr: p.advance_deposit_date,
          amount: p.advance_deposit_amount || 0,
          hasAntiStack: false,
          source: 'bank'
        });
      }
    });

    // Sort by date
    fundingTimeline.sort((a, b) => a.date - b.date);

    // Check for violations - each funder that funded AFTER other positions existed
    fundingTimeline.forEach((entry, idx) => {
      if (idx > 0) {
        const priorStack = fundingTimeline.slice(0, idx);
        const priorWeekly = priorStack.reduce((sum, p) => {
          const pos = activePositions.find(ap => ap.funder_name === p.funder);
          return sum + (pos ? (pos.payment_amount || pos.payment_amount_current || 0) : 0);
        }, 0);

        if (priorStack.length > 0 && entry.hasAntiStack) {
          violations.push({
            funder: entry.funder,
            fundingDate: entry.dateStr,
            priorPositions: priorStack.length,
            priorFunders: priorStack.map(p => p.funder).join(', '),
            priorWeeklyBurden: priorWeekly,
            hasAntiStack: entry.hasAntiStack,
            antiStackText: entry.antiStackText
          });
        }
      }
    });

    return { violations, timeline: fundingTimeline };
  }, [agreementResults, activePositions]);

  const generateStackingNarrative = () => {
    if (!stackingViolations || stackingViolations.violations.length === 0) return null;
    const v = stackingViolations.violations;
    const timeline = stackingViolations.timeline;

    let narrative = `STACKING VIOLATION ANALYSIS:\n\n`;
    narrative += `This merchant has ${timeline.length} MCA positions. Timeline analysis reveals the following:\n\n`;

    timeline.forEach((entry, idx) => {
      const weeklyPayment = activePositions.find(p => p.funder_name === entry.funder)?.payment_amount || 0;
      narrative += `${idx + 1}. ${entry.funder} — Funded ${entry.dateStr}`;
      if (entry.amount) narrative += ` ($${entry.amount.toLocaleString()})`;
      if (weeklyPayment) narrative += ` — $${weeklyPayment.toLocaleString()}/week`;
      if (idx > 0) {
        const priorCount = idx;
        narrative += `\n   ⚠️ At funding: ${priorCount} existing position${priorCount > 1 ? 's' : ''} already in place`;
      }
      narrative += '\n';
    });

    if (v.length > 0) {
      narrative += `\nVIOLATIONS DETECTED:\n`;
      v.forEach(viol => {
        narrative += `• ${viol.funder} funded on ${viol.fundingDate} with an anti-stacking clause, `;
        narrative += `despite ${viol.priorPositions} existing position${viol.priorPositions > 1 ? 's' : ''} `;
        narrative += `(${viol.priorFunders}) totaling $${viol.priorWeeklyBurden.toLocaleString()}/week.\n`;
        narrative += `  Their own anti-stacking clause was violated at origination, materially impairing their enforcement standing.\n`;
      });
    }

    return narrative;
  };
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

      {/* Deal Sequencing — Funder Intelligence */}
      {(() => {
        const agMap = {};
        (agreementResults || []).forEach(ar => {
          const d = ar.analysis || ar;
          if (d.funder_name) agMap[d.funder_name] = d;
        });
        const scored = scoreAllPositions(activePositions, agMap);
        const qColors = { red: '#ef5350', orange: '#ff9800', amber: '#ffd54f', green: '#4caf50' };
        if (scored.length === 0) return null;
        return (
          <div style={S.card}>
            <div style={S.sectionTitle}>Deal Sequencing — Recommended Negotiation Order</div>
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 10 }}>Ranked by enforceability × aggressiveness × recovery stake composite scoring</div>
            {scored.map((sp, i) => {
              const fi = sp.funderIntel;
              if (!fi) return null;
              const q = fi.quadrant;
              return (
                <div key={sp._id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${qColors[q.color]}22`, border: `1px solid ${qColors[q.color]}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: qColors[q.color], fontWeight: 600, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#e8e8f0' }}>{sp.funder_name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>{q.description}</div>
                  </div>
                  <div style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: `${qColors[q.color]}15`, color: qColors[q.color], border: `1px solid ${qColors[q.color]}33`, whiteSpace: 'nowrap', flexShrink: 0 }}>{q.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)', textAlign: 'right', flexShrink: 0, width: 40 }}>{(parseFloat(fi.composite) || 0).toFixed(1)}</div>
                </div>
              );
            })}
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

      {/* DSR Comparison - Gross Profit vs Revenue */}
      {cogs > 0 && (
        <div style={{ background: 'rgba(234,208,104,0.08)', border: '1px solid rgba(234,208,104,0.2)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 16 }}>📊</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#EAD068', letterSpacing: 0.5 }}>DSR METHODOLOGY — FF vs Traditional</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginBottom: 6 }}>Traditional DSR (vs Revenue)</div>
              <div style={{ fontSize: 22, color: dsrRevenue > 35 ? '#ef5350' : dsrRevenue > 25 ? '#ff9800' : '#ffd54f' }}>{fmtP(dsrRevenue)}</div>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginTop: 4 }}>{fmt(totalMCAMonthly)} ÷ {fmt(revenue)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginBottom: 6 }}>FF DSR (vs Gross Profit)</div>
              <div style={{ fontSize: 22, color }}>{fmtP(dsr)}</div>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginTop: 4 }}>{fmt(totalMCAMonthly)} ÷ {fmt(grossProfit)}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', marginTop: 12, lineHeight: 1.6 }}>
            <strong>Why Gross Profit?</strong> The FF method uses Gross Profit (Revenue − COGS) as the true available cash for debt service. COGS of {fmt(cogs)}/mo must be paid to keep the business operating. This shows the real burden on available cash.
          </div>
        </div>
      )}

      {/* Stacking Violation Narrative */}
      {stackingViolations && stackingViolations.timeline.length > 1 && (
        <div style={{ background: 'rgba(239,83,80,0.08)', border: '1px solid rgba(239,83,80,0.25)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ef9a9a', letterSpacing: 0.5 }}>STACKING VIOLATION ANALYSIS</div>
          </div>

          {/* Timeline */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Funding Timeline</div>
            {stackingViolations.timeline.map((entry, idx) => {
              const weeklyPayment = activePositions.find(p => p.funder_name === entry.funder)?.payment_amount || 0;
              const priorCount = idx;
              return (
                <div key={idx} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: idx === 0 ? 'rgba(76,175,80,0.2)' : 'rgba(239,83,80,0.2)', border: `1px solid ${idx === 0 ? 'rgba(76,175,80,0.4)' : 'rgba(239,83,80,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: idx === 0 ? '#81c784' : '#ef9a9a', flexShrink: 0 }}>{idx + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#e8e8f0', marginBottom: 2 }}>
                      <strong>{entry.funder}</strong> — {entry.dateStr}
                      {entry.amount > 0 && <span style={{ color: 'rgba(232,232,240,0.5)' }}> ({fmt(entry.amount)})</span>}
                      {weeklyPayment > 0 && <span style={{ color: '#ef9a9a' }}> — {fmt(weeklyPayment)}/week</span>}
                    </div>
                    {priorCount > 0 && (
                      <div style={{ fontSize: 11, color: '#ffd54f' }}>
                        ⚠️ {priorCount} existing position{priorCount > 1 ? 's' : ''} at time of funding
                        {entry.hasAntiStack && <span style={{ color: '#ef9a9a' }}> — HAS ANTI-STACKING CLAUSE</span>}
                      </div>
                    )}
                    {idx === 0 && <div style={{ fontSize: 11, color: '#81c784' }}>✓ First position (no violation)</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Violations */}
          {stackingViolations.violations.length > 0 && (
            <div style={{ background: 'rgba(239,83,80,0.1)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#ef9a9a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Violations Detected</div>
              {stackingViolations.violations.map((v, idx) => (
                <div key={idx} style={{ fontSize: 12, color: 'rgba(232,232,240,0.7)', lineHeight: 1.7, marginBottom: idx < stackingViolations.violations.length - 1 ? 10 : 0 }}>
                  <strong>{v.funder}</strong> funded on {v.fundingDate} with an anti-stacking clause, despite {v.priorPositions} existing position{v.priorPositions > 1 ? 's' : ''} ({v.priorFunders}) totaling {fmt(v.priorWeeklyBurden)}/week. <em style={{ color: '#ffd54f' }}>Their own anti-stacking clause was violated at origination, materially impairing their enforcement standing.</em>
                </div>
              ))}
            </div>
          )}

          {/* Copy Narrative */}
          <button
            onClick={() => {
              const narrative = generateStackingNarrative();
              if (narrative) {
                navigator.clipboard.writeText(narrative);
              }
            }}
            style={{ ...S.btn('secondary'), padding: '8px 14px', fontSize: 12 }}
          >
            📋 Copy Stacking Narrative
          </button>
        </div>
      )}

      {/* Per-funder revenue take */}
      {activePositions.length > 0 && (
        <>
          <div style={S.divider} />
          <div style={S.sectionTitle}>Per-Funder Revenue Take</div>
          {activePositions.map((p, i) => {
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

      {/* ── Waterfall-Based Email Generator ── */}
      {activePositions.length > 0 && (() => {
        // Build deduped enrolled positions for waterfall
        const enrolledActive = activePositions.filter(p => {
          if (p.status === 'paid_off') return false;
          if (enrolledPositions === null) return true;
          if (!(enrolledPositions instanceof Set)) return true;
          return enrolledPositions.has(p._id);
        });
        if (enrolledActive.length === 0) return (
          <div style={{ textAlign: 'center', padding: 20, color: 'rgba(232,232,240,0.4)', fontSize: 13 }}>
            No positions enrolled in restructuring program. Enroll positions in the MCA Positions tab.
          </div>
        );

        // Deduplicate enrolled positions
        const dedupEnrolled = [];
        const seenKeys = new Set();
        enrolledActive.forEach(p => {
          const key = normalizeFunderKey(p.funder_name);
          const matchKey = key.length >= 6 ? key : (p.funder_name || '').toLowerCase().split(/\s+/)[0];
          let found = false;
          for (const dp of dedupEnrolled) {
            const dpKey = normalizeFunderKey(dp.funder_name);
            if (matchKey.length >= 6 && dpKey.length >= 6 && (matchKey.includes(dpKey.slice(0, 6)) || dpKey.includes(matchKey.slice(0, 6)))) {
              const advWeekly = toWeeklyEquiv(p.payment_amount_current || p.payment_amount || 0, p.frequency);
              const advAgMatch = matchAgreementToPosition(p.funder_name, agreementResults);
              const advBalance = advAgMatch?.analysis?.financial_terms?.purchased_amount
                ? Math.round(advAgMatch.analysis.financial_terms.purchased_amount)
                : Math.round(advWeekly * 52);
              dp._totalWeekly += advWeekly;
              dp._balance += advBalance;
              dp._advCount++;
              dp._advances.push({
                label: p.funder_name,
                balance: advBalance,
                weekly: advWeekly,
                agreementDate: advAgMatch?.analysis?.effective_date || advAgMatch?.analysis?.funding_date || null,
              });
              found = true;
              break;
            }
          }
          if (!found) {
            const agMatch = matchAgreementToPosition(p.funder_name, agreementResults);
            const agBalance = agMatch?.analysis?.financial_terms?.purchased_amount;
            const weekly = toWeeklyEquiv(p.payment_amount_current || p.payment_amount || 0, p.frequency);
            const bal = agBalance ? Math.round(agBalance) : Math.round(weekly * 52);
            dedupEnrolled.push({
              ...p,
              funder_name: p.funder_name.replace(/\s*\(Advance\s*\d+\)/i, '').replace(/\s*\(Position\s*[A-Z]\)/i, '').trim(),
              _totalWeekly: weekly,
              _advCount: 1,
              _balance: bal,
              _advances: [{
                label: p.funder_name,
                balance: bal,
                weekly: weekly,
                agreementDate: agMatch?.analysis?.effective_date || agMatch?.analysis?.funding_date || null,
              }],
            });
          }
        });

        const totalBalance = dedupEnrolled.reduce((s, dp) => s + dp._balance, 0);
        const totalWeeklyBurden = dedupEnrolled.reduce((s, dp) => s + dp._totalWeekly, 0);

        // Simple waterfall: use 40% of current weekly as base (sustainable level)
        const sustainableWeekly = Math.round(totalWeeklyBurden * 0.4);
        const tad = sustainableWeekly;

        // Per-funder tiers using proportional allocation
        const fTiers = dedupEnrolled.map(dp => {
          const alloc = totalBalance > 0 ? tad * (dp._balance / totalBalance) : 0;
          const origWeekly = dp._totalWeekly;
          const origTerm = origWeekly > 0 ? Math.round(dp._balance / origWeekly) : 52;
          const tiers = [0.5, 0.75, 1.0].map(pct => {
            const wkPmt = alloc * pct;
            const term = wkPmt > 0 ? Math.ceil(dp._balance / wkPmt) : 9999;
            return {
              pct, weeklyPayment: wkPmt, proposedTermWeeks: term,
              reductionPct: origWeekly > 0 ? ((origWeekly - wkPmt) / origWeekly) * 100 : 0,
              reductionDollars: origWeekly - wkPmt,
              extensionPct: origTerm > 0 ? ((term / origTerm) - 1) * 100 : 0,
            };
          });
          return { name: dp.funder_name, balance: dp._balance, originalWeekly: origWeekly, allocation: alloc, origTerm, tiers, _advCount: dp._advCount };
        });

        return <NegotiationEmailEngine
          fTiers={fTiers}
          revenue={revenue}
          a={a}
          totalWeeklyBurden={totalWeeklyBurden}
          enrolledCount={dedupEnrolled.length}
          agreementResults={agreementResults}
        />;
      })()}
    </div>
  );
}

// ─── Negotiation Email Generator Component ────────────────────────────────────
function NegotiationEmailGenerator({ businessName, positions, totalPositions, revenue, totalMCAMonthly, dsr, weeksToInsolvency, adbDays, grossProfit, opex }) {
  const [selectedFunder, setSelectedFunder] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState('opening');
  const [copied, setCopied] = useState(false);
  const [funderTracking, setFunderTracking] = useState({});

  const FF_CONTACT = {
    name: 'Gavin Roberts',
    title: 'Resolutions Manager',
    phone: '480-631-7691',
    email: 'resolutions@fundersfirst.com',
    address: 'Phoenix, AZ',
    tagline: 'RBFC Advocate | Revenue Based Finance Coalition'
  };

  const templates = [
    { id: 'opening', label: '1️⃣ Opening Offer', desc: 'Initial outreach with full positioning' },
    { id: 'middle1', label: '2️⃣ 1st Middle Ground', desc: 'Follow-up with weekly payments' },
    { id: 'middle2', label: '3️⃣ 2nd Middle Ground', desc: 'Improved terms / 1.5x allocation' },
    { id: 'final', label: '4️⃣ Final Offer', desc: 'Maximum allocation, last chance' },
  ];

  const generateComparisonBox = (balance, termWeeks) => {
    const defaultRecovery = balance * 0.35;
    const legalCosts = 7500;
    const netDefault = defaultRecovery - legalCosts;
    const advantage = balance - netDefault;
    return `════════════════════════════════════════════════════════════════
                     YOUR OPTIONS COMPARED
════════════════════════════════════════════════════════════════
   ACCEPT OUR PROPOSAL          │  PURSUE DEFAULT/COLLECTIONS
───────────────────────────────────────────────────────────────
   Receive: ${fmt(balance)} (100%)   │  Expected: ${fmt(defaultRecovery)} (~35%)
   Timeline: ${termWeeks} weeks          │  Timeline: 12-18+ months
   Your Legal Costs: $0         │  Legal Costs: $5,000-$15,000
   Collection Fees: $0          │  Collection Fees: ~25-35%
   Payments Start: 72 hours     │  Recovery Start: 6+ months
───────────────────────────────────────────────────────────────
   NET DIFFERENCE: +${fmt(advantage)} by accepting our proposal
════════════════════════════════════════════════════════════════`;
  };

  const generateEmail = (funder, templateId) => {
    const p = funder;
    const balance = p.estimated_balance || p.estimated_monthly_total * 12; // estimate if not known
    const currentWeekly = (p.payment_amount_current || p.payment_amount || 0);
    const proposedWeekly = Math.round(currentWeekly * 0.4); // 60% reduction proposal
    const termWeeks = Math.ceil(balance / proposedWeekly);
    const termMonths = Math.round(termWeeks / 4.33);
    const reductionPct = Math.round((1 - proposedWeekly / currentWeekly) * 100);
    const withholdPct = Math.round((totalMCAMonthly / revenue) * 100);
    const funderPosition = positions.findIndex(pos => pos._id === p._id) + 1;

    const statsBlock = `BANK-VERIFIED FINANCIAL OVERVIEW:
Business: ${businessName}
True Monthly Revenue (bank-verified): ${fmt(revenue)}
Combined MCA Weekly Burden: ${fmt(totalMCAMonthly / 4.33)} (${totalPositions} positions)
Current Withhold % of Revenue: ${withholdPct}%
${adbDays ? `Average Daily Balance Coverage: ${adbDays} days` : ''}
${weeksToInsolvency ? `Days Until Likely Default: ${Math.round(weeksToInsolvency * 7)} days` : ''}
Risk Assessment: ${dsr > 50 ? 'UNSUSTAINABLE' : dsr > 35 ? 'CRITICAL' : 'STRESSED'}

NOTE: All revenue figures are bank-statement verified — not merchant-reported estimates.`;

    const positioningBlock = `IMPORTANT — WHO WE ARE:
Funders First is NOT a debt settlement company. We do not advise merchants that MCAs are predatory, unfair, or that they don't owe what they contracted for. We believe in and support revenue-based finance as a legitimate funding tool for small businesses.

The issue here is over-stacking. This merchant is servicing ${totalPositions} concurrent funding positions, consuming ${withholdPct}% of weekly revenue. This level of debt service is mathematically unsustainable and, without intervention, leads to default — which benefits no one.

Our solution protects your investment by ensuring 100% repayment while giving the merchant breathing room to operate their business. This is not debt reduction — this is debt restructuring that works for everyone.

We are advocates of the Revenue Based Finance Coalition (RBFC) and work WITH funders, not against them.`;

    const yourPositionBlock = `YOUR POSITION:
You are 1 of ${totalPositions} funders in this portfolio
Current Weekly Payment: ${fmt(currentWeekly)}
Estimated Remaining Balance: ${fmt(balance)}`;

    const proposalBlock = `OUR ${templateId === 'final' ? 'FINAL ' : templateId === 'middle2' ? 'IMPROVED ' : templateId === 'middle1' ? 'REVISED ' : 'OPENING '}PROPOSAL:
Proposed Payment: ${fmt(proposedWeekly)} ${templateId === 'opening' ? 'bi-weekly' : 'weekly'}
Proposed Term: ${termWeeks} weeks (${termMonths} months)
Total Repayment: ${fmt(balance)} — 100% of your balance
Payment Reduction: ${reductionPct}% from current
Payments Begin: Within 72 hours of agreement`;

    const comparisonBox = generateComparisonBox(balance, termWeeks);

    const signature = `Best regards,
${FF_CONTACT.name}
${FF_CONTACT.title}
${FF_CONTACT.phone}
${FF_CONTACT.email}
${FF_CONTACT.address}

${FF_CONTACT.tagline}`;

    const lnaaNotice = `⚠️ IMPORTANT: Per the enclosed LNAA, all communications regarding this account must now be directed to our office. Please do not contact the merchant directly.`;

    const impossibilityNotice = dsr > 50 ? `
⚠️ MATHEMATICAL IMPOSSIBILITY NOTICE:
Bank statement analysis confirms ${fmt(totalMCAMonthly)} in monthly MCA debt service against ${fmt(grossProfit)} in monthly gross profit after ${fmt(opex)} in verified operating expenses. There is no repayment scenario that services all current positions without default.
` : '';

    const urgencyNotice = (weeksToInsolvency && weeksToInsolvency < 8) || (adbDays && adbDays < 14) ? `
⚠️ URGENT: Based on current cash flow analysis, this merchant has approximately ${weeksToInsolvency ? Math.round(weeksToInsolvency * 7) : adbDays} days before account balances become critically depleted.
` : '';

    if (templateId === 'opening') {
      return `Subject: Payment Modification Request - ${businessName} - Position ${funderPosition} of ${totalPositions} - Immediate Attention Required

Dear ${p.funder_name} Collections/Servicing Team,

We are reaching out on behalf of ${businessName} regarding their merchant cash advance position with your organization.

${positioningBlock}

${statsBlock}
${impossibilityNotice}${urgencyNotice}
${yourPositionBlock}

${proposalBlock}

${comparisonBox}

We are prepared to begin payments within 72 hours of reaching agreement. We want to start paying you right away.

ATTACHMENT: Please find enclosed our Limited Negotiation Authorization Agreement (LNAA), executed by ${businessName}, authorizing Funders First to negotiate on their behalf.

${lnaaNotice}

${signature}`;
    } else if (templateId === 'middle1') {
      return `Subject: Follow-Up: Modification Proposal - ${businessName} - Revised Terms

Dear ${p.funder_name} Collections/Servicing Team,

Following our previous communication regarding ${businessName}, we are presenting revised terms for your consideration.

${statsBlock}

${proposalBlock}

This proposal shifts to weekly payments while maintaining full repayment of your balance.

${comparisonBox}

We remain committed to ensuring you receive 100% of what is owed. Please respond so we can finalize terms and begin remittance immediately.

${lnaaNotice}

${signature}`;
    } else if (templateId === 'middle2') {
      const improvedWeekly = Math.round(proposedWeekly * 1.5);
      const improvedTerm = Math.ceil(balance / improvedWeekly);
      return `Subject: Revised Proposal - ${businessName} - Improved Terms Available

Dear ${p.funder_name} Collections/Servicing Team,

We are submitting improved terms for your position with ${businessName}.

${statsBlock}

OUR IMPROVED PROPOSAL:
Proposed Payment: ${fmt(improvedWeekly)} weekly (1.5x allocation)
Proposed Term: ${improvedTerm} weeks (${Math.round(improvedTerm / 4.33)} months)
Total Repayment: ${fmt(balance)} — 100% of your balance
Payment Reduction: ${Math.round((1 - improvedWeekly / currentWeekly) * 100)}% from current

This represents a more aggressive payment schedule that shortens your recovery timeline while maintaining sustainable merchant payments.

${comparisonBox}

We urge your prompt consideration. The sooner we reach agreement, the sooner payments begin. Other funders in this portfolio have been responsive — we want to include you in the initial payment distribution.

${lnaaNotice}

${signature}`;
    } else {
      return `Subject: Final Proposal - ${businessName} - Maximum Allocation Available

Dear ${p.funder_name} Collections/Servicing Team,

This represents our final proposal for the ${businessName} restructuring.

${statsBlock}

FINAL PROPOSAL (Full Weekly Allocation):
${proposalBlock}

This is our maximum allocation offer. This is the last opportunity to participate in the structured repayment before we are forced to notify you that your position cannot be accommodated in the current payment structure.

${comparisonBox}

${lnaaNotice}

${signature}`;
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const updateFunderTracking = (funderId, field, value) => {
    setFunderTracking(prev => ({
      ...prev,
      [funderId]: { ...(prev[funderId] || {}), [field]: value }
    }));
  };

  return (
    <>
      <div style={S.divider} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={S.sectionTitle}>✉️ Negotiation Email Generator</div>
        <span style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>Select a funder to generate pre-filled emails</span>
      </div>

      {/* Funder Selection */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {positions.map((p, i) => {
          const tracking = funderTracking[p._id] || {};
          const statusColors = { not_contacted: 'grey', email_sent: 'amber', in_negotiation: 'cyan', accepted: 'green', declined: 'red' };
          return (
            <button
              key={p._id}
              onClick={() => setSelectedFunder(selectedFunder?._id === p._id ? null : p)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: selectedFunder?._id === p._id ? '2px solid #00e5ff' : '1px solid rgba(255,255,255,0.15)',
                background: selectedFunder?._id === p._id ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.04)',
                color: selectedFunder?._id === p._id ? '#00e5ff' : '#e8e8f0',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[tracking.status] || 'rgba(255,255,255,0.2)' }} />
              {p.funder_name}
            </button>
          );
        })}
      </div>

      {/* Email Generator Panel */}
      {selectedFunder && (
        <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, color: '#00e5ff', marginBottom: 4 }}>{selectedFunder.funder_name}</div>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)' }}>
                {fmt(selectedFunder.payment_amount_current || selectedFunder.payment_amount)}/{selectedFunder.frequency} · Est. {fmt(selectedFunder.estimated_monthly_total)}/mo
              </div>
            </div>
            <select
              value={funderTracking[selectedFunder._id]?.status || 'not_contacted'}
              onChange={e => updateFunderTracking(selectedFunder._id, 'status', e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 11, fontFamily: 'inherit' }}>
              <option value="not_contacted">Not Contacted</option>
              <option value="email_sent">Email Sent</option>
              <option value="in_negotiation">In Negotiation</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </select>
          </div>

          {/* Template Selection */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(t.id)}
                style={{
                  flex: 1,
                  minWidth: 140,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: selectedTemplate === t.id ? '2px solid #EAD068' : '1px solid rgba(255,255,255,0.12)',
                  background: selectedTemplate === t.id ? 'rgba(234,208,104,0.1)' : 'rgba(255,255,255,0.03)',
                  color: selectedTemplate === t.id ? '#EAD068' : 'rgba(232,232,240,0.7)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  textAlign: 'left'
                }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{t.label}</div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>{t.desc}</div>
              </button>
            ))}
          </div>

          {/* Email Preview */}
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 16, marginBottom: 12, maxHeight: 400, overflowY: 'auto' }}>
            <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 11, color: 'rgba(232,232,240,0.85)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {generateEmail(selectedFunder, selectedTemplate)}
            </pre>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => copyToClipboard(generateEmail(selectedFunder, selectedTemplate))}
              style={{ ...S.btn('primary'), padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 6 }}>
              {copied ? '✓ Copied!' : '📋 Copy Email'}
            </button>
            <input
              placeholder="Contact email..."
              value={funderTracking[selectedFunder._id]?.contactEmail || ''}
              onChange={e => updateFunderTracking(selectedFunder._id, 'contactEmail', e.target.value)}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 12, fontFamily: 'inherit' }}
            />
            <input
              placeholder="Notes..."
              value={funderTracking[selectedFunder._id]?.notes || ''}
              onChange={e => updateFunderTracking(selectedFunder._id, 'notes', e.target.value)}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 12, fontFamily: 'inherit' }}
            />
          </div>
        </div>
      )}

      {/* Funder Status Summary */}
      {Object.keys(funderTracking).length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(232,232,240,0.4)', marginBottom: 10 }}>Negotiation Progress</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {['accepted', 'in_negotiation', 'email_sent', 'declined'].map(status => {
              const count = Object.values(funderTracking).filter(t => t.status === status).length;
              if (count === 0) return null;
              const colors = { accepted: '#4caf50', in_negotiation: '#00e5ff', email_sent: '#ff9800', declined: '#ef5350' };
              const labels = { accepted: 'Accepted', in_negotiation: 'In Negotiation', email_sent: 'Contacted', declined: 'Declined' };
              return (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: colors[status] }} />
                  <span style={{ fontSize: 12, color: colors[status] }}>{count} {labels[status]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Negotiation Email Engine (new waterfall-based) ──────────────────────────
function NegotiationEmailEngine({ fTiers, revenue, a, totalWeeklyBurden, enrolledCount, agreementResults }) {
  const [negFunderId, setNegFunderId] = useState(null);
  const [copiedEmail, setCopiedEmail] = useState(null);

  const negTierColors = ['#00bcd4', '#f59e0b', '#ef5350'];
  const negTierLabels = ['Opening (80%)', 'Revised (90%)', 'Final (100%)'];

  const biz = a.business_name || 'Business';
  const withholdPct = revenue > 0 ? ((totalWeeklyBurden * 4.33 / revenue) * 100).toFixed(1) : '0';
  const adb = a.balance_summary?.avg_daily_balance || a.calculated_metrics?.avg_daily_balance || 0;
  const monthlyBurden = totalWeeklyBurden * 4.33;
  const adbDays = monthlyBurden > 0 ? Math.round(adb / (monthlyBurden / 30)) : 0;
  const opex = a.expense_categories?.total_operating_expenses || 0;
  const deficit = revenue - (a.expense_categories?.inventory_cogs || 0) - opex - monthlyBurden;
  const daysToDefault = deficit < 0 ? Math.round(Math.abs(adb / (deficit / 30))) : 999;

  const generateEmail = (funderIdx, tierIdx) => {
    const ft = fTiers[funderIdx];
    if (!ft) return '';
    const tier = ft.tiers[tierIdx];
    if (!tier) return '';
    const f$ = (n) => '$' + Math.round(n).toLocaleString('en-US');

    const agMatch = matchAgreementToPosition(ft.name, agreementResults);
    const originDateStr = agMatch?.analysis?.funding_date || agMatch?.analysis?.effective_date || null;
    const originNote = originDateStr ? `\nNote: This position was originated on ${originDateStr}.` : '';

    const statsBlock = `BANK-VERIFIED FINANCIAL OVERVIEW:\nBusiness: ${biz}\nTrue Monthly Revenue (bank-verified): ${fmt(revenue)}\nTotal Active Positions: ${enrolledCount}\nCombined Weekly Burden: ${fmt(totalWeeklyBurden)} (${enrolledCount} positions)\nWithhold % of Revenue: ${withholdPct}%\nADB Coverage: ${adbDays} days\nDays Until Likely Default: ${daysToDefault < 999 ? daysToDefault + ' days' : 'N/A'}${originNote}\n\nNOTE: All revenue figures are bank-statement verified.`;

    const contractWeekly = getContractWeekly(agMatch);
    const currentLabel = contractWeekly > 0 ? `${f$(contractWeekly)} (per agreement)` : f$(ft.originalWeekly);
    const overpullDelta = contractWeekly > 0 ? ft.originalWeekly - contractWeekly : 0;
    const overpullNote = overpullDelta > contractWeekly * 0.01 ? `\nNote: Recent debits of ${f$(ft.originalWeekly)} exceed your contractual installment.` : '';

    const positionBreakdown = ft._advances && ft._advances.length > 1
      ? `YOUR POSITIONS WITH ${ft.name.toUpperCase()}:\nWe have identified ${ft._advances.length} active advances with your organization:\n${ft._advances.map((adv, i) => `  Advance ${i + 1}: Balance ${f$(adv.balance)} · ${f$(adv.weekly)}/wk${adv.agreementDate ? ` (originated ${adv.agreementDate})` : ''}`).join('\n')}\n\nCOMBINED POSITION:\n`
      : '';

    const proposalBlock = `${positionBreakdown}YOUR POSITION${ft._advCount > 1 ? ' (COMBINED)' : ''}:\nYour Current Weekly Payment:    ${currentLabel}\nProposed Weekly Payment:        ${f$(tier.weeklyPayment)}\nWeekly Reduction:               ${f$(tier.reductionDollars)} less per week\nPayment Reduction:              ${(parseFloat(tier.reductionPct) || 0).toFixed(1)}%\nProposed Term:                  ${tier.proposedTermWeeks} weeks\nTotal Repayment:                ${f$(ft.balance)} — 100% of your balance\nPayments Begin:                 Within 72 hours of agreement${overpullNote}`;

    const defaultRecovery = Math.round(ft.balance * 0.35);
    const defaultNet = Math.round(defaultRecovery * 0.7);
    const comparisonBlock = `════════════════════════════════════════════════════════════════\n                     YOUR OPTIONS COMPARED\n════════════════════════════════════════════════════════════════\n   ACCEPT PROPOSAL                │  PURSUE DEFAULT/COLLECTIONS\n───────────────────────────────────────────────────────────────\n   Total Recovery:                │\n     ${f$(ft.balance)} (100%)          │  ~${f$(defaultRecovery)} (~35%)\n   Your Weekly Payment:           │\n     ${f$(tier.weeklyPayment)}/wk             │  $0 (frozen/litigation)\n   Term: ${tier.proposedTermWeeks} weeks                │  12-18+ months contested\n   Legal Costs: $0                │  $5,000 - $15,000+\n   First Payment: 72 hours        │  6+ months from litigation\n───────────────────────────────────────────────────────────────\n   NET RECOVERY: +${f$(ft.balance - defaultNet)} by accepting\n════════════════════════════════════════════════════════════════`;

    const signature = `Best regards,\nGavin Roberts\nResolutions Manager\n480-631-7691\nresolutions@fundersfirst.com\nPhoenix, AZ\n\nRBFC Advocate | Revenue Based Finance Coalition`;
    const lnaaNotice = `Per the enclosed LNAA, all communications regarding this account must now be directed to our office. Please do not contact the merchant directly.`;

    if (tierIdx === 0) {
      return `Subject: Payment Modification Request – ${biz} – ${ft.name}\n\nDear ${ft.name} Collections/Servicing Team,\n\nWe are reaching out on behalf of ${biz} regarding their merchant cash advance position with your organization.\n\nIMPORTANT — WHO WE ARE:\nFunders First is NOT a debt settlement company. We believe in and support revenue-based finance as a legitimate funding tool for small businesses.\n\nThe issue here is over-stacking. This merchant is servicing ${enrolledCount} concurrent funding positions, consuming ${withholdPct}% of weekly revenue.\n\n${statsBlock}\n\n${proposalBlock}\n\n${comparisonBlock}\n\nWe are prepared to begin payments within 72 hours of reaching agreement.\n\nATTACHMENT: LNAA executed by ${biz}.\n\n${lnaaNotice}\n\n${signature}`;
    } else if (tierIdx === 1) {
      return `Subject: Revised Proposal – ${biz} – Improved Terms Available\n\nDear ${ft.name} Collections/Servicing Team,\n\nFollowing our previous communication regarding ${biz}, we are presenting improved terms.\n\nDays to default: ${daysToDefault < 999 ? daysToDefault : 'critical'}.\n\n${statsBlock}\n\n${proposalBlock}\n\n${comparisonBlock}\n\nPlease respond so we can finalize terms and begin remittance immediately.\n\n${lnaaNotice}\n\n${signature}`;
    } else {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const deadlineStr = futureDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      return `Subject: Final Proposal – ${biz} – Maximum Allocation\n\nDear ${ft.name} Collections/Servicing Team,\n\nThis represents our final proposal for the ${biz} restructuring.\n\n${statsBlock}\n\n${proposalBlock}\n\n${comparisonBlock}\n\nPositions not accommodated by ${deadlineStr} will be removed from the structured payment pool.\n\n${lnaaNotice}\n\n${signature}`;
    }
  };

  return (
    <>
      <div style={S.divider} />
      <div style={S.sectionTitle}>Funder Negotiation Emails</div>

      {/* Term Comparison Table */}
      {fTiers.length > 0 && (
        <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 16, marginBottom: 20, overflowX: 'auto' }}>
          <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Term Comparison — {fTiers.length} Funder{fTiers.length !== 1 ? 's' : ''} ({fTiers.reduce((s, ft) => s + (ft._advCount || 1), 0)} positions)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['Funder', 'Balance', 'Current Pmt', 'Orig Remaining', '80% Term', '90% Term', '100% Term'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Funder' ? 'left' : 'right', fontSize: 10, color: 'rgba(232,232,240,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fTiers.map((ft, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '8px 8px', color: '#e8e8f0', fontWeight: 600 }}>{ft.name}{ft._advCount > 1 ? ` (${ft._advCount} advances)` : ''}</td>
                  <td style={{ padding: '8px 8px', color: '#ef9a9a', textAlign: 'right' }}>{fmt(ft.balance)}</td>
                  <td style={{ padding: '8px 8px', color: 'rgba(232,232,240,0.5)', textAlign: 'right' }}>{fmt(ft.originalWeekly)}/wk</td>
                  <td style={{ padding: '8px 8px', color: 'rgba(232,232,240,0.4)', textAlign: 'right' }}>{ft.originalTermWeeks} wks</td>
                  <td style={{ padding: '8px 8px', color: negTierColors[0], textAlign: 'right' }}>{ft.tiers[0].proposedTermWeeks} wks</td>
                  <td style={{ padding: '8px 8px', color: negTierColors[1], textAlign: 'right' }}>{ft.tiers[1].proposedTermWeeks} wks</td>
                  <td style={{ padding: '8px 8px', color: negTierColors[2], textAlign: 'right', fontWeight: 700 }}>{ft.tiers[2].proposedTermWeeks} wks</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Funder Dropdown + Email Cards */}
      <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 12, padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Select Funder:</label>
          <select value={negFunderId ?? ''} onChange={e => setNegFunderId(e.target.value === '' ? null : Number(e.target.value))} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit', minWidth: 320 }}>
            <option value="">Select a funder…</option>
            {fTiers.map((ft, i) => <option key={i} value={i}>{ft.name} — {fmt(ft.balance)} bal — {fmtD(ft.allocation)}/wk alloc</option>)}
          </select>
        </div>

        {negFunderId !== null && fTiers[negFunderId] && (() => {
          const selFt = fTiers[negFunderId];
          return (
            <div>
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 12, color: 'rgba(232,232,240,0.7)', lineHeight: 1.8 }}>
                <div style={{ fontSize: 16, color: '#00e5ff', fontWeight: 700, marginBottom: 6 }}>{selFt.name}{selFt._advCount > 1 ? ` (${selFt._advCount} advances)` : ''}</div>
                {selFt._advances && selFt._advances.length > 1 && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: 10, marginBottom: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    {selFt._advances.map((adv, ai) => (
                      <div key={ai} style={{ fontSize: 11, color: 'rgba(232,232,240,0.6)', lineHeight: 1.8, display: 'flex', gap: 12 }}>
                        <span style={{ color: '#ffd54f', minWidth: 80 }}>Advance {ai + 1}:</span>
                        <span>Balance: <strong style={{ color: '#e8e8f0' }}>{fmt(adv.balance)}</strong></span>
                        <span>Weekly: <strong style={{ color: '#ef9a9a' }}>{fmtD(adv.weekly)}/wk</strong></span>
                        {adv.agreementDate && <span style={{ color: 'rgba(232,232,240,0.35)' }}>({adv.agreementDate})</span>}
                      </div>
                    ))}
                  </div>
                )}
                <div>Combined Balance: <strong style={{ color: '#e8e8f0' }}>{fmt(selFt.balance)}</strong> · Combined Weekly: <strong style={{ color: '#ef9a9a' }}>{fmt(selFt.originalWeekly)}/wk</strong> · Allocation: <strong style={{ color: '#00e5ff' }}>{fmtD(selFt.allocation)}/wk</strong></div>
                <div>Total Repayment (all tiers): <strong style={{ color: '#4caf50' }}>{fmt(selFt.balance)}</strong> (100%)</div>
              </div>

              {/* 3 email preview cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[0, 1, 2].map(ti => {
                  const t = selFt.tiers[ti];
                  return (
                    <div key={ti} style={{ background: `${negTierColors[ti]}08`, border: `1px solid ${negTierColors[ti]}44`, borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: negTierColors[ti], marginBottom: 8 }}>{negTierLabels[ti]}</div>
                      <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.6)', lineHeight: 1.8, marginBottom: 10 }}>
                        <div>Payment: <strong style={{ color: negTierColors[ti] }}>{fmtD(t.weeklyPayment)}/wk</strong></div>
                        <div>Reduction: <strong>{(parseFloat(t.reductionPct) || 0).toFixed(1)}%</strong> ({fmtD(t.reductionDollars)} less)</div>
                        <div>Term: <strong>{t.proposedTermWeeks} wks</strong> ({Math.round(t.proposedTermWeeks / 4.33)} mo)</div>
                        <div>Extension: +{(parseFloat(t.extensionPct) || 0).toFixed(0)}%</div>
                        <div>Repayment: <strong style={{ color: '#4caf50' }}>{fmt(selFt.balance)}</strong></div>
                      </div>
                      <button onClick={() => { const txt = generateEmail(negFunderId, ti); navigator.clipboard.writeText(txt); setCopiedEmail(`${negFunderId}-${ti}`); setTimeout(() => setCopiedEmail(null), 2000); }} style={{ ...S.btn('primary'), padding: '6px 12px', fontSize: 11, width: '100%' }}>
                        {copiedEmail === `${negFunderId}-${ti}` ? '✓ Copied!' : 'Copy Email'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Full email preview */}
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 16, maxHeight: 500, overflowY: 'auto' }}>
                <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 11, color: 'rgba(232,232,240,0.85)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {generateEmail(negFunderId, 0)}
                </pre>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}

// ─── Agreements Tab (NEW) ────────────────────────────────────────────────────
function AgreementsTab({ agreementResults }) {
  if (!agreementResults || agreementResults.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(232,232,240,0.4)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 15, marginBottom: 8, color: '#ffd54f' }}>Upload agreements to enable</div>
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>Upload MCA agreements using the "Add Agreements" button in the header above, then click "Analyze Agreements" to extract contract terms. Cross-reference analysis requires at least one analyzed agreement.</div>
      </div>
    );
  }

  // Build cross-agreement key
  const CLAUSE_DEFS = [
    { key: 'reconciliation', label: 'Reconciliation', color: 'green', desc: 'Merchant can request payment reduction if revenue drops. Most powerful renegotiation lever.' },
    { key: 'anti_stacking', label: 'Anti-Stacking', color: 'amber', desc: 'Prohibits taking additional MCA positions. If funder violated this themselves by funding into existing stack, their enforcement position is weakened.' },
    { key: 'coj', label: 'COJ (Confession of Judgment)', color: 'red', desc: 'Allows funder to enter judgment without lawsuit. UNENFORCEABLE in NY as of Feb 2026 under FAIR Act.' },
    { key: 'arbitration', label: 'Arbitration', color: 'purple', desc: 'Disputes resolved by arbitrator, not court. Can cut both ways — faster but limits appeal rights.' },
    { key: 'jury_waiver', label: 'Jury Waiver', color: 'grey', desc: 'Merchant waives right to jury trial. Standard in most MCA agreements.' },
    { key: 'pg', label: 'Personal Guarantee', color: 'red', desc: 'Owner personally liable for the MCA. Scope matters — full PG vs performance obligations only.' },
    { key: 'ucc', label: 'UCC Lien', color: 'grey', desc: 'Blanket lien on business assets filed with the state. Public record that affects future financing.' },
  ];

  const getClauseStatus = (ag, key) => {
    const d = ag.analysis || ag;
    const clauses = d.problematic_clauses || [];
    const protections = d.merchant_protections || [];
    const sa = d.stacking_analysis || {};
    switch(key) {
      case 'reconciliation': return protections.some(p => p.protection_type === 'reconciliation');
      case 'anti_stacking':  return sa.has_anti_stacking_clause || clauses.some(c => c.clause_type === 'anti_stacking');
      case 'coj':            return clauses.some(c => c.clause_type === 'coj');
      case 'arbitration':    return clauses.some(c => c.clause_type === 'arbitration') || (d.agreement_type||'').includes('arbitration');
      case 'jury_waiver':    return clauses.some(c => c.clause_type === 'jury_waiver');
      case 'pg':             return clauses.some(c => c.clause_type === 'personal_guarantee');
      case 'ucc':            return clauses.some(c => /ucc/i.test(c.clause_type));
      default:               return false;
    }
  };

  const tagColors = { green: '#4caf50', amber: '#ff9800', red: '#ef5350', purple: '#ce93d8', grey: 'rgba(232,232,240,0.4)' };

  return (
    <div>
      {/* ── Agreement Key / Comparison Grid ── */}
      <div style={{ ...S.card, background: 'rgba(255,255,255,0.04)', marginBottom: 24 }}>
        <div style={S.sectionTitle}>Agreement Clause Comparison</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'rgba(232,232,240,0.4)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: 180 }}>CLAUSE</th>
                {agreementResults.map((ag, i) => {
                  const d = ag.analysis || ag;
                  return <th key={i} style={{ textAlign: 'center', padding: '8px 12px', color: '#00e5ff', fontWeight: 400, borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: 120 }}>{d.funder_name || ag.fileName?.replace('.pdf','') || `Agreement ${i+1}`}</th>;
                })}
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'rgba(232,232,240,0.4)', fontWeight: 400, letterSpacing: 1, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>WHAT IT MEANS</th>
              </tr>
            </thead>
            <tbody>
              {CLAUSE_DEFS.map((def) => (
                <tr key={def.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '10px 12px', color: tagColors[def.color], fontWeight: 500 }}>{def.label}</td>
                  {agreementResults.map((ag, i) => {
                    const has = getClauseStatus(ag, def.key);
                    return (
                      <td key={i} style={{ textAlign: 'center', padding: '10px 12px' }}>
                        {has
                          ? <span style={{ color: def.key === 'reconciliation' ? '#4caf50' : def.color === 'grey' ? 'rgba(232,232,240,0.5)' : tagColors[def.color], fontSize: 16 }}>✓</span>
                          : <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 14 }}>—</span>
                        }
                      </td>
                    );
                  })}
                  <td style={{ padding: '10px 12px', color: 'rgba(232,232,240,0.45)', lineHeight: 1.5, fontSize: 11 }}>{def.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
        const priorBalance    = (() => {
        // Look in other_fees for buyout/prior balance paid to previous position
        const fromFees = (fa.other_fees || []).find(f => /prior|buyout|payoff|balance/i.test(f.name))?.amount || 0;
        // Also check fee_analysis for explicit prior_balance field
        const explicit = fa.prior_balance_paid || fa.prior_balance || 0;
        return explicit || fromFees;
      })();
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
              <div><div style={S.statLabel}>Factor Rate</div><div style={{ fontSize: 15, color: '#e8e8f0' }}>{factorRate ? (parseFloat(factorRate) || 0).toFixed(2) : '—'}</div></div>
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
function CrossReferenceTab({ crossRefResult, crossRefError, agreementResults, positions, a }) {
  if (!agreementResults || agreementResults.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(232,232,240,0.4)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 15, marginBottom: 8, color: '#ffd54f' }}>Upload agreements to enable cross-reference</div>
        <div style={{ fontSize: 13 }}>Upload MCA agreements and click "Analyze Agreements" first. Then click "Run Cross-Reference" to compare contract terms against bank data.</div>
      </div>
    );
  }
  if (!crossRefResult) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(232,232,240,0.4)' }}>
        {crossRefError ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 15, marginBottom: 8, color: '#ef9a9a' }}>Cross-reference failed</div>
            <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.5)', lineHeight: 1.6, maxWidth: 500, margin: '0 auto', padding: '12px 16px', background: 'rgba(239,83,80,0.08)', border: '1px solid rgba(239,83,80,0.2)', borderRadius: 8 }}>{crossRefError}</div>
            <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.35)', marginTop: 12 }}>Try again or switch to a different model.</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔄</div>
            <div style={{ fontSize: 15, marginBottom: 8 }}>Cross-reference not yet run</div>
            <div style={{ fontSize: 13 }}>{agreementResults.length} agreement{agreementResults.length > 1 ? 's' : ''} analyzed. Click "Run Cross-Reference" in the header to compare against bank data.</div>
          </>
        )}
      </div>
    );
  }
  const cr = crossRefResult.analysis || crossRefResult;
  const chronology = cr.position_chronology || [];
  const contractVsReality = cr.contract_vs_reality || [];
  const scorecards = cr.funder_scorecards || [];
  const cascading = cr.cascading_burden_analysis || {};
  const recommendation = cr.restructuring_recommendation || {};
  const revenueReality = cr.revenue_reality || {};
  const modelUsed = crossRefResult.model_used || '';

  const gradeColor = (g) => g === 'A' ? '#4caf50' : g === 'B' ? '#81c784' : g === 'C' ? '#ffd54f' : g === 'D' ? '#ff9800' : '#ef5350';
  const [showLegend, setShowLegend] = useState(false);

  const legendPill = (color, label) => <span style={{ ...S.tag(color), fontSize: 10, whiteSpace: 'nowrap' }}>{label}</span>;
  const legendGrade = (grade, color) => <span style={{ display: 'inline-block', width: 28, height: 28, lineHeight: '28px', textAlign: 'center', borderRadius: 6, fontWeight: 700, fontSize: 16, color, background: `${color}18`, border: `1px solid ${color}44` }}>{grade}</span>;

  const legendGroups = [
    {
      title: 'Payment Compliance Tags',
      items: [
        { badge: legendPill('green', '✓ MATCH'), desc: 'Actual payments match the contract amount. Funder is pulling what they agreed to.' },
        { badge: legendPill('amber', '⚠ UNDERPULL'), desc: 'Actual payments are LESS than contracted. Favorable for merchant — funder has been accepting less than agreed.' },
        { badge: legendPill('red', '⚠ OVERPULL'), desc: 'Actual payments EXCEED the contract amount. Potential funder breach — strong negotiation leverage.' },
        { badge: <span style={{ ...S.tag('red'), fontSize: 10, background: 'rgba(255,145,0,0.15)', color: '#ff9100', border: '1px solid rgba(255,145,0,0.3)' }}>⚠ ESCALATION</span>, desc: 'Payment amount has INCREASED over time. May indicate unilateral funder action.' },
        { badge: legendPill('grey', '— NO AGREEMENT'), desc: 'No contract uploaded for this position. Payment estimated from bank statement patterns.' },
      ]
    },
    {
      title: 'Contract vs Reality Grades',
      items: [
        { badge: legendGrade('A', '#4caf50'), desc: 'Clean deal. Revenue assumptions match reality, factor rate within market norms.' },
        { badge: legendGrade('B', '#81c784'), desc: 'Minor discrepancies. Revenue slightly overstated or factor rate slightly elevated.' },
        { badge: legendGrade('C', '#ffd54f'), desc: 'Moderate issues. Revenue gap, funded into known stack, or anti-stacking violation.' },
        { badge: legendGrade('D', '#ff9800'), desc: 'Significant issues. Large revenue gap, self-renewal with inflated factor, underwriting failures.' },
        { badge: legendGrade('F', '#ef5350'), desc: 'Predatory. Extreme true factor rate (>2.5x), massive fee extraction, or 49%+ specified % with known stack.' },
      ]
    },
    {
      title: 'Contract vs Reality Metrics',
      items: [
        { badge: <span style={{ fontSize: 10, fontWeight: 600, color: '#ffd54f', textTransform: 'uppercase', letterSpacing: 0.5 }}>IMPLIED REVENUE</span>, desc: 'Monthly revenue the funder assumed, calculated from weekly_payment ÷ specified_percentage × 4.33.' },
        { badge: <span style={{ fontSize: 10, fontWeight: 600, color: '#ffd54f', textTransform: 'uppercase', letterSpacing: 0.5 }}>STATED REVENUE</span>, desc: 'Revenue figure explicitly written in the contract. Different from Implied.' },
        { badge: <span style={{ fontSize: 10, fontWeight: 600, color: '#00e5ff', textTransform: 'uppercase', letterSpacing: 0.5 }}>ACTUAL REVENUE</span>, desc: 'Bank-verified monthly revenue from statement analysis. The ground truth.' },
        { badge: <span style={{ fontSize: 10, fontWeight: 600, color: '#ef5350', textTransform: 'uppercase', letterSpacing: 0.5 }}>REVENUE GAP</span>, desc: '"Overstated" = funder assumed more revenue than exists. "Below actual" = funder understated.' },
        { badge: <span style={{ fontSize: 10, fontWeight: 600, color: '#e8e8f0', textTransform: 'uppercase', letterSpacing: 0.5 }}>TRUE FACTOR RATE</span>, desc: 'Effective factor based on net proceeds (purchased_amount ÷ net_funded). Self-renewals inflate this dramatically. Industry norm: 1.20-1.50. Above 2.0 = predatory.' },
      ]
    },
    {
      title: 'Funder Scorecard Tags',
      items: [
        { badge: legendPill('green', '✓ Rev Verified'), desc: 'Funder verified actual revenue before funding. Implied revenue within 15% of actual.' },
        { badge: legendPill('red', '✕ Rev Verified'), desc: 'Funder did NOT verify revenue. Implied revenue gap exceeds 15%.' },
        { badge: legendPill('green', '✓ Stack Checked'), desc: 'Funder accounted for existing MCA stack before funding.' },
        { badge: legendPill('red', '✕ Stack Checked'), desc: 'Funder ignored existing stack. Funded without accounting for existing burden.' },
        { badge: legendPill('red', 'Anti-Stack Hypocrite'), desc: 'Contract has anti-stacking clause, yet funder funded INTO a known stack.' },
        { badge: legendPill('red', 'Predatory'), desc: 'True factor rate >2.5x, origination fee >8%, or fee extraction >50% of purchase price.' },
        { badge: legendPill('green', 'Market'), desc: 'Terms within normal MCA market ranges. Factor 1.15-1.55, origination 2-6%.' },
        { badge: legendPill('gold', 'Self-Renewal'), desc: 'Funder paid off their OWN prior position. Proves knowledge of merchant condition.' },
        { badge: legendPill('green', 'COJ Void'), desc: 'Confession of Judgment clause is unenforceable (NY FAIR Act, state prohibition, etc.).' },
        { badge: legendPill('green', '✓ Reconciliation'), desc: 'Contract has reconciliation clause allowing payment modification based on actual revenue.' },
      ]
    },
  ];

  return (
    <div>
      {/* Model indicator */}
      {modelUsed && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 8px' }}>
            Model: {modelUsed.includes('sonnet') ? 'Sonnet' : modelUsed.includes('opus') ? 'Opus' : modelUsed}
          </span>
        </div>
      )}
      {/* Revenue Reality */}
      {revenueReality.actual_monthly_revenue > 0 && (
        <div style={{ ...S.card, background: 'rgba(0,229,255,0.04)', marginBottom: 20 }}>
          <div style={S.sectionTitle}>Revenue Reality (Bank-Verified)</div>
          <div style={S.row}>
            <div style={S.stat}><div style={S.statLabel}>Actual Monthly Revenue</div><div style={S.statValue('#00e5ff')}>{fmt(revenueReality.actual_monthly_revenue)}</div></div>
            {revenueReality.actual_gross_profit > 0 && <div style={S.stat}><div style={S.statLabel}>Actual Gross Profit</div><div style={S.statValue('#81c784')}>{fmt(revenueReality.actual_gross_profit)}</div></div>}
            <div style={S.stat}><div style={S.statLabel}>Months Analyzed</div><div style={S.statValue('#e8e8f0')}>{revenueReality.months_analyzed || '—'}</div></div>
          </div>
          {revenueReality.revenue_methodology && <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)', marginTop: 10, lineHeight: 1.6 }}>{revenueReality.revenue_methodology}</div>}
        </div>
      )}

      {/* Analysis Legend */}
      <div style={{ margin: '0 0 20px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setShowLegend(!showLegend)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            padding: '8px 16px',
            color: 'rgba(232,232,240,0.7)',
            cursor: 'pointer',
            fontSize: 14,
            transition: 'all 0.2s'
          }}
        >
          {showLegend ? 'Hide Legend' : 'Analysis Legend'}
        </button>
      </div>
      {showLegend && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}>
          {legendGroups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: gi < legendGroups.length - 1 ? 24 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#00e5ff', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid rgba(0,229,255,0.15)' }}>{group.title}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '10px 24px' }}>
                {group.items.map((item, ii) => (
                  <div key={ii} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
                    <div style={{ flexShrink: 0, minWidth: 110, display: 'flex', justifyContent: 'center' }}>{item.badge}</div>
                    <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)', lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#00e5ff', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 }}>Restructuring Recommendation</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '10px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
                <div style={{ flexShrink: 0, minWidth: 110, textAlign: 'center' }}><span style={{ fontSize: 10, fontWeight: 600, color: '#ef9a9a', textTransform: 'uppercase', letterSpacing: 0.5 }}>CURRENT WEEKLY</span></div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)', lineHeight: 1.5 }}>Sum of all active MCA payments per week from bank statements.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
                <div style={{ flexShrink: 0, minWidth: 110, textAlign: 'center' }}><span style={{ fontSize: 10, fontWeight: 600, color: '#4caf50', textTransform: 'uppercase', letterSpacing: 0.5 }}>SUSTAINABLE</span></div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)', lineHeight: 1.5 }}>Payment level the merchant can afford based on gross profit and industry DSR (25-35%).</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
                <div style={{ flexShrink: 0, minWidth: 110, textAlign: 'center' }}><span style={{ fontSize: 10, fontWeight: 600, color: '#00e5ff', textTransform: 'uppercase', letterSpacing: 0.5 }}>REDUCTION</span></div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)', lineHeight: 1.5 }}>Percentage decrease from current to sustainable. Higher = more urgent restructuring case.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
                <div style={{ flexShrink: 0, minWidth: 110, textAlign: 'center' }}><span style={{ fontSize: 10, fontWeight: 600, color: '#e8e8f0', textTransform: 'uppercase', letterSpacing: 0.5 }}>PER-FUNDER</span></div>
                <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)', lineHeight: 1.5 }}><span style={{ color: '#ef9a9a', textDecoration: 'line-through' }}>current</span> → <span style={{ color: '#4caf50' }}>proposed</span> (term). Proportional to each funder's share. All receive 100% of remaining balance.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Compliance — Agreement vs Actual */}
      {(() => {
        const compliance = buildPaymentCompliance(positions || [], agreementResults, a?.monthly_breakdown);
        const withContract = compliance.filter(c => c.contractWeekly);
        if (withContract.length === 0) return null;
        const overpulls = withContract.filter(c => c.contractStatus === 'overpull');
        return (
          <>
            <div style={{ ...S.divider, marginTop: 4 }} />
            <div style={S.sectionTitle}>Payment Compliance — Agreement vs Actual</div>
            {overpulls.length > 0 && (
              <div style={{ background: 'rgba(239,83,80,0.08)', border: '1px solid rgba(239,83,80,0.25)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#ef9a9a', fontWeight: 600, marginBottom: 10 }}>OVERPULL DETECTED — {overpulls.length} Position{overpulls.length > 1 ? 's' : ''}</div>
                {overpulls.map((c, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#ef9a9a', lineHeight: 1.8, marginBottom: 6, padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                    <strong>OVERPULL DETECTED:</strong> {c.funder_name} is debiting {fmt(c.latestWeekly)}/wk — {fmt(Math.abs(c.contractDelta))} above their contractual weekly installment of {fmt(c.contractWeekly)}. This may constitute a breach of the MCA agreement.
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gap: 10 }}>
              {withContract.map((c, i) => {
                const statusColor = c.contractStatus === 'match' ? '#4caf50' : c.contractStatus === 'overpull' ? '#ef5350' : '#ffd54f';
                const statusIcon = c.contractStatus === 'match' ? '✓' : c.contractStatus === 'overpull' ? '🚨' : '⚠';
                return (
                  <div key={i} style={{ ...S.funderCard, borderColor: c.contractStatus === 'overpull' ? 'rgba(239,83,80,0.3)' : undefined }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 14, color: '#e8e8f0' }}>{c.funder_name}</div>
                      <span style={S.tag(c.contractStatus === 'match' ? 'green' : c.contractStatus === 'overpull' ? 'red' : 'amber')}>{statusIcon} {c.contractStatus?.toUpperCase()}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>Contract Payment</div>
                        <div style={{ fontSize: 16, color: '#e8e8f0' }}>{fmt(c.contractWeekly)}<span style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>/wk</span></div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>Prior Actual</div>
                        <div style={{ fontSize: 16, color: '#e8e8f0' }}>{fmt(c.priorWeekly)}<span style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>/wk</span></div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>Latest Actual</div>
                        <div style={{ fontSize: 16, color: statusColor }}>
                          {fmt(c.latestWeekly)}<span style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>/wk</span>
                          {Math.abs(c.contractDelta) > 0.01 && (
                            <span style={{ fontSize: 12, color: statusColor, marginLeft: 6 }}>
                              {c.contractDelta > 0 ? '+' : ''}{fmt(c.contractDelta)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {c.paymentChanged && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#ffd54f', padding: '6px 10px', background: 'rgba(249,168,37,0.06)', borderRadius: 6 }}>
                        Payment changed from {fmt(c.priorWeekly)}/wk to {fmt(c.latestWeekly)}/wk ({c.paymentChangePct > 0 ? '+' : ''}{(parseFloat(c.paymentChangePct) || 0).toFixed(1)}%)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Cascading Burden Narrative */}
      {cascading.narrative && (
        <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.7)', lineHeight: 1.8, padding: '14px 18px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 16, whiteSpace: 'pre-line' }}>{cascading.narrative}</div>
      )}

      {/* Position Chronology */}
      {chronology.length > 0 && (
        <>
          <div style={S.sectionTitle}>Funding Chronology</div>
          {chronology.map((p, i) => (
            <div key={i} style={{ ...S.funderCard, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, color: '#e8e8f0' }}><span style={{ color: 'rgba(232,232,240,0.4)', marginRight: 8 }}>#{p.order}</span>{p.funder_name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.45)', marginTop: 2 }}>Funded: {p.funding_date} · Purchase: {fmt(p.purchase_price)} · Net: {fmt(p.net_proceeds)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, color: '#ef9a9a' }}>{fmt(p.weekly_payment)}/wk</div>
                  <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>{fmt(p.monthly_payment)}/mo</div>
                </div>
              </div>
              <div style={S.grid2}>
                <div><div style={S.statLabel}>Existing MCA at Funding</div><div style={{ fontSize: 13, color: '#ffd54f' }}>{fmt(p.existing_weekly_mca_at_funding)}/wk</div></div>
                <div><div style={S.statLabel}>Available Revenue After</div><div style={{ fontSize: 13, color: p.available_revenue_after_this_position < 0 ? '#ef5350' : '#81c784' }}>{fmt(p.available_revenue_after_this_position)}</div></div>
              </div>
              {p.pct_of_available_revenue_consumed > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 3 }}>
                    <span>Revenue consumed</span><span>{fmtP(p.pct_of_available_revenue_consumed)}</span>
                  </div>
                  <div style={S.progressTrack}><div style={S.progressBar(p.pct_of_available_revenue_consumed, p.pct_of_available_revenue_consumed > 80 ? '#ef5350' : '#ff9800')} /></div>
                </div>
              )}
              {p.narrative && <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)', marginTop: 8, lineHeight: 1.6 }}>{p.narrative}</div>}
            </div>
          ))}
        </>
      )}

      {/* Contract vs Reality */}
      {contractVsReality.length > 0 && (
        <>
          <div style={{ ...S.divider, marginTop: 20 }} />
          <div style={S.sectionTitle}>Contract vs Reality</div>
          {contractVsReality.map((c, i) => (
            <div key={i} style={{ ...S.card, background: 'rgba(255,255,255,0.04)', padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 15, color: '#e8e8f0' }}>{c.funder_name}</div>
                <span style={S.tag(c.underwriting_grade === 'A' || c.underwriting_grade === 'B' ? 'green' : c.underwriting_grade === 'C' ? 'amber' : 'red')}>Grade: {c.underwriting_grade || '—'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
                <div>
  <div style={S.statLabel}>{c.revenue_source === 'implied_from_specified_percentage' ? 'Implied Revenue' : 'Stated Revenue'}</div>
  <div style={{ fontSize: 13, color: '#ffd54f' }}>
    {c.stated_revenue ? fmt(c.stated_revenue) : 'Not Disclosed'}
    {c.revenue_source === 'implied_from_specified_percentage' && (
      <span style={{ fontSize: 10, color: 'rgba(255,213,79,0.5)', marginLeft: 6 }}>(from specified %)</span>
    )}
  </div>
</div>
                <div><div style={S.statLabel}>Actual Revenue</div><div style={{ fontSize: 13, color: '#00e5ff' }}>{fmt(c.actual_revenue)}</div></div>
                <div><div style={S.statLabel}>Revenue Gap</div><div style={{ fontSize: 13, color: c.revenue_discrepancy_pct > 0 ? '#ef5350' : c.revenue_discrepancy_pct < 0 ? '#ffd54f' : '#4caf50' }}>{c.revenue_discrepancy_pct > 0 ? `+${fmtP(c.revenue_discrepancy_pct)} overstated` : c.revenue_discrepancy_pct < 0 ? `${fmtP(c.revenue_discrepancy_pct)} below actual` : 'Match'}</div></div>
                <div><div style={S.statLabel}>Contract Withhold</div><div style={{ fontSize: 13, color: '#e8e8f0' }}>{fmtP(c.contracted_withhold_pct)}</div></div>
                <div><div style={S.statLabel}>Actual Withhold</div><div style={{ fontSize: 13, color: c.actual_withhold_pct > c.contracted_withhold_pct ? '#ef5350' : '#e8e8f0' }}>{fmtP(c.actual_withhold_pct)}</div></div>
                <div><div style={S.statLabel}>True Factor Rate</div><div style={{ fontSize: 13, color: c.true_factor_rate > 1.5 ? '#ef5350' : '#e8e8f0' }}>{c.true_factor_rate ? (parseFloat(c.true_factor_rate) || 0).toFixed(2) : '—'}</div></div>
              </div>
              {(c.underwriting_failures || []).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {c.underwriting_failures.map((f, j) => (
                    <div key={j} style={{ fontSize: 12, color: '#ef9a9a', lineHeight: 1.6 }}>• {f}</div>
                  ))}
                </div>
              )}
              {(c.leverage_points || []).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {c.leverage_points.map((lp, j) => (
                    <div key={j} style={{ fontSize: 12, color: '#81c784', lineHeight: 1.6 }}>+ {lp}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Funder Scorecards */}
      {scorecards.length > 0 && (
        <>
          <div style={{ ...S.divider, marginTop: 20 }} />
          <div style={S.sectionTitle}>Funder Scorecards</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {scorecards.map((sc, i) => (
              <div key={i} style={{ ...S.card, background: 'rgba(255,255,255,0.04)', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 14, color: '#e8e8f0' }}>{sc.funder_name}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: gradeColor(sc.underwriting_grade) }}>{sc.underwriting_grade}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={S.tag(sc.revenue_verified ? 'green' : 'red')}>{sc.revenue_verified ? '✓' : '✕'} Rev Verified</span>
                  <span style={S.tag(sc.existing_positions_accounted ? 'green' : 'red')}>{sc.existing_positions_accounted ? '✓' : '✕'} Stack Checked</span>
                  {sc.anti_stacking_hypocrite && <span style={S.tag('red')}>Anti-Stack Hypocrite</span>}
                  <span style={S.tag(sc.factor_rate_assessment === 'market' ? 'green' : sc.factor_rate_assessment === 'predatory' ? 'red' : 'amber')}>{sc.factor_rate_assessment}</span>
                </div>
                {sc.recommended_approach && <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.55)', lineHeight: 1.6 }}>{sc.recommended_approach}</div>}
                {sc.estimated_negotiation_outcome && <div style={{ fontSize: 11, color: '#81c784', marginTop: 6 }}>{sc.estimated_negotiation_outcome}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Restructuring Recommendation */}
      {recommendation.headline && (
        <>
          <div style={{ ...S.divider, marginTop: 20 }} />
          <div style={S.sectionTitle}>Restructuring Recommendation</div>
          <div style={{ ...S.card, background: 'rgba(76,175,80,0.06)', borderColor: 'rgba(76,175,80,0.2)' }}>
            <div style={{ fontSize: 14, color: '#81c784', marginBottom: 12, lineHeight: 1.6 }}>{recommendation.headline}</div>
            <div style={S.row}>
              <div style={S.stat}><div style={S.statLabel}>Current Weekly</div><div style={{ fontSize: 16, color: '#ef9a9a' }}>{fmt(recommendation.current_total_weekly)}</div></div>
              <div style={S.stat}><div style={S.statLabel}>Sustainable Weekly</div><div style={{ fontSize: 16, color: '#4caf50' }}>{fmt(recommendation.sustainable_weekly)}</div></div>
              <div style={S.stat}><div style={S.statLabel}>Reduction</div><div style={{ fontSize: 16, color: '#00e5ff' }}>{fmtP(recommendation.recommended_reduction_pct)}</div></div>
            </div>
            {(recommendation.per_funder_recommendation || []).length > 0 && (
              <div style={{ marginTop: 12 }}>
                {recommendation.per_funder_recommendation.map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12 }}>
                    <span style={{ color: '#e8e8f0' }}>{r.funder}</span>
                    <span><span style={{ color: '#ef9a9a', textDecoration: 'line-through' }}>{fmt(r.current_weekly)}</span> <span style={{ color: '#4caf50' }}>→ {fmt(r.recommended_weekly)}/wk</span> <span style={{ color: 'rgba(232,232,240,0.4)' }}>({r.recommended_term_weeks}wk)</span></span>
                  </div>
                ))}
              </div>
            )}
            {recommendation.repayment_guarantee && <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)', marginTop: 12, lineHeight: 1.6 }}>{recommendation.repayment_guarantee}</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Confidence Tab (NEW) ────────────────────────────────────────────────────
function ConfidenceTab({ a, positions, excludedIds, depositOverrides, agreementResults }) {
  const allPositions = positions || a.mca_positions || [];
  const activePositions = allPositions.filter(p => !(excludedIds || []).includes(p._id));
  const flags = a.flags_and_alerts || [];

  const revenue = calcAdjustedRevenue(a, depositOverrides);
  const totalMCAMonthly = activePositions.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0);
  const cogs = a.expense_categories?.inventory_cogs || 0;
  const grossProfit = revenue - cogs;
  const dsr = grossProfit > 0 ? (totalMCAMonthly / grossProfit) * 100 : 0;
  const dsrRevenue = revenue > 0 ? (totalMCAMonthly / revenue) * 100 : 0;

  const monthsCount = a.monthly_breakdown?.length || 0;
  const hasAgreements = (agreementResults || []).length > 0;

  // Per-field confidence scoring — DETERMINISTIC RULES (no AI dependency)
  // Revenue: HIGH if 3+ months, MEDIUM if 1-2, LOW if 0
  const revenueConfidence = monthsCount >= 3 ? 'high' : monthsCount >= 1 ? 'medium' : 'low';
  // DSR: HIGH if we have revenue AND confirmed MCA payment amounts from statements
  const hasConfirmedPayments = activePositions.length > 0 && activePositions.some(p => (p.payments_detected || 0) >= 2);
  const dsrConfidence = (monthsCount >= 1 && hasConfirmedPayments) ? 'high' : 'medium';
  // Gross Profit: ALWAYS MEDIUM — COGS is estimated without P&L
  const grossProfitConfidence = 'medium';
  // OpEx: ALWAYS LOW — inferred from debits, no P&L
  const opexConfidence = 'low';
  // ADB: HIGH if daily balances available, MEDIUM if only end-of-month
  const adbConfidence = (a.adb_by_month?.length > 0 || a.balance_summary?.avg_daily_balance > 0) ? 'high' : 'medium';
  // Days to Default: ALWAYS MEDIUM — projection, not fact
  const daysToDefaultConfidence = 'medium';
  // NSF: HIGH if text-readable statements, MEDIUM if scanned
  const hasScannedStatements = (a.revenue_confidence === 'partial' || a.revenue_confidence === 'low');
  const nsfConfidence = hasScannedStatements ? 'medium' : (monthsCount >= 1 ? 'high' : 'medium');

  // Build the field confidence list for accurate counting
  const fieldConfidences = [
    { label: 'Total Monthly Revenue (Bank-Verified)', value: fmt(revenue), confidence: revenueConfidence, note: `Based on ${monthsCount} months of statements` },
    { label: 'DSR (FF Method - vs Gross Profit)', value: fmtP(dsr), confidence: dsrConfidence, note: cogs > 0 ? `${fmt(totalMCAMonthly)} ÷ ${fmt(grossProfit)} gross profit` : 'No COGS detected - using revenue' },
    { label: 'DSR (Traditional - vs Revenue)', value: fmtP(dsrRevenue), confidence: dsrConfidence, note: `${fmt(totalMCAMonthly)}/mo ÷ ${fmt(revenue)} revenue` },
    { label: 'Gross Profit', value: fmt(grossProfit), confidence: grossProfitConfidence, note: 'COGS estimated (no P&L) — always medium confidence' },
    { label: 'Operating Expenses', value: fmt(a.expense_categories?.total_operating_expenses || 0), confidence: opexConfidence, note: 'Inferred from bank debits — no P&L provided' },
    { label: 'ADB Coverage', value: fmt(a.balance_summary?.avg_daily_balance || 0), confidence: adbConfidence, note: 'Direct calculation from daily balances' },
    { label: 'Days to Default', value: a.calculated_metrics?.weeks_to_insolvency != null ? `${a.calculated_metrics.weeks_to_insolvency} weeks` : 'N/A', confidence: daysToDefaultConfidence, note: 'Projection based on current burn rate' },
    { label: 'NSF / Overdraft Events', value: `${a.nsf_analysis?.nsf_count || 0} events`, confidence: nsfConfidence, note: `Direct count from ${monthsCount} month(s)` },
  ];

  const highConf = fieldConfidences.filter(f => f.confidence === 'high').length;
  const medConf = fieldConfidences.filter(f => f.confidence === 'medium').length;
  const lowConf = fieldConfidences.filter(f => f.confidence === 'low').length;
  const total = fieldConfidences.length;

  const confColor = (c) => c === 'high' ? '#4caf50' : c === 'low' ? '#ef5350' : '#ff9800';
  const confBg = (c) => c === 'high' ? 'rgba(76,175,80,0.1)' : c === 'low' ? 'rgba(239,83,80,0.1)' : 'rgba(255,152,0,0.1)';

  const FieldRow = ({ label, value, confidence, note }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: confBg(confidence), borderRadius: 8, marginBottom: 8, border: `1px solid ${confColor(confidence)}22` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 16, color: '#e8e8f0' }}>{value}</div>
        {note && <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginTop: 2 }}>{note}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...S.tag(confidence === 'high' ? 'green' : confidence === 'low' ? 'red' : 'amber'), fontSize: 10 }}>{confidence}</span>
        {confidence === 'low' && <span style={{ cursor: 'pointer', opacity: 0.6 }} title="Low confidence - verify manually">✏️</span>}
      </div>
    </div>
  );

  return (
    <div>
      {/* Summary Stats */}
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

      {/* Per-Field Confidence */}
      <div style={S.divider} />
      <div style={S.sectionTitle}>Field-Level Confidence</div>
      <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 12 }}>Fields with low confidence should be manually verified before sending to funders</div>

      {fieldConfidences.map((fc, i) => (
        <FieldRow key={i} label={fc.label} value={fc.value} confidence={fc.confidence} note={fc.note} />
      ))}

      {/* Position Confidence Detail */}
      <div style={S.divider} />
      <div style={S.sectionTitle}>Per-Funder Balance Confidence</div>
      <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 12 }}>HIGH = agreement uploaded & matched, MEDIUM = estimated from statement debits, LOW = manually entered</div>
      {allPositions.map((p, i) => {
        // Deterministic per-position confidence: HIGH if agreement matched, MEDIUM if detected from statements, LOW if manual
        const agMatch = matchAgreementToPosition(p.funder_name, agreementResults);
        const posConf = p.isManual ? 'low' : agMatch ? 'high' : (p.payments_detected || 0) >= 2 ? 'medium' : 'low';
        const posNote = p.isManual ? 'Manually entered — no supporting data' : agMatch ? 'Agreement uploaded & matched' : (p.payments_detected || 0) >= 2 ? 'Estimated from statement debits' : 'Few payments detected — verify';
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: i%2===0 ? 'rgba(255,255,255,0.03)' : 'transparent', borderRadius: 6, opacity: (excludedIds || []).includes(p._id) ? 0.4 : 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#e8e8f0' }}>{p.funder_name} {p.isManual && <span style={{ fontSize: 10, color: '#00e5ff' }}>(manual)</span>}</div>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>
                {fmt(p.payment_amount_current || p.payment_amount)}/{p.frequency} · {p.payments_detected || 0} payments · {posNote}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={S.tag(posConf === 'high' ? 'green' : posConf === 'low' ? 'red' : 'amber')}>{posConf}</span>
              {posConf === 'low' && <span style={{ cursor: 'pointer', opacity: 0.6 }} title="Edit this position">✏️</span>}
            </div>
          </div>
        );
      })}

      {/* Analysis Alerts */}
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

// ─── UW Offer Engine (mirrors UWCalculatorCore.jsx math) ──────────────────────
const UW_SETTINGS = {
  baseReduction: 0.7286,
  reductionPerPoint: 0.02857,
  maxPoints: 15,
  weeksPerMonth: 4.33,
  buyoutThreshold: 10000,
  fundersFee: 1500,
};

function toWeeklyEquiv(payment, frequency) {
  if (frequency === 'daily') return payment * 5;
  if (frequency === 'bi-weekly') return payment / 2;
  return payment; // weekly
}

// ─── Position Deduplication ──────────────────────────────────────────────────
// Groups multiple advances from the same funder into one consolidated record.
// Uses normalized name matching to identify same-funder positions.
function normalizeFunderKey(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/advance\d*|position[a-z]?|pos[a-z]?|\(.*?\)/g, '').trim();
}

function deduplicatePositions(allPositions, balances, positionStatuses, agreementResults) {
  const groups = {};
  const groupOrder = [];

  allPositions.forEach((p, i) => {
    const key = normalizeFunderKey(p.funder_name);
    // Also try first-word match for cases like "The Merchant Marketplace (Advance 1)"
    const firstWord = (p.funder_name || '').toLowerCase().split(/\s+/)[0];
    const matchKey = key.length >= 6 ? key : (firstWord.length >= 4 ? firstWord : `_pos_${i}`);

    // Find existing group with overlapping key
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
        ...g.positions[0],
        _dedupId: gk,
        _sourceIndices: [i],
        _advanceCount: 1,
        _consolidatedBalance: parseFloat(balances[i]) || 0,
        _consolidatedStatus: positionStatuses[i] || 'include',
        _consolidatedWeekly: toWeeklyEquiv(g.positions[0].payment_amount_current || g.positions[0].payment_amount || 0, g.positions[0].frequency),
      };
    }

    // Multiple positions from same funder — consolidate
    const primary = g.positions[0]; // use first as primary name
    const cleanName = primary.funder_name.replace(/\s*\(Advance\s*\d+\)/i, '').replace(/\s*\(Position\s*[A-Z]\)/i, '').trim();
    const totalBalance = g.indices.reduce((s, i) => s + (parseFloat(balances[i]) || 0), 0);
    const totalWeekly = g.positions.reduce((s, p) => s + toWeeklyEquiv(p.payment_amount_current || p.payment_amount || 0, p.frequency), 0);

    // Status: if any is 'include', consolidated is 'include'; else use first non-exclude
    const statuses = g.indices.map(i => positionStatuses[i] || 'include');
    const consolidatedStatus = statuses.includes('include') ? 'include' : statuses.includes('buyout') ? 'buyout' : statuses[0];

    // If agreement exists, prefer agreement balance
    const agMatch = (agreementResults || []).find(ag => {
      const agName = (ag?.analysis?.funder_name || '').toLowerCase();
      const pName = cleanName.toLowerCase();
      return agName && pName && (agName.includes(pName.split(' ')[0]) || pName.includes(agName.split(' ')[0]));
    });
    const agBalance = agMatch?.analysis?.financial_terms?.purchased_amount;
    const finalBalance = agBalance ? Math.round(agBalance) : totalBalance;

    return {
      ...primary,
      funder_name: cleanName,
      _dedupId: gk,
      _sourceIndices: g.indices,
      _advanceCount: g.positions.length,
      _advances: g.positions.map((p, idx) => ({
        name: p.funder_name,
        payment: p.payment_amount_current || p.payment_amount || 0,
        frequency: p.frequency,
        weekly: toWeeklyEquiv(p.payment_amount_current || p.payment_amount || 0, p.frequency),
        depositAmount: p.advance_deposit_amount || 0,
        depositDate: p.advance_deposit_date || null,
      })),
      _consolidatedBalance: finalBalance,
      _consolidatedStatus: consolidatedStatus,
      _consolidatedWeekly: totalWeekly,
      payment_amount_current: totalWeekly, // total of all advances
      frequency: 'weekly', // normalized to weekly
      estimated_monthly_total: totalWeekly * 4.33,
    };
  });
}

function calcSmartAlloc(uwFunders) {
  const tiers = [
    { name: 'Opening Offer', multiplier: 2.0, freq: 'bi-weekly' },
    { name: '1st Middle', multiplier: 2.0, freq: 'weekly' },
    { name: '2nd Middle', multiplier: 1.5, freq: 'weekly' },
    { name: 'Final Offer', multiplier: 1.25, freq: 'weekly' },
  ];
  return tiers.map(tier => {
    const offers = uwFunders.map(f => {
      const weeklyEquiv = toWeeklyEquiv(f.payment, f.frequency);
      const weeksLeft = weeklyEquiv > 0 ? f.balance / weeklyEquiv : 52;
      const term = Math.max(Math.round(weeksLeft * tier.multiplier), 1);
      const weeklyPayment = f.balance / term;
      const actualPayment = tier.freq === 'bi-weekly' ? weeklyPayment * 2 : weeklyPayment;
      const reduction = weeklyEquiv > 0 ? 1 - (weeklyPayment / weeklyEquiv) : 0;
      return { ...f, term, weeklyPayment, actualPayment, frequency: tier.freq, reduction };
    });
    const totalCurrentWeekly = uwFunders.reduce((s, f) => s + toWeeklyEquiv(f.payment, f.frequency), 0);
    const totalNewWeekly = offers.reduce((s, o) => s + o.weeklyPayment, 0);
    const totalReduction = totalCurrentWeekly > 0 ? 1 - (totalNewWeekly / totalCurrentWeekly) : 0;
    const maxTerm = Math.max(...offers.map(o => o.term), 0);
    return { ...tier, offers, totalNewWeekly, totalReduction, maxTerm, originalWeekly: totalCurrentWeekly };
  });
}

// ─── Negotiation Engine Waterfall ─────────────────────────────────────────────
// IMMUTABLE ORDER: Merchant Weekly → minus FF Fee → minus ISO Commission → TAD
function calcWaterfall({ merchantWeeklyToFF, totalDebtStack, ffFeePct, isoPointsPct, maxTermWeeks }) {
  const ffFeePerWeek = maxTermWeeks > 0 ? (totalDebtStack * ffFeePct) / maxTermWeeks : 0;
  const isoCommPerWeek = maxTermWeeks > 0 ? (totalDebtStack * (isoPointsPct / 100)) / maxTermWeeks : 0;
  const tad = merchantWeeklyToFF - ffFeePerWeek - isoCommPerWeek;
  return { merchantWeeklyToFF, ffFeePerWeek, isoCommPerWeek, tad: Math.max(tad, 0), totalDebtStack, maxTermWeeks };
}

// Per-funder proportional extension model — 3-tier term calculation
function calcFunderTiers(funders, tad, agreementResults) {
  const totalBalance = funders.reduce((s, f) => s + f.balance, 0);
  if (totalBalance <= 0 || tad <= 0) return [];

  const tierDefs = [
    { key: 'email1', label: 'Opening Proposal', pct: 0.80 },
    { key: 'email2', label: 'Revised Proposal', pct: 0.90 },
    { key: 'email3', label: 'Final Proposal', pct: 1.00 },
  ];

  // Step 1: For each funder, determine contract_payment (agreement → actual fallback)
  const funderData = funders.map(f => {
    const actualWeekly = toWeeklyEquiv(f.payment, f.frequency);
    const agMatch = matchAgreementToPosition(f.name, agreementResults);
    const contractWeekly = getContractWeekly(agMatch);
    // Use contract payment if available, otherwise actual bank statement weekly
    const effectiveWeekly = (contractWeekly && contractWeekly > 0) ? contractWeekly : actualWeekly;
    const originalRemainingWeeks = effectiveWeekly > 0 ? f.balance / effectiveWeekly : 52;
    return { ...f, actualWeekly, contractWeekly, effectiveWeekly, originalRemainingWeeks, agMatch };
  });

  // Step 2: Total original weekly burden (sum of all funders' effective weekly payments)
  const totalOriginalWeeklyBurden = funderData.reduce((s, fd) => s + fd.effectiveWeekly, 0);

  // Step 3-5: For each tier, calculate multiplier → proposed term → proposed payment
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
      return {
        ...td,
        weeklyPayment,
        proposedTermWeeks,
        extensionWeeks,
        extensionPct,
        reductionDollars,
        reductionPct,
        totalRepayment: fd.balance,
        multiplier,
      };
    });

    return {
      ...fd,
      allocation,
      originalWeekly: fd.actualWeekly,
      originalTermWeeks,
      tiers,
    };
  });
}

// CONFIDENTIALITY CHECK — blocks funder output if ISO/FF data leaks
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

// ─── Export Tab ───────────────────────────────────────────────────────────────
function ExportTab({ a, fileName, positions, excludedIds, otherExcludedIds, depositOverrides, agreementResults, enrolledPositions }) {
  const { useState: useLocalState, useMemo: useLocalMemo } = React;
  const allPositions = (positions || a.mca_positions || []).filter(p => !(excludedIds || []).includes(p._id));
  // Only include ACTIVE positions in MCA calculations — exclude paid_off
  const activeCalcPositions = allPositions.filter(p => {
    const status = (p.status || '').toLowerCase().replace(/[_\s]+/g, '');
    return status === 'active' || status === '';
  });
  const totalMCAMonthly = activeCalcPositions.reduce((s, p) => s + (p.estimated_monthly_total || 0), 0);
  const activeOther = (a.other_debt_service || []).filter((_, i) => !(otherExcludedIds || []).includes(i));
  const totalOtherDebt = activeOther.reduce((s, o) => s + (o.monthly_total || 0), 0);
  const revenue = calcAdjustedRevenue(a, depositOverrides);
  const dsr = (totalMCAMonthly / revenue) * 100;
  const totalDSR = ((totalMCAMonthly + totalOtherDebt) / revenue) * 100;
  const trueFree = revenue - totalMCAMonthly - totalOtherDebt - (a.expense_categories?.total_operating_expenses || 0);
  const csv = buildCSV(a, activeCalcPositions, totalMCAMonthly, dsr, totalOtherDebt, totalDSR, trueFree, revenue);

  // ── Deal Economics state ──
  const [dealIsoPoints, setDealIsoPoints] = useLocalState(11);
  const [dealFfFeePct, setDealFfFeePct] = useLocalState(0.119);

  // ── Position status: 'include' | 'buyout' | 'exclude' ──
  // Paid-off positions default to 'exclude' — they should not be in calculations
  const [positionStatuses, setPositionStatuses] = useLocalState(() => {
    const init = {};
    allPositions.forEach((p, i) => {
      const status = (p.status || '').toLowerCase().replace(/[_\s]+/g, '');
      init[i] = (status === 'paidoff') ? 'exclude' : 'include';
    });
    return init;
  });

  // ── Negotiation engine state ──
  const [negFunderId, setNegFunderId] = useLocalState(null);
  const [copiedEmail, setCopiedEmail] = useLocalState(null);
  const [merchantWeeklyOverride, setMerchantWeeklyOverride] = useLocalState('');

  // ── UW Offer state ──
  const [isoPoints, setIsoPoints] = useLocalState(8);
  const [selectedTier, setSelectedTier] = useLocalState(1);
  const [showOfferEngine, setShowOfferEngine] = useLocalState(false);
  const [copiedOffer, setCopiedOffer] = useLocalState(false);

  // Build uwFunders: match positions to agreements for balance data
  const [balances, setBalances] = useLocalState(() => {
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

  // Deduplicate positions: group same-funder advances into one record
  const dedupedPositions = useLocalMemo(
    () => deduplicatePositions(allPositions, balances, positionStatuses, agreementResults),
    [JSON.stringify(allPositions.map(p => p.funder_name)), JSON.stringify(balances), JSON.stringify(positionStatuses)]
  );

  // Enrollment: use parent enrolledPositions (Set of position _ids) if available
  // A deduped position is enrolled if ANY of its source positions are enrolled
  const isPositionEnrolled = (dp) => {
    if (dp._consolidatedStatus === 'paid_off' || dp._consolidatedStatus === 'exclude') return false;
    // Also check underlying MCA status from AI
    const mcaStatus = (dp.status || '').toLowerCase().replace(/[_\s]+/g, '');
    if (mcaStatus === 'paidoff') return false;
    if (enrolledPositions === null) return true; // null = all enrolled
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

  // Filtered sets — enrolled funders get TAD allocation; all included count toward DSR
  const includedFunders = uwFunders.filter(f => f.status === 'include' && f.balance > 0 && f.enrolled);
  const totalDebt = uwFunders.reduce((s, f) => s + f.balance, 0);
  const includedDebt = includedFunders.reduce((s, f) => s + f.balance, 0);
  const totalCurrentWeekly = uwFunders.reduce((s, f) => s + toWeeklyEquiv(f.payment, f.frequency), 0);
  const includedCurrentWeekly = includedFunders.reduce((s, f) => s + toWeeklyEquiv(f.payment, f.frequency), 0);
  const dsrOnlyFunders = uwFunders.filter(f => f.status === 'include' && f.balance > 0 && !f.enrolled);
  const enrolledCount = includedFunders.length;
  const dsrOnlyCount = dsrOnlyFunders.length;
  const activeCount = enrolledCount + dsrOnlyCount;

  // ISO Pricing math
  const reductionPct = UW_SETTINGS.baseReduction - (isoPoints * UW_SETTINGS.reductionPerPoint);
  const factorRate = 1.119 + (isoPoints * 0.01);
  const totalPayback = totalDebt * factorRate;
  const isoFeeTotal = (isoPoints / UW_SETTINGS.maxPoints) * totalDebt * 0.15;
  const ffRevenue = totalPayback - totalDebt;

  // Smart allocation tiers (for ISO Offer Calculator)
  const smartAlloc = useLocalMemo(() => calcSmartAlloc(uwFunders.filter(f => f.balance > 0)), [JSON.stringify(uwFunders)]);
  const activeTier = smartAlloc[selectedTier] || smartAlloc[0];
  const isoTermLow = smartAlloc[3] ? Math.round(smartAlloc[3].maxTerm / UW_SETTINGS.weeksPerMonth) + 1 : 0;
  const isoTermHigh = smartAlloc[0] ? Math.round(smartAlloc[0].maxTerm / UW_SETTINGS.weeksPerMonth) + 1 : 0;

  // ═══════════════════════════════════════════════════════════════════
  // NEGOTIATION ENGINE — Financial Waterfall
  // ═══════════════════════════════════════════════════════════════════
  // Merchant weekly payment to FF: from UW Calculator selected tier, or manual override
  const uwMerchantWeekly = activeTier ? activeTier.totalNewWeekly : includedCurrentWeekly * 0.5;
  const merchantWeeklyToFF = merchantWeeklyOverride ? parseFloat(merchantWeeklyOverride) : uwMerchantWeekly;

  // Max term = longest individual funder term at 100% tier (needed for fee amortization)
  const maxTermForFees = useLocalMemo(() => {
    if (includedFunders.length === 0 || merchantWeeklyToFF <= 0) return 52;
    // Proportional extension: at 100% TAD, multiplier = totalBurden / TAD
    // Each funder's term = ceil(remaining * multiplier) = ceil((balance/weekly) * (totalBurden/TAD))
    // But TAD needs maxTerm for fee amortization... bootstrap with estimate
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

  const waterfall = useLocalMemo(() =>
    calcWaterfall({
      merchantWeeklyToFF,
      totalDebtStack: includedDebt,
      ffFeePct: dealFfFeePct,
      isoPointsPct: dealIsoPoints,
      maxTermWeeks: maxTermForFees,
    }),
    [merchantWeeklyToFF, includedDebt, dealFfFeePct, dealIsoPoints, maxTermForFees]
  );

  // Per-funder tier calculations
  const funderTiers = useLocalMemo(() =>
    calcFunderTiers(includedFunders, waterfall.tad, agreementResults),
    [JSON.stringify(includedFunders), waterfall.tad, JSON.stringify(agreementResults)]
  );

  // Reserve calculations
  const reserveAt80 = merchantWeeklyToFF - (waterfall.tad * 0.80) - waterfall.ffFeePerWeek - waterfall.isoCommPerWeek;
  const reserveAt90 = merchantWeeklyToFF - (waterfall.tad * 0.90) - waterfall.ffFeePerWeek - waterfall.isoCommPerWeek;

  // Bank-verified overview numbers for emails
  const cogs = a.expense_categories?.inventory_cogs || 0;
  const grossProfit = revenue - cogs;
  const opex = a.expense_categories?.total_operating_expenses || 0;
  const includedMonthly = includedCurrentWeekly * 4.33;
  const monthlyDeficit = revenue - cogs - opex - includedMonthly;
  const adb = a.balance_summary?.avg_daily_balance || a.calculated_metrics?.avg_daily_balance || 0;
  const adbDays = includedMonthly > 0 ? Math.round(adb / (includedMonthly / 30)) : 0;
  const daysToDefault = monthlyDeficit < 0 ? Math.round(Math.abs(adb / (monthlyDeficit / 30))) : 999;
  const withholdPct = revenue > 0 ? ((includedMonthly / revenue) * 100).toFixed(1) : '0';
  const biz = a.business_name || 'Business';

  const downloadCSV = () => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a2 = document.createElement('a');
    a2.href = url;
    a2.download = `FF-Analysis-${(a.business_name || 'export').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    a2.click();
    URL.revokeObjectURL(url);
  };

  // ── Brief HTML Generator (uses negotiation engine numbers) ──
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

    // Build stack rows — only included positions visible to funders
    const totalIncWeekly = includedFunders.reduce((s, f) => s + toWeeklyEquiv(f.payment, f.frequency), 0);
    const totalIncBalance = includedFunders.reduce((s, f) => s + f.balance, 0);
    const stackRows = includedFunders.map((f, i) => {
      const isTarget = f.name === ft.name;
      const weeklyPmt = toWeeklyEquiv(f.payment, f.frequency);
      return `<tr${isTarget ? ' class="highlight-row"' : ''}>
        <td><span class="funder-name">${f.name}</span>${isTarget ? ' <span class="position-tag tag-you">You</span>' : ''}</td>
        <td>${f$(weeklyPmt)}</td>
        <td>${f$(f.balance)}</td>
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
    <div class="card-eyebrow"><i class="fas fa-layer-group"></i> Full MCA Stack &mdash; All ${includedFunders.length} Positions</div>
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
  <p><strong>Mathematical Impossibility Notice:</strong> Bank statement analysis confirms ${f$(totalMCAMo)} in monthly MCA debt service against ${f$(grossProfit)} in monthly gross profit after ${f$(opex)} in verified operating expenses. ${daysToDefault < 999 ? `At current trajectory, account balances become critically depleted within ${daysToDefault} days &mdash; at which point all ${includedFunders.length} funders lose recovery priority simultaneously.` : ''} This analysis is based on bank-verified transaction data, not merchant-reported estimates.</p>
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
      <tr><td class="row-label">Priority vs. Other ${includedFunders.length - 1} Funders</td><td class="accept-val">Secured &mdash; structured first</td><td class="decline-val">Race to courthouse &mdash; uncertain</td></tr>
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
      <tr><td class="label-col">Competing creditors (funders)</td><td>${includedFunders.length} positions</td></tr>
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

  // ── Negotiation Email Generator ──
  const generateNegotiationEmail = (funderIdx, tierIdx) => {
    const ft2 = funderTiers[funderIdx];
    if (!ft2) return '';
    const tier = ft2.tiers[tierIdx];
    if (!tier) return '';
    const f$ = (n) => '$' + Math.round(n).toLocaleString('en-US');

    // Contract vs actual cross-reference for this funder
    const agMatch = matchAgreementToPosition(ft2.name, agreementResults);
    const originDateStr = agMatch?.analysis?.funding_date || agMatch?.analysis?.effective_date || agMatch?.analysis?.contract_date || null;
    const monthsSinceOrig = originDateStr ? Math.max(1, Math.round((Date.now() - new Date(originDateStr).getTime()) / (1000 * 60 * 60 * 24 * 30.44))) : null;
    const originNote = originDateStr ? `\nNote: This merchant's position was originated on ${originDateStr}. Current cash flow trajectory reflects ${monthsSinceOrig} month${monthsSinceOrig !== 1 ? 's' : ''} of compounding debt service.` : '';

    const statsBlock = `BANK-VERIFIED FINANCIAL OVERVIEW:
Business: ${biz}
True Monthly Revenue (bank-verified): ${fmt(revenue)}
Total Active Positions: ${includedFunders.length}
Combined Weekly Burden: ${fmt(includedCurrentWeekly)} (${includedFunders.length} positions)
Withhold % of Revenue: ${withholdPct}%
ADB Coverage: ${adbDays} days
Days Until Likely Default: ${daysToDefault < 999 ? daysToDefault + ' days' : 'N/A'}${originNote}

NOTE: All revenue figures are bank-statement verified — not merchant-reported estimates.`;
    const contractWeekly = getContractWeekly(agMatch);
    const currentWeeklyLabel = contractWeekly && contractWeekly > 0
      ? `${f$(contractWeekly)} (per agreement)`
      : f$(ft2.originalWeekly);
    const overpullDelta = contractWeekly && contractWeekly > 0
      ? ft2.originalWeekly - contractWeekly : 0;
    const hasOverpull = overpullDelta > contractWeekly * 0.01;
    const overpullNote = hasOverpull
      ? `\nNote: Recent debits of ${f$(ft2.originalWeekly)} exceed your contractual installment — this has been noted in our analysis.`
      : '';

    const proposalBlock = `YOUR POSITION:
Your Current Weekly Payment:    ${currentWeeklyLabel}
Proposed Weekly Payment:        ${f$(tier.weeklyPayment)}
Weekly Reduction:               ${f$(tier.reductionDollars)} less per week
Payment Reduction:              ${(parseFloat(tier.reductionPct) || 0).toFixed(1)}%
Your Original Term:             ${ft2.originalTermWeeks} weeks
Proposed Term:                  ${tier.proposedTermWeeks} weeks
Term Extension:                 +${(parseFloat(tier.extensionPct) || 0).toFixed(1)}% longer
Total Repayment:                ${f$(ft2.balance)} — 100% of your balance
Payments Begin:                 Within 72 hours of agreement${overpullNote}`;

    const defaultRecovery = Math.round(ft2.balance * 0.35);
    const defaultNet = Math.round(defaultRecovery * 0.7);
    const comparisonBlock = `════════════════════════════════════════════════════════════════
                     YOUR OPTIONS COMPARED
════════════════════════════════════════════════════════════════
   ACCEPT PROPOSAL                │  PURSUE DEFAULT/COLLECTIONS
───────────────────────────────────────────────────────────────
   Total Recovery:                │
     ${f$(ft2.balance)} (100%)          │  ~${f$(defaultRecovery)} (~35%)
   Your Weekly Payment:           │
     ${f$(tier.weeklyPayment)}/wk             │  $0 (frozen/litigation)
   Your Term:                     │
     ${tier.proposedTermWeeks} weeks                │  12-18+ months contested
   Legal Costs: $0                │  $5,000 - $15,000+
   Collection Fees: $0            │  25-35% of recovery
   First Payment: 72 hours        │  6+ months from litigation
   Regulatory Exposure: None      │  Heightened
───────────────────────────────────────────────────────────────
   NET RECOVERY: +${f$(ft2.balance - defaultNet)} by accepting
════════════════════════════════════════════════════════════════`;

    const signature = `Best regards,
Gavin Roberts
Resolutions Manager
480-631-7691
resolutions@fundersfirst.com
Phoenix, AZ

RBFC Advocate | Revenue Based Finance Coalition`;

    const lnaaNotice = `Per the enclosed LNAA, all communications regarding this account must now be directed to our office. Please do not contact the merchant directly.`;

    // Validate confidentiality before returning
    let emailText = '';

    if (tierIdx === 0) {
      // EMAIL 1 — OPENING PROPOSAL (80% allocation)
      emailText = `Subject: Payment Modification Request – ${biz} – ${ft2.name}

Dear ${ft2.name} Collections/Servicing Team,

We are reaching out on behalf of ${biz} regarding their merchant cash advance position with your organization.

IMPORTANT — WHO WE ARE:
Funders First is NOT a debt settlement company. We do not advise merchants that MCAs are predatory, unfair, or that they don't owe what they contracted for. We believe in and support revenue-based finance as a legitimate funding tool for small businesses.

The issue here is over-stacking. This merchant is servicing ${includedFunders.length} concurrent funding positions, consuming ${withholdPct}% of weekly revenue. This level of debt service is mathematically unsustainable and, without intervention, leads to default — which benefits no one.

Our solution protects your investment by ensuring 100% repayment while giving the merchant breathing room to operate their business.

${statsBlock}

${proposalBlock}

${comparisonBlock}

We are prepared to begin payments within 72 hours of reaching agreement.

ATTACHMENT: Please find enclosed our Limited Negotiation Authorization Agreement (LNAA), executed by ${biz}, authorizing Funders First to negotiate on their behalf.

${lnaaNotice}

${signature}`;
    } else if (tierIdx === 1) {
      // EMAIL 2 — REVISED PROPOSAL (90% allocation)
      const email1Tier = ft2.tiers[0];
      emailText = `Subject: Revised Proposal – ${biz} – Improved Terms Available

Dear ${ft2.name} Collections/Servicing Team,

Following our previous communication regarding ${biz}, we are presenting significantly improved terms for your consideration.

Note: Cash position has continued to decline since our initial outreach. Estimated days to default: ${daysToDefault < 999 ? daysToDefault : 'critical'}.

${statsBlock}

${proposalBlock}

This offer represents a ${(parseFloat((tier.weeklyPayment - email1Tier.weeklyPayment) / email1Tier.weeklyPayment * 100) || 0).toFixed(0)}% increase in weekly payment over our opening proposal and reduces your term from ${email1Tier.proposedTermWeeks} to ${tier.proposedTermWeeks} weeks.

${comparisonBlock}

We remain committed to ensuring you receive 100% of what is owed. Please respond so we can finalize terms and begin remittance immediately.

${lnaaNotice}

${signature}`;
    } else {
      // EMAIL 3 — FINAL PROPOSAL (100% allocation, full TAD)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const deadlineStr = futureDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      emailText = `Subject: Final Proposal – ${biz} – Maximum Allocation

Dear ${ft2.name} Collections/Servicing Team,

This represents our final proposal for the ${biz} restructuring. This is our maximum weekly allocation for your position.

${statsBlock}

${proposalBlock}

This is our maximum weekly allocation for your position. Your term at full allocation is ${tier.proposedTermWeeks} weeks — the shortest possible timeline under this program.

${comparisonBlock}

Based on current cash flow trajectory, this is the final opportunity to participate in a structured repayment. Positions not accommodated by ${deadlineStr} will be removed from the structured payment pool.

${lnaaNotice}

${signature}`;
    }

    // CONFIDENTIALITY CHECK
    if (!confidentialityCheck(emailText)) {
      return 'ERROR: CONFIDENTIALITY BLOCK — ISO/FF data detected in funder output. This email cannot be generated.';
    }
    return emailText;
  };

  const copyOffer = () => {
    if (!activeTier) return;
    const lines = [
      `FUNDERS FIRST — ISO OFFER PITCH`,
      `Merchant: ${a.business_name || 'Business'}`,
      `Total Debt Stack: ${fmt(totalDebt)} across ${uwFunders.length} positions`,
      `Current Weekly Burden: ${fmt(totalCurrentWeekly)}/wk`,
      ``,
      `Recommended Offer (${activeTier.name}):`,
      `Total New Weekly: ${fmt(activeTier.totalNewWeekly)}/wk`,
      `Payment Reduction: ${fmtP(activeTier.totalReduction * 100)}`,
      `Deal Term Range: ${isoTermLow}–${isoTermHigh} months`,
      ``,
      `Per-Funder Breakdown:`,
      ...(activeTier.offers || []).map(o => `  • ${o.name}: ${fmt(o.actualPayment)}/${o.frequency} for ${o.term} wks (${fmtP(o.reduction * 100)} reduction)`),
      ``,
      `ISO Commission (${isoPoints} pts): ${fmt(isoFeeTotal)}`,
      `Factor Rate: ${(parseFloat(factorRate) || 0).toFixed(3)}`,
      `Total Payback to FF: ${fmt(totalPayback)}`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedOffer(true);
    setTimeout(() => setCopiedOffer(false), 2000);
  };

  const tierColors = ['#00bcd4', '#7c3aed', '#f59e0b', '#22c55e'];
  const tierLabels = ['Opening', '1st Middle', '2nd Middle', 'Final'];
  const negTierColors = ['#00bcd4', '#f59e0b', '#ef5350'];
  const negTierLabels = ['Opening (80%)', 'Revised (90%)', 'Final (100%)'];

  const statusColors = { include: '#00e5ff', buyout: '#CFA529', exclude: 'rgba(232,232,240,0.3)', paid_off: '#4caf50' };
  const statusLabels = { include: 'Include', buyout: 'Buyout', exclude: 'Exclude', paid_off: 'Paid Off' };

  return (
    <div>
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* NEGOTIATION ENGINE                                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      {/* 1. DEAL ECONOMICS CARD (internal only) */}
      <div style={S.sectionTitle}>Deal Economics (Internal — Never Exported)</div>
      <div style={{ background: 'rgba(207,165,41,0.06)', border: '1px solid rgba(207,165,41,0.2)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>ISO Points</label>
            <input type="number" value={dealIsoPoints} onChange={e => setDealIsoPoints(Number(e.target.value) || 0)} min={0} max={20} step={1} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(207,165,41,0.3)', background: 'rgba(0,0,0,0.3)', color: '#EAD068', fontSize: 16, fontFamily: 'inherit', fontWeight: 700, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>FF Fee %</label>
            <input type="number" value={dealFfFeePct} onChange={e => setDealFfFeePct(Number(e.target.value) || 0)} min={0} max={1} step={0.001} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(207,165,41,0.3)', background: 'rgba(0,0,0,0.3)', color: '#EAD068', fontSize: 16, fontFamily: 'inherit', fontWeight: 700, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Merchant Wkly to FF</label>
            <input type="number" value={merchantWeeklyOverride} onChange={e => setMerchantWeeklyOverride(e.target.value)} placeholder={fmt(uwMerchantWeekly)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(207,165,41,0.3)', background: 'rgba(0,0,0,0.3)', color: '#EAD068', fontSize: 16, fontFamily: 'inherit', fontWeight: 700, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Total Included Debt</label>
            <div style={{ fontSize: 16, color: '#ef5350', fontWeight: 700, padding: '8px 0' }}>{fmt(includedDebt)}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 12 }}>
          {[
            { label: 'TAD / Week', value: fmtD(waterfall.tad), color: '#00e5ff' },
            { label: 'ISO Comm / Wk', value: fmtD(waterfall.isoCommPerWeek), color: '#CFA529' },
            { label: 'FF Fee / Wk', value: fmtD(waterfall.ffFeePerWeek), color: '#CFA529' },
            { label: 'Reserve @80%', value: fmtD(reserveAt80 > 0 ? reserveAt80 : 0), color: '#4caf50' },
            { label: 'Reserve @90%', value: fmtD(reserveAt90 > 0 ? reserveAt90 : 0), color: '#4caf50' },
          ].map((s2, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'rgba(232,232,240,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s2.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: s2.color }}>{s2.value}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)' }}>Waterfall: {fmt(merchantWeeklyToFF)} merchant weekly → −{fmtD(waterfall.ffFeePerWeek)} FF fee → −{fmtD(waterfall.isoCommPerWeek)} ISO comm = {fmtD(waterfall.tad)} TAD</div>
      </div>

      {/* 2. POSITION MANAGEMENT */}
      <div style={{ ...S.divider }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={S.sectionTitle}>Position Management</div>
        <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)' }}>
          Enrolled: <span style={{ color: '#00e5ff', fontWeight: 700 }}>{enrolledCount}</span> of {activeCount} active
          {dsrOnlyCount > 0 && <span style={{ marginLeft: 8 }}>· DSR-only: <span style={{ color: '#ffd54f', fontWeight: 600 }}>{dsrOnlyCount}</span></span>}
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
                  <span style={{ fontSize: 13, color: nameColor, fontWeight: 600, textDecoration: isExcluded ? 'line-through' : 'none', textDecorationColor: isPaidOff ? '#4caf50' : undefined }}>{f.name}</span>
                  {isPaidOff && <span style={{ fontSize: 9, background: 'rgba(76,175,80,0.2)', color: '#4caf50', padding: '1px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>PAID OFF</span>}
                  {f._advanceCount > 1 && <span style={{ fontSize: 9, background: 'rgba(0,229,255,0.15)', color: '#00e5ff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{f._advanceCount} advances</span>}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 4 }}>{fmt(toWeeklyEquiv(f.payment, f.frequency))}/wk · {fmt(f.balance)} bal</div>
                {f._advances && f._advanceCount > 1 && (
                  <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.3)', marginBottom: 4, lineHeight: 1.6 }}>
                    {f._advances.map((adv, ai) => (
                      <div key={ai}>Adv {ai + 1}: {fmt(adv.weekly)}/wk{adv.depositDate ? ` · funded ${adv.depositDate}` : ''}</div>
                    ))}
                  </div>
                )}
                <input type="number" value={(() => { const idx = f._sourceIndices[0]; return balances[idx] || ''; })()} onChange={e => { const updates = {}; f._sourceIndices.forEach(idx => { updates[idx] = e.target.value; }); setBalances(b => ({ ...b, ...updates })); }} placeholder="Balance $" style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 6 }} />
                {/* Enrollment status */}
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
      </div>

      {/* 3. TERM COMPARISON TABLE */}
      {funderTiers.length > 0 && (
        <>
          <div style={{ ...S.divider }} />
          <div style={S.sectionTitle}>Term Comparison — All Included Funders</div>
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 16, marginBottom: 20, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {['Funder', 'Balance', 'Current Pmt', 'Orig Remaining', '80% Term', '90% Term', '100% Term'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Funder' ? 'left' : 'right', fontSize: 10, color: 'rgba(232,232,240,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {funderTiers.map((ft3, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px 8px', color: '#e8e8f0', fontWeight: 600 }}>{ft3.name}</td>
                    <td style={{ padding: '8px 8px', color: '#ef9a9a', textAlign: 'right' }}>{fmt(ft3.balance)}</td>
                    <td style={{ padding: '8px 8px', color: 'rgba(232,232,240,0.5)', textAlign: 'right' }}>{fmt(ft3.originalWeekly)}/wk</td>
                    <td style={{ padding: '8px 8px', color: 'rgba(232,232,240,0.4)', textAlign: 'right' }}>{ft3.originalTermWeeks} wks</td>
                    <td style={{ padding: '8px 8px', color: negTierColors[0], textAlign: 'right' }}>{ft3.tiers[0].proposedTermWeeks} wks</td>
                    <td style={{ padding: '8px 8px', color: negTierColors[1], textAlign: 'right' }}>{ft3.tiers[1].proposedTermWeeks} wks</td>
                    <td style={{ padding: '8px 8px', color: negTierColors[2], textAlign: 'right', fontWeight: 700 }}>{ft3.tiers[2].proposedTermWeeks} wks</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 4. FUNDER EMAIL GENERATOR */}
      <div style={{ ...S.divider }} />
      <div style={S.sectionTitle}>Funder Negotiation Emails</div>
      <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 4 }}>Select Funder:</label>
            <select value={negFunderId ?? ''} onChange={e => setNegFunderId(e.target.value === '' ? null : Number(e.target.value))} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 13, fontFamily: 'inherit', minWidth: 280 }}>
              <option value="">Select a funder…</option>
              {funderTiers.map((ft3, i) => <option key={i} value={i}>{ft3.name} — {fmt(ft3.balance)} bal — {fmtD(ft3.allocation)}/wk alloc</option>)}
            </select>
          </div>
        </div>

        {negFunderId !== null && funderTiers[negFunderId] && (() => {
          const selFt = funderTiers[negFunderId];
          return (
            <div>
              {/* Funder summary */}
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 12, color: 'rgba(232,232,240,0.7)', lineHeight: 1.8 }}>
                <div style={{ fontSize: 16, color: '#00e5ff', fontWeight: 700, marginBottom: 6 }}>{selFt.name}</div>
                <div>Balance: <strong style={{ color: '#e8e8f0' }}>{fmt(selFt.balance)}</strong> · Original: <strong style={{ color: '#ef9a9a' }}>{fmt(selFt.originalWeekly)}/wk</strong> · Allocation: <strong style={{ color: '#00e5ff' }}>{fmtD(selFt.allocation)}/wk</strong></div>
                <div>Total Repayment (all tiers): <strong style={{ color: '#4caf50' }}>{fmt(selFt.balance)}</strong> (100%)</div>
              </div>

              {/* 3 email previews */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[0, 1, 2].map(ti => {
                  const t = selFt.tiers[ti];
                  return (
                    <div key={ti} style={{ background: `${negTierColors[ti]}08`, border: `1px solid ${negTierColors[ti]}44`, borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: negTierColors[ti], marginBottom: 8 }}>{negTierLabels[ti]}</div>
                      <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.6)', lineHeight: 1.8, marginBottom: 10 }}>
                        <div>Payment: <strong style={{ color: negTierColors[ti] }}>{fmtD(t.weeklyPayment)}/wk</strong></div>
                        <div>Reduction: <strong>{(parseFloat(t.reductionPct) || 0).toFixed(1)}%</strong> ({fmtD(t.reductionDollars)} less)</div>
                        <div>Term: <strong>{t.proposedTermWeeks} wks</strong> ({Math.round(t.proposedTermWeeks / 4.33)} mo)</div>
                        <div>Extension: +{(parseFloat(t.extensionPct) || 0).toFixed(0)}%</div>
                        <div>Repayment: <strong style={{ color: '#4caf50' }}>{fmt(t.totalRepayment)}</strong></div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { const txt = generateNegotiationEmail(negFunderId, ti); navigator.clipboard.writeText(txt); setCopiedEmail(`${negFunderId}-${ti}`); setTimeout(() => setCopiedEmail(null), 2000); }} style={{ ...S.btn('primary'), padding: '6px 12px', fontSize: 11, flex: 1 }}>
                          {copiedEmail === `${negFunderId}-${ti}` ? '✓ Copied!' : 'Copy Email'}
                        </button>
                        <button onClick={() => { const html = generateBriefHTML(negFunderId, ti); const w = window.open('', '_blank'); w.document.write(html); w.document.close(); }} style={{ ...S.btn('secondary'), padding: '6px 10px', fontSize: 10 }}>
                          PDF
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Full email preview */}
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 16, maxHeight: 500, overflowY: 'auto' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {[0, 1, 2].map(ti => (
                    <button key={ti} onClick={() => setNegFunderId(prev => prev)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'default', border: `1px solid ${negTierColors[ti]}`, background: `${negTierColors[ti]}22`, color: negTierColors[ti], fontFamily: 'inherit' }}>
                      {negTierLabels[ti]} — {selFt.tiers[ti].proposedTermWeeks} wks
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

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ISO OFFER CALCULATOR (collapsible)                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div style={{ ...S.divider, marginTop: 24 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={S.sectionTitle}>ISO Offer Calculator</div>
        <button style={{ ...S.btn('ghost'), fontSize: 11, padding: '3px 10px', marginLeft: 'auto' }} onClick={() => setShowOfferEngine(v => !v)}>
          {showOfferEngine ? '▲ Collapse' : '▼ Expand'}
        </button>
      </div>

      {showOfferEngine && (
        <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          {/* ISO Points slider */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.6)' }}>ISO Commission Points</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#00bcd4' }}>{isoPoints} pts</div>
            </div>
            <input type="range" min={0} max={15} step={1} value={isoPoints} onChange={e => setIsoPoints(Number(e.target.value))} style={{ width: '100%', accentColor: '#00bcd4' }} />
          </div>

          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
            {[
              { label: 'Total Debt Stack', value: fmt(totalDebt), color: '#ef5350' },
              { label: 'Current Wkly Burden', value: fmt(totalCurrentWeekly), color: '#ef9a9a' },
              { label: 'ISO Commission', value: fmt(isoFeeTotal), color: '#CFA529' },
              { label: 'Merchant Term Range', value: `${isoTermLow}–${isoTermHigh} mo`, color: '#22c55e' },
            ].map((s2, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 4 }}>{s2.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: s2.color }}>{s2.value}</div>
              </div>
            ))}
          </div>

          {/* Tier selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {tierLabels.map((label, i) => (
              <button key={i} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${selectedTier === i ? tierColors[i] : 'rgba(255,255,255,0.1)'}`, background: selectedTier === i ? `${tierColors[i]}22` : 'rgba(255,255,255,0.03)', color: selectedTier === i ? tierColors[i] : 'rgba(232,232,240,0.5)', transition: 'all 0.15s', fontFamily: 'inherit' }} onClick={() => setSelectedTier(i)}>
                {label}
              </button>
            ))}
          </div>

          {/* Active tier breakdown */}
          {activeTier && (
            <div style={{ background: `${tierColors[selectedTier]}11`, border: `1px solid ${tierColors[selectedTier]}44`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: tierColors[selectedTier], marginBottom: 4 }}>{activeTier.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginBottom: 14 }}>
                Total: <strong style={{ color: '#22c55e' }}>{fmt(activeTier.totalNewWeekly)}/wk</strong>
                {' '}(down from <span style={{ color: '#ef5350' }}>{fmt(activeTier.originalWeekly)}</span>)
                {' '}— <strong style={{ color: '#00bcd4' }}>{fmtP(activeTier.totalReduction * 100)} reduction</strong>
                {' '}· max term <strong style={{ color: 'rgba(232,232,240,0.8)' }}>{activeTier.maxTerm} wks</strong>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{['Funder', 'Balance', 'Current', 'New Payment', 'Term', 'Reduction'].map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontSize: 10, color: 'rgba(232,232,240,0.35)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {activeTier.offers.map((o, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '7px 8px', color: '#e8e8f0', fontWeight: 600 }}>{o.name}</td>
                      <td style={{ padding: '7px 8px', color: '#ef9a9a' }}>{fmt(o.balance)}</td>
                      <td style={{ padding: '7px 8px', color: 'rgba(232,232,240,0.5)' }}>{fmt(toWeeklyEquiv(o.payment, uwFunders[i]?.frequency || 'weekly'))}/wk</td>
                      <td style={{ padding: '7px 8px', color: tierColors[selectedTier], fontWeight: 700 }}>{fmt(o.actualPayment)}/{o.frequency}</td>
                      <td style={{ padding: '7px 8px', color: 'rgba(232,232,240,0.7)' }}>{o.term} wks</td>
                      <td style={{ padding: '7px 8px', color: '#22c55e', fontWeight: 700 }}>{fmtP(o.reduction * 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button style={S.btn('primary')} onClick={copyOffer}>{copiedOffer ? '✓ Copied!' : 'Copy ISO Pitch'}</button>
            <button style={S.btn('secondary')} onClick={downloadCSV}>Download CSV</button>
          </div>
        </div>
      )}

      {/* ── CSV Export ── */}
      <div style={{ ...S.divider, marginTop: 24 }} />
      <div style={S.sectionTitle}>CSV Export</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <button style={S.btn('secondary')} onClick={downloadCSV}>⬇ Download CSV</button>
        <button style={S.btn('ghost')} onClick={() => navigator.clipboard.writeText(JSON.stringify(a, null, 2))}>📋 Copy Full JSON</button>
      </div>
      <div style={S.exportBox}>{csv}</div>

      <div style={{ ...S.divider, marginTop: 24 }} />
      <div style={S.sectionTitle}>Analysis Metadata</div>
      <div style={S.grid2}>
        <div style={S.stat}><div style={S.statLabel}>Source File</div><div style={{ fontSize: 13, color: '#e8e8f0', wordBreak: 'break-all' }}>{fileName}</div></div>
        <div style={S.stat}><div style={S.statLabel}>Analyzed</div><div style={{ fontSize: 13, color: '#e8e8f0' }}>{new Date().toLocaleString()}</div></div>
        <div style={S.stat}><div style={S.statLabel}>Statement Period</div><div style={{ fontSize: 13, color: '#e8e8f0' }}>{
  a.statement_month
    ? a.statement_month
    : a.statement_periods && a.statement_periods.length > 0
      ? a.statement_periods.length === 1
        ? a.statement_periods[0].month
        : `${a.statement_periods[0].month} — ${a.statement_periods[a.statement_periods.length - 1].month}`
      : a.monthly_breakdown && a.monthly_breakdown.length > 0
        ? a.monthly_breakdown.length === 1
          ? a.monthly_breakdown[0].month
          : `${a.monthly_breakdown[0].month} — ${a.monthly_breakdown[a.monthly_breakdown.length - 1].month}`
        : '—'
}</div></div>
        <div style={S.stat}><div style={S.statLabel}>Transaction Count</div><div style={{ fontSize: 13, color: '#e8e8f0' }}>{(a.raw_transaction_summary?.total_credit_transactions || 0) + (a.raw_transaction_summary?.total_debit_transactions || 0)} total</div></div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Trend Tab ────────────────────────────────────────────────────────────────
function TrendTab({ a, agreementResults }) {
  const trend = a.revenue_trend;
  const monthly = a.monthly_breakdown || [];

  if (!trend && monthly.length === 0) {
    return (
      <div style={{ color: 'rgba(232,232,240,0.4)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
        Upload multiple months to see revenue trend analysis
      </div>
    );
  }

  const rawRevenues = trend?.monthly_revenues || monthly.map(m => ({ month: m.month, amount: m.net_verified_revenue }));
  // Normalize: trend data uses 'revenue' key, monthly fallback uses 'amount' — unify to 'amount'
  const revenues = rawRevenues.map(r => ({ month: r.month, amount: r.amount ?? r.revenue ?? 0 }));
  const maxRev = Math.max(...revenues.map(r => r.amount), 1);

  // Build origination markers from agreement data
  const originationMarkers = (agreementResults || []).map(ar => {
    const d = ar.analysis || ar;
    const dateStr = d.funding_date || d.effective_date || d.contract_date;
    if (!dateStr || !d.funder_name) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const shortName = (d.funder_name || '').split(/\s+/).slice(0, 2).join(' ');
    const amount = d.purchase_price || d.financial_terms?.purchase_price || 0;
    const amtLabel = amount >= 1000 ? '$' + Math.round(amount / 1000) + 'K' : amount > 0 ? '$' + amount : '';
    return { date, dateStr, funder: shortName, amtLabel, fullName: d.funder_name, amount };
  }).filter(Boolean).sort((a, b) => a.date - b.date);

  // Map origination dates to bar indices (find which month bar they fall closest to)
  const monthToIdx = {};
  revenues.forEach((r, i) => {
    // Parse "Month YYYY" format
    const parts = (r.month || '').split(' ');
    if (parts.length >= 2) {
      const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      const mIdx = monthNames.indexOf(parts[0].toLowerCase());
      const year = parseInt(parts[parts.length - 1]);
      if (mIdx >= 0 && year) monthToIdx[`${year}-${String(mIdx + 1).padStart(2, '0')}`] = i;
    }
  });

  const markerPositions = originationMarkers.map(m => {
    const key = `${m.date.getFullYear()}-${String(m.date.getMonth() + 1).padStart(2, '0')}`;
    const barIdx = monthToIdx[key];
    return barIdx !== undefined ? { ...m, barIdx } : null;
  }).filter(Boolean);

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 180, marginBottom: 8, padding: '0 4px', position: 'relative' }}>
            {revenues.map((r, i) => {
              const barH = Math.max(Math.round((r.amount / maxRev) * 130), 4);
              const isHighest = r.amount === maxRev;
              const markers = markerPositions.filter(m => m.barIdx === i);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, minWidth: 0, position: 'relative' }}>
                  {/* Dashed origination line — subtle, behind content */}
                  {markers.length > 0 && (
                    <div style={{ position: 'absolute', top: 10, bottom: 20, left: '50%', width: 0, borderLeft: '1px dashed rgba(255,152,0,0.35)', zIndex: 1, pointerEvents: 'none' }} />
                  )}
                  <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', zIndex: 2 }}>{fmt(r.amount)}</div>
                  <div style={{ width: '80%', background: isHighest ? 'linear-gradient(180deg, #EAD068, #f0a500)' : 'linear-gradient(180deg, #00e5ff, #00acc1)', borderRadius: '4px 4px 0 0', height: barH + 'px', transition: 'height 0.4s ease', minHeight: 4, zIndex: 2 }} />
                  <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', textAlign: 'center', lineHeight: 1.3, whiteSpace: 'nowrap' }}>{r.month}</div>
                  {/* Marker labels BELOW x-axis */}
                  {markers.map((mk, mi) => (
                    <div key={mi} style={{ fontSize: 9, color: '#ff9800', whiteSpace: 'nowrap', background: 'rgba(255,152,0,0.1)', padding: '1px 4px', borderRadius: 3, border: '1px solid rgba(255,152,0,0.2)', marginTop: mi * 14, lineHeight: 1.3, transform: markers.length > 1 && mi > 0 ? 'translateY(2px)' : undefined, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {mk.funder}{mk.amtLabel ? ' ' + mk.amtLabel : ''}
                    </div>
                  ))}
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

// ─── Funder Intelligence Tab ─────────────────────────────────────────────────
const fiBtn = { padding: '8px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: 'none' };
const fiBtnSm = { padding: '2px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent' };
const fiStat = { background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 16, border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' };
const fiInput = { width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' };
const fiSelect = { ...fiInput, appearance: 'auto' };

function FunderIntelTab({ positions, agreementResults }) {
  const [funders, setFunders] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeSection, setActiveSection] = useState('directory');

  useEffect(() => {
    import('./data/funder-intel.js').then(mod => {
      setFunders(mod.getAllFunders());
      setOutcomes(mod.getAllOutcomes());
    });
  }, []);

  const refreshData = async () => {
    const mod = await import('./data/funder-intel.js');
    setFunders(mod.getAllFunders());
    setOutcomes(mod.getAllOutcomes());
  };

  const handleSave = async (funder) => {
    const mod = await import('./data/funder-intel.js');
    mod.saveFunder(funder);
    await refreshData();
    setEditingId(null);
    setEditForm({});
    setShowAddForm(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this funder intel record?')) return;
    const mod = await import('./data/funder-intel.js');
    mod.deleteFunder(id);
    await refreshData();
  };

  const autoPopulate = async () => {
    const mod = await import('./data/funder-intel.js');
    const allPositions = positions || [];
    const allAgreements = agreementResults || [];
    let added = 0;

    allPositions.forEach(p => {
      if (!p.funder_name) return;
      const existing = mod.findFunderByName(p.funder_name);
      if (!existing) {
        const agMatch = allAgreements.find(a => {
          const agName = (a.analysis?.funder_name || '').toLowerCase();
          const posName = p.funder_name.toLowerCase();
          return agName.includes(posName.slice(0, 6)) || posName.includes(agName.slice(0, 6));
        });
        const ag = agMatch?.analysis;

        mod.saveFunder({
          name: p.funder_name,
          has_reconciliation: ag?.reconciliation_right || null,
          reconciliation_days: ag?.reconciliation_days || null,
          has_anti_stacking: ag?.anti_stacking_clause || null,
          has_coj: ag?.coj_clause || null,
          governing_law: ag?.governing_law_state || '',
          notes: `Auto-populated from deal analysis on ${new Date().toLocaleDateString()}`,
        });
        added++;
      }
    });

    await refreshData();
    if (added === 0) alert('All funders from current deal are already in the database.');
  };

  // ── Insights calculations ──
  const resolvedOutcomes = outcomes.filter(o => o.days_to_resolution > 0);
  const avgResponseTime = resolvedOutcomes.length > 0
    ? (resolvedOutcomes.reduce((s, o) => s + o.days_to_resolution, 0) / resolvedOutcomes.length).toFixed(1)
    : '—';
  const acceptanceRate = outcomes.length > 0
    ? ((outcomes.filter(o => o.accepted === true).length / outcomes.length) * 100).toFixed(0)
    : '—';
  const acceptedWithReduction = outcomes.filter(o => o.accepted && o.accepted_reduction_pct > 0);
  const avgReduction = acceptedWithReduction.length > 0
    ? (acceptedWithReduction.reduce((s, o) => s + o.accepted_reduction_pct, 0) / acceptedWithReduction.length).toFixed(1)
    : '—';

  const sectionBtns = [
    { key: 'directory', label: `Funder Directory (${funders.length})`, icon: '📇' },
    { key: 'outcomes', label: `Deal Outcomes (${outcomes.length})`, icon: '📊' },
    { key: 'insights', label: 'Intelligence Insights', icon: '🧠' },
  ];

  // ── Edit form fields ──
  const renderEditForm = (form, setForm, onSave, onCancel) => (
    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid rgba(0,229,255,0.2)' }}>
      <div style={{ fontSize: 13, color: '#00e5ff', fontWeight: 600, marginBottom: 12 }}>{form.id ? 'Edit Funder' : 'Add New Funder'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Funder Name *</label>
          <input style={fiInput} value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mint Funding, Inc." />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Collections Email</label>
          <input style={fiInput} value={form.collections_email || ''} onChange={e => setForm(f => ({ ...f, collections_email: e.target.value }))} placeholder="collections@..." />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Collections Phone</label>
          <input style={fiInput} value={form.collections_phone || ''} onChange={e => setForm(f => ({ ...f, collections_phone: e.target.value }))} placeholder="(555) 123-4567" />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Servicing Email</label>
          <input style={fiInput} value={form.servicing_email || ''} onChange={e => setForm(f => ({ ...f, servicing_email: e.target.value }))} placeholder="servicing@..." />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>General Email</label>
          <input style={fiInput} value={form.general_email || ''} onChange={e => setForm(f => ({ ...f, general_email: e.target.value }))} placeholder="info@..." />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>General Phone</label>
          <input style={fiInput} value={form.general_phone || ''} onChange={e => setForm(f => ({ ...f, general_phone: e.target.value }))} placeholder="(555) 123-4567" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Physical Address</label>
          <input style={fiInput} value={form.physical_address || ''} onChange={e => setForm(f => ({ ...f, physical_address: e.target.value }))} placeholder="123 Main St, City, State ZIP" />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Aggression Level</label>
          <select style={fiSelect} value={form.aggression_level || ''} onChange={e => setForm(f => ({ ...f, aggression_level: e.target.value }))}>
            <option value="">— Select —</option>
            <option value="cooperative">Cooperative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
            <option value="hostile">Hostile</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Typical Settlement Tier</label>
          <select style={fiSelect} value={form.typical_settlement_tier || ''} onChange={e => setForm(f => ({ ...f, typical_settlement_tier: e.target.value }))}>
            <option value="">— Select —</option>
            <option value="email1">Email 1 (Opening 80%)</option>
            <option value="email2">Email 2 (Revised 90%)</option>
            <option value="email3">Email 3 (Final 100%)</option>
            <option value="never">Never settles</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Avg Response Time (days)</label>
          <input style={fiInput} type="number" value={form.response_time_days || ''} onChange={e => setForm(f => ({ ...f, response_time_days: parseInt(e.target.value) || null }))} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Typical Reduction Accepted</label>
          <input style={fiInput} value={form.typical_reduction_accepted || ''} onChange={e => setForm(f => ({ ...f, typical_reduction_accepted: e.target.value }))} placeholder="e.g. 40-50%" />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Governing Law</label>
          <input style={fiInput} value={form.governing_law || ''} onChange={e => setForm(f => ({ ...f, governing_law: e.target.value }))} placeholder="e.g. NY, CT" />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Collections Firm</label>
          <input style={fiInput} value={form.collections_firm || ''} onChange={e => setForm(f => ({ ...f, collections_firm: e.target.value }))} placeholder="In-house or firm name" />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Reconciliation</label>
          <select style={fiSelect} value={form.has_reconciliation === null ? '' : form.has_reconciliation ? 'yes' : 'no'} onChange={e => setForm(f => ({ ...f, has_reconciliation: e.target.value === '' ? null : e.target.value === 'yes' }))}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Anti-Stacking</label>
          <select style={fiSelect} value={form.has_anti_stacking === null ? '' : form.has_anti_stacking ? 'yes' : 'no'} onChange={e => setForm(f => ({ ...f, has_anti_stacking: e.target.value === '' ? null : e.target.value === 'yes' }))}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>COJ (Confession of Judgment)</label>
          <select style={fiSelect} value={form.has_coj === null ? '' : form.has_coj ? 'yes' : 'no'} onChange={e => setForm(f => ({ ...f, has_coj: e.target.value === '' ? null : e.target.value === 'yes' }))}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Threatens COJ?</label>
          <select style={fiSelect} value={form.threatens_coj === null ? '' : form.threatens_coj ? 'yes' : 'no'} onChange={e => setForm(f => ({ ...f, threatens_coj: e.target.value === '' ? null : e.target.value === 'yes' }))}>
            <option value="">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: 10, color: 'rgba(232,232,240,0.5)', display: 'block', marginBottom: 3 }}>Notes</label>
          <textarea style={{ ...fiInput, minHeight: 60, resize: 'vertical' }} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Intelligence notes, negotiation history, behavior observations..." />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => onSave(form)} disabled={!form.name} style={{ ...fiBtn, background: form.name ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.05)', color: form.name ? '#00e5ff' : 'rgba(232,232,240,0.3)', border: '1px solid rgba(0,229,255,0.3)' }}>Save</button>
        <button onClick={onCancel} style={{ ...fiBtn, background: 'rgba(255,255,255,0.05)', color: 'rgba(232,232,240,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {sectionBtns.map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key)}
            style={{ padding: '8px 16px', borderRadius: 6, border: activeSection === s.key ? '1px solid rgba(0,229,255,0.5)' : '1px solid rgba(255,255,255,0.1)', background: activeSection === s.key ? 'rgba(0,229,255,0.1)' : 'rgba(255,255,255,0.03)', color: activeSection === s.key ? '#00e5ff' : 'rgba(232,232,240,0.6)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'directory' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => { setShowAddForm(true); setEditForm({ name: '' }); }} style={{ ...fiBtn, background: 'rgba(0,229,255,0.15)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.3)' }}>+ Add Funder</button>
            <button onClick={autoPopulate} style={{ ...fiBtn, background: 'rgba(255,213,79,0.1)', color: '#ffd54f', border: '1px solid rgba(255,213,79,0.3)' }}>Auto-populate from Current Deal</button>
          </div>

          {showAddForm && renderEditForm(editForm, setEditForm, handleSave, () => { setShowAddForm(false); setEditForm({}); })}

          {funders.length === 0 && !showAddForm ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(232,232,240,0.4)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📇</div>
              <div style={{ fontSize: 15 }}>No funders in database yet</div>
              <div style={{ fontSize: 12, marginTop: 8 }}>Click "Auto-populate" to import funders from your current analysis, or add them manually.</div>
            </div>
          ) : (
            funders.map(f => (
              <div key={f.id}>
                {editingId === f.id ? (
                  renderEditForm(editForm, setEditForm, handleSave, () => { setEditingId(null); setEditForm({}); })
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 15, color: '#00e5ff', fontWeight: 700 }}>{f.name}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {f.aggression_level && (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: f.aggression_level === 'cooperative' ? 'rgba(76,175,80,0.2)' : f.aggression_level === 'hostile' ? 'rgba(239,83,80,0.2)' : 'rgba(255,152,0,0.2)', color: f.aggression_level === 'cooperative' ? '#4caf50' : f.aggression_level === 'hostile' ? '#ef5350' : '#ff9800' }}>
                            {f.aggression_level}
                          </span>
                        )}
                        <button onClick={() => { setEditingId(f.id); setEditForm({ ...f }); }} style={{ ...fiBtnSm, color: '#00e5ff' }}>Edit</button>
                        <button onClick={() => handleDelete(f.id)} style={{ ...fiBtnSm, color: '#ef5350' }}>×</button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, fontSize: 11, color: 'rgba(232,232,240,0.6)' }}>
                      {f.collections_email && <div>📧 {f.collections_email}</div>}
                      {f.collections_phone && <div>📞 {f.collections_phone}</div>}
                      {f.governing_law && <div>⚖️ {f.governing_law} law</div>}
                      {f.has_reconciliation !== null && <div>{f.has_reconciliation ? '✅' : '❌'} Reconciliation{f.reconciliation_days ? ` (${f.reconciliation_days}d)` : ''}</div>}
                      {f.has_anti_stacking !== null && <div>{f.has_anti_stacking ? '⚠️' : '✅'} Anti-stacking{f.stacking_penalty ? `: ${f.stacking_penalty}` : ''}</div>}
                      {f.has_coj !== null && <div>{f.has_coj ? '🔴' : '✅'} COJ{f.coj_enforceable === false ? ' (unenforceable)' : ''}</div>}
                      {f.typical_settlement_tier && <div>🎯 Settles at: {f.typical_settlement_tier}</div>}
                      {f.typical_reduction_accepted && <div>📉 Accepts: {f.typical_reduction_accepted} reduction</div>}
                      {f.response_time_days && <div>⏱️ Responds in ~{f.response_time_days}d</div>}
                      {f.deals_count > 0 && <div>📁 {f.deals_count} deals</div>}
                    </div>

                    {f.notes && <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginTop: 8, fontStyle: 'italic' }}>{f.notes}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}

      {activeSection === 'outcomes' && (
        <>
          {outcomes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(232,232,240,0.4)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 15 }}>No outcomes recorded yet</div>
              <div style={{ fontSize: 12, marginTop: 8 }}>Outcomes are saved from the Negotiation tab when a funder accepts, counters, or rejects a proposal.</div>
            </div>
          ) : (
            outcomes.map(o => (
              <div key={o.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 16, marginBottom: 12, border: `1px solid ${o.accepted ? 'rgba(76,175,80,0.3)' : o.accepted === false ? 'rgba(239,83,80,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, color: '#e8e8f0', fontWeight: 600 }}>{o.funder_name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>{o.deal_name} · {o.first_contact_date || 'No date'}</div>
                  </div>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: o.accepted ? 'rgba(76,175,80,0.2)' : o.accepted === false ? 'rgba(239,83,80,0.2)' : 'rgba(255,152,0,0.2)', color: o.accepted ? '#4caf50' : o.accepted === false ? '#ef5350' : '#ff9800' }}>
                    {o.accepted ? 'Accepted' : o.accepted === false ? 'Rejected' : 'Pending'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.6)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <div>Proposed: ${o.proposed_weekly?.toLocaleString()}/wk ({o.proposed_reduction_pct}% reduction)</div>
                  {o.accepted && <div>Accepted: ${o.accepted_weekly?.toLocaleString()}/wk ({o.accepted_reduction_pct}% reduction)</div>}
                  {o.days_to_resolution > 0 && <div>Resolved in {o.days_to_resolution} days</div>}
                </div>
                {o.resolution_notes && <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginTop: 6 }}>{o.resolution_notes}</div>}
              </div>
            ))
          )}
        </>
      )}

      {activeSection === 'insights' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div style={fiStat}><div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 4 }}>FUNDERS TRACKED</div><div style={{ fontSize: 24, color: '#00e5ff' }}>{funders.length}</div></div>
            <div style={fiStat}><div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 4 }}>DEALS RECORDED</div><div style={{ fontSize: 24, color: '#ffd54f' }}>{outcomes.length}</div></div>
            <div style={fiStat}><div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 4 }}>ACCEPTANCE RATE</div><div style={{ fontSize: 24, color: '#4caf50' }}>{acceptanceRate}%</div></div>
            <div style={fiStat}><div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 4 }}>AVG REDUCTION ACCEPTED</div><div style={{ fontSize: 24, color: '#ff9800' }}>{avgReduction}%</div></div>
            <div style={fiStat}><div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 4 }}>AVG DAYS TO RESOLUTION</div><div style={{ fontSize: 24, color: '#e8e8f0' }}>{avgResponseTime}</div></div>
          </div>

          <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.45)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Funder Behavior Patterns</div>
          {funders.filter(f => f.aggression_level).length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(232,232,240,0.3)', padding: 20, textAlign: 'center' }}>
              Update funder records with behavior data (aggression level, settlement patterns) to see insights here.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
              {['cooperative', 'moderate', 'aggressive', 'hostile'].map(level => {
                const count = funders.filter(f => f.aggression_level === level).length;
                if (count === 0) return null;
                const colors = { cooperative: '#4caf50', moderate: '#ffd54f', aggressive: '#ff9800', hostile: '#ef5350' };
                return (
                  <div key={level} style={{ background: `${colors[level]}08`, border: `1px solid ${colors[level]}33`, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, color: colors[level], fontWeight: 600, marginBottom: 6 }}>{level.charAt(0).toUpperCase() + level.slice(1)} ({count})</div>
                    {funders.filter(f => f.aggression_level === level).map(f => (
                      <div key={f.id} style={{ fontSize: 11, color: 'rgba(232,232,240,0.6)', lineHeight: 1.6 }}>• {f.name}{f.typical_settlement_tier ? ` — settles at ${f.typical_settlement_tier}` : ''}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
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
  const [depositOverrides, setDepositOverrides] = useState({});
  const [showRevenueReview, setShowRevenueReview] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [enrolledPositions, setEnrolledPositions] = useState(null); // null = all enrolled (default)
  const [selectedIndustry, setSelectedIndustry] = useState('general');
  const [chatOpen, setChatOpen] = useState(false);
  const inputRef = useRef(null);

  const TABS = ['📊 Revenue', '📈 Trend', '🏦 MCA Positions', '⚠️ Risk', '📋 Agreements', '🔄 Cross-Ref', '🤝 Negotiation', '💰 Pricing', '📇 Funder Intel', '🎯 Confidence', '⬇️ Export'];

  // ─── Agreement state ─────────────────────────────────────────
  const [uploadedAgreements, setUploadedAgreements] = useState([]);
  const [agreementResults, setAgreementResults] = useState([]);
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [crossRefResult, setCrossRefResult] = useState(null);
  const [crossRefLoading, setCrossRefLoading] = useState(false);
  const [crossRefError, setCrossRefError] = useState(null);
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
    const newEntries = files.map(f => ({ id: Date.now() + Math.random(), file: f, name: f.name, status: 'detecting', textLength: 0 }));
    setUploadedAgreements(prev => [...prev, ...newEntries]);
    // Detect text vs scanned for each agreement
    for (const entry of newEntries) {
      try {
        const text = await extractPDFText(entry.file);
        const hasText = text && text.trim().length > 200;
        setUploadedAgreements(prev => prev.map(a =>
          a.id === entry.id ? { ...a, status: 'pending', textLength: text?.length || 0, isScanned: !hasText } : a
        ));
      } catch {
        setUploadedAgreements(prev => prev.map(a => a.id === entry.id ? { ...a, status: 'pending', isScanned: true } : a));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          // Check if extraction looks incomplete (blank pages likely) — auto-retry with images
          const analysis = data.analysis;
          const hasLowConfidence = analysis.analysis_confidence?.overall === 'low';
          const missingCriticalFields = !analysis.financial_terms?.purchase_price && !analysis.financial_terms?.purchased_amount;
          const noProtections = (!analysis.merchant_protections || analysis.merchant_protections.length === 0);
          const noDefaultTriggers = (!analysis.default_triggers || analysis.default_triggers.length === 0);
          const looksIncomplete = hasLowConfidence || (missingCriticalFields && noProtections && noDefaultTriggers);

          if (looksIncomplete && !ag.autoRetried) {
            // Auto-retry by sending raw PDF via FormData (server-side processing)
            setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'retrying', autoRetried: true, error: null } : a));
            try {
              const retryFormData = new FormData();
              retryFormData.append('pdf', ag.file);
              retryFormData.append('model', model === 'sonnet' ? 'opus' : model);
              retryFormData.append('fileName', ag.name);
              const retryRes = await fetch('/api/analyze-agreement', { method: 'POST', body: retryFormData });
              const retryData = await retryRes.json();
              if (retryData.analysis) {
                setAgreementResults(prev => [...prev, { fileName: ag.name, analysis: retryData.analysis }]);
                setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'done', isScanned: true, error: null } : a));
              } else {
                setAgreementResults(prev => [...prev, { fileName: ag.name, analysis: data.analysis }]);
                setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'done', error: 'Retry failed — using partial data' } : a));
              }
            } catch (retryErr) {
              setAgreementResults(prev => [...prev, { fileName: ag.name, analysis: data.analysis }]);
              setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'done', error: 'Retry failed — using partial data' } : a));
            }
          } else {
            setAgreementResults(prev => [...prev, { fileName: ag.name, analysis: data.analysis }]);
            setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'done' } : a));
          }
        } else {
          setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'error', error: data.error || 'Failed' } : a));
        }
      } catch (err) {
        setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'error', error: err.message } : a));
      }
    }
    setAgreementLoading(false);
  };

  const retryAgreementAsPDF = async (ag) => {
    if (!ag.file) return;
    setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'retrying', error: null } : a));
    try {
      const formData = new FormData();
      formData.append('pdf', ag.file);
      formData.append('model', model === 'sonnet' ? 'opus' : model);
      formData.append('fileName', ag.name);
      const res = await fetch('/api/analyze-agreement', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.analysis) {
        setAgreementResults(prev => [...prev.filter(r => r.fileName !== ag.name), { fileName: ag.name, analysis: data.analysis }]);
        setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'done', isScanned: true } : a));
      } else {
        setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'error', error: data.error || 'PDF scan failed' } : a));
      }
    } catch (err) {
      setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'error', error: err.message } : a));
    }
  };

  const runCrossReference = async () => {
    if (!result?.analysis) { alert('Run bank statement analysis first.'); return; }
    if (agreementResults.length === 0) { alert('Analyze at least one MCA agreement first.'); return; }
    setCrossRefLoading(true);
    setCrossRefResult(null);
    setCrossRefError(null);
    try {
      const res = await fetch('/api/cross-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankAnalysis: result.analysis, agreementAnalyses: agreementResults.filter(a => a.analysis).map(a => a.analysis), model, industry: selectedIndustry })
      });
      let data;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => 'Unknown server error');
        setCrossRefError('Server returned invalid response: ' + text.slice(0, 200));
        setActiveTab(5);
        setCrossRefLoading(false);
        return;
      }
      if (!res.ok || !data.analysis) {
        setCrossRefError(data.error || 'Cross-reference failed — no analysis returned.');
        setActiveTab(5);
      } else {
        setCrossRefResult(data);
        setActiveTab(5);
      }
    } catch (err) {
      setCrossRefError('Cross-reference request failed: ' + err.message);
      setActiveTab(5);
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

  // ─── Streaming fetch helper for Opus ──────────────────────────────────────────
  // Reads a streamed text response, accumulates it, parses JSON at the end.
  // Updates loadingMsg with a live byte counter so the user sees progress.
  async function fetchStreaming(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let chunks = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      accumulated += chunk;
      chunks++;
      if (chunks % 5 === 0) {
        setLoadingMsg(`Receiving Opus data… ${(accumulated.length / 1024).toFixed(0)} KB`);
      }
    }

    // Check for error marker
    const errorIdx = accumulated.indexOf('\n[ERROR]');
    if (errorIdx !== -1) {
      const errJson = accumulated.slice(errorIdx + 8);
      try {
        const errObj = JSON.parse(errJson);
        throw new Error(errObj.message || 'Stream error');
      } catch (e) {
        if (e.message !== 'Stream error') throw e;
        throw new Error(errJson.slice(0, 500));
      }
    }

    // Strip [DONE] marker and markdown fences
    let text = accumulated.replace(/\n?\[DONE\]$/, '').trim();
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Strip preamble before first { and trailing text after last }
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) {
      throw new Error(`Opus returned no JSON object: ${text.slice(0, 300)}`);
    }
    if (firstBrace > 0) {
      console.log(`[stream] Stripping ${firstBrace} chars of preamble`);
      text = text.slice(firstBrace);
    }
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace !== -1) {
      text = text.slice(0, lastBrace + 1);
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`JSON parse failed after streaming. Length: ${text.length}. Start: ${text.slice(0, 200)}`);
    }
  }

  // ─── Core fetch: handles both streaming (Opus) and regular (Sonnet) ─────────
  async function fetchAnalysis(endpoint, body) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // Detect streaming: check header OR content-type (header may be stripped by CDN/proxy)
    const streamHeader = res.headers.get('X-Stream-Mode');
    const contentType = res.headers.get('Content-Type') || '';
    const isStreaming = streamHeader === 'opus' || (contentType.includes('text/plain') && !contentType.includes('json'));

    if (isStreaming) {
      setLoadingMsg('Opus streaming started… receiving data');
      const analysis = await fetchStreaming(res);
      return { success: true, analysis, statement_count: body.statements?.length || 1 };
    }

    // Non-streaming (Sonnet or single statement)
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // Response might have preamble — extract JSON
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        data = JSON.parse(text.slice(start, end + 1));
      } else {
        throw new Error('No JSON in response: ' + text.slice(0, 300));
      }
    }
    if (!res.ok || data.error) {
      throw new Error(data.message || data.error || 'Analysis failed');
    }
    return data;
  }

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
        ? { text: statements[0].text, fileName: ready[0].file.name, model, industry: selectedIndustry }
        : { statements, model, industry: selectedIndustry };

      const data = await fetchAnalysis(endpoint, body);
      clearInterval(interval);

      // Post-process: deduplicate positions, fix missing fields, recalculate metrics
      if (data.analysis) {
        data.analysis = postProcessAnalysis(data.analysis);
      }

      setResult(data);
      setPositions((data.analysis.mca_positions || []).map((p, i) => {
        const pa = parseFloat(p.payment_amount_current || p.payment_amount) || 0;
        const freq = (p.frequency || 'weekly').toLowerCase().replace(/[-_\s]/g, '');
        const freqMult = freq === 'daily' ? 22 : freq === 'biweekly' ? 2.17 : freq === 'monthly' ? 1 : 4.33;
        const computedMonthly = pa * freqMult;
        return {
          ...p,
          _id: i,
          estimated_monthly_total: (p.estimated_monthly_total && p.estimated_monthly_total > 0)
            ? p.estimated_monthly_total
            : computedMonthly,
        };
      }));
      setExcludedIds([]);
      setOtherExcludedIds([]);
      setDepositOverrides({});
      setReviewDismissed(false);
      // Check for low-confidence deposits → trigger review modal
      const sources = data.analysis?.revenue?.revenue_sources || [];
      const flagged = sources.filter(s => (s.confidence ?? 90) < 80);
      if (flagged.length > 0) setShowRevenueReview(true);
      setActiveTab(0);
    } catch (e) {
      clearInterval(interval);
      setError(e.message);
    }
    setLoading(false);
  };

  const reanalyze = async () => {
    const ready = uploadedFiles.filter(f => f.status === 'ready' && (f.text || (f.images && f.images.length > 0)));
    if (!ready.length) return;

    // Preserve manual/edited positions to restore after re-analysis
    const manualPositions = positions.filter(p => p.isManual || p.isEdited);
    const prevExcludedIds = [...excludedIds];
    const prevOtherExcludedIds = [...otherExcludedIds];
    const prevDepositOverrides = { ...depositOverrides };

    setLoading(true);
    setError(null);
    setLoadingMsg(`Re-analyzing with ${model === 'opus' ? 'Opus' : 'Sonnet'}…`);

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
        ? { text: statements[0].text, fileName: ready[0].file.name, model, industry: selectedIndustry }
        : { statements, model, industry: selectedIndustry };

      const data = await fetchAnalysis(endpoint, body);

      // Post-process: deduplicate positions, fix missing fields, recalculate metrics
      if (data.analysis) {
        data.analysis = postProcessAnalysis(data.analysis);
      }

      setResult(data);

      // Merge new positions with preserved manual ones
      const newPositions = (data.analysis.mca_positions || []).map((p, i) => {
        const pa = parseFloat(p.payment_amount_current || p.payment_amount) || 0;
        const freq = (p.frequency || 'weekly').toLowerCase().replace(/[-_\s]/g, '');
        const freqMult = freq === 'daily' ? 22 : freq === 'biweekly' ? 2.17 : freq === 'monthly' ? 1 : 4.33;
        const computedMonthly = pa * freqMult;
        return {
          ...p,
          _id: i,
          estimated_monthly_total: (p.estimated_monthly_total && p.estimated_monthly_total > 0) ? p.estimated_monthly_total : computedMonthly,
        };
      });
      // Add manual positions back with new IDs
      const maxId = Math.max(...newPositions.map(p => p._id), 0);
      manualPositions.forEach((mp, i) => {
        newPositions.push({ ...mp, _id: maxId + i + 1 });
      });
      setPositions(newPositions);

      // Restore exclusion lists (best effort — IDs may have shifted)
      setExcludedIds(prevExcludedIds.filter(id => newPositions.some(p => p._id === id)));
      setOtherExcludedIds(prevOtherExcludedIds);
      setDepositOverrides(prevDepositOverrides);
      // Check for low-confidence deposits → trigger review modal
      setReviewDismissed(false);
      const sources = data.analysis?.revenue?.revenue_sources || [];
      const flagged = sources.filter(s => (s.confidence ?? 90) < 80);
      if (flagged.length > 0) setShowRevenueReview(true);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const reset = () => {
    setUploadedFiles([]); setResult(null); setError(null);
    setPositions([]); setExcludedIds([]); setOtherExcludedIds([]); setDepositOverrides({});
    setShowRevenueReview(false); setReviewDismissed(false);
    setUploadedAgreements([]); setAgreementResults([]); setCrossRefResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const readyCount = uploadedFiles.filter(f => f.status === 'ready' && (f.text || (f.images && f.images.length > 0))).length;
  const detectingCount = uploadedFiles.filter(f => f.status === 'detecting').length;
  const needsScanCount = uploadedFiles.filter(f => f.status === 'needs_scan').length;
  const insufficientTextCount = uploadedFiles.filter(f => f.status === 'ready' && (!f.text || f.text.length < 200) && (!f.images || f.images.length === 0)).length;
  const canAnalyze = readyCount > 0 && detectingCount === 0 && needsScanCount === 0 && insufficientTextCount === 0;

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
                        </div>
                      </div>
                    )}
                    {f.status === 'needs_scan' && (
                      <div>
                        <div style={{ fontSize: 12, color: '#ffd54f', marginBottom: 8 }}>📷 NEEDS SCAN — scanned PDF detected</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button onClick={() => scanWithClaude(f.id, f.file, 'sonnet')} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.08)', color: '#00e5ff', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>🔍 Scan with Claude (Sonnet)</button>
                          <button onClick={() => scanWithClaude(f.id, f.file, 'opus')} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(76,175,80,0.3)', background: 'rgba(76,175,80,0.08)', color: '#4caf50', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>🔍 Scan with Opus</button>
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
                  style={{ ...S.btn('primary'), opacity: canAnalyze ? 1 : 0.5 }}
                  disabled={!canAnalyze}
                  onClick={analyze}>
                  🔍 Analyze {readyCount} Statement{readyCount !== 1 ? 's' : ''}
                </button>
                <button style={S.btn('secondary')} onClick={reset}>✕ Clear All</button>
                <select
                  value={selectedIndustry}
                  onChange={e => setSelectedIndustry(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,0,0,0.3)', color: '#e8e8f0', fontSize: 12, fontFamily: 'inherit' }}
                >
                  {Object.entries(INDUSTRY_PROFILES).map(([key, p]) => (
                    <option key={key} value={key}>{p.label}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px' }}>
                  <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)' }}>Model:</span>
                  <button onClick={() => setModel('opus')} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: model === 'opus' ? 'rgba(0,229,255,0.2)' : 'transparent', color: model === 'opus' ? '#00e5ff' : 'rgba(232,232,240,0.45)' }}>Opus</button>
                  <button onClick={() => setModel('sonnet')} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: model === 'sonnet' ? 'rgba(234,208,104,0.2)' : 'transparent', color: model === 'sonnet' ? '#EAD068' : 'rgba(232,232,240,0.45)' }}>Sonnet ⚡</button>
                </div>
                {detectingCount > 0 && <span style={{ fontSize: 12, color: '#00e5ff', animation: 'pulse 1s infinite' }}>Detecting {detectingCount} file{detectingCount > 1 ? 's' : ''}…</span>}
                {needsScanCount > 0 && <span style={{ fontSize: 12, color: '#ff9800' }}>⚠️ {needsScanCount} statement{needsScanCount > 1 ? 's need' : ' needs'} scanning first</span>}
                {insufficientTextCount > 0 && <span style={{ fontSize: 12, color: '#ef5350' }}>⚠️ {insufficientTextCount} statement{insufficientTextCount > 1 ? 's have' : ' has'} insufficient text — scan first</span>}
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
                {uploadedAgreements.filter(a => a.status === 'pending' || a.status === 'ready').length > 0 && (
                  <button style={{ ...S.btn('gold'), padding: '8px 16px', fontSize: 12, opacity: agreementLoading ? 0.5 : 1 }} onClick={analyzeAgreements} disabled={agreementLoading}>
                    {agreementLoading ? '⏳ Analyzing…' : `📋 Analyze ${uploadedAgreements.filter(a => a.status === 'pending' || a.status === 'ready').length} Agreement${uploadedAgreements.filter(a => a.status === 'pending' || a.status === 'ready').length > 1 ? 's' : ''}`}
                  </button>
                )}
                {uploadedAgreements.length > 0 && <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.5)' }}>{uploadedAgreements.filter(a => a.status === 'done').length}/{uploadedAgreements.length} analyzed</span>}
              </div>
              {uploadedAgreements.map(ag => (
                <span key={ag.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: ag.status === 'analyzing' || ag.status === 'retrying' ? 'rgba(0,229,255,0.08)' : ag.status === 'error' ? 'rgba(239,83,80,0.08)' : ag.status === 'done' ? 'rgba(76,175,80,0.08)' : ag.isScanned ? 'rgba(249,168,37,0.08)' : 'rgba(234,208,104,0.08)', border: `1px solid ${ag.status === 'analyzing' || ag.status === 'retrying' ? 'rgba(0,229,255,0.3)' : ag.status === 'error' ? 'rgba(239,83,80,0.3)' : ag.status === 'done' ? 'rgba(76,175,80,0.3)' : ag.isScanned ? 'rgba(249,168,37,0.3)' : 'rgba(234,208,104,0.2)'}`, borderRadius: 6, padding: '4px 8px', marginRight: 6, marginBottom: 4, fontSize: 11 }}>
                  {ag.status === 'detecting' && <span style={{color:'#00e5ff'}}>⏳</span>}
                  {ag.status === 'analyzing' && <span style={{color:'#00e5ff', animation: 'pulse 1s infinite'}}>⏳</span>}
                  {ag.status === 'retrying' && <span style={{color:'#00e5ff', animation: 'spin 1s linear infinite', display: 'inline-block'}}>↻</span>}
                  {ag.status === 'done' && <span style={{color:'#81c784'}}>✓</span>}
                  {ag.status === 'error' && <span style={{color:'#ef9a9a'}}>✕</span>}
                  {ag.status === 'pending' && (ag.isScanned ? <span style={{color:'#ff9800'}}>🖨️</span> : <span style={{ color: '#EAD068' }}>📋</span>)}
                  <span style={{ color: 'rgba(232,232,240,0.6)' }}>{ag.name.slice(0, 22)}{ag.name.length > 22 ? '…' : ''}</span>
                  {ag.status === 'analyzing' && <span style={{fontSize:9, color:'#00e5ff', letterSpacing:0.5}}>SCANNING</span>}
                  {ag.status === 'retrying' && <span style={{fontSize:9, color:'#00e5ff', letterSpacing:0.5}}>RETRYING</span>}
                  {ag.status === 'done' && <span style={{fontSize:9, color:'#81c784', letterSpacing:0.5}}>DONE</span>}
                  {ag.isScanned && ag.status === 'pending' && <span style={{fontSize:9, color:'#ff9800', letterSpacing:0.5}}>SCANNED</span>}
                  {!ag.isScanned && ag.status === 'pending' && <span style={{fontSize:9, color:'#81c784', letterSpacing:0.5}}>TEXT ✓</span>}
                  {ag.status === 'error' && (
                    <>
                      <button onClick={() => { setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? {...a, status: 'pending', error: null} : a)); }} style={{ marginLeft: 4, padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.1)', color: '#00e5ff', cursor: 'pointer', fontSize: 9, fontFamily: 'inherit' }}>↺</button>
                      <button onClick={() => retryAgreementAsPDF(ag)} style={{ padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(234,208,104,0.3)', background: 'rgba(234,208,104,0.1)', color: '#EAD068', cursor: 'pointer', fontSize: 9, fontFamily: 'inherit' }}>🔍 Rescan</button>
                    </>
                  )}
                  {ag.status !== 'analyzing' && ag.status !== 'retrying' && ag.status !== 'detecting' && <button onClick={() => setUploadedAgreements(prev => prev.filter(a => a.id !== ag.id))} style={{ background: 'none', border: 'none', color: 'rgba(232,232,240,0.3)', cursor: 'pointer', fontSize: 12, padding: 0, marginLeft: 2 }}>✕</button>}
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
                <button style={{ ...S.btn('secondary'), padding: '6px 14px', fontSize: 12 }} onClick={reanalyze} title="Re-runs analysis with current model. Manual positions will be preserved.">🔄 Re-analyze</button>
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
                  <span key={ag.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(232,232,240,0.5)', background: ag.status === 'error' ? 'rgba(239,83,80,0.08)' : ag.status === 'retrying' ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${ag.status === 'error' ? 'rgba(239,83,80,0.3)' : ag.status === 'retrying' ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 6, padding: '3px 7px' }}>
                    {ag.status === 'done' && <span style={{ color: '#81c784' }}>✓</span>}
                    {ag.status === 'error' && <span style={{ color: '#ef9a9a' }}>✕</span>}
                    {ag.status === 'analyzing' && <span style={{ color: '#00e5ff' }}>⏳</span>}
                    {ag.status === 'retrying' && <span style={{ color: '#00e5ff', animation: 'spin 1s linear infinite', display: 'inline-block' }}>↻</span>}
                    {ag.status === 'pending' && <span style={{ color: '#EAD068' }}>📋</span>}
                    {ag.name.slice(0,18)}{ag.name.length>18?'…':''}
                    {ag.status === 'retrying' && <span style={{ color: '#00e5ff', fontSize: 9, marginLeft: 2 }}>retrying...</span>}
                    {ag.status === 'error' && (
                      <>
                        <button onClick={() => { setUploadedAgreements(prev => prev.map(a => a.id === ag.id ? {...a, status: 'pending', error: null} : a)); }} style={{ marginLeft: 4, padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(0,229,255,0.3)', background: 'rgba(0,229,255,0.1)', color: '#00e5ff', cursor: 'pointer', fontSize: 9, fontFamily: 'inherit' }}>↺ Retry</button>
                        <button onClick={() => retryAgreementAsPDF(ag)} style={{ padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(234,208,104,0.3)', background: 'rgba(234,208,104,0.1)', color: '#EAD068', cursor: 'pointer', fontSize: 9, fontFamily: 'inherit' }}>🔍 Rescan Scan</button>
                      </>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Revenue Review Modal */}
          {showRevenueReview && !reviewDismissed && result?.analysis?.revenue?.revenue_sources && (() => {
            const sources = result.analysis.revenue.revenue_sources;
            const flagged = sources.map((s, i) => ({ ...s, _idx: i })).filter(s => (s.confidence ?? 90) < 80);
            if (flagged.length === 0) return null;
            const confColor = (c) => c >= 80 ? '#4caf50' : c >= 60 ? '#ffd54f' : '#ef5350';
            const isIncluded = (src, i) => {
              if (depositOverrides.hasOwnProperty(i)) return depositOverrides[i];
              return !src.is_excluded;
            };
            return (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ background: '#1a1a2e', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 16, padding: 28, maxWidth: 800, width: '100%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#ffd54f', marginBottom: 6 }}>Revenue Review — Flagged Deposits</div>
                  <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.5)', marginBottom: 20, lineHeight: 1.6 }}>These deposits scored below 80% confidence. Review each one before analysis runs downstream.</div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.6fr 0.6fr', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {['Source', 'Total', 'Type', 'Confidence', 'Include?'].map(h => (
                        <span key={h} style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: h === 'Source' ? 'left' : 'center' }}>{h}</span>
                      ))}
                    </div>
                    {flagged.map(s => {
                      const idx = s._idx;
                      const included = isIncluded(s, idx);
                      return (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.6fr 0.6fr', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#e8e8f0' }}>
                            {s.name}
                            {s.note && <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.35)', marginTop: 2 }}>{s.note}</div>}
                          </span>
                          <span style={{ fontSize: 12, textAlign: 'center', color: '#e8e8f0' }}>{fmt(s.total)}</span>
                          <span style={{ textAlign: 'center' }}><span style={S.tag('grey')}>{(s.type || '').replace(/_/g, ' ')}</span></span>
                          <span style={{ textAlign: 'center' }}><span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${confColor(s.confidence ?? 50)}22`, color: confColor(s.confidence ?? 50) }}>{s.confidence ?? '?'}</span></span>
                          <span style={{ textAlign: 'center' }}>
                            <button onClick={() => setDepositOverrides(prev => ({ ...prev, [idx]: !included }))} style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative', background: included ? '#00e5ff' : '#ef5350', transition: 'background 0.2s' }}>
                              <span style={{ position: 'absolute', top: 2, left: included ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)' }}>{flagged.length} flagged deposit{flagged.length > 1 ? 's' : ''}</span>
                    <button onClick={() => { setShowRevenueReview(false); setReviewDismissed(true); }} style={{ ...S.btn('primary'), padding: '10px 28px', fontSize: 14, fontWeight: 700 }}>
                      Confirm & Calculate
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Tabs */}
          <div style={S.tabs}>
            {TABS.map((t, i) => <button key={i} style={S.tab(activeTab === i)} onClick={() => setActiveTab(i)}>{t}</button>)}
          </div>

          <div style={S.card}>
            {activeTab === 0 && <RevenueTab a={result.analysis} depositOverrides={depositOverrides} setDepositOverrides={setDepositOverrides} />}
            {activeTab === 1 && <TrendTab a={result.analysis} agreementResults={agreementResults} />}
            {activeTab === 2 && <MCATab a={result.analysis} positions={positions} setPositions={setPositions} excludedIds={excludedIds} setExcludedIds={setExcludedIds} otherExcludedIds={otherExcludedIds} setOtherExcludedIds={setOtherExcludedIds} depositOverrides={depositOverrides} agreementResults={agreementResults} enrolledPositions={enrolledPositions} setEnrolledPositions={setEnrolledPositions} />}
            {activeTab === 3 && <RiskTab a={result.analysis} positions={positions} excludedIds={excludedIds} otherExcludedIds={otherExcludedIds} depositOverrides={depositOverrides} />}
            {activeTab === 4 && <AgreementsTab agreementResults={agreementResults} />}
            {activeTab === 5 && <CrossReferenceTab crossRefResult={crossRefResult} crossRefError={crossRefError} agreementResults={agreementResults} positions={positions} a={result.analysis} />}
            {activeTab === 6 && <NegotiationTab a={result.analysis} positions={positions} excludedIds={excludedIds} otherExcludedIds={otherExcludedIds} depositOverrides={depositOverrides} agreementResults={agreementResults} enrolledPositions={enrolledPositions} />}
            {activeTab === 7 && <PricingTab a={result.analysis} positions={positions} excludedIds={excludedIds} otherExcludedIds={otherExcludedIds} depositOverrides={depositOverrides} agreementResults={agreementResults} enrolledPositions={enrolledPositions} />}
            {activeTab === 8 && <FunderIntelTab positions={positions} agreementResults={agreementResults} />}
            {activeTab === 9 && <ConfidenceTab a={result.analysis} positions={positions} excludedIds={excludedIds} depositOverrides={depositOverrides} agreementResults={agreementResults} />}
            {activeTab === 10 && <ExportTab a={result.analysis} fileName={result.file_name || 'analysis'} positions={positions} excludedIds={excludedIds} otherExcludedIds={otherExcludedIds} depositOverrides={depositOverrides} agreementResults={agreementResults} enrolledPositions={enrolledPositions} />}
          </div>
        </div>
      )}

      {/* Floating Chat Button */}
      {result && result.analysis && (
        <button
          onClick={() => setChatOpen(!chatOpen)}
          style={{
            position: 'fixed',
            bottom: chatOpen ? -100 : 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(0,229,255,0.2), rgba(0,229,255,0.1))',
            border: '1px solid rgba(0,229,255,0.3)',
            color: '#00e5ff',
            fontSize: 24,
            cursor: 'pointer',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(0,229,255,0.15)',
            transition: 'all 0.3s ease',
          }}
          title="Open Negotiation Advisor"
        >
          💬
        </button>
      )}

      {/* Chat Panel */}
      <NegotiationChat
        analysisContext={{
          businessName: result?.analysis?.business_name || '',
          revenue: result?.analysis?.true_monthly_revenue || result?.analysis?.calculated_metrics?.true_monthly_revenue || 0,
          industry: selectedIndustry || 'general',
          positions: (positions || []).map(p => ({
            funder_name: p.funder_name,
            weekly: parseFloat(p.payment_amount_current || p.payment_amount) || 0,
            balance: parseFloat(p.estimated_remaining_balance) || 0,
            specified_pct: p.specified_receivable_percentage || null,
            frequency: p.frequency,
            status: p.status,
          })),
          agreements: agreementResults || [],
          crossRef: crossRefResult || null,
        }}
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}

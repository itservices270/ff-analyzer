'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { calculatePricing, calculateEnforceabilityWeighted } from '../../lib/pricing-engine';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (n) => (parseFloat(n) || 0).toFixed(1) + '%';
const round2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;

// ─── Styles ───────────────────────────────────────────────────────────────────
const PS = {
  container: { fontFamily: 'Questrial, sans-serif', color: '#e0e0e0' },
  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(232,232,240,0.5)', marginBottom: 14 },
  goldCard: { background: 'rgba(207,165,41,0.06)', border: '1px solid rgba(207,165,41,0.2)', borderRadius: 12, padding: 20, marginBottom: 16 },
  snapGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 },
  snapStat: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 14px' },
  snapLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(232,232,240,0.4)', marginBottom: 4 },
  snapValue: (color) => ({ fontSize: 18, color: color || '#e0e0e0', fontWeight: 400 }),
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  sliderGroup: { flex: 1, minWidth: 200 },
  sliderLabel: { fontSize: 12, color: 'rgba(232,232,240,0.6)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' },
  slider: { width: '100%', accentColor: '#CFA529', cursor: 'pointer' },
  input: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', color: '#e0e0e0', fontSize: 14, fontFamily: 'inherit', width: '100%' },
  select: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '6px 10px', color: '#e0e0e0', fontSize: 13, fontFamily: 'inherit' },
  checkbox: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(232,232,240,0.7)', cursor: 'pointer' },
  btn: (variant) => ({
    padding: '10px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', letterSpacing: 0.4, transition: 'all 0.2s',
    ...(variant === 'gold' ? { background: 'linear-gradient(135deg, #CFA529, #EAD068)', color: '#0a0a0f', fontWeight: 600 } :
      variant === 'primary' ? { background: 'linear-gradient(135deg, #00acc1, #00e5ff)', color: '#0a0a0f', fontWeight: 600 } :
      { background: 'rgba(255,255,255,0.08)', color: '#e0e0e0', border: '1px solid rgba(255,255,255,0.15)' }),
  }),
  tierGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 },
  tierCard: (active) => ({
    background: active ? 'rgba(207,165,41,0.08)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? 'rgba(207,165,41,0.3)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: 10, padding: 14, textAlign: 'center',
  }),
  tierLabel: { fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(232,232,240,0.45)', marginBottom: 6 },
  tierValue: { fontSize: 20, color: '#CFA529', fontWeight: 400, marginBottom: 4 },
  tierSub: { fontSize: 11, color: 'rgba(232,232,240,0.4)' },
  posCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16, marginBottom: 10 },
  posHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  posName: { fontSize: 15, color: '#e0e0e0' },
  badge: (color) => ({
    display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase',
    ...(color === 'green' ? { background: 'rgba(76,175,80,0.15)', color: '#81c784', border: '1px solid rgba(76,175,80,0.25)' } :
      color === 'gold' ? { background: 'rgba(234,208,104,0.12)', color: '#EAD068', border: '1px solid rgba(234,208,104,0.25)' } :
      color === 'amber' ? { background: 'rgba(249,168,37,0.15)', color: '#ffd54f', border: '1px solid rgba(249,168,37,0.25)' } :
      color === 'red' ? { background: 'rgba(239,83,80,0.15)', color: '#ef9a9a', border: '1px solid rgba(239,83,80,0.3)' } :
      color === 'teal' ? { background: 'rgba(0,229,255,0.12)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.25)' } :
      { background: 'rgba(255,255,255,0.07)', color: 'rgba(232,232,240,0.6)', border: '1px solid rgba(255,255,255,0.12)' }),
  }),
  compareRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  arrow: { fontSize: 18, color: '#CFA529' },
  toast: (visible) => ({
    position: 'fixed', bottom: 24, right: 24, background: 'rgba(76,175,80,0.95)', color: '#fff', padding: '12px 20px', borderRadius: 8,
    fontSize: 13, zIndex: 9999, transition: 'all 0.3s', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  }),
  divider: { borderTop: '1px solid rgba(255,255,255,0.06)', margin: '14px 0' },
  internalNote: { background: 'rgba(239,83,80,0.08)', border: '1px solid rgba(239,83,80,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#ef9a9a', marginBottom: 16, lineHeight: 1.5 },
  statusDropdown: { position: 'relative', display: 'inline-block' },
  miniGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 },
  miniCell: { background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' },
  miniLabel: { fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(232,232,240,0.35)', marginBottom: 2 },
  miniValue: { fontSize: 13, color: '#CFA529' },
  miniSub: { fontSize: 10, color: 'rgba(232,232,240,0.35)' },
};

const STATUS_COLORS = { analysis: 'teal', priced: 'gold', approved: 'green', enrolled: 'green', completed: 'green', cancelled: 'red' };
const STATUS_OPTIONS = ['analysis', 'priced', 'approved', 'enrolled', 'completed', 'cancelled'];

export default function PricingTab({ a, positions, excludedIds, otherExcludedIds, depositOverrides, agreementResults, enrolledPositions, dealId: externalDealId, setDealId: externalSetDealId }) {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [dealId, setDealIdLocal] = useState(externalDealId || null);
  const setDealId = externalSetDealId || setDealIdLocal;

  const [merchantName, setMerchantName] = useState('');
  const [isoName, setIsoName] = useState('');
  const [isoCommissionPoints, setIsoCommissionPoints] = useState(0);
  const [targetDsr, setTargetDsr] = useState(20);
  const [ffNetMarginWeekly, setFfNetMarginWeekly] = useState(0);
  const [useEW, setUseEW] = useState(false);
  const [dealStatus, setDealStatus] = useState('analysis');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [dealList, setDealList] = useState([]);
  const [showLoadDeal, setShowLoadDeal] = useState(false);
  const [imported, setImported] = useState(false);

  // Per-position EW scores (editable)
  const [ewScores, setEwScores] = useState({});

  // Revenue data (populated from analyzer or loaded deal)
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [monthlyCogs, setMonthlyCogs] = useState(0);
  const [grossProfit, setGrossProfit] = useState(0);
  const [avgDailyBalance, setAvgDailyBalance] = useState(0);
  const [pricingPositions, setPricingPositions] = useState([]);

  // ─── Auto-import on first render ───────────────────────────────────────────
  useEffect(() => {
    if (!imported && a && positions && positions.length > 0) {
      importFromAnalysis();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Import from analysis ──────────────────────────────────────────────────
  const importFromAnalysis = useCallback(() => {
    if (!a) return;

    const calcAdjustedRev = () => {
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
    };

    const rev = calcAdjustedRev();
    const cogs = a.expense_categories?.inventory_cogs || 0;
    const gp = rev - cogs;
    const adb = a.balance_summary?.avg_daily_balance || a.calculated_metrics?.avg_daily_balance || 0;

    setMonthlyRevenue(round2(rev));
    setMonthlyCogs(round2(cogs));
    setGrossProfit(round2(gp));
    setAvgDailyBalance(round2(adb));
    setMerchantName(a.business_name || '');

    // Map positions
    const activePositions = (positions || a.mca_positions || []).filter(
      (p) => !(excludedIds || []).includes(p._id) && p.status !== 'paid_off'
    );

    const mapped = activePositions.map((p) => {
      const freq = (p.frequency || 'weekly').toLowerCase();
      let weeklyPayment = parseFloat(p.payment_amount_current || p.payment_amount) || 0;
      if (freq === 'daily') weeklyPayment = round2(weeklyPayment * 5);
      else if (freq === 'bi-weekly' || freq === 'biweekly') weeklyPayment = round2(weeklyPayment / 2);
      else if (freq === 'monthly') weeklyPayment = round2(weeklyPayment / 4.33);

      const balance = parseFloat(p.estimated_remaining_balance) || parseFloat(p.purchased_amount) || round2(weeklyPayment * 26);

      return {
        _id: p._id,
        funder_name: p.funder_name,
        account_number: p.account_number || '',
        current_weekly_payment: weeklyPayment,
        payment_frequency: p.frequency || 'weekly',
        estimated_balance: balance,
        status: 'active',
        position_type: p.position_type || 'mca',
        specified_percentage: p.specified_receivable_percentage || 0,
        // EW defaults
        enforceability_score: p.funderIntel?.enforceability || 5,
        aggressiveness_score: p.funderIntel?.aggressiveness || 5,
        recovery_stake_score: p.funderIntel?.recoveryStake || 5,
        funder_intel_grade: p.funderIntel?.funderRecord?.lowestGrade || 'C',
      };
    });

    setPricingPositions(mapped);

    // Set EW scores from imported data
    const scores = {};
    mapped.forEach((p) => {
      scores[p._id] = {
        enforceability: p.enforceability_score,
        aggressiveness: p.aggressiveness_score,
        recovery_stake: p.recovery_stake_score,
        grade: p.funder_intel_grade,
      };
    });
    setEwScores(scores);
    setImported(true);
  }, [a, positions, excludedIds, depositOverrides]);

  // ─── Client-side pricing calculation ───────────────────────────────────────
  const pricing = useMemo(() => {
    if (pricingPositions.length === 0 || grossProfit <= 0) return null;

    // Apply EW scores to positions before pricing
    const positionsWithScores = pricingPositions.map((p) => {
      const scores = ewScores[p._id] || {};
      return {
        ...p,
        enforceability_score: scores.enforceability || p.enforceability_score || 5,
        aggressiveness_score: scores.aggressiveness || p.aggressiveness_score || 5,
        recovery_stake_score: scores.recovery_stake || p.recovery_stake_score || 5,
        funder_intel_grade: scores.grade || p.funder_intel_grade || 'C',
      };
    });

    return calculatePricing({
      positions: positionsWithScores,
      grossProfit,
      isoCommissionPoints,
      targetDsr: targetDsr / 100,
      ffNetMarginWeekly,
    });
  }, [pricingPositions, grossProfit, isoCommissionPoints, targetDsr, ffNetMarginWeekly, ewScores]);

  // ─── EW calculation ────────────────────────────────────────────────────────
  const ewData = useMemo(() => {
    if (!useEW || !pricing || pricingPositions.length === 0) return null;
    const positionsWithScores = pricingPositions.map((p) => {
      const scores = ewScores[p._id] || {};
      return {
        ...p,
        enforceability_score: scores.enforceability || 5,
        aggressiveness_score: scores.aggressiveness || 5,
        recovery_stake_score: scores.recovery_stake || 5,
        funder_intel_grade: scores.grade || 'C',
      };
    });
    return calculateEnforceabilityWeighted(positionsWithScores, pricing.tad100);
  }, [useEW, pricing, pricingPositions, ewScores]);

  // ─── Toast helper ──────────────────────────────────────────────────────────
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ─── Save Deal ─────────────────────────────────────────────────────────────
  const saveDeal = async () => {
    setSaving(true);
    try {
      const dealData = {
        merchant_name: merchantName,
        iso_name: isoName,
        iso_commission_points: isoCommissionPoints,
        monthly_revenue: monthlyRevenue,
        monthly_cogs: monthlyCogs,
        gross_profit: grossProfit,
        avg_daily_balance: avgDailyBalance,
        status: dealStatus,
      };

      const posData = pricingPositions.map((p) => ({
        funder_name: p.funder_name,
        account_number: p.account_number,
        current_weekly_payment: p.current_weekly_payment,
        payment_frequency: p.payment_frequency || 'weekly',
        estimated_balance: p.estimated_balance,
        status: p.status || 'active',
        source: 'analyzer',
        enforceability_score: ewScores[p._id]?.enforceability || p.enforceability_score || 5,
        aggressiveness_score: ewScores[p._id]?.aggressiveness || p.aggressiveness_score || 5,
        recovery_stake_score: ewScores[p._id]?.recovery_stake || p.recovery_stake_score || 5,
        funder_intel_grade: ewScores[p._id]?.grade || p.funder_intel_grade || 'C',
      }));

      let res;
      if (dealId) {
        // Update existing deal
        res = await fetch(`/api/deals/${dealId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dealData),
        });
      } else {
        // Create new deal with positions
        res = await fetch('/api/deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...dealData, positions: posData }),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }

      const data = await res.json();
      const newId = data.id || dealId;
      setDealId(newId);
      setDealIdLocal(newId);
      showToast(`Deal saved — ID: ${newId.substring(0, 8)}...`);
      return newId;
    } catch (err) {
      showToast(`Error: ${err.message}`);
      return null;
    } finally {
      setSaving(false);
    }
  };

  // ─── Save & Price ──────────────────────────────────────────────────────────
  const saveAndPrice = async () => {
    setSaving(true);
    try {
      const id = await saveDeal();
      if (!id) return;

      const res = await fetch(`/api/deals/${id}/price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          iso_commission_points: isoCommissionPoints,
          target_dsr: targetDsr / 100,
          ff_net_margin_weekly: ffNetMarginWeekly,
          use_enforceability_weighting: useEW,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Pricing failed');
      }

      const priceData = await res.json();
      if (priceData.status === 'priced') setDealStatus('priced');
      showToast('Deal priced and saved to database');
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Load Deal ─────────────────────────────────────────────────────────────
  const fetchDealList = async () => {
    setLoadingDeals(true);
    try {
      const res = await fetch('/api/deals');
      if (res.ok) {
        const data = await res.json();
        setDealList(data);
      }
    } catch (err) {
      console.error('Failed to load deals:', err);
    } finally {
      setLoadingDeals(false);
    }
  };

  const loadDeal = async (id) => {
    try {
      const res = await fetch(`/api/deals/${id}`);
      if (!res.ok) throw new Error('Failed to load deal');
      const deal = await res.json();

      setDealId(deal.id);
      setDealIdLocal(deal.id);
      setMerchantName(deal.merchant_name || '');
      setIsoName(deal.iso_name || '');
      setIsoCommissionPoints(deal.iso_commission_points || 0);
      setMonthlyRevenue(deal.monthly_revenue || 0);
      setMonthlyCogs(deal.monthly_cogs || 0);
      setGrossProfit(deal.gross_profit || 0);
      setAvgDailyBalance(deal.avg_daily_balance || 0);
      setDealStatus(deal.status || 'analysis');

      // Map positions
      const mapped = (deal.positions || []).filter(
        (p) => p.status === 'active' || p.status === 'negotiating' || p.status === 'agreed'
      ).map((p) => ({
        _id: p.id,
        id: p.id,
        funder_name: p.funder_name,
        account_number: p.account_number || '',
        current_weekly_payment: parseFloat(p.current_weekly_payment) || 0,
        payment_frequency: p.payment_frequency || 'weekly',
        estimated_balance: parseFloat(p.estimated_balance) || 0,
        status: p.status || 'active',
        position_type: p.position_type || 'mca',
        enforceability_score: p.enforceability_score || 5,
        aggressiveness_score: p.aggressiveness_score || 5,
        recovery_stake_score: p.recovery_stake_score || 5,
        funder_intel_grade: p.funder_intel_grade || 'C',
      }));

      setPricingPositions(mapped);

      const scores = {};
      mapped.forEach((p) => {
        scores[p._id] = {
          enforceability: p.enforceability_score,
          aggressiveness: p.aggressiveness_score,
          recovery_stake: p.recovery_stake_score,
          grade: p.funder_intel_grade,
        };
      });
      setEwScores(scores);

      setShowLoadDeal(false);
      setImported(true);
      showToast(`Loaded: ${deal.merchant_name}`);
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  // ─── Change Deal Status ────────────────────────────────────────────────────
  const changeDealStatus = async (newStatus) => {
    setDealStatus(newStatus);
    setShowStatusDropdown(false);
    if (dealId) {
      try {
        await fetch(`/api/deals/${dealId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
      } catch (err) { /* silent */ }
    }
  };

  // ─── Update EW score for a position ────────────────────────────────────────
  const updateEwScore = (posId, field, value) => {
    setEwScores((prev) => ({
      ...prev,
      [posId]: { ...prev[posId], [field]: value },
    }));
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  const hasData = pricingPositions.length > 0 && grossProfit > 0;

  return (
    <div style={PS.container}>
      {/* Toast */}
      <div style={PS.toast(!!toast)}>{toast}</div>

      {/* Deal Status Badge + Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, color: '#CFA529', letterSpacing: 0.5 }}>Pricing Engine</div>
        <div style={PS.statusDropdown}>
          <button
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            style={{ ...PS.badge(STATUS_COLORS[dealStatus] || 'teal'), cursor: 'pointer', border: 'none', fontSize: 11, padding: '4px 14px' }}
          >
            {dealStatus.toUpperCase()} {dealId ? `(${dealId.substring(0, 8)})` : '(unsaved)'}
          </button>
          {showStatusDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, background: 'rgba(20,20,30,0.98)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 4, zIndex: 100, minWidth: 140, marginTop: 4 }}>
              {STATUS_OPTIONS.map((s) => (
                <button key={s} onClick={() => changeDealStatus(s)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', background: s === dealStatus ? 'rgba(207,165,41,0.15)' : 'transparent', border: 'none', color: '#e0e0e0', fontSize: 12, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Internal Use Warning */}
      <div style={PS.internalNote}>
        Internal Use Only — TAD percentages and tier labels are NEVER shown on position briefs or funder communications.
      </div>

      {/* A. Merchant Snapshot Bar */}
      <div style={PS.card}>
        <div style={PS.cardTitle}>Merchant Snapshot</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={PS.snapLabel}>Merchant Name</div>
            <input style={PS.input} value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Merchant name" />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={PS.snapLabel}>ISO Name</div>
            <input style={PS.input} value={isoName} onChange={(e) => setIsoName(e.target.value)} placeholder="ISO / Referral partner" />
          </div>
        </div>
        <div style={PS.snapGrid}>
          <div style={PS.snapStat}>
            <div style={PS.snapLabel}>Monthly Revenue</div>
            <div style={PS.snapValue('#00e5ff')}>{fmt(monthlyRevenue)}</div>
          </div>
          <div style={PS.snapStat}>
            <div style={PS.snapLabel}>Gross Profit</div>
            <div style={PS.snapValue('#81c784')}>{fmt(grossProfit)}</div>
          </div>
          <div style={PS.snapStat}>
            <div style={PS.snapLabel}>Avg Daily Balance</div>
            <div style={PS.snapValue()}>{fmt(avgDailyBalance)}</div>
          </div>
          <div style={PS.snapStat}>
            <div style={PS.snapLabel}>Current DSR</div>
            <div style={PS.snapValue(pricing?.currentDsr > 35 ? '#ef9a9a' : pricing?.currentDsr > 25 ? '#ffd54f' : '#81c784')}>
              {pricing ? fmtP(pricing.currentDsr) : '—'}
            </div>
          </div>
          <div style={PS.snapStat}>
            <div style={PS.snapLabel}>Active Positions</div>
            <div style={PS.snapValue('#CFA529')}>{pricingPositions.length}</div>
          </div>
          <div style={PS.snapStat}>
            <div style={PS.snapLabel}>Weekly Burden</div>
            <div style={PS.snapValue('#ef9a9a')}>{pricing ? fmtD(pricing.totalWeeklyBurden) : '—'}</div>
          </div>
        </div>
      </div>

      {/* B. Deal Controls */}
      <div style={PS.card}>
        <div style={PS.cardTitle}>Deal Controls</div>
        <div style={PS.row}>
          <div style={PS.sliderGroup}>
            <div style={PS.sliderLabel}>
              <span>ISO Commission Points</span>
              <span style={{ color: '#CFA529' }}>{isoCommissionPoints} pts</span>
            </div>
            <input type="range" min="0" max="15" step="0.5" value={isoCommissionPoints} onChange={(e) => setIsoCommissionPoints(parseFloat(e.target.value))} style={PS.slider} />
          </div>
          <div style={PS.sliderGroup}>
            <div style={PS.sliderLabel}>
              <span>Target DSR</span>
              <span style={{ color: '#CFA529' }}>{targetDsr}%</span>
            </div>
            <input type="range" min="10" max="35" step="1" value={targetDsr} onChange={(e) => setTargetDsr(parseInt(e.target.value))} style={PS.slider} />
          </div>
        </div>
        <div style={PS.row}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={PS.sliderLabel}><span>FF Net Margin / Week ($)</span></div>
            <input type="number" style={PS.input} value={ffNetMarginWeekly} onChange={(e) => setFfNetMarginWeekly(parseFloat(e.target.value) || 0)} placeholder="0.00" />
          </div>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
            <label style={PS.checkbox}>
              <input type="checkbox" checked={useEW} onChange={(e) => setUseEW(e.target.checked)} />
              Enable Enforceability Weighting
            </label>
          </div>
        </div>
      </div>

      {/* C. Pricing Summary */}
      {pricing && (
        <div style={PS.goldCard}>
          <div style={{ ...PS.cardTitle, color: 'rgba(207,165,41,0.7)' }}>Pricing Summary</div>

          {/* Before → After */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(239,83,80,0.7)', marginBottom: 4 }}>Current Weekly Burden</div>
              <div style={{ fontSize: 26, color: '#ef9a9a' }}>{fmtD(pricing.totalWeeklyBurden)}</div>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>DSR: {fmtP(pricing.currentDsr)}</div>
            </div>
            <div style={PS.arrow}>→</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(76,175,80,0.7)', marginBottom: 4 }}>Merchant Pays FF</div>
              <div style={{ fontSize: 26, color: '#81c784' }}>{fmtD(pricing.merchantWeeklyPayment)}</div>
              <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)' }}>DSR: {fmtP(pricing.proposedDsr)}</div>
            </div>
          </div>

          <div style={PS.divider} />

          {/* Breakdown Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div style={PS.snapStat}>
              <div style={PS.snapLabel}>TAD to Funders/wk</div>
              <div style={PS.snapValue('#CFA529')}>{fmtD(pricing.tad100)}</div>
            </div>
            <div style={PS.snapStat}>
              <div style={PS.snapLabel}>+ ISO Commission/wk</div>
              <div style={PS.snapValue()}>{fmtD(pricing.isoWeeklyCommission)}</div>
            </div>
            <div style={PS.snapStat}>
              <div style={PS.snapLabel}>+ FF Margin/wk</div>
              <div style={PS.snapValue()}>{fmtD(ffNetMarginWeekly)}</div>
            </div>
            <div style={PS.snapStat}>
              <div style={PS.snapLabel}>ISO Commission Total</div>
              <div style={PS.snapValue()}>{fmtD(pricing.isoCommissionTotal)}</div>
            </div>
            <div style={PS.snapStat}>
              <div style={PS.snapLabel}>Max Term</div>
              <div style={PS.snapValue('#CFA529')}>{pricing.maxTermWeeks} wks</div>
              <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)' }}>~{Math.round(pricing.maxTermWeeks / 4.33)} months</div>
            </div>
            <div style={PS.snapStat}>
              <div style={PS.snapLabel}>Eff. Factor Rate</div>
              <div style={PS.snapValue()}>{pricing.effectiveFactorRate.toFixed(3)}</div>
            </div>
            <div style={PS.snapStat}>
              <div style={PS.snapLabel}>Payment Reduction</div>
              <div style={PS.snapValue(pricing.paymentReductionPct > 0 ? '#81c784' : '#ef9a9a')}>
                {pricing.paymentReductionPct > 0 ? '↓ ' : ''}{fmtP(pricing.paymentReductionPct)}
              </div>
            </div>
            <div style={PS.snapStat}>
              <div style={PS.snapLabel}>Total Debt</div>
              <div style={PS.snapValue()}>{fmt(pricing.totalDebt)}</div>
            </div>
          </div>
        </div>
      )}

      {/* D. Offer Tier Grid */}
      {pricing && (
        <div style={PS.card}>
          <div style={PS.cardTitle}>Offer Tiers</div>
          <div style={PS.tierGrid}>
            <div style={PS.tierCard(false)}>
              <div style={PS.tierLabel}>Opening (80%)</div>
              <div style={PS.tierValue}>{fmtD(pricing.tad80)}</div>
              <div style={PS.tierSub}>to funders/wk</div>
            </div>
            <div style={PS.tierCard(false)}>
              <div style={PS.tierLabel}>Middle 1 (90%)</div>
              <div style={PS.tierValue}>{fmtD(pricing.tad90)}</div>
              <div style={PS.tierSub}>to funders/wk</div>
            </div>
            <div style={PS.tierCard(false)}>
              <div style={PS.tierLabel}>Middle 2 (95%)</div>
              <div style={PS.tierValue}>{fmtD(pricing.tad95)}</div>
              <div style={PS.tierSub}>to funders/wk</div>
            </div>
            <div style={PS.tierCard(true)}>
              <div style={PS.tierLabel}>Final (100%)</div>
              <div style={PS.tierValue}>{fmtD(pricing.tad100)}</div>
              <div style={PS.tierSub}>to funders/wk</div>
            </div>
          </div>
        </div>
      )}

      {/* E. Per-Position Breakdown Cards */}
      {pricing && pricing.positionBreakdowns.length > 0 && (
        <div style={PS.card}>
          <div style={PS.cardTitle}>Per-Position Breakdown</div>
          {pricing.positionBreakdowns.map((pb, idx) => {
            const pos = pricingPositions.find((p) => (p.id || p._id) === pb.position_id);
            const ewEntry = ewData?.find((e) => e.position_id === pb.position_id);
            const posId = pb.position_id;
            const scores = ewScores[posId] || {};

            return (
              <div key={posId || idx} style={PS.posCard}>
                <div style={PS.posHeader}>
                  <div>
                    <span style={PS.posName}>{pb.funder_name}</span>
                    {pb.account_number && <span style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)', marginLeft: 10 }}>#{pb.account_number}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'rgba(232,232,240,0.4)' }}>{fmtP(pb.funder_share_pct)} share</span>
                    <span style={PS.badge(STATUS_COLORS[pos?.status] || 'teal')}>{pos?.status || 'active'}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 8 }}>
                  <div><span style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)' }}>Balance</span><div style={{ fontSize: 14, color: '#e0e0e0' }}>{fmtD(pb.estimated_balance)}</div></div>
                  <div><span style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)' }}>Current Weekly</span><div style={{ fontSize: 14, color: '#ef9a9a' }}>{fmtD(pb.current_weekly_payment)}</div></div>
                  {ewEntry && <div><span style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)' }}>EW Payment</span><div style={{ fontSize: 14, color: '#CFA529' }}>{fmtD(ewEntry.ew_adjusted_payment)}</div></div>}
                  {ewEntry && <div><span style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)' }}>EW Share</span><div style={{ fontSize: 14, color: '#CFA529' }}>{fmtP(ewEntry.ew_adjusted_share)}</div></div>}
                </div>

                {/* 4-column tier mini-grid */}
                <div style={PS.miniGrid}>
                  <div style={PS.miniCell}>
                    <div style={PS.miniLabel}>Opening</div>
                    <div style={PS.miniValue}>{fmtD(pb.opening_payment)}</div>
                    <div style={PS.miniSub}>{pb.opening_term_weeks} wks</div>
                  </div>
                  <div style={PS.miniCell}>
                    <div style={PS.miniLabel}>Mid 1</div>
                    <div style={PS.miniValue}>{fmtD(pb.middle1_payment)}</div>
                    <div style={PS.miniSub}>{pb.middle1_term_weeks} wks</div>
                  </div>
                  <div style={PS.miniCell}>
                    <div style={PS.miniLabel}>Mid 2</div>
                    <div style={PS.miniValue}>{fmtD(pb.middle2_payment)}</div>
                    <div style={PS.miniSub}>{pb.middle2_term_weeks} wks</div>
                  </div>
                  <div style={PS.miniCell}>
                    <div style={PS.miniLabel}>Final</div>
                    <div style={PS.miniValue}>{fmtD(pb.final_payment)}</div>
                    <div style={PS.miniSub}>{pb.final_term_weeks} wks</div>
                  </div>
                </div>

                {/* EW Scoring inputs (only when enabled) */}
                {useEW && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(207,165,41,0.04)', borderRadius: 8, border: '1px solid rgba(207,165,41,0.1)' }}>
                    <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(207,165,41,0.5)', marginBottom: 8 }}>Three-Axis Scoring</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 2 }}>Enforceability</div>
                        <select style={PS.select} value={scores.enforceability || 5} onChange={(e) => updateEwScore(posId, 'enforceability', parseInt(e.target.value))}>
                          {[1,2,3,4,5,6,7,8,9,10].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 2 }}>Aggressiveness</div>
                        <select style={PS.select} value={scores.aggressiveness || 5} onChange={(e) => updateEwScore(posId, 'aggressiveness', parseInt(e.target.value))}>
                          {[1,2,3,4,5,6,7,8,9,10].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 2 }}>Recovery Stake</div>
                        <select style={PS.select} value={scores.recovery_stake || 5} onChange={(e) => updateEwScore(posId, 'recovery_stake', parseInt(e.target.value))}>
                          {[1,2,3,4,5,6,7,8,9,10].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'rgba(232,232,240,0.4)', marginBottom: 2 }}>Intel Grade</div>
                        <select style={PS.select} value={scores.grade || 'C'} onChange={(e) => updateEwScore(posId, 'grade', e.target.value)}>
                          {['A', 'B', 'C', 'D', 'F'].map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                    </div>
                    {ewEntry && (
                      <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(207,165,41,0.6)' }}>
                        Composite: {ewEntry.composite_score?.toFixed(2)} | Base Share: {fmtP(ewEntry.base_share)} | EW Share: {fmtP(ewEntry.ew_adjusted_share)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No data state */}
      {!hasData && !dealId && (
        <div style={{ ...PS.card, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
          <div style={{ fontSize: 15, color: '#e0e0e0', marginBottom: 8 }}>No pricing data yet</div>
          <div style={{ fontSize: 13, color: 'rgba(232,232,240,0.5)', marginBottom: 16 }}>
            {a && positions?.length > 0
              ? 'Click "Import from Analysis" to pull in your current analyzer data.'
              : 'Upload and analyze a bank statement first, or load a saved deal.'}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            {a && positions?.length > 0 && (
              <button style={PS.btn('gold')} onClick={importFromAnalysis}>Import from Analysis</button>
            )}
            <button style={PS.btn('secondary')} onClick={() => { fetchDealList(); setShowLoadDeal(true); }}>Load Saved Deal</button>
          </div>
        </div>
      )}

      {/* F. Deal Actions Bar */}
      <div style={{ ...PS.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={PS.btn('secondary')} onClick={importFromAnalysis} disabled={!a || !positions?.length}>
          Import from Analysis
        </button>
        <button style={PS.btn('secondary')} onClick={saveDeal} disabled={saving || !hasData}>
          {saving ? 'Saving...' : dealId ? 'Update Deal' : 'Save Deal'}
        </button>
        <button style={PS.btn('gold')} onClick={saveAndPrice} disabled={saving || !hasData}>
          {saving ? 'Processing...' : 'Save & Price'}
        </button>
        <button style={PS.btn('secondary')} onClick={() => { fetchDealList(); setShowLoadDeal(true); }}>
          Load Deal
        </button>
        <div style={{ flex: 1 }} />
        {dealId && <span style={{ fontSize: 11, color: 'rgba(232,232,240,0.35)' }}>Deal: {dealId.substring(0, 8)}...</span>}
      </div>

      {/* Load Deal Modal */}
      {showLoadDeal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowLoadDeal(false)}>
          <div style={{ background: '#14141e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 24, width: '90%', maxWidth: 500, maxHeight: '60vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, color: '#CFA529', marginBottom: 16 }}>Load Saved Deal</div>
            {loadingDeals && <div style={{ color: 'rgba(232,232,240,0.5)', fontSize: 13 }}>Loading...</div>}
            {!loadingDeals && dealList.length === 0 && <div style={{ color: 'rgba(232,232,240,0.5)', fontSize: 13 }}>No saved deals found.</div>}
            {dealList.map((d) => (
              <button
                key={d.id}
                onClick={() => loadDeal(d.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, marginBottom: 6, cursor: 'pointer', color: '#e0e0e0', fontFamily: 'inherit' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14 }}>{d.merchant_name || 'Unnamed Deal'}</span>
                  <span style={PS.badge(STATUS_COLORS[d.status] || 'teal')}>{d.status}</span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(232,232,240,0.4)', marginTop: 4 }}>
                  {d.position_count || 0} positions | {d.total_balance ? fmt(d.total_balance) : '—'} debt | {d.iso_name || 'No ISO'}
                </div>
              </button>
            ))}
            <button style={{ ...PS.btn('secondary'), marginTop: 10, width: '100%' }} onClick={() => setShowLoadDeal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

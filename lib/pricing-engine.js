// ─── Pricing Engine ─────────────────────────────────────────────────────────
// Pure JavaScript module — works in both Node.js (API routes) and browser (UI).
// No server dependencies. All money values rounded to 2 decimal places.

const round2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;

/**
 * Calculate linear ISO commission rate based on points
 * 1% per point, capped at 15 points
 *
 * @param {number} points - Integer from 0 to 15
 * @returns {number} - Total commission rate as decimal (e.g., 0.10 for 10 points)
 */
export function getGraduatedCommissionRate(points) {
  if (points <= 0) return 0;
  if (points > 15) points = 15;
  return points * 0.01; // Linear: 1% per point
}

/**
 * Calculate tier allocations with locked position carve-out.
 *
 * Locked positions get their fixed payment at every tier.
 * Remaining TAD is distributed proportionally (or EW-weighted) among unlocked positions.
 *
 * @param {Array}  positions    — deduped positions with _balance, _totalWeekly, locked status
 * @param {number} tadAt100     — TAD at 100% tier
 * @param {Array}  tierPcts     — tier percentages [0.80, 0.90, 0.95, 1.00]
 * @param {Object} opts         — { enforcementWeighting, scoreMap }
 * @returns {Object} { funderTiers, warnings }
 */
export function calculateTierAllocations(positions, tadAt100, tierPcts, opts = {}) {
  const { enforcementWeighting = false, scoreMap = {} } = opts;

  const locked = positions.filter(p => p._isLocked && p._lockedPayment > 0);
  const unlocked = positions.filter(p => !p._isLocked || !p._lockedPayment);
  const totalLocked = locked.reduce((sum, p) => sum + p._lockedPayment, 0);

  const warnings = [];
  if (totalLocked > tadAt100) {
    warnings.push({ level: 'critical', message: 'Locked payments exceed available TAD — deal is over-capacity' });
  } else if (totalLocked > tadAt100 * 0.80) {
    warnings.push({ level: 'warning', message: 'Locked payments exceed Opening tier TAD — limited negotiation room' });
  }

  // Compute unlocked shares (proportional or EW-weighted)
  const totalUnlockedWeekly = unlocked.reduce((sum, p) => sum + (p._effectiveWeekly || p._totalWeekly), 0);
  const totalUnlockedBalance = unlocked.reduce((sum, p) => sum + p._balance, 0);

  // If EW enabled, compute composite-based shares
  let unlockedShares;
  if (enforcementWeighting && Object.keys(scoreMap).length > 0) {
    const totalComposite = unlocked.reduce((sum, p) => {
      const key = normKey(p.funder_name);
      return sum + (scoreMap[key]?.composite || 5);
    }, 0);

    unlockedShares = unlocked.map(p => {
      const key = normKey(p.funder_name);
      const intel = scoreMap[key];
      const effectiveW = p._effectiveWeekly || p._totalWeekly;
      const baseShare = totalUnlockedWeekly > 0 ? effectiveW / totalUnlockedWeekly : 0;
      const normalizedScore = totalComposite > 0 ? (intel?.composite || 5) / totalComposite : 0;
      let adjustedShare = (baseShare * 0.60) + (normalizedScore * 0.40);

      // Override: D-grade funder with recovery_stake >= 7: +7.5%
      const grade = (intel?.funderRecord?.lowestGrade || '').toUpperCase();
      const rs = intel?.recoveryStake || 5;
      if (grade === 'D' && rs >= 7) adjustedShare += 0.075;

      // Override: Reverse MCA: -17.5%
      const posType = (p.position_type || p.source_type || '').toLowerCase();
      if (posType === 'reverse_mca' || posType === 'reverse mca') {
        adjustedShare -= 0.175;
        if (adjustedShare < 0) adjustedShare = 0.01;
      }

      return { position: p, adjustedShare };
    });

    // Normalize so shares sum to 1
    const totalShares = unlockedShares.reduce((s, us) => s + us.adjustedShare, 0);
    if (totalShares > 0) {
      unlockedShares = unlockedShares.map(us => ({
        ...us,
        adjustedShare: us.adjustedShare / totalShares,
      }));
    }
  } else {
    // Simple proportional by weekly burden
    unlockedShares = unlocked.map(p => ({
      position: p,
      adjustedShare: totalUnlockedWeekly > 0 ? (p._effectiveWeekly || p._totalWeekly) / totalUnlockedWeekly : 0,
    }));
  }

  const funderTiers = [];

  // Locked positions — same payment at every tier
  locked.forEach(p => {
    const payment = p._lockedPayment;
    const termWeeks = payment > 0 ? Math.ceil(p._balance / payment) : 9999;
    const origTermWeeks = p._effectiveWeekly > 0 ? Math.ceil(p._balance / p._effectiveWeekly) : 52;

    const tiers = tierPcts.map((pct, i) => ({
      pct,
      weeklyPayment: payment,
      proposedTermWeeks: termWeeks,
      extensionWeeks: termWeeks - origTermWeeks,
      extensionPct: origTermWeeks > 0 ? ((termWeeks / origTermWeeks) - 1) * 100 : 0,
      reductionDollars: p._effectiveWeekly - payment,
      reductionPct: p._effectiveWeekly > 0 ? ((p._effectiveWeekly - payment) / p._effectiveWeekly) * 100 : 0,
      allocation: payment,
      isLocked: true,
    }));

    funderTiers.push({
      ...p,
      tiers,
      originalTermWeeks: origTermWeeks,
      isLocked: true,
      lockedPayment: payment,
    });
  });

  // Unlocked positions — tier-based allocation from remaining TAD
  unlockedShares.forEach(({ position: p, adjustedShare }) => {
    const origTermWeeks = p._effectiveWeekly > 0 ? Math.ceil(p._balance / p._effectiveWeekly) : 52;

    const tiers = tierPcts.map((pct, i) => {
      const tierTAD = tadAt100 * pct;
      const remaining = Math.max(0, tierTAD - totalLocked);
      const allocation = remaining * adjustedShare;
      const proposedTermWeeks = allocation > 0 ? Math.ceil(p._balance / allocation) : 9999;
      const weeklyPayment = allocation;
      return {
        pct,
        weeklyPayment,
        proposedTermWeeks,
        extensionWeeks: proposedTermWeeks - origTermWeeks,
        extensionPct: origTermWeeks > 0 ? ((proposedTermWeeks / origTermWeeks) - 1) * 100 : 0,
        reductionDollars: p._effectiveWeekly - weeklyPayment,
        reductionPct: p._effectiveWeekly > 0 ? ((p._effectiveWeekly - weeklyPayment) / p._effectiveWeekly) * 100 : 0,
        allocation: weeklyPayment,
        isLocked: false,
      };
    });

    funderTiers.push({
      ...p,
      tiers,
      originalTermWeeks: origTermWeeks,
      adjustedShare,
      isLocked: false,
    });
  });

  return { funderTiers, warnings, totalLocked };
}

/**
 * Main pricing calculation.
 *
 * @param {Object} opts
 * @param {Array}  opts.positions            — active MCA positions
 * @param {number} opts.grossProfit          — monthly gross profit (revenue - COGS)
 * @param {number} opts.isoCommissionPoints  — 0–15
 * @param {number} opts.targetDsr            — decimal, e.g. 0.20 for 20%
 * @param {number} opts.ffNetMarginWeekly    — FF weekly net margin $
 * @returns {Object} full pricing breakdown
 */
export function calculatePricing({
  positions = [],
  grossProfit = 0,
  isoCommissionPoints = 0,
  targetDsr = 0.20,
  ffNetMarginWeekly = 0,
}) {
  const activePositions = positions.filter(
    (p) => p.status === 'active' || p.status === 'negotiating' || p.status === 'agreed'
  );

  // STEP 1: Sustainable Weekly Capacity
  const grossProfitWeekly = round2(grossProfit / 4.33);
  const tad100 = round2(grossProfitWeekly * targetDsr);

  // STEP 2: Four Offer Tiers
  const tad80 = round2(tad100 * 0.80);
  const tad90 = round2(tad100 * 0.90);
  const tad95 = round2(tad100 * 0.95);

  // Total current weekly burden across all active positions
  const totalWeeklyBurden = round2(
    activePositions.reduce((sum, p) => {
      const weekly = normalizeToWeekly(p);
      return sum + weekly;
    }, 0)
  );

  // Total debt (sum of balances)
  const totalDebt = round2(
    activePositions.reduce((sum, p) => sum + (parseFloat(p.estimated_balance) || 0), 0)
  );

  // STEP 3: Proportional Allocation Per Funder
  const positionBreakdowns = activePositions.map((p) => {
    const weeklyPayment = normalizeToWeekly(p);
    const balance = parseFloat(p.estimated_balance) || 0;
    const funderShare = totalWeeklyBurden > 0 ? weeklyPayment / totalWeeklyBurden : 0;

    const openingPayment = round2(tad80 * funderShare);
    const middle1Payment = round2(tad90 * funderShare);
    const middle2Payment = round2(tad95 * funderShare);
    const finalPayment = round2(tad100 * funderShare);

    const openingTermWeeks = openingPayment > 0 ? Math.ceil(balance / openingPayment) : 0;
    const middle1TermWeeks = middle1Payment > 0 ? Math.ceil(balance / middle1Payment) : 0;
    const middle2TermWeeks = middle2Payment > 0 ? Math.ceil(balance / middle2Payment) : 0;
    const finalTermWeeks = finalPayment > 0 ? Math.ceil(balance / finalPayment) : 0;

    return {
      position_id: p.id || p._id,
      funder_name: p.funder_name,
      account_number: p.account_number || '',
      estimated_balance: round2(balance),
      current_weekly_payment: round2(weeklyPayment),
      funder_share_pct: round2(funderShare * 100),
      opening_payment: openingPayment,
      middle1_payment: middle1Payment,
      middle2_payment: middle2Payment,
      final_payment: finalPayment,
      opening_term_weeks: openingTermWeeks,
      middle1_term_weeks: middle1TermWeeks,
      middle2_term_weeks: middle2TermWeeks,
      final_term_weeks: finalTermWeeks,
    };
  });

  // STEP 4: ISO Commission (graduated)
  const isoCommissionRate = getGraduatedCommissionRate(isoCommissionPoints);
  const isoCommissionTotal = round2(totalDebt * isoCommissionRate);
  const maxTermWeeks = Math.max(
    ...positionBreakdowns.map((p) => p.middle1_term_weeks),
    1 // avoid division by zero
  );
  const isoWeeklyCommission = round2(isoCommissionTotal / maxTermWeeks);

  // STEP 5: FF Fee & Merchant Payment
  const ffWeeklyFee = round2(isoWeeklyCommission + ffNetMarginWeekly);
  const merchantWeeklyPayment = round2(tad100 + ffWeeklyFee);

  // STEP 6: Factor Rate & Reduction
  const totalMerchantCost = round2(merchantWeeklyPayment * maxTermWeeks);
  const effectiveFactorRate = totalDebt > 0 ? round2((totalMerchantCost / totalDebt) * 1000) / 1000 : 0;
  const paymentReductionPct = totalWeeklyBurden > 0
    ? round2(((totalWeeklyBurden - merchantWeeklyPayment) / totalWeeklyBurden) * 100)
    : 0;
  const proposedDsr = grossProfitWeekly > 0
    ? round2((merchantWeeklyPayment / grossProfitWeekly) * 100)
    : 0;
  const currentDsr = grossProfitWeekly > 0
    ? round2((totalWeeklyBurden / grossProfitWeekly) * 100)
    : 0;

  return {
    // Inputs echo
    grossProfit: round2(grossProfit),
    grossProfitWeekly,
    targetDsr: round2(targetDsr * 100),
    isoCommissionPoints: round2(isoCommissionPoints),
    ffNetMarginWeekly: round2(ffNetMarginWeekly),

    // TAD tiers
    tad100,
    tad80,
    tad90,
    tad95,

    // Totals
    totalWeeklyBurden,
    totalDebt,
    positionCount: activePositions.length,

    // ISO (graduated)
    isoCommissionRate,
    isoCommissionTotal,
    isoWeeklyCommission,
    maxTermWeeks,

    // Merchant
    ffWeeklyFee,
    merchantWeeklyPayment,
    totalMerchantCost,
    effectiveFactorRate,
    paymentReductionPct,
    proposedDsr,
    currentDsr,

    // Per-position
    positionBreakdowns,
  };
}

/**
 * Enforceability-Weighted TAD allocation.
 *
 * @param {Array}  positions — with enforceability_score, aggressiveness_score, recovery_stake_score, funder_intel_grade
 * @param {number} tadAmount — the TAD total to distribute
 * @returns {Array} positions with ew_* fields attached
 */
export function calculateEnforceabilityWeighted(positions, tadAmount) {
  if (!positions || positions.length === 0) return [];

  const activePositions = positions.filter(
    (p) => p.status === 'active' || p.status === 'negotiating' || p.status === 'agreed'
  );

  const totalWeeklyBurden = activePositions.reduce((sum, p) => sum + normalizeToWeekly(p), 0);

  // Calculate composite scores
  const withComposites = activePositions.map((p) => {
    const enforceability = parseFloat(p.enforceability_score) || 5;
    const aggressiveness = parseFloat(p.aggressiveness_score) || 5;
    const recoveryStake = parseFloat(p.recovery_stake_score) || 5;
    const composite = round2(
      (enforceability * 0.35) + (aggressiveness * 0.40) + (recoveryStake * 0.25)
    );
    return { ...p, _composite: composite };
  });

  const sumComposites = withComposites.reduce((s, p) => s + p._composite, 0);

  return withComposites.map((p) => {
    const weeklyPayment = normalizeToWeekly(p);
    const baseShare = totalWeeklyBurden > 0 ? weeklyPayment / totalWeeklyBurden : 0;
    const normalizedScore = sumComposites > 0 ? p._composite / sumComposites : 0;

    let adjustedShare = (baseShare * 0.60) + (normalizedScore * 0.40);

    // Override: D-grade funder with recovery_stake >= 7 → +7.5%
    const grade = (p.funder_intel_grade || '').toUpperCase();
    const recoveryStake = parseFloat(p.recovery_stake_score) || 5;
    if (grade === 'D' && recoveryStake >= 7) {
      adjustedShare += 0.075;
    }

    // Override: Reverse MCA → -17.5%
    const posType = (p.position_type || p.source_type || '').toLowerCase();
    if (posType === 'reverse_mca' || posType === 'reverse mca') {
      adjustedShare -= 0.175;
      if (adjustedShare < 0) adjustedShare = 0.01; // floor at 1%
    }

    const adjustedPayment = round2(tadAmount * adjustedShare);

    return {
      position_id: p.id || p._id,
      funder_name: p.funder_name,
      composite_score: p._composite,
      base_share: round2(baseShare * 100),
      ew_adjusted_share: round2(adjustedShare * 100),
      ew_adjusted_payment: adjustedPayment,
    };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize any payment frequency to a weekly amount.
 */
function normalizeToWeekly(position) {
  const freq = (position.payment_frequency || position.frequency || 'weekly').toLowerCase();
  const amount = parseFloat(position.current_weekly_payment || position.payment_amount_current || position.payment_amount || position.weekly_payment || 0);

  if (freq === 'daily') return round2(amount * 5);
  if (freq === 'bi-weekly' || freq === 'biweekly') return round2(amount / 2);
  if (freq === 'monthly') return round2(amount / 4.33);
  return round2(amount); // weekly default
}

/**
 * Normalize funder key for matching
 */
function normKey(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/advance\d*|position[a-z]?|pos[a-z]?/g, '').trim();
}

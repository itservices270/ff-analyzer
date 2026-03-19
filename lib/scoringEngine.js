// ─── Three-Axis Funder Intelligence Scoring Engine ───────────────────────────
// Evaluates each funder across:
// 1. Enforceability (legal leverage)
// 2. Aggressiveness (collection behavior)
// 3. Recovery Stake (financial exposure)
// Outputs composite score, quadrant, and recommended strategy.

import { matchFunder } from './funderDatabase.js';

// ─── Axis 1: Enforceability Score (1-10) ────────────────────────────────────
export function calculateEnforceabilityScore(position, agreement) {
  let score = 5; // base

  // Agreement-based adjustments (if agreement uploaded)
  if (agreement) {
    if (position.lienPosition === 1) score += 2;
    if (agreement.coj_clause && !agreement.coj_unenforceable) score += 2;
    if (agreement.reconciliation_right && !position.reconciliationDenied) score += 1;
    if (!position.antiStackingViolationConfirmed) score += 1;
    if (['NY', 'NJ', 'CT', 'New York', 'New Jersey', 'Connecticut'].includes(agreement.governing_law_state)) score += 1;
    if (agreement.guarantors && agreement.guarantors.length > 0) score += 1;

    // Negative factors
    if (agreement.coj_clause && (agreement.coj_enforceability_note || '').toLowerCase().includes('unenforceable')) score -= 2;
    if (position.antiStackingViolationConfirmed) score -= 2;
    if (agreement.reconciliation_right === false || position.reconciliationDenied) score -= 2;
  } else {
    // No agreement on file — significant reduction
    score -= 2;
  }

  // Position-based factors
  if (position.lienPosition > 1) score -= 1;
  if (position.usuryConcern) score -= 2;

  // Reverse MCA factors
  const posType = (position.position_type || 'mca').toLowerCase();
  if (posType === 'reverse_mca') {
    score -= 1; // partial advance weakens position
    if (position.loanLanguage) score -= 1; // loan language creates usury exposure
  }

  return Math.max(1, Math.min(10, score));
}

// ─── Axis 2: Aggressiveness Score (1-10) ─────────────────────────────────────
export function calculateAggressivenessScore(funderRecord, position) {
  const gradeBaseMap = { 'A': 2, 'B': 4, 'C': 6, 'D': 8 };
  let score = gradeBaseMap[funderRecord.lowestGrade] || 6;

  if (funderRecord.knownLitigationHistory) score += 1;
  if (funderRecord.attorneyOnFile) score += 1;
  if (funderRecord.subThreeYearsOld) score += 1;
  if (funderRecord.noInHouseLegal) score += 1;
  if (funderRecord.isLargeInstitution) score -= 2; // OnDeck-scale patience
  if (funderRecord.softDataMerchReporter) score -= 2;
  if (funderRecord.priorFFRestructure) score -= 1;

  return Math.max(1, Math.min(10, score));
}

// ─── Axis 3: Recovery Stake Score (1-10) ──────────────────────────────────────
export function calculateRecoveryStakeScore(position, funderRecord) {
  const balance = position.remaining_balance || position.estimated_balance || 0;
  let score;

  if (balance < 50000) score = 2;
  else if (balance < 100000) score = 4;
  else if (balance < 200000) score = 6;
  else if (balance < 350000) score = 8;
  else score = 10;

  // Adjust by funder grade (loss capacity)
  const lowestGrade = funderRecord.lowestGrade;
  if (lowestGrade === 'A') score -= 3;
  else if (lowestGrade === 'B') score -= 1;
  else if (lowestGrade === 'D') score += 2;

  // Multiple positions same merchant
  if (position.positionCountSameMerchant > 1) {
    score += (position.positionCountSameMerchant - 1);
  }

  // Reverse MCA past inflection point
  if (position.isReverseMCA && position.pastInflectionPoint) {
    score -= 2;
  }

  return Math.max(1, Math.min(10, score));
}

// ─── Quadrant Classification ─────────────────────────────────────────────────
export function getQuadrant(enforceability, aggressiveness) {
  const highE = enforceability >= 6;
  const highA = aggressiveness >= 6;

  if (highE && highA) return {
    label: "LOCK FIRST",
    color: "red",
    priority: 1,
    description: "Can hurt you AND will try. Pay fairly."
  };
  if (highE && !highA) return {
    label: "LOCK EARLY",
    color: "orange",
    priority: 2,
    description: "Could win but won't chase. Professional treatment, mild compression OK."
  };
  if (!highE && highA) return {
    label: "HIGH DANGER",
    color: "amber",
    priority: 2,
    description: "Most dangerous day-to-day. Move before they act. Show them FF beats collections."
  };
  return {
    label: "LOW URGENCY",
    color: "green",
    priority: 3,
    description: "Last priority. Minimum viable offer."
  };
}

// ─── Composite Score ─────────────────────────────────────────────────────────
export function calculateCompositeScore(enforceability, aggressiveness, recoveryStake) {
  return (enforceability * 0.35) + (aggressiveness * 0.40) + (recoveryStake * 0.25);
}

// ─── Score All Positions ─────────────────────────────────────────────────────
export function scoreAllPositions(positions, agreements = {}) {
  return positions.map(p => {
    const funderRecord = matchFunder(p.funder_name);
    const agreement = agreements[p.funder_name] || agreements[p._id] || null;

    // Count same-funder positions
    const sameFunderCount = positions.filter(other =>
      matchFunder(other.funder_name)?.key === funderRecord.key
    ).length;
    const posWithCounts = { ...p, positionCountSameMerchant: sameFunderCount };

    const enforceability = calculateEnforceabilityScore(posWithCounts, agreement);
    const aggressiveness = calculateAggressivenessScore(funderRecord, posWithCounts);
    const recoveryStake = calculateRecoveryStakeScore(posWithCounts, funderRecord);
    const composite = calculateCompositeScore(enforceability, aggressiveness, recoveryStake);
    const quadrant = getQuadrant(enforceability, aggressiveness);

    return {
      ...p,
      funderIntel: {
        funderRecord,
        enforceability,
        aggressiveness,
        recoveryStake,
        composite,
        quadrant,
        knownBehavior: funderRecord.knownBehavior || []
      }
    };
  }).sort((a, b) => {
    // Sort by priority (1=first), then by composite score desc
    const pDiff = (a.funderIntel.quadrant.priority || 3) - (b.funderIntel.quadrant.priority || 3);
    if (pDiff !== 0) return pDiff;
    return b.funderIntel.composite - a.funderIntel.composite;
  });
}

// ─── Enforceability-Weighted TAD Allocation ──────────────────────────────────
export function calculateAdjustedTAD(positions, TAD) {
  if (!positions || positions.length === 0 || TAD <= 0) return positions;

  const totalBalance = positions.reduce((sum, p) => sum + (p.remaining_balance || p.estimated_balance || 0), 0);
  if (totalBalance <= 0) return positions;

  const totalComposite = positions.reduce((sum, p) => sum + (p.funderIntel?.composite || 5), 0);

  return positions.map(p => {
    const balance = p.remaining_balance || p.estimated_balance || 0;
    const composite = p.funderIntel?.composite || 5;

    const baseShare = balance / totalBalance;
    const normalizedScore = composite / totalComposite;
    const adjustedShare = (baseShare * 0.60) + (normalizedScore * 0.40);
    const adjustedPayment = TAD * adjustedShare;

    return {
      ...p,
      tadAllocation: {
        baseShare: Math.round(baseShare * 10000) / 100,
        adjustedShare: Math.round(adjustedShare * 10000) / 100,
        basePayment: Math.round(TAD * baseShare * 100) / 100,
        adjustedPayment: Math.round(adjustedPayment * 100) / 100
      }
    };
  });
}

// ─── Same-Day Stack Detection ────────────────────────────────────────────────
export function detectSameDayStack(positions) {
  const sameDayPairs = [];

  for (let i = 0; i < positions.length; i++) {
    const dateA = positions[i].advance_deposit_date;
    if (!dateA) continue;

    for (let j = i + 1; j < positions.length; j++) {
      const dateB = positions[j].advance_deposit_date;
      if (!dateB) continue;

      const dA = new Date(dateA);
      const dB = new Date(dateB);
      if (isNaN(dA) || isNaN(dB)) continue;

      const daysDiff = Math.abs(dA - dB) / (1000 * 60 * 60 * 24);

      // Within 2 business days (approx 3 calendar days to account for weekends)
      if (daysDiff <= 3) {
        sameDayPairs.push({
          funderA: positions[i].funder_name,
          funderB: positions[j].funder_name,
          dateA,
          dateB,
          daysDiff: Math.round(daysDiff)
        });
      }
    }
  }

  return sameDayPairs;
}

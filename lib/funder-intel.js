// ─── Funder Intelligence Database ─────────────────────────────────────────────
// Three-axis scoring: Enforceability (1-10), Aggressiveness (1-10), Recovery Stake (calculated)
//
// Enforceability: How legally enforceable is their position?
//   1-3 = Weak (no agreement, COJ unenforceable, recharacterization risk)
//   4-6 = Moderate (standard terms, some compliance gaps)
//   7-10 = Strong (tight contracts, active litigation history)
//
// Aggressiveness: How operationally disruptive will they be?
//   1-3 = Patient (institutional, loss-reserved, professional)
//   4-6 = Moderate (will push but negotiable)
//   7-10 = Aggressive (UCC threats, rapid litigation, harassment)
//
// Recovery Stake: Calculated from balance
//   Under $50K = 3, $50K-$100K = 5, $100K-$200K = 7, Over $200K = 9, Over $500K = 10
//
// Weights: Enforceability x 0.35 + Aggressiveness x 0.40 + Recovery Stake x 0.25

export const FUNDER_INTEL_DB = {
  // ── A-Tier: Institutional ──────────────────────────────────────────────────
  ondeck: {
    display_name: 'OnDeck Capital',
    grade: 'A-B',
    tier: 'a_tier',
    enforceability: 7,
    aggressiveness: 4,
    notes: 'Professional, institutional. Easy to negotiate. Email 1-2 typically sufficient.',
    match_patterns: ['ondeck', 'on deck', 'ondeck capital'],
  },
  credibly: {
    display_name: 'Credibly',
    grade: 'A-B',
    tier: 'a_tier',
    enforceability: 7,
    aggressiveness: 3,
    notes: 'Institutional, patient. Low urgency.',
    match_patterns: ['credibly'],
  },
  kapitus: {
    display_name: 'Kapitus',
    grade: 'A-B',
    tier: 'a_tier',
    enforceability: 7,
    aggressiveness: 4,
    notes: 'Institutional. Professional engagement.',
    match_patterns: ['kapitus'],
  },
  national_funding: {
    display_name: 'National Funding',
    grade: 'A-B',
    tier: 'a_tier',
    enforceability: 7,
    aggressiveness: 3,
    notes: 'Investor agreements may prohibit working with restructuring — expect ~1 month to engage. Syndicated positions need investor approval.',
    match_patterns: ['national funding'],
  },
  can_capital: {
    display_name: 'CAN Capital',
    grade: 'A-B',
    tier: 'a_tier',
    enforceability: 7,
    aggressiveness: 3,
    notes: 'Institutional. Professional.',
    match_patterns: ['can capital'],
  },
  rapid_finance: {
    display_name: 'Rapid Finance',
    grade: 'A-B',
    tier: 'a_tier',
    enforceability: 7,
    aggressiveness: 4,
    notes: 'ACH descriptor: RBFS. Professional.',
    match_patterns: ['rapid finance', 'rbfs'],
  },
  paypal_capital: {
    display_name: 'PayPal Capital',
    grade: 'A-B',
    tier: 'a_tier',
    enforceability: 8,
    aggressiveness: 3,
    notes: 'Corporate-level patience. Very low aggressiveness.',
    match_patterns: ['paypal', 'paypal capital'],
  },

  // ── B-Tier: Professional Sub-Prime ─────────────────────────────────────────
  forward_financing: {
    display_name: 'Forward Financing',
    grade: 'B-C',
    tier: 'b_tier',
    enforceability: 6,
    aggressiveness: 6,
    notes: 'Worst DataMerch offender — flags everything as default. Will negotiate but slow.',
    match_patterns: ['forward financing', 'forward fin'],
  },
  fora_financial: {
    display_name: 'Fora Financial',
    grade: 'B-C',
    tier: 'b_tier',
    enforceability: 6,
    aggressiveness: 5,
    notes: 'Professional sub-prime. Moderate negotiation.',
    match_patterns: ['fora financial', 'fora'],
  },
  fundkite: {
    display_name: 'Fundkite',
    grade: 'B-C',
    tier: 'b_tier',
    enforceability: 6,
    aggressiveness: 5,
    notes: 'Professional sub-prime.',
    match_patterns: ['fundkite'],
  },
  libertas: {
    display_name: 'Libertas Funding',
    grade: 'B-C',
    tier: 'b_tier',
    enforceability: 6,
    aggressiveness: 5,
    notes: 'Professional sub-prime.',
    match_patterns: ['libertas'],
  },
  pearl_capital: {
    display_name: 'Pearl Capital',
    grade: 'B-C',
    tier: 'b_tier',
    enforceability: 6,
    aggressiveness: 6,
    notes: 'Known for filing COJ when merchants merely request payment modification.',
    match_patterns: ['pearl capital', 'pearl'],
  },
  itria: {
    display_name: 'Itria Ventures',
    grade: 'B-C',
    tier: 'b_tier',
    enforceability: 6,
    aggressiveness: 5,
    notes: 'Large operation. Less aggressive than TMM. High payment frequency (~3x/week). Multiple positions elevate combined Recovery Stake.',
    match_patterns: ['itria', 'itria ven'],
  },
  reliant: {
    display_name: 'Reliant Funding',
    grade: 'B-C',
    tier: 'b_tier',
    enforceability: 6,
    aggressiveness: 5,
    notes: 'Professional, moderate aggressiveness.',
    match_patterns: ['reliant'],
  },

  // ── C-Tier: Stack Funders — Professional ───────────────────────────────────
  tbf: {
    display_name: 'True Business Funding',
    grade: 'B-C',
    tier: 'c_tier',
    enforceability: 5,
    aggressiveness: 5,
    notes: 'Most professional of stack funders. COJ unenforceable post NY FAIR Act (2/17/2026). Anti-stacking addendum with $10K penalty. Contact: David Sharp.',
    match_patterns: ['tbf', 'true business', 'tbf grp', 'true business funding'],
  },
  tmm: {
    display_name: 'The Merchant Marketplace',
    grade: 'B-D',
    tier: 'c_tier',
    enforceability: 5,
    aggressiveness: 8,
    notes: 'Will litigate. Uses Regent & Associates (Paul Morris / Michael Scarpati). Self-refinances via Rider 2. 49% specified % observed. Will split positions strategically.',
    match_patterns: ['tmm', 'merchant marketplace', 'merchant market', 'the merchant marketplace'],
  },
  fox_funding: {
    display_name: 'Fox Funding',
    grade: 'C',
    tier: 'c_tier',
    enforceability: 5,
    aggressiveness: 6,
    notes: 'Stack funder. Self-refinances.',
    match_patterns: ['fox funding', 'fox'],
  },
  mantis: {
    display_name: 'Mantis Funding',
    grade: 'C',
    tier: 'c_tier',
    enforceability: 5,
    aggressiveness: 6,
    notes: 'Stack funder.',
    match_patterns: ['mantis'],
  },
  everest: {
    display_name: 'Everest Business Funding',
    grade: 'C',
    tier: 'c_tier',
    enforceability: 5,
    aggressiveness: 6,
    notes: 'Stack funder.',
    match_patterns: ['everest'],
  },
  yellowstone: {
    display_name: 'Yellowstone Capital',
    grade: 'C',
    tier: 'c_tier',
    enforceability: 5,
    aggressiveness: 6,
    notes: 'Stack funder.',
    match_patterns: ['yellowstone'],
  },
  mint: {
    display_name: 'Mint Funding',
    grade: 'C',
    tier: 'c_tier',
    enforceability: 5,
    aggressiveness: 6,
    notes: 'Stack funder. Monthly servicing fee $499 (ACH: MONTHLY MINT).',
    match_patterns: ['mint funding', 'mint', 'monthly mint'],
  },
  westmount: {
    display_name: 'Westmount Capital',
    grade: 'C',
    tier: 'c_tier',
    enforceability: 5,
    aggressiveness: 5,
    notes: 'Most merchant-friendly contracts of stack funders.',
    match_patterns: ['westmount'],
  },

  // ── C-D Tier: Aggressive Stack ─────────────────────────────────────────────
  rowan: {
    display_name: 'Rowan Advance Group',
    grade: 'B-D',
    tier: 'c_tier',
    enforceability: 4,
    aggressiveness: 9,
    notes: 'Denies reconciliation in writing. Threatens UCC freeze. Uses Land K Legal (Sol S.). Junior lien. Inflates claimed balance. Poor industry reputation. 2nd+ position only.',
    match_patterns: ['rowan', 'rowan advance'],
  },
  suncoast: {
    display_name: 'Suncoast Funding',
    grade: 'C-D',
    tier: 'c_tier',
    enforceability: 4,
    aggressiveness: 8,
    notes: 'Aggressive collections. Treat like Rowan.',
    match_patterns: ['suncoast'],
  },

  // ── D-Tier: Aggressive Stack ───────────────────────────────────────────────
  bitty: {
    display_name: 'Bitty Advance',
    grade: 'D',
    tier: 'd_tier',
    enforceability: 3,
    aggressiveness: 8,
    notes: 'Outsourced "legal" often not real attorneys. ACH: MCA Servicing.',
    match_patterns: ['bitty', 'bitty advance'],
  },
  eminent: {
    display_name: 'Eminent Funding',
    grade: 'D',
    tier: 'd_tier',
    enforceability: 3,
    aggressiveness: 7,
    notes: 'No min FICO, satisfied defaults OK.',
    match_patterns: ['eminent'],
  },
  overnight_capital: {
    display_name: 'Overnight Capital',
    grade: 'A-D',
    tier: 'd_tier',
    enforceability: 4,
    aggressiveness: 7,
    notes: 'Reactive, erratic.',
    match_patterns: ['overnight capital', 'overnight'],
  },
  spg_advance: {
    display_name: 'SPG Advance',
    grade: 'B-D',
    tier: 'd_tier',
    enforceability: 4,
    aggressiveness: 7,
    notes: 'Reactive.',
    match_patterns: ['spg advance', 'spg'],
  },
  samson: {
    display_name: 'Samson Funding',
    grade: 'B-D',
    tier: 'd_tier',
    enforceability: 4,
    aggressiveness: 7,
    notes: 'Reactive.',
    match_patterns: ['samson'],
  },

  // ── Special: Reverse MCA ───────────────────────────────────────────────────
  ufce: {
    display_name: 'UFCE (United First Capital Experts)',
    grade: 'N/A',
    tier: 'reverse_mca',
    enforceability: 3,
    aggressiveness: 6,
    notes: 'Reverse MCA. Actual lender: First Gate Finance LLC. Utah law. 247% stated APR = usury exposure. Advances stop when merchant stops paying. Compress using legal ambiguity.',
    match_patterns: ['ufce', 'united first capital', 'first gate finance'],
  },

  // ── Newtek (NOT MCA — SBA/term loan) ───────────────────────────────────────
  newtek: {
    display_name: 'Newtek Small Business Finance',
    grade: 'A',
    tier: 'a_tier',
    enforceability: 8,
    aggressiveness: 3,
    notes: 'SBA/term lender, NOT MCA. Very different negotiation approach — federally backed, formal modification process.',
    match_patterns: ['newtek', 'newtek small business'],
  },
};

/**
 * Calculate Recovery Stake score based on balance
 */
export function getRecoveryStakeScore(balance) {
  if (balance >= 500000) return 10;
  if (balance >= 200000) return 9;
  if (balance >= 100000) return 7;
  if (balance >= 50000) return 5;
  return 3;
}

/**
 * Calculate composite score using three-axis weights
 * Enforceability x 0.35 + Aggressiveness x 0.40 + Recovery Stake x 0.25
 */
export function getCompositeScore(enforceability, aggressiveness, recoveryStake) {
  return Math.round(
    ((enforceability * 0.35) + (aggressiveness * 0.40) + (recoveryStake * 0.25)) * 100
  ) / 100;
}

/**
 * Look up funder by name — fuzzy match against match_patterns
 * Returns the funder intel object or null if not found
 */
export function lookupFunder(funderName) {
  if (!funderName) return null;
  const normalized = funderName.toLowerCase().trim();

  for (const [key, funder] of Object.entries(FUNDER_INTEL_DB)) {
    for (const pattern of funder.match_patterns) {
      if (normalized.includes(pattern) || pattern.includes(normalized)) {
        return { key, ...funder };
      }
    }
  }
  return null;
}

/**
 * Auto-score a position using funder intel + balance-based recovery stake
 * Returns { enforceability, aggressiveness, recovery_stake, composite, grade, tier, notes }
 */
export function autoScorePosition(funderName, balance) {
  const intel = lookupFunder(funderName);
  const recoveryStake = getRecoveryStakeScore(balance);

  if (intel) {
    const composite = getCompositeScore(intel.enforceability, intel.aggressiveness, recoveryStake);
    return {
      enforceability: intel.enforceability,
      aggressiveness: intel.aggressiveness,
      recovery_stake: recoveryStake,
      composite,
      grade: intel.grade,
      tier: intel.tier,
      display_name: intel.display_name,
      notes: intel.notes,
      auto_scored: true,
    };
  }

  // Unknown funder — return defaults with flag
  return {
    enforceability: 5,
    aggressiveness: 5,
    recovery_stake: recoveryStake,
    composite: getCompositeScore(5, 5, recoveryStake),
    grade: 'Unknown',
    tier: 'unknown',
    display_name: funderName,
    notes: 'Funder not in intelligence database — using default scores. Adjust manually.',
    auto_scored: false,
  };
}

// app/data/funder-risk-tiers.js
// MCA Funder Risk Tier Classification System
// Source: Funders First industry expertise + DailyFunder.com intelligence

export const FUNDER_RISK_TIERS = {
  A: {
    label: 'A-Tier (Institutional)',
    fico_requirement: '620+',
    position_preference: '1st position only (rarely 2nd)',
    underwriting: 'Strict — full credit check, bank verification, time-in-business minimums (2yr+), low NSF tolerance (0-3/month)',
    collections_approach: 'In-house professional teams. Legal action through legitimate counsel.',
    negotiation_profile: {
      difficulty: 'Easy',
      typical_response_time: '3-7 days',
      typical_settlement_tier: 'Email 1-2',
      cooperative: true,
      notes: 'Most willing to restructure. Understand that 100% recovery over extended term beats default recovery. Professional communication. In-house teams with authority to modify terms.',
    },
    default_rate: '5-8%',
    default_recovery: '85-92 cents on dollar',
    datamerch_behavior: 'Generally accurate reporting. Some overreport (Forward Financing worst offender).',
    syndication: 'Common — may need investor approval for modifications (National Funding ~1 month).',
    examples: ['OnDeck', 'Credibly', 'Kapitus', 'National Funding', 'CAN Capital', 'Rapid Finance', 'Snap Advance'],
    post_restructuring: 'Will NOT fund merchants with recent restructuring history. Need 6+ months clean statements.',
  },

  B: {
    label: 'B-Tier (Professional Sub-Prime)',
    fico_requirement: '550+',
    position_preference: '2nd position preferred (less risk — merchant already paying an MCA with good history)',
    underwriting: 'Moderate — credit check but more flexible. Bank verification required. Will accept some NSFs (5-8/month). Weaker revenue verification.',
    collections_approach: 'In-house or reputable outsourced firm. Legal threats but usually follows through properly.',
    negotiation_profile: {
      difficulty: 'Moderate',
      typical_response_time: '5-14 days',
      typical_settlement_tier: 'Email 2-3',
      cooperative: 'Sometimes',
      notes: 'More resistant than A-tier but still professional. May counter-offer. Respond to data-driven proposals. Usually have authority to modify without investor approval.',
    },
    default_rate: '9-13%',
    default_recovery: '75-85 cents on dollar',
    datamerch_behavior: 'Mixed — some overreport. Forward Financing is worst offender, lists everything as default after a few bounced payments.',
    syndication: 'Less common but possible.',
    examples: ['Forward Financing', 'Fora Financial', 'Fundkite', 'Libertas', 'Mulligan Funding', 'Pearl Capital', 'Biz2Credit', 'Lendini'],
    post_restructuring: 'Some will fund after 3-4 months clean statements. Need to demonstrate no stacking.',
  },

  C: {
    label: 'C-Tier (Stack Funders - Professional)',
    fico_requirement: '500+ (some no minimum)',
    position_preference: '2nd-4th positions. "As long as there\'s room."',
    underwriting: 'Weak — bank statements only, minimal credit check. Primarily looking at revenue vs existing MCA burden. Will fund into existing stacks knowingly.',
    collections_approach: 'Mixed — some in-house, some outsourced to aggressive firms. May threaten COJ (often unenforceable). May threaten account freeze (usually bluffing).',
    negotiation_profile: {
      difficulty: 'Moderate-Hard',
      typical_response_time: '7-21 days',
      typical_settlement_tier: 'Email 2-3, sometimes requires phone call',
      cooperative: 'Varies',
      notes: 'Know they funded into a stack. Anti-stacking hypocrisy is strong leverage. Most have reconciliation clauses they never honor. Specified percentages often disconnected from reality. More likely to have outsourced legal that sends form letters.',
    },
    default_rate: '15-25%',
    default_recovery: '50-70 cents on dollar',
    datamerch_behavior: 'Report aggressively. Will flag merchants in restructuring as "defaults."',
    syndication: 'Common for larger positions.',
    examples: ['TBF GRP', 'The Merchant Marketplace', 'Rowan Advance', 'Fox Business Funding', 'Mantis Funding', 'Everest Business Funding', 'Yellowstone Capital', 'Mint Funding', 'Westmount Capital', 'Expansion Capital', 'Cedar Advance', 'Itria Ventures'],
    post_restructuring: 'First funders willing to re-fund after restructuring. 3-4 months clean statements needed.',
  },

  D: {
    label: 'D-Tier (Aggressive Stack Funders)',
    fico_requirement: '500 or no minimum',
    position_preference: 'Any position. Will stack regardless of existing burden.',
    underwriting: 'Minimal to none. If there is revenue and a bank account, they will fund.',
    collections_approach: 'Outsourced to aggressive firms. Fake legal notices common. May show up at merchant\'s place of business. Threats of illegal actions (account freezes without court order, etc.).',
    negotiation_profile: {
      difficulty: 'Hard',
      typical_response_time: '14-30 days (or silence)',
      typical_settlement_tier: 'Email 3 + extended negotiation',
      cooperative: false,
      notes: 'Least likely to engage professionally. May ignore outreach entirely. Collections threats are common but usually empty. Outsourced "legal" is often not real attorneys. The aggressive posture indicates compliance exposure, not strength.',
    },
    default_rate: '25-40%',
    default_recovery: '30-50 cents on dollar',
    datamerch_behavior: 'Weaponize DataMerch — flag merchants to prevent them from funding elsewhere.',
    syndication: 'Less common — often self-funded or small investor pools.',
    examples: ['Bitty Advance', 'Eminent Funding', 'Radisson Funding'],
    post_restructuring: 'Will fund almost anyone. Gateway back into MCA after restructuring.',
  },

  F: {
    label: 'F-Tier (Predatory / Scam)',
    fico_requirement: 'None',
    position_preference: 'Any — predatory terms regardless of position.',
    underwriting: 'None. Designed to extract maximum fees regardless of merchant ability to repay.',
    collections_approach: 'Criminal-adjacent. Fake legal notices, impersonating attorneys, showing up at businesses, filing bogus default fees for services never rendered.',
    negotiation_profile: {
      difficulty: 'Extreme / Do not engage normally',
      typical_response_time: 'Unpredictable',
      typical_settlement_tier: 'May require legal action by merchant',
      cooperative: false,
      notes: 'These are bad actors. Document everything. If their position is small, consider buyout to remove them from the deal entirely. Their contracts may be unenforceable due to unconscionability. Refer to legal counsel if they become threatening.',
    },
    default_rate: '40%+',
    default_recovery: '<30 cents on dollar',
    datamerch_behavior: 'May not use DataMerch at all. Some are too small/new to have access.',
    syndication: 'None — typically self-funded.',
    examples: ['Coconut Funding (Pearlman)', 'Alpaca Funding', 'Plato Funding', 'Citrus Fund', 'Waterfall Capital', 'Timeless Funding'],
    post_restructuring: 'N/A — do not refer merchants to F-tier funders.',
  },
};

// Default recovery rates by tier (for position brief comparison blocks)
export const DEFAULT_RECOVERY_RATES = {
  A: { low: 0.85, mid: 0.90, high: 0.92 },
  B: { low: 0.75, mid: 0.80, high: 0.85 },
  C: { low: 0.50, mid: 0.60, high: 0.70 },
  D: { low: 0.30, mid: 0.40, high: 0.50 },
  F: { low: 0.10, mid: 0.20, high: 0.30 },
};

// Industry-wide stats (sourced from DailyFunder, OnDeck 10K, SBA)
export const INDUSTRY_DEFAULT_STATS = {
  overall_default_rate: { low: 0.10, mid: 0.15, high: 0.25, source: 'DailyFunder consensus + SBA' },
  net_charge_off_rate: { low: 0.08, mid: 0.15, high: 0.25, source: 'OnDeck 2019 10K: 13.6%, DailyFunder: 24-25% avg' },
  deep_subprime_charge_off: { rate: 0.25, source: 'DailyFunder: "baseline net charge-off rate for deep subprime ~25%"' },
  stress_period_default: { low: 0.70, high: 0.85, source: 'DailyFunder: "some lenders reporting 70-85% default rates" during economic stress' },
  collections_legal_cost: { low: 5000, high: 15000, source: 'Industry estimate for litigation/arbitration per position' },
  collections_timeline_months: { low: 6, high: 18, source: 'Typical timeline from default to recovery through legal process' },
};

// Debt settlement vs restructuring comparison
export const SETTLEMENT_VS_RESTRUCTURING = {
  settlement: {
    label: 'Debt Settlement',
    payment_to_funders: 'Stopped for 1-3 months while fees are collected',
    fee_structure: 'Merchant pays settlement firm 25-50% of savings; highest seen: $500K in fees over 3 months with $0 going to funders',
    funder_recovery: '30-60% of balance (negotiated down)',
    timeline: '3-12 months',
    merchant_impact: 'DataMerch "Settled" flag — extremely difficult to get funded again. Most A-B funders will never touch the merchant.',
    funder_reaction: 'Hostile — funders view settlement companies as adversaries',
    legal_risk: 'High — funders aggressively pursue COJ, UCC enforcement, and personal guarantees when they detect settlement',
  },
  restructuring: {
    label: 'Debt Restructuring (Funders First model)',
    payment_to_funders: 'Payments continue — reduced amount but no gap',
    fee_structure: 'Merchant pays FF weekly; FF distributes TAD to funders proportionally. No multi-month fee-only period.',
    funder_recovery: '100% of remaining purchased amount',
    timeline: 'New agreements typically within 1-2 weeks of outreach',
    merchant_impact: 'DataMerch "Paid in Full" — merchant can re-enter funding market in 3-6 months',
    funder_reaction: 'Grudging respect — "savings are similar, total cost far less, moves far faster, lenders get paid in full"',
    legal_risk: 'Low — FF maintains payment continuity and frames restructuring as exercising contractual reconciliation rights',
  },
  key_talking_point: 'Unlike settlement firms, we maintain payment to all positions during restructuring — no payment gaps, no settlement discounts, 100% recovery. Your position is not being settled for less. It is being restructured to a sustainable payment cadence that ensures you receive every dollar owed.',
};

// Post-restructuring pathway funders
export const POST_RESTRUCTURING_FUNDERS = [
  { name: 'Eminent Funding', tier: 'D', notes: 'No min FICO. ABCD paper. Funds satisfied defaults. Up to 12 months. 12pts commission.', contact: 'admin@eminentfunding.com' },
  { name: 'Radisson Funding', tier: 'D', notes: 'Past defaults OK. No industry restrictions. Up to $2.5M. 1st position and up.', contact: 'abe@radissonfunding.com' },
  { name: 'LoanMe', tier: 'B', notes: 'No FICO requirement. Monthly payments (not daily/weekly). Does not care about defaults. Up to $250K.', contact: null },
  { name: 'Breakout Capital', tier: 'B', notes: 'No min FICO. 1st position only — will take out other funders. Early payoff options. Competitive pricing.', contact: null },
];

export function getTierInfo(tier) {
  return FUNDER_RISK_TIERS[tier] || FUNDER_RISK_TIERS['C'];
}

export function getDefaultRecovery(tier) {
  return DEFAULT_RECOVERY_RATES[tier] || DEFAULT_RECOVERY_RATES['C'];
}

export default FUNDER_RISK_TIERS;

// ─── Funder Intelligence Database ────────────────────────────────────────────
// Seeded from FunderIntel grades, operational experience, and deal history.
// For unknown funders: default to lowestGrade: "C", aggressivenessBase: 6

export const FUNDER_DATABASE = {
  "ondeck": {
    displayName: "OnDeck Capital",
    funderIntelGrade: "A-B",
    lowestGrade: "A",
    aggressivenessBase: 3,
    preferredPosition: "1st only",
    achDescriptors: ["ONDECK CAPITAL", "ONDECK"],
    knownBehavior: [
      "Rarely litigates accounts under $250K",
      "Inconsistent DataMerch reporting",
      "In-house collections only",
      "Loss reserves allow extended non-payment tolerance"
    ],
    avgTermMonths: 12,
    isLargeInstitution: true,
    softDataMerchReporter: true
  },
  "tmm": {
    displayName: "The Merchant Marketplace (TMM)",
    funderIntelGrade: "B-D",
    lowestGrade: "D",
    aggressivenessBase: 8,
    preferredPosition: "2nd-3rd",
    achDescriptors: ["Merchant Market", "THE MERCHANT MARKETP"],
    knownBehavior: [
      "Will litigate — uses Regent & Associates",
      "Self-refinances prior positions via Rider 2",
      "Will split positions strategically",
      "49% specified percentage observed"
    ],
    avgTermMonths: 6,
    knownLitigationHistory: true,
    attorneyOnFile: true
  },
  "tbf": {
    displayName: "True Business Funding (TBF)",
    funderIntelGrade: "B-C (estimated)",
    lowestGrade: "C",
    aggressivenessBase: 5,
    preferredPosition: "1st-2nd",
    achDescriptors: ["TBF GRP", "TRUE BUSINESS FUND"],
    knownBehavior: [
      "Most professional of C-tier funders",
      "COJ unenforceable post NY FAIR Act (2/17/2026)",
      "Anti-stacking addendum with $10K penalty"
    ],
    avgTermMonths: 7
  },
  "rowan": {
    displayName: "Rowan Advance Group",
    funderIntelGrade: "B-D",
    lowestGrade: "D",
    aggressivenessBase: 9,
    preferredPosition: "2nd+ only",
    achDescriptors: ["ROWAN ADVANCE", "ROWAN", "ROWANADVANCEGROU"],
    knownBehavior: [
      "Denies reconciliation in writing",
      "Threatens UCC freeze but has not acted",
      "Uses Land K Legal for collections",
      "Junior lien — filed 01/22/2026",
      "Inflates claimed balance without itemization"
    ],
    avgTermMonths: 4,
    knownLitigationHistory: true,
    attorneyOnFile: true
  },
  "suncoast": {
    displayName: "Suncoast Funding",
    funderIntelGrade: "C-D (estimated)",
    lowestGrade: "D",
    aggressivenessBase: 8,
    preferredPosition: "2nd-3rd",
    achDescriptors: ["SUNCOAST FUNDING"],
    knownBehavior: ["Aggressive collections posture — treat as Rowan-class"],
    avgTermMonths: 4
  },
  "itria": {
    displayName: "Itria Ventures",
    funderIntelGrade: "B-C (estimated)",
    lowestGrade: "C",
    aggressivenessBase: 5,
    preferredPosition: "2nd-3rd",
    achDescriptors: ["Itria Ven-Mercha", "ITRIA"],
    knownBehavior: [
      "Large operation, less aggressive than TMM",
      "High payment frequency (~3x/week)",
      "Multiple positions elevates combined recovery stake"
    ],
    avgTermMonths: 5
  },
  "ufce": {
    displayName: "UFCE (United First Capital Experts)",
    funderIntelGrade: "N/A — Reverse MCA",
    lowestGrade: "D",
    aggressivenessBase: 6,
    preferredPosition: "Last (reverse — stacked on existing)",
    achDescriptors: ["UFCE 8018930381", "UFCE"],
    isReverseMCA: true,
    knownBehavior: [
      "Advances stop when merchant stops paying",
      "No reconciliation clause",
      "Full personal guarantee — unconditional",
      "247% stated APR — usury exposure",
      "Fees excluded from stated APR",
      "Utah governing law only",
      "Actual lender: First Gate Finance LLC"
    ],
    avgTermMonths: 13
  },
  "newtek": {
    displayName: "Newtek Small Business Finance",
    funderIntelGrade: "A-B",
    lowestGrade: "B",
    aggressivenessBase: 3,
    preferredPosition: "1st",
    achDescriptors: ["Newtek S Bus Fin", "NEWTEK"],
    knownBehavior: [
      "SBA-adjacent lender, professional collections",
      "Will report to credit bureaus",
      "Reasonable settlement expectations"
    ],
    avgTermMonths: 12,
    isLargeInstitution: true
  },
  "fundkite": {
    displayName: "Fundkite",
    funderIntelGrade: "C-D",
    lowestGrade: "C",
    aggressivenessBase: 7,
    preferredPosition: "2nd-3rd",
    achDescriptors: ["FUNDKITE"],
    knownBehavior: [
      "Aggressive stacking practices",
      "Short term deals with high factor rates"
    ],
    avgTermMonths: 4
  },
  "credibly": {
    displayName: "Credibly (formerly RetailCapital)",
    funderIntelGrade: "A-B",
    lowestGrade: "B",
    aggressivenessBase: 4,
    preferredPosition: "1st-2nd",
    achDescriptors: ["CREDIBLY"],
    knownBehavior: [
      "Professional collections, rarely litigates",
      "Willing to restructure if approached professionally"
    ],
    avgTermMonths: 10,
    isLargeInstitution: true
  },
  "kapitus": {
    displayName: "Kapitus (formerly Strategic Funding)",
    funderIntelGrade: "A-B",
    lowestGrade: "B",
    aggressivenessBase: 4,
    preferredPosition: "1st",
    achDescriptors: ["KAPITUS", "STRATEGIC FUND"],
    knownBehavior: [
      "Institutional funder, professional approach",
      "Will consider payment modifications"
    ],
    avgTermMonths: 10,
    isLargeInstitution: true
  },
  "greenbox": {
    displayName: "Greenbox Capital",
    funderIntelGrade: "C-D (estimated)",
    lowestGrade: "C",
    aggressivenessBase: 6,
    preferredPosition: "2nd-3rd",
    achDescriptors: ["GREENBOX"],
    isReverseMCA: true,
    knownBehavior: ["Reverse MCA funder — advances and debits from same account"],
    avgTermMonths: 6
  },
  "sos_capital": {
    displayName: "SOS Capital",
    funderIntelGrade: "C-D (estimated)",
    lowestGrade: "D",
    aggressivenessBase: 7,
    preferredPosition: "2nd+",
    achDescriptors: ["SOS CAPITAL"],
    isReverseMCA: true,
    knownBehavior: ["Reverse MCA funder"],
    avgTermMonths: 6
  },
  "libertas": {
    displayName: "Libertas Funding",
    funderIntelGrade: "C",
    lowestGrade: "C",
    aggressivenessBase: 6,
    preferredPosition: "2nd-3rd",
    achDescriptors: ["LIBERTAS"],
    isReverseMCA: true,
    knownBehavior: ["Can operate as both standard and reverse MCA"],
    avgTermMonths: 6
  },
  "mantis": {
    displayName: "Mantis Funding",
    funderIntelGrade: "C-D (estimated)",
    lowestGrade: "D",
    aggressivenessBase: 7,
    preferredPosition: "3rd+",
    achDescriptors: ["MANTIS"],
    isReverseMCA: true,
    knownBehavior: ["Reverse MCA funder — aggressive stacking"],
    avgTermMonths: 4
  },
  "everest": {
    displayName: "Everest Business Funding",
    funderIntelGrade: "C-D (estimated)",
    lowestGrade: "D",
    aggressivenessBase: 7,
    preferredPosition: "2nd+",
    achDescriptors: ["EVEREST"],
    isReverseMCA: true,
    knownBehavior: ["Reverse MCA funder"],
    avgTermMonths: 6
  },
  "forward_financing": {
    displayName: "Forward Financing",
    funderIntelGrade: "B",
    lowestGrade: "B",
    aggressivenessBase: 5,
    preferredPosition: "1st-2nd",
    achDescriptors: ["FORWARD FIN", "FORWARD FINANCING"],
    knownBehavior: [
      "Professional sub-prime funder",
      "Moderate negotiation difficulty"
    ],
    avgTermMonths: 8
  },
  "rapid_finance": {
    displayName: "Rapid Finance",
    funderIntelGrade: "B-C",
    lowestGrade: "C",
    aggressivenessBase: 5,
    preferredPosition: "1st-2nd",
    achDescriptors: ["RAPID FINANCE", "RAPID"],
    knownBehavior: [
      "Can operate as standard MCA, LOC, or true split",
      "Regional presence — some TX true splits"
    ],
    avgTermMonths: 6
  }
};

// Match a funder name from bank statement to the database
export function matchFunder(funderName) {
  if (!funderName) return null;
  const normalized = funderName.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const [key, record] of Object.entries(FUNDER_DATABASE)) {
    // Check ACH descriptors
    for (const desc of record.achDescriptors) {
      const descNorm = desc.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalized.includes(descNorm) || descNorm.includes(normalized.slice(0, Math.min(6, normalized.length)))) {
        return { key, ...record };
      }
    }
    // Check display name
    const displayNorm = record.displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.includes(displayNorm.slice(0, 6)) || displayNorm.includes(normalized.slice(0, 6))) {
      return { key, ...record };
    }
  }

  // Unknown funder — return default
  return {
    key: 'unknown',
    displayName: funderName,
    funderIntelGrade: "Unknown — C/D tier (estimated)",
    lowestGrade: "C",
    aggressivenessBase: 6,
    preferredPosition: "Unknown",
    achDescriptors: [],
    knownBehavior: ["No intelligence on file — treat as mid-tier funder"],
    avgTermMonths: 6
  };
}

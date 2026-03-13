// app/data/ach-descriptors.js
// Maps ACH bank statement descriptors to funder identities
// Sources: DailyFunder.com threads, agreement analysis, bank statement forensics
//
// Categories:
//   'mca_funder'     — Active MCA funder pulling payments
//   'collections'    — Collections/recovery company (NOT an active position)
//   'factoring'      — Invoice factoring (NOT MCA — classify as other_debt_service)
//   'fuel_card'      — Fleet fuel card (OpEx, NOT MCA)
//   'loan'           — Term loan or LOC (NOT MCA — classify as other_debt_service)
//   'settlement'     — Debt settlement company (flag for special handling)
//   'unknown'        — Needs manual identification

export const ACH_DESCRIPTORS = [
  // ─── A-Tier Funders ────────────────────────────────────────────────
  { pattern: 'ONDECK', funder: 'OnDeck Capital', tier: 'A', category: 'mca_funder', notes: 'A-tier. 620+ FICO, 1st position only. In-house collections, professional. Cooperative in restructuring.' },
  { pattern: 'ON DECK', funder: 'OnDeck Capital', tier: 'A', category: 'mca_funder' },
  { pattern: 'CREDIBLY', funder: 'Credibly', tier: 'A', category: 'mca_funder', notes: 'A-tier. Strict UW. In-house team.' },
  { pattern: 'KAPITUS', funder: 'Kapitus', tier: 'A', category: 'mca_funder', notes: 'A-tier. Formerly Strategic Funding Source (SFS). Professional, in-house.' },
  { pattern: 'STRATEGIC FUNDING', funder: 'Kapitus (fka Strategic Funding Source)', tier: 'A', category: 'mca_funder' },
  { pattern: 'SFS CAPITAL', funder: 'Kapitus (fka SFS)', tier: 'A', category: 'mca_funder' },
  { pattern: 'NATIONAL FUNDING', funder: 'National Funding', tier: 'A', category: 'mca_funder', notes: 'A-tier. Investor agreements may prohibit debt settlement work — expect ~1 month to get to table. Syndicated positions common.' },
  { pattern: 'CAN CAPITAL', funder: 'CAN Capital', tier: 'A', category: 'mca_funder', notes: 'A-tier. Long-standing, professional.' },
  { pattern: 'RAPID FINANCE', funder: 'Rapid Finance', tier: 'A', category: 'mca_funder' },
  { pattern: 'RBFS', funder: 'Rapid Finance', tier: 'A', category: 'mca_funder', notes: 'Rapid Finance ACH descriptor. Often confused — NOT debt settlement.' },
  { pattern: 'SNAP ADVANCE', funder: 'Snap Advance', tier: 'A', category: 'mca_funder' },
  { pattern: 'BLUEVINE', funder: 'Bluevine', tier: 'A', category: 'loan', notes: 'LOC/loan product, not MCA. Classify as other_debt_service.' },
  { pattern: 'KABBAGE', funder: 'Kabbage (now AmEx)', tier: 'A', category: 'loan', notes: 'LOC product, not MCA.' },

  // ─── B-Tier Funders ────────────────────────────────────────────────
  { pattern: 'FORWARD FINANCING', funder: 'Forward Financing', tier: 'B', category: 'mca_funder', notes: 'B-tier. Reports aggressively to DataMerch. "Forward is by far the worse offender of this on datamerch they list everything as a default once they bounce a few payments."' },
  { pattern: 'FORWARD FIN', funder: 'Forward Financing', tier: 'B', category: 'mca_funder' },
  { pattern: 'FORA FINANCIAL', funder: 'Fora Financial', tier: 'B', category: 'mca_funder' },
  { pattern: 'FUNDKITE', funder: 'Fundkite', tier: 'B', category: 'mca_funder' },
  { pattern: 'LIBERTAS', funder: 'Libertas Funding', tier: 'B', category: 'mca_funder' },
  { pattern: 'MULLIGAN', funder: 'Mulligan Funding', tier: 'B', category: 'mca_funder' },
  { pattern: 'LENDINI', funder: 'Lendini', tier: 'B', category: 'mca_funder' },
  { pattern: 'PEARL CAPITAL', funder: 'Pearl Capital', tier: 'B', category: 'mca_funder', notes: 'Known for filing COJs when merchants request payment modifications. Uses MCA Servicing for collections.' },
  { pattern: 'BREAKOUT CAPITAL', funder: 'Breakout Capital', tier: 'B', category: 'mca_funder', notes: 'No minimum FICO. First position only — will take out other funders. Good post-restructuring option.' },
  { pattern: 'PRINCIPIS', funder: 'Principis Capital', tier: 'B', category: 'mca_funder' },
  { pattern: 'QUICKSILVER', funder: 'QuickSilver Capital', tier: 'B', category: 'mca_funder' },
  { pattern: 'NEWTEK', funder: 'Newtek Small Business Finance', tier: 'B', category: 'loan', notes: 'SBA/term loan. NOT MCA — classify as other_debt_service.' },

  // ─── C-D Tier Funders (Stack funders) ──────────────────────────────
  { pattern: 'TBF GRP', funder: 'True Business Funding LLC', tier: 'C', category: 'mca_funder', notes: 'Most professional of the stack funders. Self-renewal pattern common. COJ clause but unenforceable under NY FAIR Act post-Feb 2026. Anti-stacking with $10K penalty.' },
  { pattern: 'TRUE BUSINESS', funder: 'True Business Funding LLC', tier: 'C', category: 'mca_funder' },
  { pattern: 'MERCHANT MARKET', funder: 'The Merchant Marketplace Holdings Corp', tier: 'C', category: 'mca_funder', notes: 'Sub-2yr old funder. Multiple simultaneous positions common (Position A, B, C). Self-renewal/payoff pattern. Phone: 8882711420. CT governing law. 49% specified percentage seen.' },
  { pattern: 'THE MERCHANT MARKETP', funder: 'The Merchant Marketplace Holdings Corp', tier: 'C', category: 'mca_funder', notes: 'Wire deposit descriptor (different from debit descriptor "Merchant Market").' },
  { pattern: 'TMM', funder: 'The Merchant Marketplace Holdings Corp', tier: 'C', category: 'mca_funder' },
  { pattern: 'ROWAN', funder: 'Rowan Advance Group LLC', tier: 'C', category: 'mca_funder', notes: 'Only does 2nd+ positions on high-risk files. Poor reputation. 3-day reconciliation clause — strongest negotiation lever. NY law.' },
  { pattern: 'FOX BUSINESS', funder: 'Fox Business Funding', tier: 'C', category: 'mca_funder', notes: 'Stack funder. Daily ACH common.' },
  { pattern: 'FOX CAPITAL', funder: 'Fox Business Funding', tier: 'C', category: 'mca_funder' },
  { pattern: 'BITTY', funder: 'Bitty Advance', tier: 'D', category: 'mca_funder', notes: 'Micro funder. Also pulls as "MCA Servicing". Very small positions.' },
  { pattern: 'MANTIS', funder: 'Mantis Funding', tier: 'C', category: 'mca_funder' },
  { pattern: 'FUNDFI', funder: 'Fundfi Merchant Funding LLC', tier: 'C', category: 'mca_funder' },
  { pattern: 'YELLOWSTONE', funder: 'Yellowstone Capital', tier: 'C', category: 'mca_funder', notes: 'Large stack funder. Known for aggressive collections.' },
  { pattern: 'EVEREST', funder: 'Everest Business Funding', tier: 'C', category: 'mca_funder' },
  { pattern: 'EBF', funder: 'Everest Business Funding', tier: 'C', category: 'mca_funder' },
  { pattern: 'MEGED', funder: 'Meged Funding', tier: 'C', category: 'mca_funder', notes: 'Funds up to $5M per file. 35 week terms.' },
  { pattern: 'MINT FUNDING', funder: 'Mint Funding Inc', tier: 'C', category: 'mca_funder', notes: 'Uses "Monthly Mint" $499/mo servicing fee. Anti-stacking $7,500/35% penalty. NY law.' },
  { pattern: 'MONTHLY MINT', funder: 'Mint Funding Inc (servicing)', tier: 'C', category: 'mca_funder', notes: 'Monthly servicing fee for Mint Funding — $499/mo. Separate from remittance.' },
  { pattern: 'WESTMOUNT', funder: 'Westmount Capital LLC', tier: 'C', category: 'mca_funder', notes: 'Brooklyn-based. Narrow default clause (intentional acts only). No COJ. No anti-stacking. 3.8% specified % seen. Most merchant-friendly contract language.' },
  { pattern: 'EXPANSION CAPITAL', funder: 'Expansion Capital Group', tier: 'C', category: 'mca_funder' },
  { pattern: 'CEDAR ADVANCE', funder: 'Cedar Advance', tier: 'C', category: 'mca_funder' },
  { pattern: 'GARDEN FUNDING', funder: 'Garden State Funding', tier: 'C', category: 'mca_funder' },
  { pattern: 'ITRIA', funder: 'Itria Ventures', tier: 'C', category: 'mca_funder', notes: 'Multiple simultaneous positions common.' },
  { pattern: 'BIZ2CREDIT', funder: 'Biz2Credit', tier: 'B', category: 'mca_funder' },
  { pattern: 'SQUARE CAPITAL', funder: 'Square Capital', tier: 'A', category: 'loan', notes: 'Revenue-based loan through Square POS. Automatic deduction from sales. NOT traditional MCA.' },
  { pattern: 'AMAZON LENDING', funder: 'Amazon Lending', tier: 'A', category: 'loan', notes: 'Invitation-only business loan. Automatic deduction from Amazon sales. NOT MCA.' },

  // ─── E-F Tier (Predatory / Scam) ───────────────────────────────────
  { pattern: 'COCONUT', funder: 'Coconut Funding (Jack & Rob Pearlman)', tier: 'F', category: 'mca_funder', notes: 'SCAM. 1.899 factor, 20-day terms, massive fees ($899 origination on $2K advances). Files $10K default fees for blocking app fee charges. Refers merchants to debt settlement. Multiple DailyFunder threads confirming fraud.' },
  { pattern: 'ALPACA FUNDING', funder: 'Alpaca Funding LLC', tier: 'F', category: 'mca_funder', notes: 'PREDATORY. Same address as Citrus Fund, Waterfall Capital, Timeless Funding. 20-day terms, debits same day they fund.' },
  { pattern: 'PLATO FUNDING', funder: 'Plato Funding (Dragon & Rooster LLC)', tier: 'F', category: 'mca_funder', notes: 'SCAM. Randomly debits merchants without funding. Confirmed on DailyFunder.' },
  { pattern: 'CITRUS FUND', funder: 'Citrus Fund (same address as Alpaca)', tier: 'F', category: 'mca_funder' },
  { pattern: 'WATERFALL CAPITAL', funder: 'Waterfall Capital (same address as Alpaca)', tier: 'F', category: 'mca_funder' },
  { pattern: 'TIMELESS FUNDING', funder: 'Timeless Funding (same address as Alpaca)', tier: 'F', category: 'mca_funder' },

  // ─── Collections Companies (NOT active MCA) ────────────────────────
  { pattern: 'MCA SERVICING', funder: 'Bitty Advance OR Pearl Capital collections', tier: null, category: 'collections', notes: 'Collections descriptor used by Bitty Advance (active) and Pearl Capital (default). Also used by NewCo to disguise as settlement. Context matters — check if amounts match a known active position.' },
  { pattern: 'MCA RECOVERY', funder: 'MCA Recovery LLC', tier: null, category: 'collections', notes: 'Collections/default recovery. If present on statement, merchant has or had a defaulted position. Funders will decline merchants with this on statements.' },
  { pattern: 'MCALLC', funder: 'MCA Debt Advisors (collections scam)', tier: null, category: 'collections', notes: 'Collections company linked to MCA Debt Advisors. Weekly pulls. DailyFunder confirmed as scam operation.' },
  { pattern: 'NOMAS', funder: 'Nomas Recovery', tier: null, category: 'collections', notes: 'MCA collections company. "Very good at it." Funders decline merchants with Nomas on statements — they assume active default.' },
  { pattern: 'ADVANCESYNDICATE', funder: 'Advance Syndicate Services (multiple funders)', tier: null, category: 'collections', notes: 'Third-party ACH servicer used by multiple funders. Hard to determine which funder without additional context.' },

  // ─── Factoring Companies (NOT MCA) ─────────────────────────────────
  { pattern: 'TRIUMPH', funder: 'Triumph Business Capital', tier: null, category: 'factoring', notes: 'Invoice factoring for trucking. NOT MCA. Classify as other_debt_service or revenue source depending on context.' },
  { pattern: 'RTS FINANCIAL', funder: 'RTS Financial', tier: null, category: 'factoring', notes: 'Trucking factoring. NOT MCA.' },
  { pattern: 'OTR SOLUTIONS', funder: 'OTR Solutions', tier: null, category: 'factoring', notes: 'Trucking factoring. NOT MCA.' },
  { pattern: 'APEX CAPITAL', funder: 'Apex Capital Corp', tier: null, category: 'factoring', notes: 'Freight factoring. NOT MCA. Could be confused with MCA funders.' },

  // ─── Fuel Cards (OpEx, NOT MCA) ────────────────────────────────────
  { pattern: 'FLEETCOR', funder: 'FleetCor Technologies', tier: null, category: 'fuel_card', notes: 'Fleet fuel card. OpEx, NOT MCA. "FLEETCOR FUNDING" descriptor is especially confusing.' },
  { pattern: 'WEX', funder: 'WEX Inc', tier: null, category: 'fuel_card', notes: 'Fleet fuel card. OpEx, NOT MCA.' },
  { pattern: 'WRIGHT EXPRESS', funder: 'WEX Inc (fka Wright Express)', tier: null, category: 'fuel_card' },
  { pattern: 'COMDATA', funder: 'Comdata', tier: null, category: 'fuel_card', notes: 'Fleet fuel card. OpEx, NOT MCA.' },
  { pattern: 'EFS', funder: 'EFS (fleet fuel)', tier: null, category: 'fuel_card' },

  // ─── Loan Products (NOT MCA) ───────────────────────────────────────
  { pattern: 'SBA', funder: 'SBA Loan', tier: null, category: 'loan', notes: 'Government-backed loan. NOT MCA. Classify as other_debt_service.' },
  { pattern: 'LENDISTRY', funder: 'Lendistry', tier: null, category: 'loan', notes: 'CDFI/SBA lender. NOT MCA.' },
  { pattern: 'SHOPIFY CAPITAL', funder: 'Shopify Capital', tier: null, category: 'loan', notes: 'Revenue-based advance through Shopify. Auto-deducts from sales.' },
  { pattern: 'PAYPAL WORKING', funder: 'PayPal Working Capital', tier: null, category: 'loan', notes: 'Revenue-based loan through PayPal. Auto-deducts from sales.' },

  // ─── Settlement / Restructuring (Flag for special handling) ────────
  { pattern: 'INCREASE', funder: 'Funders First Inc', tier: null, category: 'restructuring', notes: 'FF ACH descriptor. NOT debt settlement. Active restructuring program — merchant is enrolled in Funders First PLUS+ program.' },
  { pattern: 'CORPORATE TURNAROUND', funder: 'Corporate Turnaround (settlement)', tier: null, category: 'settlement', notes: 'Debt settlement company. Cold-calls UCC filings. Tells merchants to stop payments. NOT restructuring — this is settlement.' },

  // ─── Post-Default / Post-Restructuring Funders ─────────────────────
  { pattern: 'EMINENT', funder: 'Eminent Funding', tier: 'D', category: 'mca_funder', notes: 'Funds satisfied defaults. No min FICO. ABCD paper. Good post-restructuring re-entry option for merchants.' },
  { pattern: 'RADISSON FUNDING', funder: 'Radisson Funding', tier: 'D', category: 'mca_funder', notes: 'Past defaults OK. No industry restrictions. Up to $2.5M. Post-restructuring option.' },
  { pattern: 'LOANME', funder: 'LoanMe', tier: 'B', category: 'loan', notes: 'No FICO requirement. Monthly payments. Does not care about defaults. Post-restructuring option.' },
];

// Helper: find matching descriptor
export function matchDescriptor(description) {
  if (!description) return null;
  const upper = description.toUpperCase();
  return ACH_DESCRIPTORS.find(d => upper.includes(d.pattern)) || null;
}

// Helper: get all funders by tier
export function getFundersByTier(tier) {
  return ACH_DESCRIPTORS.filter(d => d.tier === tier && d.category === 'mca_funder');
}

// Helper: get all collections descriptors
export function getCollectionsDescriptors() {
  return ACH_DESCRIPTORS.filter(d => d.category === 'collections');
}

// Helper: get all non-MCA descriptors (factoring, fuel, loan)
export function getNonMCADescriptors() {
  return ACH_DESCRIPTORS.filter(d => ['factoring', 'fuel_card', 'loan'].includes(d.category));
}

export default ACH_DESCRIPTORS;

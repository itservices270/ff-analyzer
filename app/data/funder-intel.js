// app/data/funder-intel.js
// Funder Intelligence — localStorage-backed database
// Persists across sessions and deals

const STORAGE_KEY = 'ff_funder_intel';
const OUTCOMES_KEY = 'ff_deal_outcomes';

// ─── Funder Intel CRUD ────────────────────────────────────────────────────

export function getAllFunders() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function saveFunder(funder) {
  const all = getAllFunders();
  const idx = all.findIndex(f => f.id === funder.id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...funder, updated_at: new Date().toISOString() };
  } else {
    all.push({ ...funder, id: funder.id || `funder_${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}

export function deleteFunder(id) {
  const all = getAllFunders().filter(f => f.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}

export function findFunderByName(name) {
  if (!name) return null;
  const all = getAllFunders();
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return all.find(f => {
    const fn = (f.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return fn === normalized || fn.includes(normalized.slice(0, 8)) || normalized.includes(fn.slice(0, 8));
  }) || null;
}

// ─── Deal Outcome Tracking ────────────────────────────────────────────────

export function getAllOutcomes() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(OUTCOMES_KEY) || '[]');
  } catch { return []; }
}

export function saveOutcome(outcome) {
  const all = getAllOutcomes();
  const idx = all.findIndex(o => o.id === outcome.id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...outcome, updated_at: new Date().toISOString() };
  } else {
    all.push({ ...outcome, id: outcome.id || `outcome_${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }
  localStorage.setItem(OUTCOMES_KEY, JSON.stringify(all));
  return all;
}

export function getOutcomesForFunder(funderName) {
  if (!funderName) return [];
  const all = getAllOutcomes();
  const normalized = funderName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return all.filter(o => {
    const fn = (o.funder_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return fn.includes(normalized.slice(0, 8)) || normalized.includes(fn.slice(0, 8));
  });
}

// ─── Funder Intel Schema (for reference when creating new entries) ─────

export const FUNDER_SCHEMA = {
  id: '',
  name: '',
  aliases: [],

  // Contact info
  collections_email: '',
  collections_phone: '',
  servicing_email: '',
  general_email: '',
  general_phone: '',
  physical_address: '',
  key_contacts: [],

  // Contract patterns
  typical_factor_range: '',
  typical_specified_pct: '',
  has_reconciliation: null,
  reconciliation_days: null,
  has_anti_stacking: null,
  stacking_penalty: '',
  has_coj: null,
  coj_enforceable: null,
  governing_law: '',
  arbitration_provider: '',

  // Behavior patterns
  aggression_level: '',
  response_time_days: null,
  typical_settlement_tier: '',
  typical_reduction_accepted: '',
  threatens_coj: null,
  threatens_account_freeze: null,
  sends_to_collections: null,
  collections_firm: '',

  // Intelligence notes
  notes: '',
  last_deal_date: '',
  deals_count: 0,

  // Timestamps
  created_at: '',
  updated_at: '',
};

export const OUTCOME_SCHEMA = {
  id: '',
  deal_name: '',
  funder_name: '',

  // What was proposed
  proposed_weekly: 0,
  proposed_term_weeks: 0,
  proposed_reduction_pct: 0,
  proposal_tier: '',

  // What was accepted
  accepted: null,
  accepted_weekly: 0,
  accepted_term_weeks: 0,
  accepted_reduction_pct: 0,

  // Timeline
  first_contact_date: '',
  response_date: '',
  resolution_date: '',
  days_to_resolution: 0,

  // Notes
  funder_response_type: '',
  counter_offer_details: '',
  resolution_notes: '',

  created_at: '',
  updated_at: '',
};

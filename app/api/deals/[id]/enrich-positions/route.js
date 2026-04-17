import { supabase } from '../../../../../lib/supabase';
import { NextResponse } from 'next/server';
import { assertNotImpersonating } from '../../../../../lib/auth';

// Allowlist of columns the analyzer is permitted to write back.
// Anything outside this list is silently dropped.
const ALLOWED_FIELDS = new Set([
  // bank-statement analysis
  'current_weekly_payment',
  'daily_payment',
  'payment_frequency',
  'ach_descriptor',
  'estimated_balance',
  // agreement analysis
  'purchase_price',
  'purchased_amount',
  'factor_rate',
  'specified_percentage',
  'origination_fee',
  'net_funding',
  'has_reconciliation',
  'reconciliation_days',
  'has_anti_stacking',
  'anti_stacking_penalty',
  'has_coj',
  'coj_enforceable',
  'governing_law',
  'has_arbitration',
  // cross-reference / funder intel
  'enforceability_score',
  'aggressiveness_score',
  'recovery_stake_score',
  'composite_score',
  'funder_intel_grade',
  // bookkeeping
  'source',
  'notes',
]);

function sanitize(fields) {
  const clean = {};
  if (!fields || typeof fields !== 'object') return clean;
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(k) && v !== undefined) clean[k] = v;
  }
  return clean;
}

// POST body:
// { updates: [{ position_id: "<uuid>", fields: { ... } }] }
// Each update row is validated against the deal id in the URL, so a client
// cannot enrich positions outside the currently-loaded deal.
export async function POST(request, { params }) {
  try {
    try {
      await assertNotImpersonating(request);
    } catch (e) {
      return NextResponse.json({ error: e.error }, { status: e.status });
    }
    const { id: dealId } = await params;
    const body = await request.json();
    const updates = Array.isArray(body?.updates) ? body.updates : [];

    if (!dealId) {
      return NextResponse.json({ error: 'deal id missing' }, { status: 400 });
    }
    if (updates.length === 0) {
      return NextResponse.json({ updated: 0, results: [] });
    }

    // Verify every referenced position actually belongs to this deal before
    // mutating anything — prevents cross-deal enrichment via a forged body.
    const positionIds = updates
      .map((u) => u?.position_id)
      .filter((id) => typeof id === 'string' && id.length > 0);

    if (positionIds.length === 0) {
      return NextResponse.json({ error: 'no valid position_id values supplied' }, { status: 400 });
    }

    const { data: owned, error: ownedErr } = await supabase
      .from('positions')
      .select('id')
      .eq('deal_id', dealId)
      .in('id', positionIds);

    if (ownedErr) {
      return NextResponse.json({ error: ownedErr.message }, { status: 500 });
    }

    const ownedSet = new Set((owned || []).map((r) => r.id));
    const results = [];
    let updatedCount = 0;

    for (const u of updates) {
      const pid = u?.position_id;
      if (!pid || !ownedSet.has(pid)) {
        results.push({ position_id: pid, ok: false, reason: 'not-in-deal' });
        continue;
      }
      const fields = sanitize(u.fields);
      if (Object.keys(fields).length === 0) {
        results.push({ position_id: pid, ok: false, reason: 'no-fields' });
        continue;
      }
      const { error: upErr } = await supabase
        .from('positions')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', pid)
        .eq('deal_id', dealId);
      if (upErr) {
        results.push({ position_id: pid, ok: false, reason: upErr.message });
      } else {
        updatedCount += 1;
        results.push({ position_id: pid, ok: true, fields: Object.keys(fields) });
      }
    }

    return NextResponse.json({ updated: updatedCount, results });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

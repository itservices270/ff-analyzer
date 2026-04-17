import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { resolveUser } from '../../../../lib/auth';

// Admin picker — enumerate merchants or ISOs with a display "business
// name" resolved from their deals. public.users does NOT store
// business/company names (confirmed from the schema: person fields
// only — first_name, last_name, email, phone, role, address). For
// merchants the business name lives on deals.merchant_dba /
// merchant_name; for ISOs it lives on deals.iso_name. We fetch users
// by role, search across person fields AND deal business fields, then
// hydrate display names + deal counts from the deals table.

const PAGE_SIZE = 50;
const MATCHABLE_ROLES = new Set(['business_owner', 'iso_partner']);

// GET /api/admin/users?role=business_owner|iso_partner&q=<search>
export async function GET(request) {
  try {
    // Auth — must be an admin. Block impersonation from calling this
    // since the picker lives on the admin UI and we don't want a
    // mid-impersonation request to enumerate users.
    let caller;
    try {
      caller = await resolveUser(request);
    } catch (e) {
      return NextResponse.json({ error: e.error || 'unauthorized' }, { status: e.status || 401 });
    }
    if (!caller.isAdmin) {
      return NextResponse.json({ error: 'admin only' }, { status: 403 });
    }
    if (caller.isImpersonating) {
      return NextResponse.json({ error: 'exit god mode before searching users' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const role = (searchParams.get('role') || '').toLowerCase();
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    if (!MATCHABLE_ROLES.has(role)) {
      return NextResponse.json(
        { error: `role must be one of: ${[...MATCHABLE_ROLES].join(', ')}` },
        { status: 400 }
      );
    }

    const pattern = q ? `%${q}%` : null;
    // deals column that points to the user being enumerated
    const dealColumn = role === 'iso_partner' ? 'iso_wp_user_id' : 'wp_user_id';
    // business-name columns on deals for this role
    const bizCols = role === 'iso_partner'
      ? ['iso_name']
      : ['merchant_dba', 'merchant_name'];

    // ── 1. Primary user lookup: match on person fields. Ordering by
    //      created_at (a Supabase default) — no last_sign_in_at here
    //      because that column lives on auth.users, not public.users.
    let usersQuery = supabase
      .from('users')
      .select('id, email, first_name, last_name, role, created_at')
      .eq('role', role)
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(PAGE_SIZE);

    if (pattern) {
      usersQuery = usersQuery.or(
        `email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`
      );
    }

    const { data: primaryRows, error: primaryErr } = await usersQuery;
    if (primaryErr) {
      return NextResponse.json({ error: primaryErr.message }, { status: 500 });
    }

    // ── 2. Business-name lookup: if the admin searched for something
    //      like "KB Toys" (merchant DBA) or "Cardinal Capital" (ISO
    //      company), we need to also find users whose DEALS match —
    //      the name won't exist on the users row. Look up user ids
    //      behind matching deals, then back-fill any that weren't in
    //      the primary result set.
    let secondaryRows = [];
    if (pattern) {
      const dealOr = bizCols.map((c) => `${c}.ilike.${pattern}`).join(',');
      const { data: dealHits } = await supabase
        .from('deals')
        .select(dealColumn)
        .or(dealOr)
        .not(dealColumn, 'is', null)
        .limit(500);

      const extraIds = [
        ...new Set((dealHits || []).map((d) => d[dealColumn]).filter(Boolean)),
      ];
      const alreadyHave = new Set((primaryRows || []).map((r) => r.id));
      const missing = extraIds.filter((id) => !alreadyHave.has(id));

      if (missing.length > 0) {
        const { data: extraRows } = await supabase
          .from('users')
          .select('id, email, first_name, last_name, role, created_at')
          .in('id', missing)
          .eq('role', role)
          .limit(PAGE_SIZE);
        secondaryRows = extraRows || [];
      }
    }

    const allRows = [...(primaryRows || []), ...secondaryRows].slice(0, PAGE_SIZE);
    const userIds = allRows.map((r) => r.id);

    // ── 3. Hydrate display business name + deal count per user.
    //      Most recently updated deal wins for the display name.
    const nameByUser = {};
    const dealCountByUser = {};
    if (userIds.length > 0) {
      const bizSelect = [dealColumn, ...bizCols, 'updated_at', 'created_at'].join(', ');
      const { data: dealRows } = await supabase
        .from('deals')
        .select(bizSelect)
        .in(dealColumn, userIds)
        .order('updated_at', { ascending: false });

      (dealRows || []).forEach((d) => {
        const key = d[dealColumn];
        if (!key) return;
        dealCountByUser[key] = (dealCountByUser[key] || 0) + 1;
        // First row per user (in descending updated_at order) wins
        if (!(key in nameByUser)) {
          const nm = bizCols.map((c) => d[c]).find((v) => !!v) || null;
          nameByUser[key] = nm;
        }
      });
    }

    const users = allRows.map((r) => ({
      id: r.id,
      email: r.email,
      full_name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null,
      business_name: nameByUser[r.id] || null,
      role: r.role,
      deal_count: dealCountByUser[r.id] || 0,
      // last_active_at removed — public.users doesn't track sign-in
      // timestamps (those live on auth.users). Could be back-filled
      // via supabase.auth.admin.getUserById if needed, but that's N
      // round-trips per request.
      last_active_at: null,
    }));

    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

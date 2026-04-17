import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { resolveUser } from '../../../../lib/auth';

// Paginate through auth.users with the admin API, since user_metadata.role
// is the source of truth. Matches on first_name / last_name / email /
// business_name via the public `users` table, then back-fills with auth
// metadata for the displayed fields.

const PAGE_SIZE = 50;
const MATCHABLE_ROLES = new Set(['business_owner', 'iso_partner']);

function lower(s) { return (s || '').toString().toLowerCase(); }

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

    // Primary lookup — public.users table. Has first_name / last_name /
    // email / business_name and a role column, so we can filter there.
    let usersQuery = supabase
      .from('users')
      .select('id, email, first_name, last_name, business_name, role, last_sign_in_at, created_at')
      .eq('role', role)
      .order('last_sign_in_at', { ascending: false, nullsFirst: false })
      .limit(PAGE_SIZE);

    if (q) {
      // ilike across the few searchable columns — Supabase OR syntax
      const pattern = `%${q}%`;
      usersQuery = usersQuery.or(
        `email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},business_name.ilike.${pattern}`
      );
    }

    const { data: rows, error } = await usersQuery;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const userIds = (rows || []).map((r) => r.id);

    // Deal count — cheap per-user tally. For merchants: deals.wp_user_id.
    // For ISOs: deals.iso_wp_user_id.
    const dealColumn = role === 'iso_partner' ? 'iso_wp_user_id' : 'wp_user_id';
    let dealCountByUser = {};
    if (userIds.length > 0) {
      const { data: dealRows } = await supabase
        .from('deals')
        .select(`id, ${dealColumn}`)
        .in(dealColumn, userIds);
      (dealRows || []).forEach((d) => {
        const key = d[dealColumn];
        if (!key) return;
        dealCountByUser[key] = (dealCountByUser[key] || 0) + 1;
      });
    }

    const users = (rows || []).map((r) => ({
      id: r.id,
      email: r.email,
      full_name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null,
      business_name: r.business_name || null,
      role: r.role,
      deal_count: dealCountByUser[r.id] || 0,
      last_active_at: r.last_sign_in_at || null,
    }));

    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

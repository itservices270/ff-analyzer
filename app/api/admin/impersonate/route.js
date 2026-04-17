import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { resolveUser, IMPERSONATE_COOKIE } from '../../../../lib/auth';

// HttpOnly cookie lives for the browser session; admin explicitly clicks
// Exit to clear it. No Max-Age → session cookie.
function serializeImpersonationCookie(targetUserId) {
  const parts = [
    `${IMPERSONATE_COOKIE}=${encodeURIComponent(targetUserId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
  ];
  return parts.join('; ');
}

function serializeClearCookie() {
  return [
    `${IMPERSONATE_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    'Max-Age=0',
  ].join('; ');
}

// GET /api/admin/impersonate — status endpoint for the frontend
// Returns { impersonating: { id, email, full_name, business_name, role } | null }
export async function GET(request) {
  try {
    let caller;
    try {
      caller = await resolveUser(request);
    } catch (e) {
      return NextResponse.json({ error: e.error || 'unauthorized' }, { status: e.status || 401 });
    }

    // Only admins (including when impersonating) see impersonation status
    if (!caller.isAdmin) {
      return NextResponse.json({ impersonating: null });
    }

    if (!caller.isImpersonating) {
      return NextResponse.json({ impersonating: null });
    }

    // Hydrate target user for display
    const targetId = caller.userId;
    const { data: targetRow } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, business_name, role')
      .eq('id', targetId)
      .maybeSingle();

    // Fallback to auth metadata if public.users row is missing
    let full_name = null;
    let email = null;
    let business_name = null;
    let role = null;
    if (targetRow) {
      full_name = [targetRow.first_name, targetRow.last_name].filter(Boolean).join(' ').trim() || null;
      email = targetRow.email;
      business_name = targetRow.business_name || null;
      role = targetRow.role;
    } else {
      try {
        const { data: authLookup } = await supabase.auth.admin.getUserById(targetId);
        const u = authLookup?.user;
        if (u) {
          const meta = u.user_metadata || {};
          full_name = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || null;
          email = u.email;
          role = meta.role || u.app_metadata?.role || null;
        }
      } catch {}
    }

    return NextResponse.json({
      impersonating: {
        id: targetId,
        email,
        full_name,
        business_name,
        role,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/admin/impersonate — start a god-mode session for target_user_id
// Body: { target_user_id: "<uuid>" }
// Sets the HttpOnly cookie + writes an audit row. Returns redirect URL.
export async function POST(request) {
  try {
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
      return NextResponse.json(
        { error: 'already impersonating — exit first before starting a new session' },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const targetId = (body.target_user_id || '').toString().trim();
    if (!targetId) {
      return NextResponse.json({ error: 'target_user_id is required' }, { status: 400 });
    }

    // Verify the target exists and has a dashboard role
    const { data: targetRow } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', targetId)
      .maybeSingle();

    let targetRole = targetRow?.role;
    if (!targetRole) {
      try {
        const { data: authLookup } = await supabase.auth.admin.getUserById(targetId);
        const meta = authLookup?.user?.user_metadata || {};
        const appMeta = authLookup?.user?.app_metadata || {};
        targetRole = meta.role || appMeta.role || null;
      } catch {}
    }
    if (!targetRole) {
      return NextResponse.json({ error: 'target user not found' }, { status: 404 });
    }
    if (!['business_owner', 'iso_partner'].includes(targetRole)) {
      return NextResponse.json(
        { error: `cannot impersonate role "${targetRole}" — only merchants and ISOs are supported` },
        { status: 400 }
      );
    }

    // Write audit log row — best-effort; don't block impersonation if
    // the audit table is missing (it'll be created by the migration).
    try {
      await supabase.from('god_mode_sessions').insert({
        admin_user_id: caller.adminUserId || caller.userId,
        target_user_id: targetId,
        target_role: targetRole,
        user_agent: request.headers.get('user-agent') || null,
        ip_address:
          request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
          request.headers.get('x-real-ip') ||
          null,
      });
    } catch (auditErr) {
      console.warn('[impersonate] audit insert failed:', auditErr?.message);
    }

    const redirect =
      targetRole === 'iso_partner' ? '/dashboard/iso' : '/dashboard/bo';

    const res = NextResponse.json({ ok: true, redirect, target_role: targetRole });
    res.headers.set('Set-Cookie', serializeImpersonationCookie(targetId));
    return res;
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Convenience: DELETE same as POST /exit
export async function DELETE(request) {
  return clearImpersonation(request);
}

async function clearImpersonation(request) {
  try {
    // Allow clearing even if the caller isn't fully admin-verified — if
    // they can present the cookie it should clear. But we still audit
    // what admin was attached to it if we can resolve it.
    let caller = null;
    try {
      caller = await resolveUser(request);
    } catch {}

    // Close the most recent open audit row for this admin+target pair
    if (caller?.isAdmin && caller.isImpersonating) {
      try {
        const { data: openRow } = await supabase
          .from('god_mode_sessions')
          .select('id')
          .eq('admin_user_id', caller.adminUserId)
          .eq('target_user_id', caller.userId)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (openRow?.id) {
          await supabase
            .from('god_mode_sessions')
            .update({ ended_at: new Date().toISOString() })
            .eq('id', openRow.id);
        }
      } catch (auditErr) {
        console.warn('[impersonate exit] audit close failed:', auditErr?.message);
      }
    }

    const res = NextResponse.json({ ok: true, redirect: '/dashboard/admin' });
    res.headers.set('Set-Cookie', serializeClearCookie());
    return res;
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// exported so exit/route.js can share the same implementation
export { clearImpersonation };

// Extracts the authenticated user's ID from the request.
// Priority: Authorization header → Supabase auth cookie.
// God Mode: honours the HttpOnly `ff_impersonate_user_id` cookie when the
// calling user is admin, and returns { effectiveUserId, isImpersonating }.
// Returns { userId, isAdmin, isImpersonating, adminUserId } or throws a 401.

import { supabase } from './supabase';

export const IMPERSONATE_COOKIE = 'ff_impersonate_user_id';

function readImpersonationCookie(request) {
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.match(/ff_impersonate_user_id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Resolve the calling user from the request. Returns the EFFECTIVE user id
 * (= the impersonation target when god mode is active, otherwise the
 * authenticated user). Also returns:
 *   - isAdmin: whether the authenticated user is admin
 *   - isImpersonating: whether an impersonation session is active
 *   - adminUserId: original admin id when impersonating (for audit/log)
 *
 * Throws { status: 401, error: string } on auth failure.
 */
export async function resolveUser(request) {
  let userId = null;
  let isAdmin = false;

  // ── 1. Bearer token ──────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) {
      userId = data.user.id;
      const role = (data.user.user_metadata?.role || data.user.app_metadata?.role || '').toString().toLowerCase();
      if (role === 'admin') isAdmin = true;
    }
  }

  // ── 2. Supabase auth cookie ──────────────────────────────────────
  if (!userId) {
    const cookies = request.headers.get('cookie') || '';
    const match = cookies.match(/sb-[a-z0-9]+-auth-token=([^;]+)/);
    if (match) {
      try {
        let rawValue = decodeURIComponent(match[1]);

        // Supabase cookie format changed: new cookies are emitted as
        // `base64-<base64-encoded JSON>`. Strip the prefix and decode
        // back to JSON. Old URL-encoded-JSON cookies (no prefix) still
        // parse via the JSON.parse path below, so both formats coexist
        // during the migration window.
        if (rawValue.startsWith('base64-')) {
          const base64Payload = rawValue.slice('base64-'.length);
          rawValue = Buffer.from(base64Payload, 'base64').toString('utf-8');
        }

        const parsed = JSON.parse(rawValue);
        const accessToken = Array.isArray(parsed) ? parsed[0] : parsed?.access_token;
        if (accessToken) {
          const { data, error } = await supabase.auth.getUser(accessToken);
          if (!error && data?.user) {
            userId = data.user.id;
            const role = (data.user.user_metadata?.role || data.user.app_metadata?.role || '').toString().toLowerCase();
            if (role === 'admin') isAdmin = true;
          }
        }
      } catch (err) {
        // malformed cookie — fall through. Log so future cookie-format
        // changes are easy to diagnose (previously this was silent).
        console.warn('[resolveUser] cookie parse failed:', err?.message);
      }
    }
  }

  if (!userId) {
    throw { status: 401, error: 'unauthorized' };
  }

  // ── 4. God Mode impersonation ───────────────────────────────────
  // If the authenticated user is admin AND the impersonation cookie is
  // present, return the target user's id as the effective caller.
  const adminUserId = isAdmin ? userId : null;
  const impersonateTargetId = readImpersonationCookie(request);
  if (isAdmin && impersonateTargetId) {
    return {
      userId: impersonateTargetId,
      isAdmin: true,
      isImpersonating: true,
      adminUserId,
    };
  }

  return { userId, isAdmin, isImpersonating: false, adminUserId };
}

/**
 * Mutating route guard: throw 403 when the active session is a God Mode
 * impersonation. Admins must exit impersonation before making edits.
 * Call at the top of any POST/PUT/PATCH/DELETE handler that writes data
 * belonging to the impersonated user.
 *
 * Usage:
 *   try {
 *     await assertNotImpersonating(request);
 *   } catch (e) {
 *     return NextResponse.json({ error: e.error }, { status: e.status });
 *   }
 */
export async function assertNotImpersonating(request) {
  const impersonateTargetId = readImpersonationCookie(request);
  if (!impersonateTargetId) return; // no cookie = no impersonation, allow

  // Cookie present — must verify the caller is actually admin before
  // deciding to block. A forged cookie from a non-admin is ignored.
  try {
    const { isAdmin } = await resolveUser(request);
    // resolveUser returns isAdmin=true even when impersonating, so we
    // reach this line only when the session IS admin + impersonating.
    if (isAdmin) {
      throw {
        status: 403,
        error: 'read-only mode — admins cannot make changes while in God Mode. Exit impersonation to edit.',
      };
    }
  } catch (e) {
    if (e && e.status === 403) throw e;
    // 401 or other failures: fall through. We don't want to block a
    // genuine unauthenticated/expired call; the downstream auth check
    // will handle it.
  }
}

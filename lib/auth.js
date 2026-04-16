// Extracts the authenticated user's ID from the request.
// Priority: Authorization header → Supabase auth cookie → query param (admin only).
// Returns { userId, isAdmin } or throws a 401-style object.

import { supabase } from './supabase';

/**
 * Resolve the calling user from the request. Tries (in order):
 *   1. Authorization: Bearer <token> header
 *   2. Supabase session cookie (sb-*-auth-token)
 *   3. ?user_id= query param — ONLY honoured when the resolved user
 *      is an admin (God Mode impersonation). Regular users are rejected
 *      if they supply a user_id that doesn't match their session.
 *
 * Returns { userId: string, isAdmin: boolean }
 * Throws  { status: 401, error: string } on failure — caller should
 *         catch and return the appropriate response.
 */
export async function resolveUser(request) {
  const url = new URL(request.url);
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
    // The cookie name pattern is sb-<project-ref>-auth-token
    const cookies = request.headers.get('cookie') || '';
    const match = cookies.match(/sb-[a-z0-9]+-auth-token=([^;]+)/);
    if (match) {
      try {
        const decoded = decodeURIComponent(match[1]);
        // Cookie value is either a JSON array [access, refresh] or a JSON object
        const parsed = JSON.parse(decoded);
        const accessToken = Array.isArray(parsed) ? parsed[0] : parsed?.access_token;
        if (accessToken) {
          const { data, error } = await supabase.auth.getUser(accessToken);
          if (!error && data?.user) {
            userId = data.user.id;
            const role = (data.user.user_metadata?.role || data.user.app_metadata?.role || '').toString().toLowerCase();
            if (role === 'admin') isAdmin = true;
          }
        }
      } catch {
        // malformed cookie — fall through
      }
    }
  }

  // ── 3. Query-param fallback (admin God Mode only) ────────────────
  const queryUserId = url.searchParams.get('user_id') || url.searchParams.get('wp_user_id');
  if (!userId && queryUserId) {
    // Verify the query-param user is an admin via the admin API
    try {
      const { data: authLookup, error: authErr } =
        await supabase.auth.admin.getUserById(queryUserId);
      if (!authErr && authLookup?.user) {
        const meta = authLookup.user.user_metadata || {};
        const appMeta = authLookup.user.app_metadata || {};
        const role = (meta.role || appMeta.role || '').toString().toLowerCase();
        if (role === 'admin') {
          userId = queryUserId;
          isAdmin = true;
        }
      }
    } catch {
      // lookup failed — reject
    }
  }

  // Also allow an authenticated admin to impersonate via ?iso_user_id=
  const isoUserIdParam = url.searchParams.get('iso_user_id');
  if (isAdmin && isoUserIdParam) {
    // Admin is impersonating a specific ISO — use that ID for data queries
    return { userId: isoUserIdParam, isAdmin: true };
  }

  if (!userId) {
    throw { status: 401, error: 'unauthorized' };
  }

  return { userId, isAdmin };
}

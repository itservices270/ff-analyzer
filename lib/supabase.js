import { createClient } from '@supabase/supabase-js';

let _supabase = null;

export function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || url.startsWith('REPLACE')) {
      throw new Error('Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Backward compat — lazy getter
export const supabase = new Proxy({}, {
  get(_, prop) {
    return getSupabase()[prop];
  }
});

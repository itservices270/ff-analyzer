import { supabase } from '../../../../lib/supabase';
import { NextResponse } from 'next/server';

// GET — Deals awaiting underwriting, oldest first.
// Returns id, core merchant fields, iso info, and joined positions.
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('deals')
      .select(`
        id,
        merchant_name,
        merchant_dba,
        status,
        created_at,
        updated_at,
        position_count,
        total_balance,
        total_weekly_burden,
        owner_first,
        owner_last,
        owner_email,
        iso_name,
        iso_wp_user_id,
        positions (
          id,
          funder_name,
          estimated_balance,
          current_weekly_payment,
          payment_frequency,
          position_order,
          status
        )
      `)
      .in('status', ['in_submissions', 'in_underwriting', 'uw_needs_info', 'submitted', 'analysis'])
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Resolve ISO display names from users table when iso_name isn't populated
    const unresolved = (data || [])
      .filter((d) => !d.iso_name && d.iso_wp_user_id)
      .map((d) => d.iso_wp_user_id);
    let isoNameById = {};
    if (unresolved.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .in('id', Array.from(new Set(unresolved)));
      (users || []).forEach((u) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
        isoNameById[u.id] = name || u.email || null;
      });
    }

    const deals = (data || []).map((d) => ({
      ...d,
      iso_name: d.iso_name || isoNameById[d.iso_wp_user_id] || null,
    }));

    return NextResponse.json({ deals });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

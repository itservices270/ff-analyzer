import { supabase } from '../../../../lib/supabase';
import { resolveUser, assertNotImpersonating } from '../../../../lib/auth';
import { NextResponse } from 'next/server';

// GET /api/iso/reps — list reps for the authenticated ISO
export async function GET(request) {
  try {
    let userId;
    try {
      ({ userId } = await resolveUser(request));
    } catch (e) {
      return NextResponse.json({ error: e.error || 'unauthorized' }, { status: e.status || 401 });
    }

    const { data, error } = await supabase
      .from('iso_reps')
      .select('id, first_name, last_name, title, email, phone, is_active, created_at')
      .eq('iso_user_id', userId)
      .order('is_active', { ascending: false })
      .order('last_name', { ascending: true });

    if (error) {
      if ((error.code || '').startsWith('42P') || /relation .* does not exist/i.test(error.message || '')) {
        return NextResponse.json({ reps: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reps: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/iso/reps — create a new rep
// Body JSON: { first_name, last_name, title, email, phone, user_id }
export async function POST(request) {
  try {
    try {
      await assertNotImpersonating(request);
    } catch (e) {
      return NextResponse.json({ error: e.error }, { status: e.status });
    }
    let userId;
    try {
      ({ userId } = await resolveUser(request.clone()));
    } catch (e) {
      return NextResponse.json({ error: e.error || 'unauthorized' }, { status: e.status || 401 });
    }

    const body = await request.json();

    const { first_name, last_name, title, email, phone } = body;
    if (!first_name?.trim() || !last_name?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: 'first_name, last_name, and email are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('iso_reps')
      .insert({
        iso_user_id: userId,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        title: title?.trim() || null,
        email: email.trim(),
        phone: phone?.trim() || null,
        is_active: true,
      })
      .select('id, first_name, last_name, title, email, phone, is_active, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

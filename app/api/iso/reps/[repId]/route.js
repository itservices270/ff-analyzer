import { supabase } from '../../../../../lib/supabase';
import { NextResponse } from 'next/server';

// PUT /api/iso/reps/[repId] — update an existing rep
// Body JSON: any of { first_name, last_name, title, email, phone, is_active }
export async function PUT(request, { params }) {
  try {
    const { repId } = await params;
    const body = await request.json();
    const userId = body.user_id || request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }
    if (!repId) {
      return NextResponse.json({ error: 'repId required' }, { status: 400 });
    }

    // Build update object from allowed fields only
    const allowed = ['first_name', 'last_name', 'title', 'email', 'phone', 'is_active'];
    const updates = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'no valid fields to update' }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    // Must belong to requesting ISO
    const { data, error } = await supabase
      .from('iso_reps')
      .update(updates)
      .eq('id', repId)
      .eq('iso_user_id', userId)
      .select('id, first_name, last_name, title, email, phone, is_active, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'rep not found or not yours' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/iso/reps/[repId] — hard delete a rep (only if no deals assigned)
export async function DELETE(request, { params }) {
  try {
    const { repId } = await params;
    const userId = new URL(request.url).searchParams.get('user_id') ||
      request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }
    if (!repId) {
      return NextResponse.json({ error: 'repId required' }, { status: 400 });
    }

    // Check if any deals are assigned to this rep
    const { count, error: countErr } = await supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_rep_id', repId);

    if (countErr) {
      // If column doesn't exist yet, allow delete (no deals could be assigned)
      if (!((countErr.code || '').startsWith('42') || /does not exist/i.test(countErr.message || ''))) {
        return NextResponse.json({ error: countErr.message }, { status: 500 });
      }
    } else if ((count || 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${count} deal(s) assigned to this rep. Deactivate instead (PUT is_active=false).` },
        { status: 409 }
      );
    }

    // Must belong to requesting ISO
    const { data, error } = await supabase
      .from('iso_reps')
      .delete()
      .eq('id', repId)
      .eq('iso_user_id', userId)
      .select('id')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'rep not found or not yours' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: true, id: data.id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

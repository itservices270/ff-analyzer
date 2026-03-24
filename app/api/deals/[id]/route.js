import { supabase } from '../../../../lib/supabase';
import { NextResponse } from 'next/server';

// GET — Single deal with positions
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from('deals')
      .select('*, positions(*)')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT — Update deal fields
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Remove fields that shouldn't be directly set
    delete body.id;
    delete body.created_at;
    delete body.positions;

    body.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('deals')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — Soft delete (set status to cancelled)
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from('deals')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Deal cancelled', deal: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

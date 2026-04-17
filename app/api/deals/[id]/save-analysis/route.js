import { supabase } from '../../../../../lib/supabase';
import { NextResponse } from 'next/server';
import { assertNotImpersonating } from '../../../../../lib/auth';

// POST — Save the full analyzer session JSON to deal
export async function POST(request, { params }) {
  try {
    try {
      await assertNotImpersonating(request);
    } catch (e) {
      return NextResponse.json({ error: e.error }, { status: e.status });
    }
    const { id } = await params;
    const body = await request.json();
    const { analyzer_session_data } = body;

    if (!analyzer_session_data) {
      return NextResponse.json({ error: 'analyzer_session_data is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('deals')
      .update({
        analyzer_session_data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Analysis saved', deal: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

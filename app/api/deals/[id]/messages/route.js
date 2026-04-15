import { supabase } from '../../../../../lib/supabase';
import { NextResponse } from 'next/server';

// GET /api/deals/[id]/messages — list messages for a deal, oldest first
export async function GET(_request, { params }) {
  try {
    const { id: dealId } = await params;
    if (!dealId) {
      return NextResponse.json({ error: 'deal id missing' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('deal_messages')
      .select('id, deal_id, sender_role, sender_name, message, created_at, read_at')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: true });

    if (error) {
      // Treat missing table as empty thread so the UI doesn't crash
      // before the migration has been applied.
      if ((error.code || '').startsWith('42P') || /relation .* does not exist/i.test(error.message || '')) {
        return NextResponse.json({ messages: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ messages: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/deals/[id]/messages — append a message to the thread
// Body: { sender_role, sender_name, message }
export async function POST(request, { params }) {
  try {
    const { id: dealId } = await params;
    const body = await request.json();
    const { sender_role, sender_name, message } = body || {};

    if (!dealId) {
      return NextResponse.json({ error: 'deal id missing' }, { status: 400 });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }
    const role = (sender_role || '').toString();
    if (!['iso', 'uw', 'system', 'merchant'].includes(role)) {
      return NextResponse.json({ error: 'invalid sender_role' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('deal_messages')
      .insert({
        deal_id: dealId,
        sender_role: role,
        sender_name: sender_name || null,
        message: message.trim(),
      })
      .select('id, deal_id, sender_role, sender_name, message, created_at, read_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

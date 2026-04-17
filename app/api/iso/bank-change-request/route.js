import { supabase } from '../../../../lib/supabase';
import { resolveUser, assertNotImpersonating } from '../../../../lib/auth';
import { sendResendEmail } from '../../../../lib/notifications';
import { NextResponse } from 'next/server';

const BUCKET = 'iso-bank-docs';

function mask(val) {
  const s = String(val || '');
  return s.length > 4 ? '****' + s.slice(-4) : '****';
}

function safeFileName(name) {
  return String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

// POST /api/iso/bank-change-request — submit a bank account change request
// Accepts FormData: account_holder, bank_name, routing_number, account_number,
// account_type, notes, supporting_doc (file), user_id
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

    const accountHolder = (form.get('account_holder') || '').toString().trim();
    const bankName = (form.get('bank_name') || '').toString().trim();
    const routingNumber = (form.get('routing_number') || '').toString().trim();
    const accountNumber = (form.get('account_number') || '').toString().trim();
    const accountType = (form.get('account_type') || 'checking').toString().trim();
    const notes = (form.get('notes') || '').toString().trim();
    const supportingDoc = form.get('supporting_doc');

    if (!accountHolder || !bankName || !routingNumber || !accountNumber) {
      return NextResponse.json(
        { error: 'account_holder, bank_name, routing_number, and account_number are required' },
        { status: 400 }
      );
    }
    if (!supportingDoc || typeof supportingDoc === 'string') {
      return NextResponse.json({ error: 'supporting_doc file is required' }, { status: 400 });
    }

    // Upload supporting doc
    const ext = (supportingDoc.name || '').split('.').pop() || 'pdf';
    const storagePath = `${userId}/${Date.now()}_${safeFileName(supportingDoc.name)}`;
    const bytes = Buffer.from(await supportingDoc.arrayBuffer());
    const contentType = supportingDoc.type || 'application/octet-stream';

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: false });

    if (uploadErr) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadErr.message}. Ensure "${BUCKET}" bucket exists.` },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const docUrl = publicUrlData?.publicUrl || storagePath;

    // Insert change request
    const { data: row, error: dbErr } = await supabase
      .from('iso_bank_change_requests')
      .insert({
        iso_user_id: userId,
        account_holder: accountHolder,
        bank_name: bankName,
        routing_number: routingNumber,
        account_number: accountNumber,
        account_type: accountType,
        supporting_doc_url: docUrl,
        notes: notes || null,
        status: 'pending',
      })
      .select()
      .single();

    if (dbErr) {
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    // Look up ISO name for the email
    let isoName = 'an ISO partner';
    try {
      const { data: authLookup } = await supabase.auth.admin.getUserById(userId);
      const meta = authLookup?.user?.user_metadata || {};
      isoName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() || isoName;
    } catch {}

    // Send notification email — best effort
    const from = process.env.NOTIFICATION_FROM_EMAIL || 'Funders First <deals@fundersfirst.com>';
    await sendResendEmail({
      from,
      to: ['info@fundersfirst.com'],
      subject: `Bank Change Request — ${isoName}`,
      text: [
        `Bank change request from ${isoName}`,
        '',
        `Account Holder: ${accountHolder}`,
        `Bank: ${bankName}`,
        `Routing: ${mask(routingNumber)}`,
        `Account: ${mask(accountNumber)}`,
        `Type: ${accountType}`,
        '',
        notes ? `Notes: ${notes}` : '',
        '',
        `Supporting Doc: ${docUrl}`,
        `Request ID: ${row.id}`,
        '',
        'Review in the admin panel.',
      ].filter(Boolean).join('\n'),
    });

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

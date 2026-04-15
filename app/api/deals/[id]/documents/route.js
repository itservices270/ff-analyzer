import { supabase } from '../../../../../lib/supabase';
import { NextResponse } from 'next/server';

const BUCKET = 'deal-files';

function safeFileName(name) {
  return String(name || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 120);
}

// GET /api/deals/[id]/documents — list documents for a deal
export async function GET(_request, { params }) {
  try {
    const { id: dealId } = await params;
    if (!dealId) {
      return NextResponse.json({ error: 'deal id missing' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('deal_documents')
      .select('id, deal_id, file_name, description, file_url, file_type, file_size, uploaded_by_role, created_at')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false });

    if (error) {
      if ((error.code || '').startsWith('42P') || /relation .* does not exist/i.test(error.message || '')) {
        return NextResponse.json({ documents: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ documents: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/deals/[id]/documents — upload a file to Supabase Storage and
// record it in the deal_documents table. Accepts multipart/form-data with:
//   file         (File, required)
//   file_name    (string, required) — ISO-entered display name
//   description  (string, optional)
//   deal_id      (string, optional — verified against the URL param)
export async function POST(request, { params }) {
  try {
    const { id: dealId } = await params;
    if (!dealId) {
      return NextResponse.json({ error: 'deal id missing' }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const fileName = (form.get('file_name') || '').toString().trim();
    const description = (form.get('description') || '').toString().trim();
    const bodyDealId = (form.get('deal_id') || '').toString().trim();

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!fileName) {
      return NextResponse.json({ error: 'file_name is required' }, { status: 400 });
    }
    if (bodyDealId && bodyDealId !== dealId) {
      return NextResponse.json({ error: 'deal_id mismatch' }, { status: 400 });
    }

    // Verify deal exists (prevents orphan uploads under a forged id)
    const { data: dealRow, error: dealErr } = await supabase
      .from('deals')
      .select('id')
      .eq('id', dealId)
      .maybeSingle();
    if (dealErr) {
      return NextResponse.json({ error: dealErr.message }, { status: 500 });
    }
    if (!dealRow) {
      return NextResponse.json({ error: 'deal not found' }, { status: 404 });
    }

    // Upload to Supabase Storage at {deal_id}/{uuid}_{filename}
    const uuid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const originalName = safeFileName(file.name || fileName);
    const storagePath = `${dealId}/${uuid}_${originalName}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'application/octet-stream';

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType,
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json(
        {
          error: `Storage upload failed: ${uploadErr.message}. ` +
            `Make sure the "${BUCKET}" bucket exists in Supabase Storage.`,
        },
        { status: 500 }
      );
    }

    // Get a public URL (if bucket is public) — falls back to the storage
    // path so the client at least has a stable reference.
    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const fileUrl = publicUrlData?.publicUrl || storagePath;

    // Record the document row
    const { data: inserted, error: insertErr } = await supabase
      .from('deal_documents')
      .insert({
        deal_id: dealId,
        file_name: fileName,
        description: description || null,
        file_url: fileUrl,
        file_type: contentType,
        file_size: bytes.length,
        uploaded_by_role: 'iso',
      })
      .select('id, deal_id, file_name, description, file_url, file_type, file_size, uploaded_by_role, created_at')
      .single();

    if (insertErr) {
      // Try to clean up the uploaded blob if we can't record it
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

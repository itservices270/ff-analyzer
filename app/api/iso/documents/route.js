import { supabase } from '../../../../lib/supabase';
import { NextResponse } from 'next/server';

const BUCKET = 'iso-documents';
const VALID_DOC_TYPES = new Set(['government_id', 'w9', 'voided_check', 'iso_agreement']);

function safeFileName(name) {
  return String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

// GET /api/iso/documents — list the authenticated ISO's uploaded docs
export async function GET(request) {
  try {
    const userId = request.headers.get('x-user-id') ||
      new URL(request.url).searchParams.get('user_id');
    if (!userId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('iso_documents')
      .select('id, doc_type, file_name, file_url, file_type, file_size, created_at')
      .eq('iso_user_id', userId)
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

// POST /api/iso/documents — upload an ISO document (ID, W-9, etc.)
// Accepts FormData: file (File), doc_type (string), user_id (string)
export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const docType = (form.get('doc_type') || '').toString().trim();
    const userId = form.get('user_id')?.toString().trim() ||
      request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 });
    }
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!VALID_DOC_TYPES.has(docType)) {
      return NextResponse.json(
        { error: `doc_type must be one of: ${[...VALID_DOC_TYPES].join(', ')}` },
        { status: 400 }
      );
    }

    // Upload to storage
    const ext = (file.name || '').split('.').pop() || 'pdf';
    const storagePath = `${userId}/${docType}_${Date.now()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'application/octet-stream';

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
    const fileUrl = publicUrlData?.publicUrl || storagePath;

    // Upsert — replaces existing doc of the same type per UNIQUE(iso_user_id, doc_type)
    const { data: row, error: dbErr } = await supabase
      .from('iso_documents')
      .upsert(
        {
          iso_user_id: userId,
          doc_type: docType,
          file_name: safeFileName(file.name),
          file_url: fileUrl,
          file_type: contentType,
          file_size: bytes.length,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'iso_user_id,doc_type' }
      )
      .select('id, doc_type, file_name, file_url, file_type, file_size, created_at')
      .single();

    if (dbErr) {
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

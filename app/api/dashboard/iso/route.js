import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const wpUserId = searchParams.get('wp_user_id');

    if (!wpUserId) {
      return jsonResponse({ error: 'wp_user_id is required' }, 400, request);
    }

    // Get all deals for this ISO
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select(`
        id, merchant_name, merchant_dba, status, enrollment_status,
        total_balance, total_weekly_burden, current_dsr, proposed_dsr,
        merchant_weekly_payment, iso_commission_total, iso_commission_points,
        proposed_reduction_pct, agreement_token,
        owner_first, owner_last, owner_email, owner_phone,
        position_count, created_at, updated_at,
        positions(id, funder_name, estimated_balance, current_weekly_payment, payment_frequency, agreement_status, status)
      `)
      .eq('iso_wp_user_id', wpUserId)
      .order('updated_at', { ascending: false });

    if (dealsError) {
      return jsonResponse({ error: dealsError.message }, 500, request);
    }

    // Pull messages + documents per deal in two batched queries so the
    // expanded view renders without additional round-trips. Both tables
    // may not exist yet — swallow "relation does not exist" so the rest
    // of the response still works.
    const dealIds = (deals || []).map((d) => d.id).filter(Boolean);
    let messagesByDeal = {};
    let documentsByDeal = {};
    if (dealIds.length > 0) {
      const [msgRes, docRes] = await Promise.all([
        supabase
          .from('deal_messages')
          .select('id, deal_id, sender_role, sender_name, message, created_at, read_at')
          .in('deal_id', dealIds)
          .order('created_at', { ascending: true }),
        supabase
          .from('deal_documents')
          .select('id, deal_id, file_name, description, file_url, file_type, file_size, uploaded_by_role, created_at')
          .in('deal_id', dealIds)
          .order('created_at', { ascending: false }),
      ]);

      if (msgRes.error) {
        const e = msgRes.error;
        if (!((e.code || '').startsWith('42P') || /relation .* does not exist/i.test(e.message || ''))) {
          console.warn('[dashboard/iso] messages query failed:', e.message);
        }
      } else {
        for (const m of msgRes.data || []) {
          (messagesByDeal[m.deal_id] = messagesByDeal[m.deal_id] || []).push(m);
        }
      }
      if (docRes.error) {
        const e = docRes.error;
        if (!((e.code || '').startsWith('42P') || /relation .* does not exist/i.test(e.message || ''))) {
          console.warn('[dashboard/iso] documents query failed:', e.message);
        }
      } else {
        for (const d of docRes.data || []) {
          (documentsByDeal[d.deal_id] = documentsByDeal[d.deal_id] || []).push(d);
        }
      }
    }

    // Status groups used by the redesigned ISO home page
    const EARNED_STATUSES = new Set(['enrolled', 'modified_payment', 'graduated']);
    const PIPELINE_STATUSES = new Set([
      'approved',
      'priced',
      'agreement_requested',
      'agreement_signed',
      'final_review',
      'welcome_call',
      'enrollment_fee_rcvd',
    ]);
    const ACTIVE_DISPLAY_STATUSES = new Set([
      'in_submissions',
      'submitted',
      'in_underwriting',
      'analysis',
      'uw_needs_info',
      'approved',
      'priced',
      'agreement_requested',
      'agreement_signed',
      'final_review',
      'welcome_call',
      'enrollment_fee_rcvd',
      'enrolled',
      'active',
      'modified_payment',
    ]);

    let activeCount = 0;
    let enrolledCount = 0;
    let submittedCount = 0;
    let commissionEarned = 0;
    let commissionPotential = 0;
    let pipelineCount = 0;
    let totalMerchantSavings = 0;

    for (const deal of deals || []) {
      const status = (deal.status || '').toLowerCase();
      const enrollment = (deal.enrollment_status || '').toLowerCase();

      if (ACTIVE_DISPLAY_STATUSES.has(status)) activeCount++;
      if (status === 'enrolled' || status === 'active' || enrollment === 'enrolled') {
        enrolledCount++;
      }
      if (status === 'in_submissions' || status === 'submitted' || enrollment === 'submitted') {
        submittedCount++;
      }

      if (EARNED_STATUSES.has(status)) {
        commissionEarned += parseFloat(deal.iso_commission_total) || 0;
      }

      if (PIPELINE_STATUSES.has(status)) {
        pipelineCount++;
        commissionPotential += (parseFloat(deal.total_balance) || 0) * 0.10;
      }

      // Merchant savings = original weekly burden minus new locked merchant
      // weekly. `current_weekly_payment` on the deal row isn't a thing — the
      // per-position column of that name is already aggregated into
      // `total_weekly_burden`, which is what we want here.
      if (status === 'enrolled' || status === 'active') {
        const before = parseFloat(deal.total_weekly_burden) || 0;
        const after = parseFloat(deal.merchant_weekly_payment) || 0;
        if (before > 0 && after > 0 && before > after) {
          totalMerchantSavings += before - after;
        }
      }
    }

    // Recent commission payments for this ISO
    const { data: recentCommissions } = await supabase
      .from('iso_commissions')
      .select('id, deal_id, amount, status, payment_date, created_at')
      .eq('iso_wp_user_id', wpUserId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Build recent activity from deals (last 10 status changes) — kept for
    // any other consumer that still references it
    const recentActivity = (deals || [])
      .slice(0, 10)
      .map((d) => ({
        deal_id: d.id,
        merchant_name: d.merchant_name,
        status: d.status,
        enrollment_status: d.enrollment_status,
        updated_at: d.updated_at,
      }));

    // Enrich each deal with messages/documents and aliases the redesigned
    // pipeline page expects: owner_cell, per-deal current_weekly_payment
    // (aliased from total_weekly_burden), and a `balance` alias on each
    // position (aliased from estimated_balance).
    const enrichedDeals = (deals || []).map((d) => ({
      ...d,
      owner_cell: d.owner_phone || null,
      current_weekly_payment: parseFloat(d.total_weekly_burden) || 0,
      positions: (d.positions || []).map((p) => ({
        ...p,
        balance: parseFloat(p.estimated_balance) || 0,
      })),
      messages: messagesByDeal[d.id] || [],
      documents: documentsByDeal[d.id] || [],
    }));

    return jsonResponse({
      active_deals: activeCount,
      enrolled_deals: enrolledCount,
      submitted_deals: submittedCount,
      total_deals: (deals || []).length,
      commission_earned: Math.round(commissionEarned),
      commission_potential: Math.round(commissionPotential),
      pipeline_count: pipelineCount,
      total_merchant_savings: Math.round(totalMerchantSavings),
      recent_activity: recentActivity,
      recent_commissions: recentCommissions || [],
      deals: enrichedDeals,
    }, 200, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

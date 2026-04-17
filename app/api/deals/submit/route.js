import { supabase } from '../../../../lib/supabase';
import { jsonResponse, optionsResponse } from '../../../../lib/cors';
import { sendNewDealEmail } from '../../../../lib/notifications';
import { assertNotImpersonating } from '../../../../lib/auth';

export async function OPTIONS(request) {
  return optionsResponse(request);
}

export async function POST(request) {
  try {
    try {
      await assertNotImpersonating(request);
    } catch (e) {
      return jsonResponse({ error: e.error }, e.status, request);
    }
    const body = await request.json();
    const {
      business_name, dba, entity_type, ein, state_incorporated,
      street_address, suite_unit, city, state, zip,
      monthly_revenue, industry,
      owner_first, owner_last, owner_dob, owner_phone, owner_email, ownership_pct,
      owner_street, owner_suite, owner_city, owner_state, owner_zip,
      positions = [],
      documents = [],
      iso_wp_user_id,
      assigned_rep_id,
    } = body;

    if (!business_name || !iso_wp_user_id) {
      return jsonResponse({ error: 'business_name and iso_wp_user_id are required' }, 400, request);
    }

    // Check if merchant user already exists by email, create if not
    let merchantUserId = null;
    if (owner_email) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', owner_email)
        .maybeSingle();

      if (existingUser) {
        merchantUserId = existingUser.id;
      } else {
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({
            email: owner_email,
            first_name: owner_first,
            last_name: owner_last,
            phone: owner_phone,
            role: 'business_owner',
            street_address: owner_street,
            suite_unit: owner_suite,
            city: owner_city,
            state: owner_state,
            zip: owner_zip,
          })
          .select('id')
          .single();

        if (userError) {
          return jsonResponse({ error: 'Failed to create merchant user: ' + userError.message }, 500, request);
        }
        merchantUserId = newUser.id;
      }
    }

    // Create deal record
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert({
        merchant_name: business_name,
        merchant_dba: dba || business_name,
        merchant_ein: ein,
        merchant_state: state_incorporated || state,
        merchant_industry: industry,
        merchant_contact_name: `${owner_first || ''} ${owner_last || ''}`.trim(),
        merchant_contact_email: owner_email,
        merchant_contact_phone: owner_phone,
        monthly_revenue: parseFloat(monthly_revenue) || 0,
        entity_type,
        street_address,
        suite_unit,
        city,
        state,
        zip,
        owner_first,
        owner_last,
        owner_dob,
        owner_phone,
        owner_email,
        ownership_pct: parseFloat(ownership_pct) || 100,
        owner_street,
        owner_suite,
        owner_city,
        owner_state,
        owner_zip,
        iso_wp_user_id,
        assigned_rep_id: assigned_rep_id || null,
        user_id: merchantUserId,
        status: 'submitted',
        enrollment_status: 'submitted',
        position_count: positions.length,
        total_balance: 0,
        total_weekly_burden: 0,
      })
      .select()
      .single();

    if (dealError) {
      return jsonResponse({ error: dealError.message }, 500, request);
    }

    // Insert positions
    let totalBalance = 0;
    let totalWeeklyBurden = 0;

    if (positions.length > 0) {
      const positionRows = positions.map((p, idx) => {
        const balance = parseFloat(p.estimated_balance) || 0;
        const payment = parseFloat(p.current_weekly_payment) || 0;
        const freq = (p.frequency || 'weekly').toLowerCase();
        // Normalize user-entered payment to weekly for storage
        let weeklyPayment = payment;
        if (freq === 'daily') weeklyPayment = payment * 5;
        else if (freq === 'bi-weekly' || freq === 'biweekly') weeklyPayment = payment / 2;
        else if (freq === 'monthly') weeklyPayment = payment / 4.33;

        totalBalance += balance;
        totalWeeklyBurden += weeklyPayment;

        return {
          deal_id: deal.id,
          funder_name: p.funder_name,
          estimated_balance: balance,
          current_weekly_payment: weeklyPayment,
          daily_payment: freq === 'daily' ? payment : weeklyPayment / 5,
          payment_frequency: freq,
          payments_modified: p.payments_modified || false,
          position_order: idx + 1,
          status: 'active',
          source: 'iso_submission',
        };
      });

      const { error: posError } = await supabase.from('positions').insert(positionRows);
      if (posError) {
        return jsonResponse({ error: 'Failed to create positions: ' + posError.message }, 500, request);
      }
    }

    // Update deal totals
    await supabase
      .from('deals')
      .update({
        total_balance: Math.round(totalBalance * 100) / 100,
        total_weekly_burden: Math.round(totalWeeklyBurden * 100) / 100,
        position_count: positions.length,
      })
      .eq('id', deal.id);

    // Insert documents
    if (documents.length > 0) {
      const docRows = documents.map(d => ({
        deal_id: deal.id,
        document_type: d.type,
        file_url: d.file_url,
        file_name: d.file_name,
        uploaded_by: merchantUserId,
      }));

      await supabase.from('deal_documents').insert(docRows);
    }

    // Fetch complete deal with positions
    const { data: fullDeal } = await supabase
      .from('deals')
      .select('*, positions(*)')
      .eq('id', deal.id)
      .single();

    // Best-effort ops notification — never block or fail the submit on email errors
    try {
      let isoName = null;
      if (iso_wp_user_id) {
        const { data: isoUser } = await supabase
          .from('users')
          .select('first_name, last_name, email')
          .eq('id', iso_wp_user_id)
          .maybeSingle();
        if (isoUser) {
          isoName =
            [isoUser.first_name, isoUser.last_name].filter(Boolean).join(' ').trim() ||
            isoUser.email ||
            null;
        }
      }

      // Look up the assigned rep so we can include their contact info
      let repInfo = null;
      if (assigned_rep_id) {
        const { data: repRow } = await supabase
          .from('iso_reps')
          .select('first_name, last_name, title, email, phone')
          .eq('id', assigned_rep_id)
          .maybeSingle();
        if (repRow) repInfo = repRow;
      }

      await sendNewDealEmail({
        deal: fullDeal || deal,
        isoName,
        totalEstimatedDebt: totalBalance,
        repInfo,
      });
    } catch (notifyErr) {
      console.error('[submit] notification dispatch failed:', notifyErr);
    }

    return jsonResponse(fullDeal, 201, request);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, request);
  }
}

/**
 * Funders First — Dashboard Data Integration (WPCode Snippet)
 *
 * This script runs on WordPress dashboard pages (Elementor-hosted).
 * It fetches data from the FF Analyzer API and populates dashboard elements.
 *
 * Prerequisites:
 *   - PHP snippet must inject ffDashboard object with currentUserId and currentUserRole
 *   - Dashboard HTML elements must exist with the expected IDs
 *
 * Add to WPCode as a JavaScript snippet, set to run on dashboard pages only.
 */

(function () {
  'use strict';

  const API_BASE = 'https://ff-analyzer.vercel.app/api';

  // Injected by PHP companion snippet (see ff-dashboard-php.php)
  const wpUserId = window.ffDashboard?.currentUserId;
  const userRole = window.ffDashboard?.currentUserRole; // iso_partner | business_owner
  const supabaseUserId = window.ffDashboard?.supabaseUserId; // for notifications/messages

  if (!wpUserId || !userRole) {
    console.warn('[FF Dashboard] Missing ffDashboard config — skipping data load.');
    return;
  }

  // ─── Helpers ──────────────────────────────────────────────

  async function apiFetch(path) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.error(`[FF Dashboard] API error (${path}):`, e.message);
      return null;
    }
  }

  async function apiPost(path, body) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.error(`[FF Dashboard] API error (${path}):`, e.message);
      return null;
    }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function show(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  }

  function hide(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function currency(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function pct(n) {
    return (n || 0) + '%';
  }

  // ─── ISO Dashboard ────────────────────────────────────────

  async function loadIsoDashboard() {
    const data = await apiFetch(`/dashboard/iso?wp_user_id=${wpUserId}`);
    if (!data) return;

    // Summary cards
    setText('ff-active-deals', data.active_deals);
    setText('ff-enrolled-deals', data.enrolled_deals);
    setText('ff-submitted-deals', data.submitted_deals);
    setText('ff-total-deals', data.total_deals);

    // Deals needing attention
    const attentionEl = document.getElementById('ff-needs-attention');
    if (attentionEl && data.needs_attention?.length) {
      attentionEl.innerHTML = data.needs_attention.map(d => `
        <div class="ff-attention-item" data-deal-id="${d.id}">
          <span class="ff-merchant-name">${d.merchant_name}</span>
          <span class="ff-status-badge ff-status-${d.enrollment_status}">${d.enrollment_status}</span>
        </div>
      `).join('');
    }

    // Recent activity feed
    const activityEl = document.getElementById('ff-recent-activity');
    if (activityEl && data.recent_activity?.length) {
      activityEl.innerHTML = data.recent_activity.map(a => `
        <div class="ff-activity-item">
          <span class="ff-merchant-name">${a.merchant_name}</span>
          <span class="ff-status-badge">${a.status}</span>
          <span class="ff-timestamp">${new Date(a.updated_at).toLocaleDateString()}</span>
        </div>
      `).join('');
    }

    // Commission summary
    const commData = await apiFetch(`/commissions/list?iso_wp_user_id=${wpUserId}`);
    if (commData?.summary) {
      setText('ff-total-earned', currency(commData.summary.total_earned));
      setText('ff-total-paid', currency(commData.summary.total_paid));
      setText('ff-pending-commissions', currency(commData.summary.pending));
    }

    // Deals table
    loadDealsTable('iso');
  }

  // ─── Business Owner Dashboard ─────────────────────────────

  async function loadBoDashboard() {
    const data = await apiFetch(`/dashboard/bo?wp_user_id=${wpUserId}`);
    if (!data || !data.deal) return;

    const deal = data.deal;

    // Hero stats
    setText('ff-weekly-payment', currency(deal.weekly_payment));
    setText('ff-weeks-completed', deal.weeks_completed);
    setText('ff-total-paid', currency(deal.total_paid));
    setText('ff-remaining-balance', currency(deal.remaining));
    setText('ff-total-savings', currency(deal.total_savings));
    setText('ff-original-burden', currency(deal.original_weekly_burden));
    setText('ff-progress-pct', pct(deal.progress_pct));

    // Progress bar
    const progressBar = document.getElementById('ff-progress-bar');
    if (progressBar) {
      progressBar.style.width = deal.progress_pct + '%';
    }

    // Next payment
    if (data.next_payment) {
      setText('ff-next-payment-date', new Date(data.next_payment.date).toLocaleDateString());
      setText('ff-next-payment-amount', currency(data.next_payment.amount));
      show('ff-next-payment');
    } else {
      hide('ff-next-payment');
    }

    // Funder positions table
    const positionsEl = document.getElementById('ff-positions-table');
    if (positionsEl && data.positions?.length) {
      positionsEl.innerHTML = data.positions.map(p => `
        <tr>
          <td>${p.funder_name}</td>
          <td>${currency(p.estimated_balance)}</td>
          <td>${currency(p.current_weekly_payment)}</td>
          <td><span class="ff-status-badge ff-status-${p.agreement_status}">${p.agreement_status}</span></td>
          <td>${p.status}</td>
        </tr>
      `).join('');
    }

    // Onboarding wizard
    if (data.onboarding) {
      loadOnboardingWizard(deal.id, data.onboarding);
    }

    // Load messages
    loadMessages(deal.id);
  }

  // ─── Deals Table ──────────────────────────────────────────

  async function loadDealsTable(role) {
    const data = await apiFetch(`/deals/list?wp_user_id=${wpUserId}&role=${role}`);
    if (!data?.deals) return;

    const tableEl = document.getElementById('ff-deals-table');
    if (!tableEl) return;

    tableEl.innerHTML = data.deals.map(d => `
      <tr data-deal-id="${d.id}">
        <td>${d.merchant_name}</td>
        <td>${d.merchant_dba || ''}</td>
        <td>${d.position_count} positions</td>
        <td>${currency(d.total_balance)}</td>
        <td>${currency(d.total_weekly_burden)}</td>
        <td><span class="ff-status-badge ff-status-${d.status}">${d.status}</span></td>
        <td>${new Date(d.updated_at).toLocaleDateString()}</td>
      </tr>
    `).join('');
  }

  // ─── Onboarding Wizard ────────────────────────────────────

  function loadOnboardingWizard(dealId, state) {
    const steps = [
      { key: 'welcome_call_completed', label: 'Welcome Call' },
      { key: 'step_1_completed', label: 'Step 1: Document Upload' },
      { key: 'step_2_completed', label: 'Step 2: Hardship Email' },
      { key: 'step_3_completed', label: 'Step 3: Bank Account Change' },
      { key: 'step_4_completed', label: 'Step 4: Final Review' },
    ];

    const wizardEl = document.getElementById('ff-onboarding-wizard');
    if (!wizardEl) return;

    wizardEl.innerHTML = steps.map((s, i) => {
      const done = state[s.key];
      return `
        <div class="ff-wizard-step ${done ? 'ff-step-done' : ''}" data-step="${s.key}">
          <div class="ff-step-number">${done ? '&#10003;' : i + 1}</div>
          <div class="ff-step-label">${s.label}</div>
        </div>
      `;
    }).join('');

    // Gate: if welcome call not done, show gate overlay
    if (!state.welcome_call_completed) {
      const gateEl = document.getElementById('ff-welcome-gate');
      if (gateEl) show('ff-welcome-gate');
    }
  }

  // ─── Messages / Chat ─────────────────────────────────────

  async function loadMessages(dealId) {
    const data = await apiFetch(`/messages/list?deal_id=${dealId}`);
    if (!data?.messages) return;

    const chatEl = document.getElementById('ff-chat-messages');
    if (!chatEl) return;

    chatEl.innerHTML = data.messages.map(m => `
      <div class="ff-message ff-message-${m.sender_role}">
        <div class="ff-message-header">
          <span class="ff-sender-name">${m.sender_name || m.sender_role}</span>
          <span class="ff-timestamp">${new Date(m.created_at).toLocaleString()}</span>
        </div>
        <div class="ff-message-body">${m.content}</div>
      </div>
    `).join('');

    // Scroll to bottom
    chatEl.scrollTop = chatEl.scrollHeight;

    // Bind send button
    const sendBtn = document.getElementById('ff-send-message');
    const inputEl = document.getElementById('ff-message-input');
    if (sendBtn && inputEl) {
      sendBtn.onclick = async function () {
        const content = inputEl.value.trim();
        if (!content) return;
        inputEl.value = '';
        sendBtn.disabled = true;

        await apiPost('/messages/send', {
          deal_id: dealId,
          sender_id: supabaseUserId || null,
          content,
          sender_role: userRole === 'iso_partner' ? 'iso' : 'merchant',
          sender_name: window.ffDashboard?.displayName || 'User',
        });

        sendBtn.disabled = false;
        loadMessages(dealId); // Refresh
      };
    }
  }

  // ─── Notifications ────────────────────────────────────────

  async function loadNotifications() {
    if (!supabaseUserId) return;

    const data = await apiFetch(`/notifications/list?user_id=${supabaseUserId}&unread_only=true`);
    if (!data) return;

    // Badge count
    const badge = document.getElementById('ff-notification-badge');
    if (badge) {
      badge.textContent = data.unread_count || '';
      badge.style.display = data.unread_count > 0 ? '' : 'none';
    }

    // Notification list
    const listEl = document.getElementById('ff-notification-list');
    if (listEl && data.notifications?.length) {
      listEl.innerHTML = data.notifications.map(n => `
        <div class="ff-notification ${n.read ? '' : 'ff-unread'}" data-id="${n.id}">
          <div class="ff-notification-content">${n.content || n.message}</div>
          <div class="ff-notification-time">${new Date(n.created_at).toLocaleString()}</div>
        </div>
      `).join('');

      // Click to mark as read
      listEl.querySelectorAll('.ff-notification.ff-unread').forEach(el => {
        el.addEventListener('click', async function () {
          await apiPost('/notifications/read', { notification_id: el.dataset.id });
          el.classList.remove('ff-unread');
          loadNotifications(); // Refresh count
        });
      });
    }
  }

  // ─── Init ─────────────────────────────────────────────────

  async function init() {
    if (userRole === 'iso_partner') {
      await loadIsoDashboard();
    } else if (userRole === 'business_owner') {
      await loadBoDashboard();
    }

    loadNotifications();

    // Poll notifications every 60 seconds
    setInterval(loadNotifications, 60000);
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

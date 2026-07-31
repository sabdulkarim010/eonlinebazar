/**
 * Project: EOnlineBazar
 * File: js/admin-newsletter.js
 * Description: Admin newsletter subscribers & email campaign management.
 */

const nlToken = () => localStorage.getItem('adminToken');

function nlNotify(message, type = 'success') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    console[type === 'error' ? 'error' : 'log'](message);
}

function nlEscapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function nlAuthHeaders() {
    const token = nlToken();
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function nlFormatDate(dateVal) {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
        timeZone: 'Asia/Dhaka'
    });
}

let nlCampaignsCache = [];
let subscriberPg = null;
let campaignPg = null;

function initNewsletterPagination() {
    if (typeof AdminPagination === 'undefined') return;

    if (!subscriberPg && document.getElementById('subscriber-pg-btns')) {
        subscriberPg = new AdminPagination({
            containerId: 'subscriber-pg-btns',
            infoId: 'subscriber-pg-info',
            countId: 'subscriber-total-count',
            limitSelectId: 'subscriber-pg-limit',
            defaultLimit: 10,
            onPageChange: (page, limit) => fetchNewsletterSubscribers(page, limit)
        });
        window.subscriberPg = subscriberPg;
    }

    if (!campaignPg && document.getElementById('campaign-pg-btns')) {
        campaignPg = new AdminPagination({
            containerId: 'campaign-pg-btns',
            infoId: 'campaign-pg-info',
            countId: 'campaign-total-count',
            limitSelectId: 'campaign-pg-limit',
            defaultLimit: 10,
            onPageChange: (page, limit) => renderCampaignsPage(page, limit)
        });
        window.campaignPg = campaignPg;
    }
}

async function fetchNewsletterSubscribers(page, limit) {
    initNewsletterPagination();
    const pg = subscriberPg;
    const effectivePage = page ?? pg?.currentPage ?? 1;
    const effectiveLimit = limit ?? pg?.currentLimit ?? 10;

    const search = document.getElementById('nlSubscriberSearch')?.value.trim() || '';
    const isActive = document.getElementById('nlSubscriberStatus')?.value || '';
    const tag = document.getElementById('nlSubscriberTag')?.value.trim() || '';

    const params = new URLSearchParams({
        page: String(effectivePage),
        limit: String(effectiveLimit)
    });
    if (search) params.set('search', search);
    if (isActive) params.set('isActive', isActive);
    if (tag) params.set('tag', tag);

    try {
        const res = await fetch(`/api/admin/newsletter/subscribers?${params}`, {
            headers: nlAuthHeaders()
        });
        const data = await res.json();
        if (!data.success) {
            nlNotify(data.message || 'Failed to load subscribers', 'error');
            return;
        }

        if (data.stats) {
            const totalEl = document.getElementById('nlStatTotal');
            const activeEl = document.getElementById('nlStatActive');
            const inactiveEl = document.getElementById('nlStatInactive');
            if (totalEl) totalEl.textContent = data.stats.total ?? 0;
            if (activeEl) activeEl.textContent = data.stats.totalActive ?? 0;
            if (inactiveEl) inactiveEl.textContent = data.stats.totalInactive ?? 0;
        }

        if (pg) {
            pg.currentPage = effectivePage;
            pg.currentLimit = effectiveLimit;
            pg.setTotal(data.pagination?.total ?? (data.data || []).length);
        }

        renderNewsletterSubscribers(data.data || []);
    } catch (err) {
        console.error(err);
        nlNotify('Failed to load subscribers', 'error');
    }
}

function renderNewsletterSubscribers(subscribers) {
    const tbody = document.getElementById('nlSubscriberTableBody');
    if (!tbody) return;

    if (!subscribers.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:24px;">No subscribers found</td></tr>';
        return;
    }

    tbody.innerHTML = subscribers.map((sub) => {
        const status = sub.isActive
            ? '<span class="coupon-status-pill coupon-status-pill--active">Active</span>'
            : '<span class="coupon-status-pill coupon-status-pill--expired">Unsubscribed</span>';
        return `
            <tr>
                <td>${nlEscapeHtml(sub.email)}</td>
                <td>${nlEscapeHtml(sub.name || '—')}</td>
                <td>${nlEscapeHtml(sub.source || '—')}</td>
                <td>${nlFormatDate(sub.subscribedAt)}</td>
                <td>${status}</td>
                <td class="col-actions">
                    <button type="button" class="btn-icon btn-icon--danger" title="Delete"
                        onclick="deleteNewsletterSubscriber('${sub._id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function deleteNewsletterSubscriber(id) {
    if (!id) return;

    const performDelete = async () => {
        try {
            const res = await fetch(`/api/admin/newsletter/subscribers/${id}`, {
                method: 'DELETE',
                headers: nlAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                nlNotify('Subscriber deleted');
                if (subscriberPg) subscriberPg.stayOnPage();
                else fetchNewsletterSubscribers(1, 10);
            } else {
                nlNotify(data.message || 'Delete failed', 'error');
            }
        } catch (err) {
            console.error(err);
            nlNotify('Delete failed', 'error');
        }
    };

    if (typeof window.showCustomConfirm === 'function') {
        window.showCustomConfirm('Confirm', 'Delete this subscriber?', performDelete, 'danger');
        return;
    }
    if (window.confirm('Delete this subscriber?')) await performDelete();
}

function readCampaignForm() {
    return {
        title: document.getElementById('nlCampaignTitle')?.value.trim() || '',
        subject: document.getElementById('nlCampaignSubject')?.value.trim() || '',
        htmlContent: document.getElementById('nlCampaignHtml')?.value.trim() || '',
        targetTags: document.getElementById('nlCampaignTags')?.value.trim() || '',
        scheduledAt: document.getElementById('nlCampaignSchedule')?.value || null
    };
}

function fillCampaignForm(campaign) {
    document.getElementById('nlCampaignEditId').value = campaign?._id || '';
    document.getElementById('nlCampaignTitle').value = campaign?.title || '';
    document.getElementById('nlCampaignSubject').value = campaign?.subject || '';
    document.getElementById('nlCampaignHtml').value = campaign?.htmlContent || '';
    document.getElementById('nlCampaignTags').value = (campaign?.targetTags || []).join(', ');

    const schedInput = document.getElementById('nlCampaignSchedule');
    if (schedInput) {
        if (campaign?.scheduledAt) {
            const d = new Date(campaign.scheduledAt);
            schedInput.value = d.toISOString().slice(0, 16);
        } else {
            schedInput.value = '';
        }
    }
}

async function saveNewsletterCampaignDraft() {
    const form = readCampaignForm();
    if (!form.title || !form.subject || !form.htmlContent) {
        nlNotify('Title, subject, and HTML content are required', 'error');
        return null;
    }

    const payload = {
        title: form.title,
        subject: form.subject,
        htmlContent: form.htmlContent,
        targetTags: form.targetTags
    };
    if (form.scheduledAt) payload.scheduledAt = new Date(form.scheduledAt).toISOString();

    try {
        const res = await fetch('/api/admin/newsletter/campaigns', {
            method: 'POST',
            headers: nlAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success) {
            nlNotify(data.message || 'Failed to save draft', 'error');
            return null;
        }
        nlNotify('Draft saved');
        document.getElementById('nlCampaignEditId').value = data.data._id;
        await fetchNewsletterCampaigns();
        return data.data;
    } catch (err) {
        console.error(err);
        nlNotify('Failed to save draft', 'error');
        return null;
    }
}

async function fetchNewsletterCampaigns() {
    try {
        const res = await fetch('/api/admin/newsletter/campaigns', {
            headers: nlAuthHeaders()
        });
        const data = await res.json();
        if (!data.success) {
            nlNotify(data.message || 'Failed to load campaigns', 'error');
            return;
        }
        nlCampaignsCache = data.data || [];
        initNewsletterPagination();
        if (campaignPg) campaignPg.stayOnPage();
        else renderCampaignsPage(1, 10);
    } catch (err) {
        console.error(err);
        nlNotify('Failed to load campaigns', 'error');
    }
}

function renderCampaignsPage(page, limit) {
    initNewsletterPagination();
    const pg = campaignPg;
    const effectivePage = page ?? pg?.currentPage ?? 1;
    const effectiveLimit = limit ?? pg?.currentLimit ?? 10;

    const start = (effectivePage - 1) * effectiveLimit;
    const slice = nlCampaignsCache.slice(start, start + effectiveLimit);

    if (pg) {
        pg.currentPage = effectivePage;
        pg.currentLimit = effectiveLimit;
        pg.setTotal(nlCampaignsCache.length);
    }

    renderNewsletterCampaigns(slice);
}

function renderCampaignStatusBadge(status) {
    const map = {
        draft: 'coupon-status-pill--exhausted',
        scheduled: 'coupon-status-pill--active',
        sending: 'coupon-status-pill--active',
        sent: 'coupon-status-pill--active',
        failed: 'coupon-status-pill--expired'
    };
    const cls = map[status] || 'coupon-status-pill--exhausted';
    return `<span class="coupon-status-pill ${cls}">${nlEscapeHtml(status || 'draft')}</span>`;
}

function renderNewsletterCampaigns(campaigns) {
    const tbody = document.getElementById('nlCampaignTableBody');
    if (!tbody) return;

    if (!campaigns.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b;padding:24px;">No campaigns yet</td></tr>';
        return;
    }

    tbody.innerHTML = campaigns.map((c) => {
        const canSend = c.status === 'draft' || c.status === 'scheduled';
        return `
            <tr>
                <td>${nlEscapeHtml(c.title)}</td>
                <td>${nlEscapeHtml(c.subject)}</td>
                <td>${renderCampaignStatusBadge(c.status)}</td>
                <td>${c.stats?.totalRecipients ?? 0}</td>
                <td>${c.stats?.sent ?? 0}</td>
                <td>${nlFormatDate(c.createdAt)}</td>
                <td class="col-actions">
                    ${canSend ? `<button type="button" class="btn-icon" title="Send" onclick="sendNewsletterCampaign('${c._id}')"><i class="fa-solid fa-paper-plane"></i></button>` : ''}
                    <button type="button" class="btn-icon" title="Test" onclick="testNewsletterCampaignById('${c._id}')"><i class="fa-solid fa-vial"></i></button>
                    <button type="button" class="btn-icon" title="View" onclick="viewNewsletterCampaign('${c._id}')"><i class="fa-solid fa-eye"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

async function testNewsletterCampaignById(id) {
    const testEmail = document.getElementById('nlCampaignTestEmail')?.value.trim();
    if (!testEmail) {
        nlNotify('Enter a test email address first', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/admin/newsletter/campaigns/${id}/test`, {
            method: 'POST',
            headers: nlAuthHeaders(),
            body: JSON.stringify({ testEmail })
        });
        const data = await res.json();
        nlNotify(data.message || (data.success ? 'Test email sent' : 'Test failed'), data.success ? 'success' : 'error');
    } catch (err) {
        console.error(err);
        nlNotify('Test send failed', 'error');
    }
}

async function testNewsletterCampaignFromForm() {
    let id = document.getElementById('nlCampaignEditId')?.value;
    if (!id) {
        const saved = await saveNewsletterCampaignDraft();
        id = saved?._id;
    }
    if (!id) return;
    await testNewsletterCampaignById(id);
}

async function sendNewsletterCampaign(id) {
    if (!id) return;

    const performSend = async () => {
        nlNotify('Sending campaign...', 'success');
        try {
            const res = await fetch(`/api/admin/newsletter/campaigns/${id}/send`, {
                method: 'POST',
                headers: nlAuthHeaders()
            });
            const data = await res.json();
            nlNotify(data.message || (data.success ? 'Campaign sent successfully' : 'Send failed'), data.success ? 'success' : 'error');
            if (data.success) fetchNewsletterCampaigns();
        } catch (err) {
            console.error(err);
            nlNotify('Send failed', 'error');
        }
    };

    if (typeof window.showCustomConfirm === 'function') {
        window.showCustomConfirm('Confirm', 'Send campaign now?', performSend, 'warning');
        return;
    }
    if (window.confirm('Send campaign now?')) await performSend();
}

async function sendNewsletterCampaignFromForm() {
    let id = document.getElementById('nlCampaignEditId')?.value;
    if (!id) {
        const saved = await saveNewsletterCampaignDraft();
        id = saved?._id;
    }
    if (!id) return;

    const scheduleVal = document.getElementById('nlCampaignSchedule')?.value;
    if (scheduleVal && new Date(scheduleVal).getTime() > Date.now()) {
        nlNotify('Campaign will be scheduled (not sent immediately)', 'success');
    }

    await sendNewsletterCampaign(id);
}

function viewNewsletterCampaign(id) {
    const campaign = nlCampaignsCache.find((c) => String(c._id) === String(id));
    if (!campaign) return;

    fillCampaignForm(campaign);

    const modal = document.getElementById('nlCampaignViewModal');
    const meta = document.getElementById('nlCampaignViewMeta');
    const htmlBox = document.getElementById('nlCampaignViewHtml');

    if (meta) {
        meta.innerHTML = `
            <p><strong>Subject:</strong> ${nlEscapeHtml(campaign.subject)}</p>
            <p><strong>Status:</strong> ${nlEscapeHtml(campaign.status)}</p>
            <p><strong>Tags:</strong> ${(campaign.targetTags || []).length ? nlEscapeHtml(campaign.targetTags.join(', ')) : 'All subscribers'}</p>
        `;
    }
    if (htmlBox) htmlBox.innerHTML = campaign.htmlContent || '';
    if (modal) modal.style.display = 'flex';
}

function closeNlCampaignViewModal() {
    const modal = document.getElementById('nlCampaignViewModal');
    if (modal) modal.style.display = 'none';
}

function loadNewsletterSubscribersSection() {
    initNewsletterPagination();
    if (subscriberPg) subscriberPg.resetPage();
    fetchNewsletterSubscribers(1, subscriberPg?.currentLimit || 10);
}

function loadNewsletterCampaignsSection() {
    initNewsletterPagination();
    fetchNewsletterCampaigns();
}

function initNewsletterAdmin() {
    initNewsletterPagination();

    document.getElementById('nlSubscriberRefreshBtn')?.addEventListener('click', () => {
        if (subscriberPg) subscriberPg.resetPage();
        fetchNewsletterSubscribers(1, subscriberPg?.currentLimit || 10);
    });
    document.getElementById('nlSubscriberSearch')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (subscriberPg) subscriberPg.resetPage();
            fetchNewsletterSubscribers(1, subscriberPg?.currentLimit || 10);
        }
    });
    document.getElementById('nlSubscriberStatus')?.addEventListener('change', () => {
        if (subscriberPg) subscriberPg.resetPage();
        fetchNewsletterSubscribers(1, subscriberPg?.currentLimit || 10);
    });
    document.getElementById('nlSubscriberTag')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (subscriberPg) subscriberPg.resetPage();
            fetchNewsletterSubscribers(1, subscriberPg?.currentLimit || 10);
        }
    });

    document.getElementById('nlCampaignSaveBtn')?.addEventListener('click', saveNewsletterCampaignDraft);
    document.getElementById('nlCampaignTestBtn')?.addEventListener('click', testNewsletterCampaignFromForm);
    document.getElementById('nlCampaignSendBtn')?.addEventListener('click', sendNewsletterCampaignFromForm);

    document.getElementById('nlCampaignViewModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'nlCampaignViewModal') closeNlCampaignViewModal();
    });
}

window.fetchNewsletterSubscribers = fetchNewsletterSubscribers;
window.deleteNewsletterSubscriber = deleteNewsletterSubscriber;
window.fetchNewsletterCampaigns = fetchNewsletterCampaigns;
window.sendNewsletterCampaign = sendNewsletterCampaign;
window.testNewsletterCampaignById = testNewsletterCampaignById;
window.viewNewsletterCampaign = viewNewsletterCampaign;
window.closeNlCampaignViewModal = closeNlCampaignViewModal;
window.loadNewsletterSubscribersSection = loadNewsletterSubscribersSection;
window.loadNewsletterCampaignsSection = loadNewsletterCampaignsSection;

document.addEventListener('DOMContentLoaded', initNewsletterAdmin);

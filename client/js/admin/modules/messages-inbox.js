/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/messages-inbox.js
 * Description: Admin support inbox for contact-form inquiries (unrelated to customer CRUD).
 */
/* Dependencies: token, adminMessagesCache, messagePg, showToast, showCustomConfirm, copyCustomerField (window) */
/* Exposes: window.bulkDeleteMessages, window.clearInquirySelection, window.deleteMessage, window.fetchAdminMessages, window.findCachedMessage, window.formatMessageDate, window.formatMessageListTime, window.formatPhoneDisplay, window.getAvatarColor, window.getCustomerInitial, window.getFilteredMessages, window.getMessageSnippet, window.getMessageStatusBadge, window.markMessageRead, window.markMessageUnread, window.populateInquiryDetailPane, window.renderMessagesInbox, window.renderMessagesPage, window.resolveMessageStatus, window.selectInquiry, window.sendInquiryReply, window.setMessagesFilterTab, window.setupMessagesInbox, window.showInquiryDetailEmpty, window.toggleDetailReadStatus, window.toggleMessageSelection, window.updateMessagesBulkToolbar, window.updateMessagesStats */

import '../admin-core.js';

/* ==========================================================================
   CUSTOMER MESSAGES INBOX (/api/admin/messages)
   ========================================================================== */

/* shared state: adminMessagesCache lives on window (admin-core) */

/* shared state: inquiryDetailActiveId lives on window (admin-core) */

/* shared state: messagesFilterTab lives on window (admin-core) */

/* shared state: messagesSearchQuery lives on window (admin-core) */

function formatMessageDate(value) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch (_) {
        return String(value);
    }
}

function formatMessageListTime(value) {
    if (!value) return '—';
    try {
        const d = new Date(value);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_) {
        return String(value);
    }
}

function resolveMessageStatus(msg) {
    if (msg.status === 'replied' || msg.status === 'read' || msg.status === 'unread') {
        return msg.status;
    }
    return msg.isRead ? 'read' : 'unread';
}

function getMessageStatusBadge(status, uppercase = false) {
    const labels = { unread: 'Unread', read: 'Read', replied: 'Replied' };
    const classes = {
        unread: 'support-status-pill--unread',
        read: 'support-status-pill--read',
        replied: 'support-status-pill--replied'
    };
    const safeStatus = labels[status] ? status : 'unread';
    const label = uppercase ? labels[safeStatus].toUpperCase() : labels[safeStatus];
    return `<span class="support-status-pill ${classes[safeStatus]}">${label}</span>`;
}

function getCustomerInitial(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '?';
    return trimmed.charAt(0).toUpperCase();
}

function getAvatarColor(name) {
    const palette = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0891b2', '#4f46e5'];
    let hash = 0;
    const str = String(name || '');
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
}

function findCachedMessage(id) {
    return adminMessagesCache.find((item) => String(item.id || item._id) === String(id));
}

function formatPhoneDisplay(phone) {
    const value = String(phone || '').trim();
    return value || '—';
}

function getMessageSnippet(text, maxLen = 90) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return 'No message content';
    return raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
}

function getFilteredMessages() {
    let list = adminMessagesCache.slice();

    if (messagesFilterTab === 'unread') {
        list = list.filter((m) => resolveMessageStatus(m) === 'unread');
    } else if (messagesFilterTab === 'replied') {
        list = list.filter((m) => resolveMessageStatus(m) === 'replied');
    }

    const q = messagesSearchQuery.trim().toLowerCase();
    if (q) {
        list = list.filter((m) => {
            const name = String(m.name || '').toLowerCase();
            const email = String(m.email || '').toLowerCase();
            const subject = String(m.subject || '').toLowerCase();
            return name.includes(q) || email.includes(q) || subject.includes(q);
        });
    }

    return list;
}

function updateMessagesStats() {
    const all = adminMessagesCache.length;
    const unread = adminMessagesCache.filter((m) => resolveMessageStatus(m) === 'unread').length;
    const replied = adminMessagesCache.filter((m) => resolveMessageStatus(m) === 'replied').length;

    const allEl = document.getElementById('supportTabCountAll');
    const unreadEl = document.getElementById('supportTabCountUnread');
    const repliedEl = document.getElementById('supportTabCountReplied');

    if (allEl) allEl.textContent = String(all);
    if (unreadEl) unreadEl.textContent = String(unread);
    if (repliedEl) repliedEl.textContent = String(replied);
}

function showInquiryDetailEmpty() {
    const emptyEl = document.getElementById('inquiryDetailEmpty');
    const paneEl = document.getElementById('inquiryDetailPane');
    if (emptyEl) emptyEl.style.display = '';
    if (paneEl) paneEl.style.display = 'none';
}

function populateInquiryDetailPane(msg) {
    const emptyEl = document.getElementById('inquiryDetailEmpty');
    const paneEl = document.getElementById('inquiryDetailPane');
    if (!msg || !paneEl) {
        showInquiryDetailEmpty();
        return;
    }

    const status = resolveMessageStatus(msg);
    const phone = formatPhoneDisplay(msg.phone);
    const id = String(msg.id || msg._id);

    if (emptyEl) emptyEl.style.display = 'none';
    paneEl.style.display = 'flex';

    const subjectEl = document.getElementById('inquiryDetailSubjectLine');
    const statusEl = document.getElementById('inquiryDetailStatusBadge');
    const avatarEl = document.getElementById('inquiryDetailSenderAvatar');
    const nameEl = document.getElementById('inquiryDetailSenderName');
    const emailEl = document.getElementById('inquiryDetailEmail');
    const phoneEl = document.getElementById('inquiryDetailPhone');
    const copyEmailBtn = document.getElementById('inquiryDetailCopyEmail');
    const copyPhoneBtn = document.getElementById('inquiryDetailCopyPhone');
    const dateEl = document.getElementById('inquiryDetailDate');
    const messageEl = document.getElementById('inquiryDetailMessage');
    const sentReplyEl = document.getElementById('inquiryDetailSentReply');
    const sentReplyTextEl = document.getElementById('inquiryDetailSentReplyText');
    const sentReplyAtEl = document.getElementById('inquiryDetailSentReplyAt');
    const replyTextEl = document.getElementById('inquiryDetailReplyText');
    const charCountEl = document.getElementById('inquiryDetailCharCount');
    const markReadBtn = document.getElementById('inquiryDetailMarkReadBtn');

    if (subjectEl) subjectEl.textContent = msg.subject || '(No subject)';
    if (statusEl) statusEl.innerHTML = getMessageStatusBadge(status, true);

    if (avatarEl) {
        avatarEl.textContent = getCustomerInitial(msg.name);
        avatarEl.style.background = getAvatarColor(msg.name);
    }
    if (nameEl) nameEl.textContent = msg.name || 'Unknown';

    if (emailEl) {
        if (msg.email) {
            emailEl.href = `mailto:${msg.email}`;
            emailEl.textContent = msg.email;
        } else {
            emailEl.removeAttribute('href');
            emailEl.textContent = '—';
        }
    }
    if (copyEmailBtn) {
        copyEmailBtn.dataset.copy = msg.email || '';
        copyEmailBtn.style.display = msg.email ? '' : 'none';
    }

    if (phoneEl) {
        if (phone !== '—') {
            phoneEl.href = `tel:${phone}`;
            phoneEl.textContent = phone;
        } else {
            phoneEl.removeAttribute('href');
            phoneEl.textContent = '—';
        }
    }
    if (copyPhoneBtn) {
        copyPhoneBtn.dataset.copy = phone !== '—' ? phone : '';
        copyPhoneBtn.style.display = phone !== '—' ? '' : 'none';
    }

    if (dateEl) dateEl.textContent = formatMessageDate(msg.createdAt);
    if (messageEl) messageEl.textContent = msg.message || '—';

    if (sentReplyEl && sentReplyTextEl && sentReplyAtEl) {
        if (status === 'replied' && msg.replyMessage) {
            sentReplyEl.style.display = '';
            sentReplyTextEl.textContent = msg.replyMessage;
            sentReplyAtEl.textContent = msg.repliedAt ? `Sent ${formatMessageDate(msg.repliedAt)}` : '';
        } else {
            sentReplyEl.style.display = 'none';
            sentReplyTextEl.textContent = '';
            sentReplyAtEl.textContent = '';
        }
    }

    if (replyTextEl) {
        replyTextEl.value = '';
        replyTextEl.disabled = status === 'replied';
    }
    if (charCountEl) charCountEl.textContent = '0';

    if (markReadBtn) {
        if (status === 'replied') {
            markReadBtn.style.display = 'none';
        } else {
            markReadBtn.style.display = '';
            const isUnread = status === 'unread';
            markReadBtn.innerHTML = isUnread
                ? '<i class="fa-solid fa-envelope-open"></i><span>Mark Read</span>'
                : '<i class="fa-solid fa-envelope"></i><span>Mark Unread</span>';
            markReadBtn.title = isUnread ? 'Mark as read' : 'Mark as unread';
        }
    }

    paneEl.dataset.activeId = id;
}

function selectInquiry(id, options = {}) {
    const sid = String(id);
    const msg = findCachedMessage(sid);
    if (!msg) {
        inquiryDetailActiveId = null;
        showInquiryDetailEmpty();
        renderMessagesInbox(adminMessagesCache);
        return;
    }

    inquiryDetailActiveId = sid;
    populateInquiryDetailPane(msg);
    renderMessagesInbox(adminMessagesCache);

    if (options.markRead && resolveMessageStatus(msg) === 'unread') {
        markMessageRead(sid, true).catch((err) => showToast(err.message, 'error'));
    }
}

function clearInquirySelection() {
    inquiryDetailActiveId = null;
    showInquiryDetailEmpty();
}

function renderMessagesPage(page, limit) {
    initAdminPaginationInstances();
    const pg = messagePg;
    const effectivePage = page ?? pg?.currentPage ?? 1;
    const effectiveLimit = limit ?? pg?.currentLimit ?? 10;

    if (pg) {
        pg.currentPage = effectivePage;
        pg.currentLimit = effectiveLimit;
    }

    renderMessagesInbox(adminMessagesCache, effectivePage, effectiveLimit);
}

function updateMessagesBulkToolbar() {
    const toolbar = document.getElementById('messages-bulk-toolbar');
    const countEl = document.getElementById('messages-selected-count');
    const count = selectedMessageIds.size;
    if (toolbar) toolbar.classList.toggle('is-visible', count > 0);
    if (countEl) countEl.textContent = `${count} selected`;
}

window.toggleMessageSelection = function(id, checked) {
    const sid = String(id);
    if (checked) selectedMessageIds.add(sid);
    else selectedMessageIds.delete(sid);
    updateMessagesBulkToolbar();
};

window.bulkDeleteMessages = function() {
    const ids = Array.from(selectedMessageIds);
    if (!ids.length) return;

    showCustomConfirm('Delete Selected Messages', `Delete ${ids.length} message(s)? This cannot be undone.`, async () => {
        try {
            const results = await Promise.all(ids.map(id =>
                fetch(`/api/admin/messages/${id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                }).then(r => r.json())
            ));
            const deleted = results.filter(r => r.success).length;
            if (deleted > 0) {
                ids.forEach(id => {
                    adminMessagesCache = adminMessagesCache.filter(m => String(m.id || m._id) !== String(id));
                    selectedMessageIds.delete(String(id));
                    if (inquiryDetailActiveId === String(id)) clearInquirySelection();
                });
                updateMessagesBulkToolbar();
                if (messagePg) messagePg.stayOnPage();
                else renderMessagesInbox(adminMessagesCache);
                showToast(`${deleted} message(s) deleted.`, 'success');
            } else {
                showToast('Could not delete selected messages.', 'error');
            }
        } catch (err) {
            showToast('Server error during bulk delete.', 'error');
        }
    }, 'danger');
};

function renderMessagesInbox(messages = adminMessagesCache, page, limit) {
    const listEl = document.getElementById('messagesInboxList');
    if (!listEl) return;

    adminMessagesCache = Array.isArray(messages) ? messages.slice() : [];
    updateMessagesStats();

    const filtered = getFilteredMessages();
    initAdminPaginationInstances();

    const effectivePage = page ?? messagePg?.currentPage ?? 1;
    const effectiveLimit = limit ?? messagePg?.currentLimit ?? 10;

    if (!adminMessagesCache.length) {
        listEl.innerHTML = '<div class="support-inbox-list-empty">No messages yet.</div>';
        inquiryDetailActiveId = null;
        showInquiryDetailEmpty();
        if (messagePg) messagePg.setTotal(0);
        updateMessagesBulkToolbar();
        return;
    }

    if (!filtered.length) {
        listEl.innerHTML = '<div class="support-inbox-list-empty">No inquiries match your filters.</div>';
        if (messagePg) messagePg.setTotal(0);
        updateMessagesBulkToolbar();
        return;
    }

    if (inquiryDetailActiveId && !filtered.some((m) => String(m.id || m._id) === inquiryDetailActiveId)) {
        inquiryDetailActiveId = null;
        showInquiryDetailEmpty();
    }

    const start = (effectivePage - 1) * effectiveLimit;
    const paginated = filtered.slice(start, start + effectiveLimit);

    if (messagePg) {
        messagePg.currentPage = effectivePage;
        messagePg.currentLimit = effectiveLimit;
        messagePg.setTotal(filtered.length);
    }

    listEl.innerHTML = paginated.map((msg) => {
        const id = escapeHtml(msg.id || msg._id);
        const sid = String(msg.id || msg._id);
        const status = resolveMessageStatus(msg);
        const isActive = inquiryDetailActiveId === sid;
        const isChecked = selectedMessageIds.has(sid);
        const initial = escapeHtml(getCustomerInitial(msg.name));
        const avatarColor = getAvatarColor(msg.name);
        const snippet = escapeHtml(getMessageSnippet(msg.message));
        const subject = escapeHtml(msg.subject || '(No subject)');
        const time = escapeHtml(formatMessageListTime(msg.createdAt));

        return `
            <div class="support-inbox-list-row ${isActive ? 'is-active-row' : ''}">
                <input type="checkbox" class="message-row-checkbox" value="${id}"
                    ${isChecked ? 'checked' : ''}
                    onclick="event.stopPropagation(); toggleMessageSelection('${sid}', this.checked)"
                    aria-label="Select message">
                <button type="button"
                    class="support-inbox-list-item ${isActive ? 'is-active border-l-4 border-blue-600 bg-blue-50/60 dark:bg-slate-800' : ''} ${status === 'unread' ? 'is-unread' : ''}"
                    data-id="${id}"
                    role="option"
                    aria-selected="${isActive ? 'true' : 'false'}">
                    <span class="support-inbox-list-avatar" style="background:${avatarColor}">${initial}</span>
                    <span class="support-inbox-list-body">
                        <span class="support-inbox-list-top">
                            <strong class="support-inbox-list-name">${escapeHtml(msg.name || 'Unknown')}</strong>
                            <time class="support-inbox-list-time">${time}</time>
                        </span>
                        <span class="support-inbox-list-subject">${subject}</span>
                        <span class="support-inbox-list-snippet">${snippet}</span>
                    </span>
                </button>
            </div>`;
    }).join('');

    updateMessagesBulkToolbar();

    if (inquiryDetailActiveId) {
        const activeMsg = findCachedMessage(inquiryDetailActiveId);
        if (activeMsg) populateInquiryDetailPane(activeMsg);
    }
}

window.fetchAdminMessages = async function fetchAdminMessages() {
    const section = document.getElementById('view-messages');
    if (!section) return;

    const listEl = document.getElementById('messagesInboxList');
    const prevActive = inquiryDetailActiveId;
    if (listEl) listEl.innerHTML = '<div class="support-inbox-list-loading text-center"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const res = await fetch('/api/admin/messages', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to load messages.');

        inquiryDetailActiveId = prevActive;
        renderMessagesInbox(data.data || [], messagePg?.currentPage || 1, messagePg?.currentLimit || 10);

        if (prevActive && !findCachedMessage(prevActive)) {
            inquiryDetailActiveId = null;
            showInquiryDetailEmpty();
            renderMessagesInbox(adminMessagesCache);
        }
    } catch (err) {
        console.error('Messages inbox error:', err);
        if (listEl) listEl.innerHTML = `<div class="support-inbox-list-empty">${escapeHtml(err.message)}</div>`;
    }
};

async function markMessageUnread(id) {
    const res = await fetch(`/api/admin/messages/${id}/unread`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Failed to mark as unread.');

    const idx = adminMessagesCache.findIndex((m) => String(m.id || m._id) === String(id));
    if (idx >= 0 && result.data) {
        adminMessagesCache[idx] = result.data;
        if (inquiryDetailActiveId === String(id)) populateInquiryDetailPane(result.data);
        renderMessagesInbox(adminMessagesCache);
    } else {
        await fetchAdminMessages();
    }
    showToast('Marked as unread.', 'success');
}

async function markMessageRead(id, silent = false) {
    const res = await fetch(`/api/admin/messages/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Failed to mark as read.');

    const idx = adminMessagesCache.findIndex((m) => String(m.id || m._id) === String(id));
    if (idx >= 0 && result.data) {
        adminMessagesCache[idx] = result.data;
        if (inquiryDetailActiveId === String(id)) populateInquiryDetailPane(result.data);
        renderMessagesInbox(adminMessagesCache);
    } else {
        await fetchAdminMessages();
    }
    if (!silent) showToast('Marked as read.', 'success');
}

async function toggleDetailReadStatus() {
    if (!inquiryDetailActiveId) return;
    const msg = findCachedMessage(inquiryDetailActiveId);
    if (!msg) return;

    const status = resolveMessageStatus(msg);
    if (status === 'replied') return;

    try {
        if (status === 'unread') {
            await markMessageRead(inquiryDetailActiveId);
        } else {
            await markMessageUnread(inquiryDetailActiveId);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteMessage(id) {
    const res = await fetch(`/api/admin/messages/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Failed to delete message.');
    showToast('Message deleted.', 'success');

    if (inquiryDetailActiveId === String(id)) {
        clearInquirySelection();
    }
    selectedMessageIds.delete(String(id));
    adminMessagesCache = adminMessagesCache.filter(m => String(m.id || m._id) !== String(id));
    if (messagePg) messagePg.stayOnPage();
    else await fetchAdminMessages();
}

async function sendInquiryReply() {
    const id = inquiryDetailActiveId;
    const textarea = document.getElementById('inquiryDetailReplyText');
    const sendBtn = document.getElementById('inquiryDetailSendBtn');
    if (!id || !textarea || !sendBtn) return;

    const replyMessage = textarea.value.trim();
    if (replyMessage.length < 5) {
        showToast('Reply must be at least 5 characters.', 'warning');
        textarea.focus();
        return;
    }

    const originalBtnHtml = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

    try {
        const res = await fetch(`/api/inquiries/${id}/reply`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ replyMessage })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Failed to send reply.');

        const idx = adminMessagesCache.findIndex((m) => String(m.id || m._id) === String(id));
        if (idx >= 0 && result.data) {
            adminMessagesCache[idx] = result.data;
            populateInquiryDetailPane(result.data);
            renderMessagesInbox(adminMessagesCache);
        } else {
            await fetchAdminMessages();
        }

        showToast('Reply sent successfully!', 'success');
    } catch (err) {
        showToast(err.message || 'Failed to send reply.', 'error');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalBtnHtml;
    }
}

function setMessagesFilterTab(tab) {
    messagesFilterTab = tab;
    document.querySelectorAll('.support-inbox-tab').forEach((btn) => {
        const isActive = btn.dataset.filter === tab;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    if (messagePg) messagePg.resetPage();
    renderMessagesPage(1, messagePg?.currentLimit);
}

function setupMessagesInbox() {
    document.getElementById('messagesRefreshBtn')?.addEventListener('click', fetchAdminMessages);

    document.querySelectorAll('.support-inbox-tab').forEach((btn) => {
        btn.addEventListener('click', () => setMessagesFilterTab(btn.dataset.filter || 'all'));
    });

    document.getElementById('messagesSearchInput')?.addEventListener('input', (e) => {
        messagesSearchQuery = e.target.value || '';
        if (messagePg) messagePg.resetPage();
        renderMessagesPage(1, messagePg?.currentLimit);
    });

    document.getElementById('messagesInboxList')?.addEventListener('click', (e) => {
        const item = e.target.closest('.support-inbox-list-item');
        if (!item) return;
        selectInquiry(item.dataset.id, { markRead: true });
    });

    document.getElementById('messagesInboxList')?.addEventListener('keydown', (e) => {
        const item = e.target.closest('.support-inbox-list-item');
        if (item && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            selectInquiry(item.dataset.id, { markRead: true });
        }
    });

    document.getElementById('inquiryDetailMarkReadBtn')?.addEventListener('click', () => {
        toggleDetailReadStatus();
    });

    document.getElementById('inquiryDetailDeleteBtn')?.addEventListener('click', () => {
        if (!inquiryDetailActiveId) return;
        const delId = inquiryDetailActiveId;
        showCustomConfirm('Delete message?', 'This inquiry will be permanently removed.', () => {
            deleteMessage(delId).catch((err) => showToast(err.message, 'error'));
        }, 'danger');
    });

    document.getElementById('inquiryDetailSendBtn')?.addEventListener('click', () => {
        sendInquiryReply();
    });

    document.getElementById('inquiryDetailCopyEmail')?.addEventListener('click', (e) => {
        copyCustomerField(e.currentTarget);
    });

    document.getElementById('inquiryDetailCopyPhone')?.addEventListener('click', (e) => {
        copyCustomerField(e.currentTarget);
    });

    document.getElementById('inquiryDetailReplyText')?.addEventListener('input', (e) => {
        const counter = document.getElementById('inquiryDetailCharCount');
        if (counter) counter.textContent = String(e.target.value.length);
    });
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    clearInquirySelection,
    deleteMessage,
    findCachedMessage,
    formatMessageDate,
    formatMessageListTime,
    formatPhoneDisplay,
    getAvatarColor,
    getCustomerInitial,
    getFilteredMessages,
    getMessageSnippet,
    getMessageStatusBadge,
    markMessageRead,
    markMessageUnread,
    populateInquiryDetailPane,
    renderMessagesInbox,
    renderMessagesPage,
    resolveMessageStatus,
    selectInquiry,
    sendInquiryReply,
    setMessagesFilterTab,
    setupMessagesInbox,
    showInquiryDetailEmpty,
    toggleDetailReadStatus,
    updateMessagesBulkToolbar,
    updateMessagesStats
});


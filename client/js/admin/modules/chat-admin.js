/**
 * EonlineBazar Admin — Live Chat Module
 * Connects legacy store admin to ecommerce-chat microservice.
 */
import '../admin-core.js';

const CHAT_API = '/api/chat-admin';
const CHAT_TOKEN_KEY = 'chat_admin_token';
const FILTER_STATUS = {
    waiting: 'WAITING_FOR_AGENT',
    active: 'ACTIVE',
    resolved: 'RESOLVED',
    all: ''
};

let activeRoomId = null;
let chatFilter = 'waiting';
let conversations = [];
let cannedResponses = [];
let chatAgent = null;
let isInternalNoteMode = false;
let isAgentTyping = false;
let typingTimer = null;
let chatSocket = null;
let socketBound = false;

function esc(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getChatToken() {
    return localStorage.getItem(CHAT_TOKEN_KEY) || '';
}

function chatHeaders(json = true) {
    const h = { Authorization: `Bearer ${getChatToken()}` };
    if (json) h['Content-Type'] = 'application/json';
    h['X-Chat-Admin'] = '1';
    return h;
}

async function chatApi(path, options = {}) {
    const res = await fetch(`${CHAT_API}${path}`, {
        ...options,
        headers: { ...chatHeaders(!(options.body instanceof FormData)), ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.message || data.error || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

function roomId(room) {
    return String(room?._id || room?.id || '');
}

function customerName(room) {
    return room?.customer_profile?.name || room?.guest_name || 'Guest';
}

function customerAvatar(room) {
    return room?.customer_profile?.avatar || room?.customer_profile?.avatarUrl || '';
}

function orderNumber(room) {
    return room?.order_metadata?.order_number || room?.order_metadata?.orderNumber || '';
}

function getTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
}

function formatMsgTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function playNotificationSound() {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        setTimeout(() => ctx.close().catch(() => {}), 400);
    } catch (_) { /* ignore */ }
}

function showChatGate(show) {
    const gate = document.getElementById('chatAgentLoginGate');
    const workspace = document.getElementById('chatWorkspace');
    if (gate) gate.hidden = !show;
    if (workspace) workspace.hidden = show;
}

function initChatModule() {
    bindChatUiEvents();
    if (getChatToken()) {
        showChatGate(false);
        bootstrapChatSession();
    } else {
        showChatGate(true);
    }
}

function bindChatUiEvents() {
    const form = document.getElementById('chatAgentLoginForm');
    if (form && !form.dataset.bound) {
        form.dataset.bound = '1';
        form.addEventListener('submit', handleChatAgentLogin);
    }

    const search = document.getElementById('chatSearchInput');
    if (search && !search.dataset.bound) {
        search.dataset.bound = '1';
        search.addEventListener('input', (e) => filterConversations(e.target.value));
    }

    document.querySelectorAll('.chat-filter-tab').forEach((btn) => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => setChatFilter(btn.dataset.filter, btn));
    });

    const sendBtn = document.getElementById('sendMsgBtn');
    if (sendBtn && !sendBtn.dataset.bound) {
        sendBtn.dataset.bound = '1';
        sendBtn.addEventListener('click', sendAdminMessage);
    }

    const input = document.getElementById('adminMessageInput');
    if (input && !input.dataset.bound) {
        input.dataset.bound = '1';
        input.addEventListener('input', () => handleAdminTyping(input));
        input.addEventListener('keydown', handleAdminKeydown);
    }

    const fileInput = document.getElementById('chatFileInput');
    if (fileInput && !fileInput.dataset.bound) {
        fileInput.dataset.bound = '1';
        fileInput.addEventListener('change', () => handleChatFileUpload(fileInput));
    }

    const quickToggle = document.getElementById('quickRepliesToggle');
    if (quickToggle && !quickToggle.dataset.bound) {
        quickToggle.dataset.bound = '1';
        quickToggle.addEventListener('click', toggleQuickReplies);
    }

    const noteToggle = document.getElementById('internalNoteToggle');
    if (noteToggle && !noteToggle.dataset.bound) {
        noteToggle.dataset.bound = '1';
        noteToggle.addEventListener('click', toggleInternalNote);
    }

    const orderBtn = document.getElementById('orderCardBtn');
    if (orderBtn && !orderBtn.dataset.bound) {
        orderBtn.dataset.bound = '1';
        orderBtn.addEventListener('click', insertOrderCard);
    }
}

async function handleChatAgentLogin(e) {
    e.preventDefault();
    const email = document.getElementById('chatAgentEmail')?.value?.trim();
    const password = document.getElementById('chatAgentPassword')?.value;
    if (!email || !password) return;

    try {
        const data = await chatApi('/admin/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        const token = data.token || data.accessToken;
        if (!token) throw new Error('No token returned');
        localStorage.setItem(CHAT_TOKEN_KEY, token);
        chatAgent = data.agent || data.user || null;
        showChatGate(false);
        if (typeof showToast === 'function') showToast('Connected to live chat', 'success');
        await bootstrapChatSession();
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message || 'Login failed', 'error');
    }
}

async function bootstrapChatSession() {
    initChatSocket();
    await Promise.all([loadConversations(), loadCannedResponses()]);
    if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }
}

function initChatSocket() {
    if (typeof io === 'undefined') {
        console.warn('[chat-admin] socket.io not loaded');
        return;
    }
    const token = getChatToken();
    if (!token) return;

    if (chatSocket?.connected) return;

    if (chatSocket) {
        chatSocket.auth = { token };
        chatSocket.connect();
        bindSocketEvents(chatSocket);
        return;
    }

    chatSocket = io(`${window.location.origin}/admin`, {
        path: '/chat-socket/socket.io',
        auth: { token },
        extraHeaders: { Authorization: `Bearer ${token}` },
        transports: ['websocket', 'polling'],
        reconnection: true
    });
    bindSocketEvents(chatSocket);
}

function bindSocketEvents(sock) {
    if (socketBound) return;
    socketBound = true;

    sock.on('connect', () => {
        const agentId = chatAgent?.id || chatAgent?._id;
        if (agentId) sock.emit('agent_online', { agent_id: agentId });
        if (activeRoomId) {
            sock.emit('join_room', { room_id: activeRoomId });
            sock.emit('admin_mark_read', { room_id: activeRoomId });
        }
    });

    sock.on('disconnect', () => { socketBound = false; });

    const onNewMessage = (payload) => {
        const rid = String(payload?.room_id || payload?.message?.room_id || '');
        const message = payload?.message || payload;
        if (!rid || !message?.sender_type) return;

        if (payload?.room) upsertConversation(payload.room);

        if (rid === activeRoomId) {
            appendMessage(message);
            scrollToBottom();
            chatSocket?.emit('admin_mark_read', { room_id: rid });
        } else if (message.sender_type === 'USER') {
            bumpUnread(rid);
        }
        updateConversationPreview(rid, message);
    };

    sock.on('new_message', onNewMessage);

    const onHandover = (payload) => {
        if (payload?.room) upsertConversation({ ...payload.room, status: 'WAITING_FOR_AGENT' });
        else if (payload?.room_id) patchConversation(payload.room_id, { status: 'WAITING_FOR_AGENT' });
        renderConversationList();
        playNotificationSound();
        if (Notification.permission === 'granted') {
            new Notification('New live chat', {
                body: `${payload?.room?.guest_name || 'Customer'} is waiting`,
                icon: '/images/logo.png'
            });
        }
        if (typeof showToast === 'function') showToast('🔔 New live chat request', 'info');
    };

    sock.on('new_handover_request', onHandover);
    sock.on('handover_started', onHandover);
    sock.on('waiting_for_agent', onHandover);

    sock.on('room_updated', (payload) => {
        if (payload?.room) upsertConversation(payload.room);
        else if (payload?._id) upsertConversation(payload);
        renderConversationList();
    });

    sock.on('room_status_changed', (payload) => {
        const rid = String(payload?.room_id || payload?.room?._id || '');
        const status = payload?.status || payload?.room?.status;
        if (rid && status) patchConversation(rid, { status });
        if (payload?.room) upsertConversation(payload.room);
        renderConversationList();
        if (rid === activeRoomId) {
            const conv = conversations.find((c) => roomId(c) === rid);
            if (conv) renderChatHeader(conv);
        }
    });

    sock.on('chat_taken', (payload) => {
        if (payload?.room) upsertConversation(payload.room);
        const rid = String(payload?.room_id || payload?.room?._id || '');
        if (rid === activeRoomId && payload?.message) {
            appendMessage(payload.message);
            scrollToBottom();
        }
        renderConversationList();
    });

    sock.on('chat_resolved', (payload) => {
        if (payload?.room) upsertConversation(payload.room);
        const rid = String(payload?.room_id || payload?.room?._id || '');
        if (rid) patchConversation(rid, { status: 'RESOLVED' });
        renderConversationList();
        if (rid === activeRoomId) {
            const conv = conversations.find((c) => roomId(c) === rid);
            if (conv) renderChatHeader(conv);
            if (payload?.message) appendMessage(payload.message);
        }
    });

    sock.on('customer_typing', ({ room_id }) => {
        if (String(room_id) !== activeRoomId) return;
        const el = document.getElementById('customerTypingIndicator');
        if (el) el.hidden = false;
    });

    sock.on('customer_stopped_typing', ({ room_id }) => {
        if (String(room_id) !== activeRoomId) return;
        const el = document.getElementById('customerTypingIndicator');
        if (el) el.hidden = true;
    });

    sock.on('customer_disconnected', ({ room_id }) => {
        if (String(room_id) === activeRoomId) showSystemMessage('Customer disconnected');
    });

    sock.on('take_chat_failed', (payload) => {
        if (typeof showToast === 'function') showToast(payload?.message || 'Could not take chat', 'error');
    });

    sock.on('error', (payload) => {
        if (payload?.message && typeof showToast === 'function') {
            showToast(payload.message, 'error');
        }
    });
}

async function loadConversations() {
    if (!getChatToken()) return;
    try {
        const status = FILTER_STATUS[chatFilter] || '';
        const qs = status ? `?status=${encodeURIComponent(status)}&limit=50` : '?limit=50';
        const data = await chatApi(`/admin/rooms${qs}`);
        conversations = data.rooms || [];
        const countEl = document.getElementById('totalChatsCount');
        if (countEl) countEl.textContent = String(conversations.length);
        renderConversationList();
    } catch (err) {
        console.error('[chat-admin] loadConversations', err);
        if (err.status === 401) {
            localStorage.removeItem(CHAT_TOKEN_KEY);
            showChatGate(true);
        }
    }
}

function upsertConversation(room) {
    const id = roomId(room);
    if (!id) return;
    const idx = conversations.findIndex((c) => roomId(c) === id);
    if (idx >= 0) conversations[idx] = { ...conversations[idx], ...room };
    else conversations.unshift(room);
    conversations.sort((a, b) =>
        new Date(b.last_message_at || b.updatedAt) - new Date(a.last_message_at || a.updatedAt)
    );
}

function patchConversation(id, patch) {
    const conv = conversations.find((c) => roomId(c) === String(id));
    if (conv) Object.assign(conv, patch);
}

function bumpUnread(id) {
    const conv = conversations.find((c) => roomId(c) === String(id));
    if (conv) {
        conv.unread_count = (conv.unread_count || 0) + 1;
        renderConversationList();
    }
}

function updateConversationPreview(id, message) {
    const conv = conversations.find((c) => roomId(c) === String(id));
    if (!conv) return;
    conv.last_message = message.message || message.text || '📎 Attachment';
    conv.last_message_at = message.createdAt || new Date().toISOString();
    conversations.sort((a, b) =>
        new Date(b.last_message_at || b.updatedAt) - new Date(a.last_message_at || a.updatedAt)
    );
    renderConversationList();
}

function renderConversationList() {
    const container = document.getElementById('conversationList');
    if (!container) return;

    if (!conversations.length) {
        container.innerHTML = `
            <div class="chat-conv-empty">
                <span class="chat-conv-empty-icon">💬</span>
                No ${esc(chatFilter)} conversations
            </div>`;
        return;
    }

    const priorityBorder = { urgent: '#ef4444', high: '#f97316', low: '#94a3b8', normal: 'transparent' };

    container.innerHTML = conversations.map((conv) => {
        const id = roomId(conv);
        const isActive = id === activeRoomId;
        const name = customerName(conv);
        const avatar = customerAvatar(conv);
        const preview = conv.last_message || 'Started conversation';
        const timeAgo = getTimeAgo(conv.last_message_at || conv.updatedAt);
        const unread = conv.unread_count || 0;
        const st = uiStatus(conv);
        const ord = orderNumber(conv);
        const initial = esc(name.charAt(0).toUpperCase());

        return `
            <div class="conv-item ${isActive ? 'conv-item-active' : ''}" data-id="${esc(id)}"
                 style="border-left-color:${priorityBorder[conv.priority] || 'transparent'}">
                <div class="conv-item-inner">
                    <div class="conv-avatar-wrap">
                        ${avatar
                            ? `<img src="${esc(avatar)}" alt="" class="conv-avatar">`
                            : `<div class="conv-avatar-fallback">${initial}</div>`}
                        <div class="conv-online-dot"></div>
                    </div>
                    <div class="conv-body">
                        <div class="conv-top-row">
                            <span class="conv-name ${unread ? 'conv-name-unread' : ''}">${esc(name)}</span>
                            <span class="conv-time">${esc(timeAgo)}</span>
                        </div>
                        <div class="conv-preview ${unread ? 'conv-preview-unread' : ''}">${esc(preview)}</div>
                        <div class="conv-meta-row">
                            <span class="conv-status-badge ${st.class}">${esc(st.label)}</span>
                            ${ord ? `<span class="conv-order-badge">#${esc(ord)}</span>` : ''}
                            ${unread ? `<span class="conv-unread-badge">${unread}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
    }).join('');

    container.querySelectorAll('.conv-item').forEach((el) => {
        el.addEventListener('click', () => selectConversation(el.dataset.id));
    });
}

function uiStatus(room) {
    const s = room?.status || '';
    if (s === 'WAITING_FOR_AGENT') return { label: 'waiting', class: 'conv-status-waiting' };
    if (s === 'ACTIVE') return { label: 'active', class: 'conv-status-active' };
    if (s === 'RESOLVED') return { label: 'resolved', class: 'conv-status-resolved' };
    return { label: s.toLowerCase(), class: 'conv-status-resolved' };
}

async function selectConversation(conversationId) {
    activeRoomId = String(conversationId);
    renderConversationList();

    document.getElementById('noChatSelected')?.style.setProperty('display', 'none');
    const win = document.getElementById('activeChatWindow');
    if (win) win.hidden = false;

    if (chatSocket) {
        chatSocket.emit('join_room', { room_id: activeRoomId });
        chatSocket.emit('admin_mark_read', { room_id: activeRoomId });
    }

    const conv = conversations.find((c) => roomId(c) === activeRoomId);
    if (conv) {
        conv.unread_count = 0;
        renderConversationList();
    }

    await Promise.all([
        loadMessages(activeRoomId),
        loadCustomerProfile(activeRoomId)
    ]);
    scrollToBottom();
}

async function loadMessages(roomIdParam) {
    try {
        const data = await chatApi(`/admin/rooms/${roomIdParam}`);
        const conv = data.room || conversations.find((c) => roomId(c) === roomIdParam);
        if (conv) upsertConversation(conv);
        renderChatHeader(conv || { _id: roomIdParam });
        renderMessages(data.messages || []);
    } catch (err) {
        console.error('[chat-admin] loadMessages', err);
        if (typeof showToast === 'function') showToast('Failed to load messages', 'error');
    }
}

function renderChatHeader(conv) {
    const header = document.getElementById('chatWindowHeader');
    if (!header || !conv) return;

    const name = customerName(conv);
    const avatar = customerAvatar(conv);
    const st = uiStatus(conv);
    const ord = orderNumber(conv);
    const id = roomId(conv);
    const initial = esc(name.charAt(0).toUpperCase());
    const isWaiting = conv.status === 'WAITING_FOR_AGENT';
    const isResolved = conv.status === 'RESOLVED';

    header.innerHTML = `
        <div class="chat-header-main">
            ${avatar
                ? `<img src="${esc(avatar)}" alt="" class="conv-avatar">`
                : `<div class="conv-avatar-fallback">${initial}</div>`}
            <div>
                <div class="chat-header-name">${esc(name)}</div>
                <div class="chat-header-sub">${esc(st.label)}${ord ? ` · Order #${esc(ord)}` : ''}</div>
            </div>
        </div>
        <div class="chat-header-actions">
            <select class="chat-priority-select" data-room-id="${esc(id)}" aria-label="Priority">
                <option value="normal" ${conv.priority === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="high" ${conv.priority === 'high' ? 'selected' : ''}>🔥 High</option>
                <option value="urgent" ${conv.priority === 'urgent' ? 'selected' : ''}>🚨 Urgent</option>
                <option value="low" ${conv.priority === 'low' ? 'selected' : ''}>Low</option>
            </select>
            ${isWaiting ? `<button type="button" class="chat-header-btn chat-header-btn-take" data-take="${esc(id)}">Take chat</button>` : ''}
            ${!isResolved ? `<button type="button" class="chat-header-btn chat-header-btn-resolve" data-resolve="${esc(id)}">✅ Resolve</button>` : ''}
            <button type="button" class="chat-header-btn" data-close-chat="${esc(id)}">✕ Close</button>
        </div>`;

    header.querySelector('[data-take]')?.addEventListener('click', () => takeChat(id));
    header.querySelector('[data-resolve]')?.addEventListener('click', () => resolveChat(id));
    header.querySelector('[data-close-chat]')?.addEventListener('click', () => closeChat(id));
    header.querySelector('.chat-priority-select')?.addEventListener('change', (e) => {
        changePriority(id, e.target.value);
    });
}

function renderMessages(messages) {
    const area = document.getElementById('messagesArea');
    if (!area) return;
    area.innerHTML = messages.map(renderMessage).join('');
}

function renderMessage(msg) {
    const type = msg.sender_type || msg.sender;
    if (type === 'SYSTEM') {
        return `<div class="chat-msg-system"><span>${esc(msg.message || msg.text || '')}</span></div>`;
    }
    if (type === 'INTERNAL') {
        return `
            <div class="chat-msg-internal">
                <div class="chat-msg-internal-inner">
                    🔒 <strong>Internal:</strong> ${esc(msg.message || '')}
                    <div class="chat-msg-time">${esc(msg.sender_name || 'Agent')} · ${esc(formatMsgTime(msg.createdAt))}</div>
                </div>
            </div>`;
    }

    const isAgent = type === 'AGENT';
    const attachments = msg.attachments || [];
    const body = msg.message || msg.text || '';
    let content = esc(body);

    if (msg.message_type === 'order_card' && msg.order_card) {
        const oc = msg.order_card;
        content = `📦 Order #${esc(oc.order_number || '')}<br>Status: ${esc(oc.status || '')}<br>Total: ৳${Number(oc.total || 0).toLocaleString()}`;
    } else if (attachments.length) {
        content = attachments.map((att) => {
            const url = att.url || att.thumbnail_url;
            const isImg = (att.type || '').toLowerCase() === 'image' || /\.(jpg|jpeg|png|gif|webp)/i.test(url || '');
            if (isImg) return `<img src="${esc(url)}" alt="" class="chat-msg-img">`;
            return `<a href="${esc(url)}" target="_blank" rel="noopener">📎 ${esc(att.filename || 'File')}</a>`;
        }).join('<br>') + (body && body !== '[Attachment]' ? `<div>${esc(body)}</div>` : '');
    }

    return `
        <div class="chat-msg-row ${isAgent ? 'chat-msg-row-agent' : ''}">
            <div class="chat-msg-avatar ${isAgent ? 'chat-msg-avatar-agent' : 'chat-msg-avatar-customer'}">${isAgent ? 'A' : 'C'}</div>
            <div class="chat-msg-bubble ${isAgent ? 'chat-msg-bubble-agent' : 'chat-msg-bubble-customer'}">
                ${content}
                <div class="chat-msg-time">${esc(formatMsgTime(msg.createdAt))}${isAgent ? ' ✓✓' : ''}</div>
            </div>
        </div>`;
}

function appendMessage(msg) {
    const area = document.getElementById('messagesArea');
    if (!area) return;
    area.insertAdjacentHTML('beforeend', renderMessage(msg));
}

function scrollToBottom() {
    const area = document.getElementById('messagesArea');
    if (area) area.scrollTop = area.scrollHeight;
}

async function takeChat(roomIdParam) {
    if (!chatSocket) return;
    chatSocket.emit('take_chat', { room_id: roomIdParam });
    patchConversation(roomIdParam, { status: 'ACTIVE' });
    renderConversationList();
    setTimeout(() => loadMessages(roomIdParam), 400);
}

async function sendAdminMessage() {
    const input = document.getElementById('adminMessageInput');
    const text = input?.value?.trim();
    if (!text || !activeRoomId) return;

    input.value = '';
    hideQuickRepliesBar();

    const conv = conversations.find((c) => roomId(c) === activeRoomId);
    if (conv?.status === 'WAITING_FOR_AGENT') {
        if (typeof showToast === 'function') showToast('Take the chat first', 'warning');
        return;
    }

    try {
        if (isInternalNoteMode) {
            chatSocket?.emit('internal_note', { room_id: activeRoomId, message: text });
            return;
        }

        if (chatSocket?.connected) {
            chatSocket.emit('agent_message', { room_id: activeRoomId, message: text });
        } else {
            const data = await chatApi(`/admin/rooms/${activeRoomId}/messages`, {
                method: 'POST',
                body: JSON.stringify({ message: text })
            });
            if (data.message) {
                appendMessage(data.message);
                scrollToBottom();
            }
        }
    } catch (err) {
        console.error('[chat-admin] send', err);
        if (typeof showToast === 'function') showToast(err.message || 'Send failed', 'error');
    }
}

function handleAdminKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAdminMessage();
    }
}

function handleAdminTyping(textarea) {
    if (!chatSocket || !activeRoomId) return;
    if (textarea.value === '/') showQuickRepliesBar();
    else if (!textarea.value.startsWith('/')) hideQuickRepliesBar();

    if (!isAgentTyping) {
        isAgentTyping = true;
        chatSocket.emit('agent_typing', { room_id: activeRoomId });
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { isAgentTyping = false; }, 2000);
}

async function loadCannedResponses() {
    if (!getChatToken()) return;
    try {
        const data = await chatApi('/admin/canned');
        cannedResponses = data.responses || [];
    } catch (err) {
        console.error('[chat-admin] canned', err);
    }
}

function showQuickRepliesBar() {
    const bar = document.getElementById('quickRepliesBar');
    const list = document.getElementById('quickRepliesList');
    if (!bar || !list) return;

    const inputVal = document.getElementById('adminMessageInput')?.value || '';
    const search = inputVal.replace(/^\//, '').toLowerCase();
    const filtered = search
        ? cannedResponses.filter((r) =>
            r.title?.toLowerCase().includes(search) ||
            r.shortcut?.toLowerCase().includes(search))
        : cannedResponses;

    list.innerHTML = filtered.slice(0, 8).map((r) => `
        <button type="button" class="chat-quick-chip" data-canned-id="${esc(r._id)}">
            ${r.shortcut ? `<span style="color:#f97316">${esc(r.shortcut)}</span> · ` : ''}${esc(r.title)}
        </button>`).join('');

    list.querySelectorAll('[data-canned-id]').forEach((btn) => {
        btn.addEventListener('click', () => insertQuickReply(btn.dataset.cannedId));
    });

    bar.hidden = filtered.length === 0;
}

function hideQuickRepliesBar() {
    const bar = document.getElementById('quickRepliesBar');
    if (bar) bar.hidden = true;
}

function toggleQuickReplies() {
    const bar = document.getElementById('quickRepliesBar');
    if (!bar) return;
    if (bar.hidden) showQuickRepliesBar();
    else bar.hidden = true;
}

function insertQuickReply(responseId) {
    const response = cannedResponses.find((r) => String(r._id) === String(responseId));
    if (!response) return;
    const input = document.getElementById('adminMessageInput');
    if (input) {
        input.value = response.text || '';
        input.focus();
    }
    hideQuickRepliesBar();
}

async function loadCustomerProfile(roomIdParam) {
    const panel = document.getElementById('chatContextPanel');
    if (!panel) return;
    panel.innerHTML = '<p class="chat-context-placeholder">Loading…</p>';

    try {
        const data = await chatApi(`/admin/rooms/${roomIdParam}/customer-profile`);
        renderCustomerProfilePanel(data.profile || {}, roomIdParam);
    } catch (err) {
        console.error('[chat-admin] profile', err);
        panel.innerHTML = '<p class="chat-context-placeholder">Could not load profile</p>';
    }
}

function renderCustomerProfilePanel(profile, roomIdParam) {
    const panel = document.getElementById('chatContextPanel');
    if (!panel) return;

    const name = profile.name || 'Guest';
    const initial = esc(name.charAt(0).toUpperCase());
    const avatar = profile.avatar || '';
    const ordCtx = profile.orderContext || profile.order_metadata || null;
    const orderNum = ordCtx?.order_number || ordCtx?.orderNumber;
    const recentOrders = profile.recentOrders || [];

    panel.innerHTML = `
        <div class="chat-ctx-profile">
            ${avatar
                ? `<img src="${esc(avatar)}" alt="" class="chat-ctx-avatar">`
                : `<div class="chat-ctx-avatar-fallback">${initial}</div>`}
            <div class="chat-ctx-name">${esc(name)}</div>
            <div class="chat-ctx-meta">${profile.isVerified ? '✅ Verified Customer' : profile.isGuest ? 'Guest session' : 'Unverified'}</div>
            ${profile.email ? `<div class="chat-ctx-meta">${esc(profile.email)}</div>` : ''}
            ${profile.phone ? `<div class="chat-ctx-meta">📞 ${esc(profile.phone)}</div>` : ''}
            ${profile.memberSince ? `<div class="chat-ctx-meta">Member since ${new Date(profile.memberSince).getFullYear()}</div>` : ''}
            ${!profile.isGuest && profile._id
                ? `<a href="#" class="chat-ctx-link" data-view-customer="${esc(profile._id)}">View in Customers →</a>`
                : ''}
        </div>
        ${!profile.isGuest ? `
            <div class="chat-ctx-stats">
                <div class="chat-ctx-stat">
                    <div class="chat-ctx-stat-value">${Number(profile.orderCount || 0)}</div>
                    <div class="chat-ctx-stat-label">Orders</div>
                </div>
                <div class="chat-ctx-stat">
                    <div class="chat-ctx-stat-value chat-ctx-stat-value-accent">৳${Number(profile.totalSpent || 0).toLocaleString()}</div>
                    <div class="chat-ctx-stat-label">Spent</div>
                </div>
            </div>` : ''}
        ${orderNum ? `
            <div class="chat-ctx-section-title">📦 Order Context</div>
            <div class="chat-ctx-order-card">
                <div class="chat-ctx-order-id">#${esc(orderNum)}</div>
                <div class="chat-ctx-order-row">Status: ${esc(ordCtx.orderStatus || ordCtx.status || '—')}</div>
                <div class="chat-ctx-order-row">Total: ৳${Number(ordCtx.orderTotal || ordCtx.total_amount || 0).toLocaleString()}</div>
                ${(ordCtx.orderItems || ordCtx.items || []).slice(0, 3).map((item) =>
                    `<div class="chat-ctx-order-item">· ${esc(item.name)} ×${Number(item.qty || item.quantity || 1)}</div>`
                ).join('')}
                <a href="#" class="chat-ctx-link" data-view-order="${esc(orderNum)}">View in Orders →</a>
            </div>` : ''}
        ${recentOrders.length ? `
            <div class="chat-ctx-section-title">Recent Orders</div>
            <div class="chat-ctx-orders-list">
                ${recentOrders.map((order) => `
                    <div class="chat-ctx-order-line">
                        <div>
                            <strong style="color:#f97316">#${esc(order.orderNumber || order.order_number || '')}</strong>
                            <div class="chat-ctx-meta">${esc(new Date(order.createdAt).toLocaleDateString())}</div>
                        </div>
                        <div style="text-align:right">
                            <div><strong>৳${Number(order.totalAmount || order.total_amount || 0).toLocaleString()}</strong></div>
                            <div class="chat-ctx-meta">${esc(order.status || '')}</div>
                        </div>
                    </div>`).join('')}
            </div>` : ''}`;

    panel.querySelector('[data-view-customer]')?.addEventListener('click', (e) => {
        e.preventDefault();
        openCustomerInAdmin(e.currentTarget.dataset.viewCustomer);
    });
    panel.querySelector('[data-view-order]')?.addEventListener('click', (e) => {
        e.preventDefault();
        openOrderInAdmin(e.currentTarget.dataset.viewOrder);
    });
}

function openCustomerInAdmin(userId) {
    const nav = document.querySelector('[data-target="view-customers"]');
    if (typeof navigateAdminSection === 'function') navigateAdminSection('view-customers', nav);
    setTimeout(() => {
        const input = document.getElementById('customerSearchInput');
        if (input) {
            input.value = userId;
            window.customerSearchQuery = userId;
            if (typeof fetchDashboardData === 'function') fetchDashboardData();
        }
    }, 200);
}

function openOrderInAdmin(orderNum) {
    const nav = document.querySelector('[data-target="view-orders"]');
    if (typeof navigateAdminSection === 'function') navigateAdminSection('view-orders', nav);
    setTimeout(() => {
        const input = document.getElementById('order-search') || document.getElementById('orderSearchInput');
        if (input) {
            input.value = orderNum;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, 200);
}

async function resolveChat(roomIdParam) {
    if (chatSocket?.connected) {
        chatSocket.emit('resolve_chat', { room_id: roomIdParam });
    }
    patchConversation(roomIdParam, { status: 'RESOLVED' });
    renderConversationList();
    const conv = conversations.find((c) => roomId(c) === roomIdParam);
    if (conv && roomIdParam === activeRoomId) renderChatHeader(conv);
    showSystemMessage('Chat resolved');
    if (typeof showToast === 'function') showToast('Chat resolved', 'success');
}

function closeChat(roomIdParam) {
    activeRoomId = null;
    document.getElementById('activeChatWindow')?.setAttribute('hidden', '');
    const empty = document.getElementById('noChatSelected');
    if (empty) empty.style.display = '';
    const panel = document.getElementById('chatContextPanel');
    if (panel) panel.innerHTML = '<p class="chat-context-placeholder">Select a conversation to view details</p>';
    if (roomIdParam && chatSocket) chatSocket.emit('leave_room', { room_id: roomIdParam });
    renderConversationList();
}

async function changePriority(roomIdParam, priority) {
    try {
        await chatApi(`/admin/rooms/${roomIdParam}/priority`, {
            method: 'PATCH',
            body: JSON.stringify({ priority })
        });
        patchConversation(roomIdParam, { priority });
        renderConversationList();
        if (typeof showToast === 'function') showToast(`Priority: ${priority}`, 'success');
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message || 'Priority update failed', 'error');
    }
}

function toggleInternalNote() {
    isInternalNoteMode = !isInternalNoteMode;
    const banner = document.getElementById('internalNoteBanner');
    const input = document.getElementById('adminMessageInput');
    const btn = document.getElementById('internalNoteToggle');
    if (isInternalNoteMode) {
        if (banner) banner.hidden = false;
        if (input) {
            input.classList.add('note-mode');
            input.placeholder = 'Write internal note (not visible to customer)…';
        }
        btn?.classList.add('is-note-active');
    } else {
        if (banner) banner.hidden = true;
        if (input) {
            input.classList.remove('note-mode');
            input.placeholder = 'Type a message… (/ for quick replies)';
        }
        btn?.classList.remove('is-note-active');
    }
}

async function handleChatFileUpload(input) {
    const file = input?.files?.[0];
    input.value = '';
    if (!file || !activeRoomId) return;

    if (!file.type.startsWith('image/')) {
        if (typeof showToast === 'function') showToast('Only images are supported for now', 'warning');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        if (typeof showToast === 'function') showToast('Image must be under 5MB', 'warning');
        return;
    }

    try {
        const form = new FormData();
        form.append('image', file);
        form.append('room_id', activeRoomId);
        const res = await fetch(`${CHAT_API}/upload/image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getChatToken()}`, 'X-Chat-Admin': '1' },
            body: form
        });
        const data = await res.json();
        if (!res.ok || !data?.url) throw new Error(data.message || 'Upload failed');

        const attachments = [{
            type: 'IMAGE',
            url: data.url,
            thumbnail_url: data.thumbnail_url || data.url,
            filename: file.name
        }];

        if (chatSocket?.connected) {
            chatSocket.emit('agent_message', { room_id: activeRoomId, message: '', attachments });
        } else {
            await chatApi(`/admin/rooms/${activeRoomId}/messages`, {
                method: 'POST',
                body: JSON.stringify({ message: '[Attachment]', attachments })
            });
            await loadMessages(activeRoomId);
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message || 'Upload failed', 'error');
    }
}

function insertOrderCard() {
    const conv = conversations.find((c) => roomId(c) === activeRoomId);
    const meta = conv?.order_metadata;
    if (!meta?.order_number) {
        if (typeof showToast === 'function') showToast('No order context on this chat', 'warning');
        return;
    }
    const text = `📦 Order #${meta.order_number}\nStatus: ${meta.status || '—'}\nTotal: ৳${Number(meta.total_amount || 0).toLocaleString()}`;
    const input = document.getElementById('adminMessageInput');
    if (input) {
        input.value = text;
        input.focus();
    }
}

function filterConversations(query) {
    const q = (query || '').toLowerCase();
    document.querySelectorAll('.conv-item').forEach((item) => {
        item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

function setChatFilter(filter, btn) {
    chatFilter = filter || 'all';
    document.querySelectorAll('.chat-filter-tab').forEach((b) => b.classList.remove('is-active'));
    btn?.classList.add('is-active');
    loadConversations();
}

function showSystemMessage(text) {
    appendMessage({
        sender_type: 'SYSTEM',
        message: text,
        createdAt: new Date().toISOString()
    });
    scrollToBottom();
}

Object.assign(window, {
    initChatModule,
    selectConversation,
    sendAdminMessage,
    resolveChat,
    closeChat,
    setChatFilter,
    toggleQuickReplies,
    toggleInternalNote,
    changePriority,
    filterConversations,
    handleAdminTyping,
    handleAdminKeydown,
    insertQuickReply,
    handleChatFileUpload,
    insertOrderCard
});

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('view-chat')) bindChatUiEvents();
});

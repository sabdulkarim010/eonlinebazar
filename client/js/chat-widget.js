/**
 * EOnlineBazar — Premium storefront chat widget
 * API: /chat-api/* (proxied to ecommerce-chat) · Socket: /customer @ /chat-socket/socket.io
 */
(function (global) {
    'use strict';

    var ALLOWED_WIDGET_PATHS = ['/profile', '/account'];

    function isChatWidgetAllowed() {
        try {
            var path = (global.location && global.location.pathname) || '';
            var isAllowedPage = ALLOWED_WIDGET_PATHS.some(function (p) {
                return path === p || path.indexOf(p + '/') === 0;
            });
            if (!isAllowedPage) return false;

            var token = null;
            try {
                token =
                    localStorage.getItem('token') ||
                    localStorage.getItem('customerToken');
            } catch (e) { /* ignore */ }
            return !!token;
        } catch (e2) {
            return false;
        }
    }

    if (!isChatWidgetAllowed()) {
        global.ChatWidget = {
            init: function () { return Promise.resolve(global.ChatWidget); },
            open: function () {},
            close: function () {},
            toggle: function () {},
            mount: function () {},
            destroy: function () {},
            openOrderSupport: function () { return Promise.resolve(global.ChatWidget); },
            linkRegisteredUser: function () { return Promise.resolve(global.ChatWidget); }
        };
        return;
    }

    var STORAGE_SESSION = 'cw_guest_session_id';
    var STORAGE_ROOM_PREFIX = 'cw_room_id_';
    var STORAGE_RATED = 'cw_rated_rooms';
    var SOCKET_CDN = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
    var BOT_AVATAR_SVG =
        '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="sw-avatar-svg">' +
            '<rect x="3" y="5" width="18" height="14" rx="4" fill="currentColor" opacity="0.2"/>' +
            '<path d="M12 3a5 5 0 0 1 5 5v1h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V8a5 5 0 0 1 5-5z" fill="currentColor"/>' +
        '</svg>';
    var AGENT_AVATAR_SVG =
        '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="sw-avatar-svg">' +
            '<circle cx="12" cy="8" r="4" fill="currentColor"/>' +
            '<path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="currentColor"/>' +
        '</svg>';

    var state = {
        apiUrl: '',
        socketUrl: '',
        socketPath: '/chat-socket/socket.io',
        type: 'GENERAL',
        guestName: 'Guest',
        guestEmail: null,
        userId: null,
        userAvatar: null,
        authToken: null,
        productMetadata: null,
        orderId: null,
        orderDisplayId: null,
        orderMetadata: null,
        guestSessionId: null,
        roomId: null,
        socket: null,
        isOpen: false,
        unread: 0,
        resolved: false,
        isTyping: false,
        typingTimer: null,
        bootstrapping: null,
        mounted: false,
        initialized: false,
        renderedIds: Object.create(null),
        agentAvatarUrl: null,
        agentName: null,
        endingSelf: false
    };

    function $(id) {
        return document.getElementById(id);
    }

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    var CLOUDINARY_CLOUD =
        (global.CHAT_CONFIG && global.CHAT_CONFIG.cloudinaryCloudName) ||
        'd1o6p4utt';

    function resolveAssetUrl(url) {
        if (!url || typeof url !== 'string') return null;
        var trimmed = url.trim();
        if (!trimmed) return null;
        if (/^https?:\/\//i.test(trimmed) || trimmed.indexOf('data:') === 0) {
            return trimmed;
        }
        if (/^\/\//.test(trimmed)) {
            return 'https:' + trimmed;
        }
        if (/res\.cloudinary\.com/i.test(trimmed)) {
            return trimmed.indexOf('http') === 0 ? trimmed : 'https://' + trimmed.replace(/^\/+/, '');
        }
        var path = trimmed.charAt(0) === '/' ? trimmed : '/' + trimmed;
        if (/^\/(uploads|images)\//i.test(path)) {
            try {
                return global.location.origin.replace(/\/$/, '') + path;
            } catch (e) {
                return path;
            }
        }
        var publicId = trimmed.replace(/^\/+/, '');
        return 'https://res.cloudinary.com/' + CLOUDINARY_CLOUD + '/image/upload/' + publicId;
    }

    function normalizeIncomingMessage(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (
            payload.message &&
            typeof payload.message === 'object' &&
            !Array.isArray(payload.message) &&
            (payload.message.sender_type || payload.message.sender || payload.message._id)
        ) {
            return payload.message;
        }
        if (payload.sender_type || payload.sender || payload._id) {
            return payload;
        }
        return null;
    }

    function mergeAgentMeta(msg, payload) {
        if (!msg || typeof msg !== 'object') return msg;
        var agent = payload && payload.agent;
        if (agent) {
            if (agent.avatar && !msg.sender_avatar) msg.sender_avatar = agent.avatar;
            if (agent.name) {
                msg.sender_name = agent.name;
                state.agentName = agent.name;
            }
            if (agent.avatar) state.agentAvatarUrl = agent.avatar;
        }
        if (!msg.agent && (msg.sender_name || state.agentName)) {
            msg.agent = {
                name: msg.sender_name || state.agentName,
                avatar: msg.sender_avatar || state.agentAvatarUrl || null
            };
        }
        return msg;
    }

    function uuid() {
        if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    }

    function formatTime(ts) {
        var d = ts ? new Date(ts) : new Date();
        if (isNaN(d.getTime())) d = new Date();
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }

    function defaultApiUrl() {
        var PROD = 'https://eonlinebazar.com/chat-api';
        var LOCAL = 'http://localhost:5001';
        if (global.CHAT_API_URL) return String(global.CHAT_API_URL).replace(/\/$/, '');
        try {
            var host = global.location.hostname || '';
            var port = global.location.port || '';
            if (/(^|\.)eonlinebazar\.com$/i.test(host)) return PROD;
            if (port === '5001') return global.location.origin;
            if (port === '5000' || port === '3000' || !port) {
                return global.location.origin + '/chat-api';
            }
        } catch (e) { /* ignore */ }
        return LOCAL;
    }

    function defaultSocketUrl() {
        try {
            var host = global.location.hostname || '';
            if (/(^|\.)eonlinebazar\.com$/i.test(host)) return global.location.origin;
            if (global.location.port === '5001') return global.location.origin;
            return global.location.origin;
        } catch (e2) {
            return defaultApiUrl().replace(/\/chat-api$/i, '');
        }
    }

    function apiUrl(path) {
        var base = state.apiUrl.replace(/\/$/, '');
        var p = path;
        if (/\/chat-api$/i.test(base) && p.indexOf('/api/') === 0) {
            p = p.replace(/^\/api/, '');
        }
        return base + p;
    }

    function apiFetch(path, options) {
        return fetch(apiUrl(path), options).then(function (res) {
            if (!res.ok) {
                return res.text().then(function (t) {
                    throw new Error(t || ('HTTP ' + res.status));
                });
            }
            var ct = res.headers.get('content-type') || '';
            if (ct.indexOf('application/json') !== -1) return res.json();
            return res.text();
        });
    }

    function getOrCreateSessionId() {
        try {
            var existing = localStorage.getItem(STORAGE_SESSION);
            if (existing) return existing;
            var id = uuid();
            localStorage.setItem(STORAGE_SESSION, id);
            return id;
        } catch (e) {
            return uuid();
        }
    }

    function roomStorageKey() {
        return STORAGE_ROOM_PREFIX + (state.type || 'GENERAL');
    }

    function persistRoom(id) {
        state.roomId = id;
        try {
            localStorage.setItem(roomStorageKey(), id);
            localStorage.setItem('chatConversationId', id);
        } catch (e) { /* ignore */ }
    }

    function readPersistedRoom() {
        try {
            return localStorage.getItem(roomStorageKey()) || localStorage.getItem('chatConversationId');
        } catch (e) {
            return null;
        }
    }

    function getRatedRooms() {
        try {
            var raw = localStorage.getItem(STORAGE_RATED);
            var arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function markRoomRated(id) {
        try {
            var rooms = getRatedRooms();
            if (rooms.indexOf(String(id)) === -1) {
                rooms.push(String(id));
                localStorage.setItem(STORAGE_RATED, JSON.stringify(rooms));
            }
        } catch (e) { /* ignore */ }
    }

    function loadSocketIo() {
        return new Promise(function (resolve, reject) {
            if (global.io) return resolve();
            var existing = document.querySelector('script[data-sw-socket]');
            if (existing) {
                existing.addEventListener('load', function () { resolve(); });
                existing.addEventListener('error', reject);
                return;
            }
            var s = document.createElement('script');
            s.src = SOCKET_CDN;
            s.async = true;
            s.setAttribute('data-sw-socket', '1');
            s.onload = function () { resolve(); };
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    function ensureCss() {
        if (document.querySelector('link[data-sw-chat-css]')) return;
        if (document.querySelector('link[href*="chat-widget"]')) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/chat-widget.css';
        link.setAttribute('data-sw-chat-css', '1');
        document.head.appendChild(link);
    }

    function mountDom() {
        if ($('chatFab') || state.mounted) return;
        ensureCss();

        document.body.insertAdjacentHTML('beforeend',
            '<button type="button" id="chatFab" aria-label="Open live chat">' +
                '💬<span id="chatFabUnread">0</span>' +
            '</button>' +
            '<div id="chatWindow" role="dialog" aria-label="Live support chat">' +
                '<div class="sw-chat-header">' +
                    '<div class="sw-chat-header-icon">🛍️</div>' +
                    '<div class="sw-chat-header-main">' +
                        '<div class="sw-chat-header-title" id="swChatTitle">EOnlineBazar Support</div>' +
                        '<div class="sw-chat-header-sub">' +
                            '<span class="sw-chat-status-dot" id="agentStatusDot"></span>' +
                            '<span id="agentStatusText">Online · Reply in minutes</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="sw-chat-header-actions">' +
                        '<button type="button" class="sw-chat-icon-btn" id="chatMinBtn" aria-label="Minimize">−</button>' +
                    '</div>' +
                '</div>' +
                '<div id="orderContextBanner">📦 <span id="orderContextText">Chatting about an order</span></div>' +
                '<div id="faqSection">' +
                    '<div class="sw-faq-label">QUICK QUESTIONS</div>' +
                    '<button type="button" class="faq-btn" data-faq="Where is my order?">📦 Where is my order?</button>' +
                    '<button type="button" class="faq-btn" data-faq="How do I return an item?">↩️ Return an item</button>' +
                    '<button type="button" class="faq-btn" data-faq="Payment methods?">💳 Payment methods?</button>' +
                    '<button type="button" class="faq-btn" data-faq="Delivery time?">🚚 Delivery time?</button>' +
                '</div>' +
                '<div id="chatWidgetMessages"></div>' +
                '<div id="widgetTypingIndicator">Agent is typing…</div>' +
                '<div id="chatRatingPrompt">' +
                    '<div class="sw-rating-title">How was our support?</div>' +
                    '<div class="sw-rating-stars" id="ratingStars"></div>' +
                '</div>' +
                '<div class="sw-chat-composer" id="chatComposer">' +
                    '<button type="button" id="cw-attach-btn" class="sw-attach-btn" title="Attach file" aria-label="Attach file">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
                            '<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>' +
                        '</svg>' +
                    '</button>' +
                    '<input type="file" id="widgetFileInput" accept="image/*,.pdf,.doc,.docx" hidden>' +
                    '<textarea id="widgetMessageInput" rows="1" placeholder="Type a message…"></textarea>' +
                    '<button type="button" id="widgetSendBtn" aria-label="Send">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">' +
                            '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>' +
                        '</svg>' +
                    '</button>' +
                '</div>' +
                '<div class="sw-chat-powered">Powered by EOnlineBazar</div>' +
            '</div>'
        );

        var stars = $('ratingStars');
        if (stars) {
            [1, 2, 3, 4, 5].forEach(function (n) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'sw-rating-star';
                btn.setAttribute('data-score', String(n));
                btn.textContent = '⭐'.repeat(n);
                btn.addEventListener('click', function () { ChatWidget.rate(n); });
                stars.appendChild(btn);
            });
        }

        $('chatFab').addEventListener('click', function () { ChatWidget.toggle(); });
        $('chatMinBtn').addEventListener('click', function () { ChatWidget.minimize(); });
        $('widgetSendBtn').addEventListener('click', function () { ChatWidget.sendMessage(); });
        $('widgetMessageInput').addEventListener('input', function () { ChatWidget.handleTyping(); });
        $('widgetMessageInput').addEventListener('keydown', function (e) { ChatWidget.handleKeydown(e); });
        $('cw-attach-btn').addEventListener('click', function () {
            var input = $('widgetFileInput');
            if (input) input.click();
        });
        $('widgetFileInput').addEventListener('change', function () { ChatWidget.handleFileAttachment(this); });
        document.querySelectorAll('.faq-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                ChatWidget.sendFAQ(btn.getAttribute('data-faq') || btn.textContent);
            });
        });

        var msgArea = $('chatWidgetMessages');
        if (msgArea) {
            msgArea.addEventListener('error', function (e) {
                var img = e.target;
                if (!img || !img.classList || !img.classList.contains('sw-msg-avatar-img')) return;
                img.style.display = 'none';
                var fb = img.parentNode && img.parentNode.querySelector('.sw-msg-avatar-fallback');
                if (fb) fb.hidden = false;
            }, true);
        }

        renderWelcome();
        state.mounted = true;
    }

    function renderWelcome() {
        var area = $('chatWidgetMessages');
        if (!area || area.children.length) return;
        area.innerHTML =
            '<div class="sw-msg-row">' +
                '<div class="sw-msg-avatar sw-msg-avatar-bot">' + BOT_AVATAR_SVG + '</div>' +
                '<div class="sw-msg-bubble sw-msg-bubble-in">' +
                    'Hi! 👋 Welcome to EOnlineBazar support.<br>How can I help you today?' +
                '</div>' +
            '</div>';
    }

    function updateHeader() {
        var sub = $('agentStatusText');
        var title = $('swChatTitle');
        if (state.type === 'ORDER_SUPPORT') {
            var label = state.orderDisplayId || state.orderId || 'your order';
            if (sub) sub.textContent = 'Order #' + label;
            if (title) title.textContent = 'Order Support';
        } else {
            if (title) title.textContent = 'EOnlineBazar Support';
            if (sub) sub.textContent = 'Online · Reply in minutes';
        }
    }

    function showOrderBanner() {
        var banner = $('orderContextBanner');
        var text = $('orderContextText');
        if (!banner || !text) return;
        if (state.type === 'ORDER_SUPPORT' && (state.orderDisplayId || state.orderId)) {
            text.textContent = 'Regarding Order #' + (state.orderDisplayId || state.orderId);
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    }

    function updateUnreadBadge() {
        var badge = $('chatFabUnread');
        if (!badge) return;
        badge.textContent = String(state.unread);
        badge.style.display = state.unread > 0 ? 'flex' : 'none';
    }

    function scrollToBottom() {
        var area = $('chatWidgetMessages');
        if (area) area.scrollTop = area.scrollHeight;
    }

    function hideFaq() {
        var faq = $('faqSection');
        if (faq) faq.style.display = 'none';
    }

    function setFabVisible(visible) {
        var fab = $('chatFab');
        if (!fab) return;
        fab.classList.toggle('sw-hidden', !visible);
        fab.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function avatarHtml(type, msg) {
        var isAgent = type === 'AGENT';
        var cls = isAgent ? 'sw-msg-avatar-agent' : 'sw-msg-avatar-bot';
        var fallback = isAgent ? AGENT_AVATAR_SVG : BOT_AVATAR_SVG;
        var rawUrl = isAgent && msg && (
            msg.sender_avatar ||
            msg.senderAvatar ||
            msg.avatar ||
            (msg.agent && (msg.agent.avatar || msg.agent.avatarUrl)) ||
            state.agentAvatarUrl
        );
        var url = resolveAssetUrl(rawUrl);
        if (url) {
            return (
                '<div class="sw-msg-avatar ' + cls + ' sw-msg-avatar-img-wrap">' +
                    '<img src="' + esc(url) + '" alt="" class="sw-msg-avatar-img">' +
                    '<span class="sw-msg-avatar-fallback" hidden>' + fallback + '</span>' +
                '</div>'
            );
        }
        return '<div class="sw-msg-avatar ' + cls + '">' + fallback + '</div>';
    }

    function clearPersistedRoom() {
        try {
            localStorage.removeItem(roomStorageKey());
            localStorage.removeItem('chatConversationId');
            localStorage.removeItem('cw_room_id');
        } catch (e) { /* ignore */ }
    }

    function emitEndChatWithAck(roomId) {
        return new Promise(function (resolve) {
            if (!state.socket || !roomId) {
                resolve(false);
                return;
            }
            var settled = false;
            function finish(ok) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try { state.socket.off('end_chat_ok', onOk); } catch (e1) { /* ignore */ }
                try { state.socket.off('end_chat_failed', onFail); } catch (e2) { /* ignore */ }
                resolve(!!ok);
            }
            function onOk() { finish(true); }
            function onFail() { finish(false); }
            var timer = setTimeout(function () { finish(false); }, 5000);
            state.socket.once('end_chat_ok', onOk);
            state.socket.once('end_chat_failed', onFail);
            state.socket.emit('end_chat', {
                room_id: roomId,
                guest_session_id: state.guestSessionId
            }, function (ack) {
                if (ack && ack.ok === false) finish(false);
                else finish(true);
            });
        });
    }

    function showChatEndedState() {
        setComposerEnabled(false);
        var composer = $('chatComposer');
        if (composer) {
            composer.innerHTML =
                '<div style="text-align:center;padding:16px;color:#6b7280;font-size:13px;">' +
                    '<p>Chat ended. Thank you!</p>' +
                    '<button type="button" id="sw-start-new-chat" style="margin-top:8px;padding:6px 16px;background:#f97316;color:white;border:none;border-radius:8px;cursor:pointer;font-size:12px;">Start new chat</button>' +
                '</div>';
            var btn = $('sw-start-new-chat');
            if (btn) {
                btn.addEventListener('click', function () {
                    ChatWidget.startNewChat();
                });
            }
        }
    }

    async function endAndHideSession() {
        state.endingSelf = true;
        var roomId = state.roomId;
        if (state.socket && roomId) {
            try {
                await emitEndChatWithAck(roomId);
            } catch (err) {
                console.error('[ChatWidget] end_chat failed:', err);
            }
        }
        clearPersistedRoom();
        state.roomId = null;
        state.resolved = true;
        state.agentAvatarUrl = null;
        state.agentName = null;
        showChatEndedState();
        state.endingSelf = false;
    }

    function emitJoinRoom() {
        if (!state.socket || !state.roomId) return;
        state.socket.emit('join_room', {
            room_id: state.roomId,
            guest_session_id: state.guestSessionId
        });
    }

    function setComposerEnabled(enabled) {
        var composer = $('chatComposer');
        if (composer) composer.classList.toggle('is-disabled', !enabled);
    }

    function renderAgentMessage(msg) {
        var agentName = (msg.agent && msg.agent.name) || msg.sender_name || state.agentName || 'Support';
        var agentAvatar = (msg.agent && msg.agent.avatar) || msg.sender_avatar || state.agentAvatarUrl || null;
        var content = msg.content || msg.message || msg.text || '';
        var time = formatTime(msg.createdAt || msg.created_at);
        var url = resolveAssetUrl(agentAvatar);
        var avatarHtml = url
            ? '<div class="sw-msg-avatar sw-msg-avatar-agent sw-msg-avatar-img-wrap">' +
                '<img src="' + esc(url) + '" alt="" class="sw-msg-avatar-img" />' +
                '<span class="sw-msg-avatar-fallback" hidden>' + AGENT_AVATAR_SVG + '</span>' +
              '</div>'
            : '<div class="sw-msg-avatar sw-msg-avatar-agent" style="background:linear-gradient(135deg,#6366f1,#4f46e5);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:600;">' +
                esc(agentName.charAt(0).toUpperCase()) +
              '</div>';

        return (
            '<div class="sw-msg-row">' +
                avatarHtml +
                '<div class="sw-msg-bubble-wrap">' +
                    '<p style="font-size:10px;color:#6b7280;margin:0 0 3px 4px;font-weight:500;">' + esc(agentName) + '</p>' +
                    '<div class="sw-msg-bubble sw-msg-bubble-in">' + esc(content) +
                        '<div class="sw-msg-time">' + time + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
    }

    function renderMessage(msg, opts) {
        opts = opts || {};
        var type = (msg.sender_type || msg.sender || '').toUpperCase();
        var id = String(msg._id || msg.id || '');
        if (id && state.renderedIds[id]) return;
        if (id) state.renderedIds[id] = true;

        var area = $('chatWidgetMessages');
        if (!area) return;

        if (type === 'SYSTEM') {
            var sysText = msg.message || msg.text || '';
            var sysEl = document.createElement('div');
            sysEl.className = 'sw-msg-system';
            sysEl.style.transition = 'opacity 0.5s ease';
            sysEl.textContent = sysText;
            area.appendChild(sysEl);
            if (!opts.skipScroll) scrollToBottom();
            if (!opts.fromHistory) {
                setTimeout(function () {
                    sysEl.style.opacity = '0';
                    setTimeout(function () {
                        if (sysEl.parentNode) sysEl.remove();
                    }, 500);
                }, 4000);
            }
            return;
        }

        if (type === 'INTERNAL') return;

        if (type === 'AGENT') {
            area.insertAdjacentHTML('beforeend', renderAgentMessage(msg));
            if (!opts.skipScroll) scrollToBottom();
            if (!state.isOpen && !opts.fromHistory) {
                state.unread += 1;
                updateUnreadBadge();
            }
            return;
        }

        var isUser = type === 'USER';
        var content = msg.content || msg.message || msg.text || '';
        var attachments = msg.attachments || [];
        var inner = esc(content);

        if (attachments.length) {
            inner = attachments.map(function (att) {
                var url = att.url || att.thumbnail_url;
                if (!url) return '';
                var attType = String(att.type || '').toUpperCase();
                var isImage =
                    attType === 'IMAGE' ||
                    att.attachmentType === 'image' ||
                    /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
                if (isImage) {
                    return '<img src="' + esc(url) + '" alt="" class="sw-msg-img" onclick="window.open(\'' + esc(url) + '\',\'_blank\')">';
                }
                var fileName = att.filename || att.attachmentName || 'Download file';
                return (
                    '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="sw-msg-file">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
                            '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
                        '</svg>' +
                        esc(fileName) +
                    '</a>'
                );
            }).join('') + (content && content !== '[Attachment]' ? '<div>' + esc(content) + '</div>' : '');
        }

        var html =
            '<div class="sw-msg-row' + (isUser ? ' sw-msg-row-user' : '') + '"' +
                (id ? ' data-msg-id="' + esc(id) + '"' : '') + '>' +
                (isUser ? '' : avatarHtml(type, msg)) +
                '<div class="sw-msg-bubble ' + (isUser ? 'sw-msg-bubble-out' : 'sw-msg-bubble-in') + '">' +
                    inner +
                    '<div class="sw-msg-time">' + formatTime(msg.createdAt || msg.created_at) +
                        (isUser ? ' ✓' : '') +
                    '</div>' +
                '</div>' +
            '</div>';

        area.insertAdjacentHTML('beforeend', html);

        if (!opts.skipScroll) scrollToBottom();

        if (!isUser && !state.isOpen && !opts.fromHistory) {
            state.unread += 1;
            updateUnreadBadge();
            if (global.Notification && Notification.permission === 'granted') {
                try {
                    new Notification('EOnlineBazar Support', {
                        body: content || 'New message',
                        icon: '/images/favicon.png'
                    });
                } catch (e) { /* ignore */ }
            }
        }
    }

    function connectSocket() {
        if (!global.io) return null;
        if (state.socket) {
            try { state.socket.disconnect(); } catch (e) { /* ignore */ }
        }
        state.socket = global.io(String(state.socketUrl).replace(/\/$/, '') + '/customer', {
            path: state.socketPath,
            auth: {
                guest_session_id: state.guestSessionId,
                user_id: state.userId || undefined
            },
            transports: ['polling', 'websocket'],
            reconnection: true
        });

        state.socket.on('connect', function () {
            emitJoinRoom();
        });

        state.socket.on('reconnect', function () {
            emitJoinRoom();
        });

        state.socket.on('new_message', function (payload) {
            var msg = normalizeIncomingMessage(payload);
            if (!msg || typeof msg !== 'object') return;
            var payloadRoomId = payload.room_id || payload.roomId || msg.room_id || msg.roomId;
            if (payloadRoomId && state.roomId && String(payloadRoomId) !== String(state.roomId)) return;
            if (String((msg.sender_type || msg.sender || '')).toUpperCase() === 'USER') return;
            mergeAgentMeta(msg, payload);
            renderMessage(msg);
            if (state.isOpen && state.roomId) {
                state.socket.emit('mark_read', { room_id: state.roomId });
            }
        });

        state.socket.on('agent_joined', function (data) {
            state.agentName = (data && (data.agent_name || data.name)) || 'Agent';
            state.agentAvatarUrl =
                (data && data.agent && (data.agent.avatar || data.agent.avatarUrl)) ||
                (data && (data.agent_avatar || data.agentAvatar)) ||
                null;
        });

        state.socket.on('agent_typing', function (payload) {
            if (payload && payload.room_id && String(payload.room_id) !== String(state.roomId)) return;
            var el = $('widgetTypingIndicator');
            if (el) el.style.display = payload && payload.isTyping === false ? 'none' : 'block';
        });

        state.socket.on('agent_stopped_typing', function (payload) {
            if (payload && payload.room_id && String(payload.room_id) !== String(state.roomId)) return;
            var el = $('widgetTypingIndicator');
            if (el) el.style.display = 'none';
        });

        state.socket.on('user_typing', function (payload) {
            if (String(payload.room_id) !== String(state.roomId)) return;
            var el = $('widgetTypingIndicator');
            if (el) el.style.display = 'block';
        });

        state.socket.on('user_stopped_typing', function (payload) {
            if (String(payload.room_id) !== String(state.roomId)) return;
            var el = $('widgetTypingIndicator');
            if (el) el.style.display = 'none';
        });

        state.socket.on('chat_resolved', function (payload) {
            if (String(payload.room_id || payload.roomId) !== String(state.roomId)) return;
            state.resolved = true;
            setComposerEnabled(false);
            if (state.endingSelf || payload.ended_by === 'CUSTOMER') {
                showChatEndedState();
                return;
            }
            showRatingPrompt();
        });

        state.socket.on('chat_history', function (payload) {
            var messages = payload.messages || payload.history || payload || [];
            var area = $('chatWidgetMessages');
            if (area) area.innerHTML = '';
            state.renderedIds = Object.create(null);
            messages.forEach(function (m) {
                renderMessage(m, { fromHistory: true, skipScroll: true });
            });
            scrollToBottom();
        });

        return state.socket;
    }

    async function startChat() {
        var body = {
            type: state.type,
            order_id: state.type === 'ORDER_SUPPORT' ? (state.orderId || null) : null,
            guest_session_id: state.guestSessionId,
            guest_name: state.guestName,
            source: state.type === 'ORDER_SUPPORT' ? 'order_page' : 'web'
        };
        if (state.guestEmail) body.guest_email = state.guestEmail;
        if (state.userId) body.user_id = state.userId;
        if (state.authToken) body.auth_token = state.authToken;
        if (state.userAvatar) {
            body.customer_avatar_url = state.userAvatar;
            body.customer_avatar = state.userAvatar;
        }
        if (state.orderMetadata) body.order_metadata = state.orderMetadata;
        if (state.productMetadata) body.product_metadata = state.productMetadata;

        var data = await apiFetch('/api/chat/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        var room = data.room || {};
        var roomId = data.room_id || room._id || room.id;
        if (!roomId) throw new Error('No room returned');
        persistRoom(String(roomId));

        if (data.welcome_message && !data.is_existing) {
            renderMessage(data.welcome_message);
        }

        if (room.status === 'RESOLVED') {
            state.resolved = true;
            setComposerEnabled(false);
            showRatingPrompt();
        }

        return data;
    }

    async function bootstrap() {
        if (state.bootstrapping) return state.bootstrapping;

        state.bootstrapping = (async function () {
            mountDom();
            updateHeader();
            showOrderBanner();
            state.resolved = false;
            setComposerEnabled(true);
            state.unread = 0;
            updateUnreadBadge();

            await loadSocketIo();
            connectSocket();

            var persisted = readPersistedRoom();
            if (persisted) {
                state.roomId = persisted;
                if (state.socket && state.socket.connected) {
                    emitJoinRoom();
                }
                await loadHistory();
            }

            await startChat();

            if (state.socket) {
                if (state.socket.connected) emitJoinRoom();
            }
        })();

        try {
            await state.bootstrapping;
        } finally {
            state.bootstrapping = null;
        }
    }

    async function loadHistory() {
        if (!state.roomId) return;
        try {
            var data = await apiFetch('/api/chat/' + encodeURIComponent(state.roomId) + '/messages?limit=50');
            var messages = data.messages || [];
            if (messages.length) {
                var area = $('chatWidgetMessages');
                if (area) area.innerHTML = '';
                state.renderedIds = Object.create(null);
                messages.forEach(function (m) {
                    renderMessage(m, { fromHistory: true, skipScroll: true });
                });
                scrollToBottom();
                hideFaq();
            }
            var room = data.room;
            if (room && room.status === 'RESOLVED' && !room.is_rated) {
                state.resolved = true;
                setComposerEnabled(false);
                showRatingPrompt();
            }
        } catch (err) {
            console.warn('[ChatWidget] history', err);
        }
    }

    function showRatingPrompt() {
        if (!state.roomId || getRatedRooms().indexOf(String(state.roomId)) !== -1) return;
        var el = $('chatRatingPrompt');
        if (el) el.style.display = 'block';
    }

    var ChatWidget = {
        toggle: function () {
            if (state.isOpen) ChatWidget.close();
            else ChatWidget.open();
        },

        open: async function () {
            mountDom();
            if (!state.initialized) {
                await ChatWidget.init({});
            }
            state.isOpen = true;
            setFabVisible(false);
            var win = $('chatWindow');
            if (win) {
                win.style.display = 'flex';
                requestAnimationFrame(function () { win.classList.add('is-open'); });
            }
            state.unread = 0;
            updateUnreadBadge();
            setTimeout(function () { $('widgetMessageInput')?.focus(); }, 280);
            if (state.roomId && state.socket) {
                state.socket.emit('mark_read', { room_id: state.roomId });
            }
        },

        close: function () {
            ChatWidget.minimize();
        },

        endChat: async function () {
            if (!state.roomId || state.resolved) {
                ChatWidget.minimize();
                return;
            }
            var confirmed = false;
            try {
                confirmed = global.confirm('End this conversation?');
            } catch (e) {
                confirmed = true;
            }
            if (confirmed) {
                await endAndHideSession();
            }
        },

        startNewChat: async function () {
            clearPersistedRoom();
            state.roomId = null;
            state.resolved = false;
            state.agentAvatarUrl = null;
            state.agentName = null;
            state.renderedIds = Object.create(null);
            var area = $('chatWidgetMessages');
            if (area) area.innerHTML = '';
            mountDom();
            renderWelcome();
            setComposerEnabled(true);
            await bootstrap();
            await ChatWidget.open();
        },

        minimize: function () {
            state.isOpen = false;
            setFabVisible(true);
            var win = $('chatWindow');
            if (win) {
                win.classList.remove('is-open');
                setTimeout(function () { win.style.display = 'none'; }, 280);
            }
        },

        handleTyping: function () {
            var input = $('widgetMessageInput');
            if (!input) return;
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 80) + 'px';
            if (state.roomId && state.socket && !state.resolved) {
                if (!state.isTyping) {
                    state.isTyping = true;
                    state.socket.emit('typing_start', {
                        room_id: state.roomId,
                        guest_session_id: state.guestSessionId
                    });
                }
                clearTimeout(state.typingTimer);
                state.typingTimer = setTimeout(function () {
                    state.isTyping = false;
                    if (state.socket) {
                        state.socket.emit('typing_stop', {
                            room_id: state.roomId,
                            guest_session_id: state.guestSessionId
                        });
                    }
                }, 2000);
            }
        },

        handleKeydown: function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ChatWidget.sendMessage();
            }
        },

        sendMessage: async function () {
            var input = $('widgetMessageInput');
            var text = input?.value?.trim();
            if (!text || state.resolved) return;

            if (!state.initialized) await ChatWidget.init({});

            input.value = '';
            input.style.height = 'auto';
            hideFaq();
            renderMessage({
                sender_type: 'USER',
                message: text,
                createdAt: new Date().toISOString()
            });

            if (state.socket && state.roomId) {
                state.socket.emit('send_message', {
                    room_id: state.roomId,
                    message: text,
                    guest_session_id: state.guestSessionId,
                    sender_name: state.guestName
                });
            }
        },

        sendFAQ: function (question) {
            var input = $('widgetMessageInput');
            if (input) input.value = question;
            ChatWidget.sendMessage();
        },

        sendImage: async function (input) {
            return ChatWidget.handleFileAttachment(input);
        },

        handleFileAttachment: async function (input) {
            var file = input?.files?.[0];
            if (input) input.value = '';
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                try { global.alert('File too large. Max size is 5MB.'); } catch (e) { /* ignore */ }
                return;
            }

            if (!state.initialized) await ChatWidget.init({});
            if (!state.roomId) return;

            hideFaq();
            var isImage = file.type.startsWith('image/');
            var form = new FormData();
            form.append(isImage ? 'image' : 'file', file);
            form.append('guest_session_id', state.guestSessionId);

            try {
                var res = await fetch(
                    apiUrl('/api/chat/' + encodeURIComponent(state.roomId) + '/upload'),
                    { method: 'POST', body: form }
                );
                if (!res.ok) {
                    throw new Error('Upload failed');
                }
            } catch (err) {
                console.error('[ChatWidget] upload', err);
                try { global.alert('Upload failed. Try again.'); } catch (e2) { /* ignore */ }
            }
        },

        rate: async function (score) {
            if (!state.roomId) return;
            try {
                await apiFetch('/api/chat/' + encodeURIComponent(state.roomId) + '/rate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        score: score,
                        rating: score,
                        guest_session_id: state.guestSessionId,
                        user_id: state.userId || undefined
                    })
                });
                markRoomRated(state.roomId);
                var el = $('chatRatingPrompt');
                if (el) {
                    el.innerHTML = '<div class="sw-rating-title" style="color:#16a34a">✅ Thank you for your feedback!</div>';
                }
            } catch (err) {
                console.error('[ChatWidget] rate', err);
            }
        },

        init: async function (options) {
            options = options || {};
            state.apiUrl = options.apiUrl || options.api_url || defaultApiUrl();
            state.socketUrl = options.socketUrl || options.socket_url || defaultSocketUrl();
            state.socketPath = options.socketPath || options.socket_path || '/chat-socket/socket.io';
            state.guestName = options.guestName || options.guest_name || 'Guest';
            state.guestEmail = options.guestEmail || options.guest_email || null;
            state.userId = options.userId || options.user_id || null;
            state.userAvatar = options.userAvatar || options.user_avatar || null;
            state.authToken = options.authToken || options.auth_token || null;
            state.productMetadata = options.productMetadata || options.product_metadata || null;
            state.orderId = options.orderId || options.order_id || null;
            state.orderDisplayId = options.orderDisplayId || options.order_display_id || null;
            state.orderMetadata = options.orderMetadata || options.order_metadata || null;
            state.type = options.type || (state.orderId ? 'ORDER_SUPPORT' : 'GENERAL');
            state.guestSessionId = getOrCreateSessionId();
            if (!state.authToken) {
                try {
                    state.authToken = localStorage.getItem('token') || localStorage.getItem('customerToken');
                } catch (e) { /* ignore */ }
            }
            if (!state.userId) {
                try {
                    var raw = localStorage.getItem('customerData') || localStorage.getItem('userInfo') || localStorage.getItem('user');
                    if (raw) {
                        var u = JSON.parse(raw);
                        state.userId = u._id || u.id || state.userId;
                        state.guestName = u.name || state.guestName;
                        state.guestEmail = u.email || state.guestEmail;
                        state.userAvatar = u.avatarUrl || u.avatar || state.userAvatar;
                    }
                } catch (e2) { /* ignore */ }
            }
            state.initialized = true;

            if (global.Notification && Notification.permission === 'default') {
                Notification.requestPermission().catch(function () {});
            }

            await bootstrap();
            return ChatWidget;
        },

        openOrderSupport: async function (options) {
            if (state.initialized) ChatWidget.destroy();
            await ChatWidget.init(Object.assign({}, options || {}, { type: 'ORDER_SUPPORT' }));
            await ChatWidget.open();
            return ChatWidget;
        },

        linkRegisteredUser: async function (options) {
            options = options || {};
            try {
                var raw = localStorage.getItem('customerData') || localStorage.getItem('userInfo') || localStorage.getItem('user');
                var user = options.user || (raw ? JSON.parse(raw) : null);
                var token = options.token || localStorage.getItem('token') || localStorage.getItem('customerToken');
                if (user) {
                    state.userId = user._id || user.id || state.userId;
                    state.guestName = user.name || state.guestName;
                    state.guestEmail = user.email || state.guestEmail;
                    state.userAvatar = user.avatarUrl || user.avatar || state.userAvatar;
                }
                if (token) state.authToken = token;
                if (!state.roomId) return ChatWidget;
                await apiFetch('/api/chat/link-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        room_id: state.roomId,
                        guest_session_id: state.guestSessionId,
                        user_id: state.userId,
                        guest_name: state.guestName,
                        guest_email: state.guestEmail,
                        auth_token: state.authToken,
                        customer_avatar_url: state.userAvatar,
                        customer_avatar: state.userAvatar
                    })
                });
            } catch (err) {
                console.warn('[ChatWidget] linkRegisteredUser', err);
            }
            return ChatWidget;
        },

        destroy: function () {
            if (state.socket) {
                try { state.socket.disconnect(); } catch (e) { /* ignore */ }
                state.socket = null;
            }
            var fab = $('chatFab');
            var win = $('chatWindow');
            if (fab) fab.remove();
            if (win) win.remove();
            state.mounted = false;
            state.initialized = false;
            state.isOpen = false;
        },

        mount: mountDom
    };

    global.ChatWidget = ChatWidget;

    document.addEventListener('DOMContentLoaded', function () {
        if (!isChatWidgetAllowed()) return;

        var root = document.querySelector('[data-order-id]');
        var orderId = root?.dataset?.orderId || null;
        var orderNumber = root?.dataset?.orderNumber || null;
        ChatWidget.mount();
        if (orderId || orderNumber) {
            state.orderId = orderId;
            state.orderDisplayId = orderNumber || orderId;
            state.type = 'ORDER_SUPPORT';
            showOrderBanner();
        }
    });
})(typeof window !== 'undefined' ? window : this);

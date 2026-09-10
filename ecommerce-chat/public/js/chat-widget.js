/**
 * EOnlineBazar Customer Chat Widget
 * Drop-in: <script src="/js/chat-widget.js"></script>
 * Init: ChatWidget.init({ apiUrl, socketUrl, guestName, orderId, type, orderMetadata })
 */
(function (global) {
  'use strict';

  var STORAGE_SESSION = 'cw_guest_session_id';
  var STORAGE_ROOM_PREFIX = 'cw_room_id_';
  var STORAGE_RATED = 'cw_rated_rooms';
  var widgetConfig = { type: 'GENERAL' };
  var SOCKET_CDN = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
  var SWAL_CDN = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
  var SWAL_Z = 2147483647;
  var LOCAL_CHAT_ORIGIN = 'http://localhost:5001';
  var BUBBLE_SVG =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>' +
    '</svg>';
  var BOT_AVATAR_SVG =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="cw-avatar-svg">' +
      '<rect x="3" y="5" width="18" height="14" rx="4" fill="currentColor" opacity="0.2"/>' +
      '<path d="M12 3a5 5 0 0 1 5 5v1h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V8a5 5 0 0 1 5-5z" fill="currentColor"/>' +
    '</svg>';
  var AGENT_AVATAR_SVG =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="cw-avatar-svg">' +
      '<circle cx="12" cy="8" r="4" fill="currentColor"/>' +
      '<path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="currentColor"/>' +
    '</svg>';
  var SEND_SVG =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>' +
    '</svg>';

  var state = {
    apiUrl: '',
    socketUrl: '',
    socketPath: '/chat-socket/socket.io',
    guestName: 'Guest',
    guestEmail: null,
    userId: null,
    userAvatar: null,
    authToken: null,
    productMetadata: null,
    orderId: null,
    orderDisplayId: null,
    orderMetadata: null,
    type: 'GENERAL',
    guestSessionId: null,
    roomId: null,
    socket: null,
    isOpen: false,
    unread: 0,
    typingTimer: null,
    isTyping: false,
    pendingFile: null,
    resolved: false,
    endingSelf: false,
    bootstrapping: null,
    agentName: null,
    lastAgentName: null,
    agentAvatarUrl: null,
    initialized: false,
    cssLoaded: false,
    renderedIds: Object.create(null),
    roomStatus: null
  };

  function normalizeMsgSenderType(msg) {
    if (!msg) return '';
    var type = String((msg.sender_type || msg.senderType || msg.sender || msg.type) || '').toUpperCase();
    if (type === 'HUMAN' || type === 'SUPPORT') type = 'AGENT';
    return type;
  }

  function getAgentGroupKey(msg) {
    if (!msg) return '';
    return String(
      msg.sender_id ||
        msg.senderId ||
        (msg.agent && (msg.agent._id || msg.agent.id)) ||
        msg.sender_name ||
        msg.senderName ||
        state.agentName ||
        ''
    );
  }

  function isSameAgentAsPrev(messages, currentIndex) {
    if (currentIndex === 0) return false;
    var prev = messages[currentIndex - 1];
    var curr = messages[currentIndex];
    if (!prev || !curr) return false;
    if (normalizeMsgSenderType(prev) !== 'AGENT' || normalizeMsgSenderType(curr) !== 'AGENT') {
      return false;
    }
    var keyPrev = getAgentGroupKey(prev);
    var keyCurr = getAgentGroupKey(curr);
    return keyPrev && keyCurr && keyPrev === keyCurr;
  }

  function isSameAgentAsNext(messages, currentIndex) {
    if (currentIndex >= messages.length - 1) return false;
    var next = messages[currentIndex + 1];
    var curr = messages[currentIndex];
    if (!next || !curr) return false;
    if (normalizeMsgSenderType(next) !== 'AGENT' || normalizeMsgSenderType(curr) !== 'AGENT') {
      return false;
    }
    var keyNext = getAgentGroupKey(next);
    var keyCurr = getAgentGroupKey(curr);
    return keyNext && keyCurr && keyNext === keyCurr;
  }

  function isSameBotAsNext(messages, currentIndex) {
    if (currentIndex >= messages.length - 1) return false;
    var next = messages[currentIndex + 1];
    var curr = messages[currentIndex];
    if (!next || !curr) return false;
    return (
      normalizeMsgSenderType(next) === 'BOT' &&
      normalizeMsgSenderType(curr) === 'BOT'
    );
  }

  function clearAvatarSlot(slot) {
    if (!slot) return;
    while (slot.firstChild) slot.removeChild(slot.firstChild);
  }

  function updateAgentAvatarGrouping(wrap, agentKey) {
    var box = $('cw-messages');
    if (!box || !wrap || !agentKey) return;
    var agentRows = box.querySelectorAll('.cw-msg.cw-agent');
    if (agentRows.length < 2) return;
    var prev = agentRows[agentRows.length - 2];
    if (prev && prev.getAttribute('data-cw-agent-key') === agentKey) {
      clearAvatarSlot(prev.querySelector('.cw-msg-avatar-slot'));
    }
  }

  /* ---------- helpers ---------- */

  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function $(id) {
    return document.getElementById(id);
  }

  /** Build full API URL; Nginx /chat-api/* → /api/* so strip /api when needed. */
  function apiUrlFor(path) {
    var base = state.apiUrl.replace(/\/$/, '');
    var resolvedPath = path;
    if (/\/chat-api$/i.test(base) && path.indexOf('/api/') === 0) {
      resolvedPath = path.replace(/^\/api/, '');
    }
    return base + resolvedPath;
  }

  function api(path, options) {
    var url = apiUrlFor(path);
    return fetch(url, options).then(function (res) {
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

  function formatTime(ts) {
    var d = ts ? new Date(ts) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var hours = d.getHours();
    var minutes = d.getMinutes();
    var ampm = hours >= 12 ? 'PM' : 'AM';
    var h = hours % 12;
    if (h === 0) h = 12;
    var m = minutes < 10 ? '0' + minutes : String(minutes);
    return h + ':' + m + ' ' + ampm;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function tickSVG(color) {
    var c = color === 'green' ? '#22c55e' : '#9ca3af';
    return '<svg width="18" height="10"' +
      ' viewBox="0 0 18 10" fill="none"' +
      ' xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M1 5L4.5 8.5L10.5 1.5"' +
      ' stroke="' + c + '" stroke-width="1.5"' +
      ' stroke-linecap="round"' +
      ' stroke-linejoin="round"/>' +
      '</svg>';
  }

  function doubleTickSVG() {
    return '<svg width="22" height="10"' +
      ' viewBox="0 0 22 10" fill="none"' +
      ' xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M1 5L4.5 8.5L10.5 1.5"' +
      ' stroke="#22c55e" stroke-width="1.5"' +
      ' stroke-linecap="round"' +
      ' stroke-linejoin="round"/>' +
      '<path d="M6 5L9.5 8.5L15.5 1.5"' +
      ' stroke="#22c55e" stroke-width="1.5"' +
      ' stroke-linecap="round"' +
      ' stroke-linejoin="round"/>' +
      '</svg>';
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
      if (agent.name && !msg.sender_name) msg.sender_name = agent.name;
      if (agent.name) state.agentName = agent.name;
      if (agent.avatar) {
        state.agentAvatarUrl = agent.avatar;
        updateHeader();
      }
    }
    if (!msg.agent && (msg.sender_name || state.agentName)) {
      msg.agent = {
        name: msg.sender_name || state.agentName,
        avatar: msg.sender_avatar || state.agentAvatarUrl || null
      };
    }
    return msg;
  }

  function resolveWidgetOrigin() {
    try {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].src || '';
        if (src.indexOf('chat-widget.js') !== -1) {
          return src.replace(/\/js\/chat-widget\.js(?:\?.*)?$/i, '');
        }
      }
    } catch (e) { /* ignore */ }
    if (state.apiUrl) return String(state.apiUrl).replace(/\/$/, '');
    if (global.CHAT_API_URL) return String(global.CHAT_API_URL).replace(/\/$/, '');
    return LOCAL_CHAT_ORIGIN;
  }

  function resolveCssHref() {
    return resolveWidgetOrigin() + '/css/chat-widget.css';
  }

  function loadCss() {
    if (state.cssLoaded || document.querySelector('link[data-cw-css]')) {
      state.cssLoaded = true;
      return;
    }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = resolveCssHref();
    link.setAttribute('data-cw-css', '1');
    document.head.appendChild(link);
    state.cssLoaded = true;
  }

  function loadSocketIo() {
    return new Promise(function (resolve, reject) {
      if (global.io) {
        resolve();
        return;
      }
      var existing = document.querySelector('script[data-cw-socket]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', reject);
        return;
      }
      var script = document.createElement('script');
      script.src = SOCKET_CDN;
      script.async = true;
      script.setAttribute('data-cw-socket', '1');
      script.onload = function () { resolve(); };
      script.onerror = function () {
        reject(new Error('Failed to load socket.io-client'));
      };
      document.head.appendChild(script);
    });
  }

  function loadSweetAlert() {
    return new Promise(function (resolve, reject) {
      if (global.Swal && typeof global.Swal.fire === 'function') {
        resolve(global.Swal);
        return;
      }
      var existing = document.querySelector('script[data-cw-swal]');
      if (existing) {
        existing.addEventListener('load', function () {
          if (global.Swal && typeof global.Swal.fire === 'function') {
            resolve(global.Swal);
          } else {
            reject(new Error('SweetAlert2 missing after load'));
          }
        });
        existing.addEventListener('error', reject);
        return;
      }
      var script = document.createElement('script');
      script.src = SWAL_CDN;
      script.async = true;
      script.setAttribute('data-cw-swal', '1');
      script.onload = function () {
        if (global.Swal && typeof global.Swal.fire === 'function') {
          resolve(global.Swal);
        } else {
          reject(new Error('SweetAlert2 missing after load'));
        }
      };
      script.onerror = function () {
        reject(new Error('Failed to load SweetAlert2'));
      };
      document.head.appendChild(script);
    });
  }

  function playNotificationSound() {
    if (!document.hidden) return;
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
      setTimeout(function () {
        try { ctx.close(); } catch (e) { /* ignore */ }
      }, 400);
    } catch (e) {
      /* ignore audio errors */
    }
  }

  function getRatedRooms() {
    try {
      var raw = localStorage.getItem(STORAGE_RATED);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function markRoomRated(roomId) {
    if (!roomId) return;
    try {
      var rooms = getRatedRooms();
      if (rooms.indexOf(roomId) === -1) {
        rooms.push(String(roomId));
        localStorage.setItem(STORAGE_RATED, JSON.stringify(rooms));
      }
    } catch (e) {
      /* ignore */
    }
  }

  function isRoomRated(roomId) {
    return getRatedRooms().indexOf(String(roomId)) !== -1;
  }

  function showErrorToast(text) {
    showSystemBanner(text || 'কিছু ভুল হয়েছে। আবার চেষ্টা করুন।');
  }

  /* ---------- DOM build ---------- */

  function ensureDom() {
    if ($('cw-bubble')) return;
    if (!document.body) return;

    var bubble = document.createElement('button');
    bubble.id = 'cw-bubble';
    bubble.type = 'button';
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.innerHTML =
      BUBBLE_SVG +
      '<span id="cw-badge" aria-live="polite"></span>';

    var container = document.createElement('div');
    container.id = 'cw-container';
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', 'Customer support chat');
    container.innerHTML =
      '<div id="cw-header">' +
        '<div id="cw-avatar">' + BOT_AVATAR_SVG + '</div>' +
        '<div id="cw-header-info">' +
          '<p id="cw-agent-name">Aria</p>' +
          '<p id="cw-status">' +
            '<span id="cw-status-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:5px;vertical-align:middle;"></span>' +
            'Online' +
          '</p>' +
        '</div>' +
        '<div id="cw-header-actions">' +
          '<button type="button" id="cw-minimize-btn" aria-label="Minimize">−</button>' +
        '</div>' +
      '</div>' +
      '<div id="cw-messages">' +
        '<div id="cw-typing" aria-hidden="true"><span></span><span></span><span></span></div>' +
      '</div>' +
      '<div id="cw-csat">' +
        '<p>আমাদের সেবা কেমন লেগেছে?</p>' +
        '<div class="cw-stars" role="group" aria-label="Rating">' +
          [1, 2, 3, 4, 5].map(function (n) {
            return '<button type="button" class="cw-star" data-rating="' + n + '" aria-label="' + n + ' star">★</button>';
          }).join('') +
        '</div>' +
        '<p id="cw-csat-thanks" hidden></p>' +
      '</div>' +
      '<div id="cw-footer">' +
        '<div id="cw-attach-preview">' +
          '<img id="cw-attach-thumb" alt="Attachment preview" />' +
          '<div id="cw-attach-name"></div>' +
          '<button type="button" id="cw-attach-remove" aria-label="Remove attachment">×</button>' +
        '</div>' +
        '<button type="button" id="cw-attachment-btn" aria-label="Attach image">📎</button>' +
        '<textarea id="cw-input" rows="1" placeholder="আপনার বার্তা লিখুন..."></textarea>' +
        '<button type="button" id="cw-send-btn" aria-label="Send">➤</button>' +
        '<input type="file" id="cw-file-input" accept="image/*" />' +
      '</div>';

    // Bubble and panel are siblings on document.body — bubble NEVER inside footer/container
    document.body.appendChild(bubble);
    document.body.appendChild(container);

    bubble.addEventListener('click', openWidget);
    $('cw-minimize-btn').addEventListener('click', minimizeWidget);
    $('cw-attachment-btn').addEventListener('click', function () {
      if (!state.resolved) $('cw-file-input').click();
    });
    $('cw-file-input').addEventListener('change', onFileSelected);
    $('cw-attach-remove').addEventListener('click', clearAttachment);

    var stars = container.querySelectorAll('#cw-csat .cw-star');
    stars.forEach(function (star) {
      star.addEventListener('mouseenter', function () {
        var csat = $('cw-csat');
        if (!csat || csat.getAttribute('data-rated') === '1') return;
        var r = Number(star.getAttribute('data-rating'));
        stars.forEach(function (s) {
          s.classList.toggle('active', Number(s.getAttribute('data-rating')) <= r);
        });
      });
      star.addEventListener('mouseleave', function () {
        var csat = $('cw-csat');
        if (!csat || csat.getAttribute('data-rated') === '1') return;
        stars.forEach(function (s) { s.classList.remove('active'); });
      });
      star.addEventListener('click', function () {
        var csat = $('cw-csat');
        if (!csat || csat.getAttribute('data-rated') === '1') return;
        submitRating(Number(star.getAttribute('data-rating')), csat);
      });
    });

    setupSendButton();
  }

  function orderLabel() {
    return (
      state.orderDisplayId ||
      (state.orderMetadata && (state.orderMetadata.order_number || state.orderMetadata.orderNumber)) ||
      state.orderId ||
      '—'
    );
  }

  function setHeaderAvatar(type, avatarUrl) {
    var avatar = $('cw-avatar');
    if (!avatar) return;
    avatar.className = 'cw-avatar-' + (type === 'agent' ? 'agent' : 'bot');
    if (type === 'agent' && avatarUrl) {
      avatar.innerHTML =
        '<img src="' + escapeHtml(resolveAssetUrl(avatarUrl) || avatarUrl) + '" alt="" class="cw-avatar-img">' +
        '<span class="cw-avatar-fallback" hidden>' + AGENT_AVATAR_SVG + '</span>';
      var img = avatar.querySelector('.cw-avatar-img');
      if (img) {
        img.addEventListener('error', function () {
          img.style.display = 'none';
          var fb = avatar.querySelector('.cw-avatar-fallback');
          if (fb) fb.hidden = false;
        });
      }
      return;
    }
    avatar.innerHTML = type === 'agent' ? AGENT_AVATAR_SVG : BOT_AVATAR_SVG;
  }

  function setStatusSubtext(text) {
    var sub = $('cw-status');
    if (!sub) return;
    var dot = $('cw-status-dot');
    sub.textContent = '';
    if (!dot) {
      dot = document.createElement('span');
      dot.id = 'cw-status-dot';
      dot.style.cssText =
        'display:inline-block;width:8px;height:8px;border-radius:50%;' +
        'background:#22c55e;margin-right:5px;vertical-align:middle;';
    }
    sub.appendChild(dot);
    sub.appendChild(document.createTextNode(text));
  }

  function updateHeader() {
    var label = $('cw-agent-name');
    if (!label) return;

    if (state.type === 'ORDER_SUPPORT') {
      setStatusSubtext('Order #' + orderLabel() + ' সাপোর্ট');
    } else {
      setStatusSubtext(state.agentName ? 'Connected with agent' : 'Online');
    }

    if (state.agentName) {
      label.textContent = state.agentName;
      setHeaderAvatar('agent', state.agentAvatarUrl || null);
    } else {
      label.textContent = 'Aria';
      setHeaderAvatar('bot');
    }
  }

  /* ---------- open / close ---------- */

  function setBubbleVisible(visible) {
    var bubble = $('cw-bubble');
    if (!bubble) return;
    bubble.classList.toggle('cw-hidden', !visible);
  }

  function setWidgetUnderSwal(active) {
    var container = $('cw-container');
    var bubble = $('cw-bubble');
    if (container) container.classList.toggle('cw-swal-open', !!active);
    if (bubble) bubble.classList.toggle('cw-swal-open', !!active);
  }

  function revealPanel() {
    ensureDom();
    state.isOpen = true;
    state.unread = 0;
    updateBadge();
    var el = $('cw-container');
    if (!el) return;
    el.classList.add('cw-open');
    setBubbleVisible(false);
    scrollToBottom();
    setTimeout(function () {
      var input = $('cw-input');
      if (input && !input.disabled) input.focus();
    }, 260);
  }

  function openWidget() {
    ensureDom();
    if (!state.roomId && state.initialized && !state.endingSelf) {
      return Promise.resolve(bootstrap())
        .then(function () {
          setupSendButton();
          revealPanel();
        })
        .catch(function (err) {
          console.error('[ChatWidget] reopen after end failed:', err);
        });
    }
    revealPanel();
  }

  function minimizeWidget() {
    state.isOpen = false;
    var el = $('cw-container');
    if (!el) return;
    el.classList.remove('cw-open');
    setBubbleVisible(true);
  }

  function hideCsatUi() {
    var csat = $('cw-csat');
    if (!csat) return;
    csat.classList.remove('visible');
    csat.removeAttribute('data-rated');
    csat.querySelectorAll('.cw-star').forEach(function (s) {
      s.classList.remove('active');
      s.disabled = false;
    });
    var thanks = $('cw-csat-thanks');
    if (thanks) {
      thanks.hidden = true;
      thanks.textContent = '';
    }
  }

  function clearPersistedRoom() {
    try {
      localStorage.removeItem(STORAGE_ROOM_PREFIX + (widgetConfig.type || state.type || 'GENERAL'));
      localStorage.removeItem('cw_room_id');
    } catch (e) { /* ignore */ }
  }

  function emitEndChatWithAck(roomId) {
    return new Promise(function (resolve) {
      var sock = state.socket;
      if (!sock || typeof sock.emit !== 'function') {
        resolve(false);
        return;
      }

      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { sock.off('end_chat_ok', onOk); } catch (e1) { /* ignore */ }
        try { sock.off('end_chat_failed', onFail); } catch (e2) { /* ignore */ }
        resolve(!!ok);
      }
      function onOk() { finish(true); }
      function onFail() { finish(false); }

      var timer = setTimeout(function () {
        console.error('[ChatWidget] end_chat timed out');
        finish(false);
      }, 5000);

      sock.once('end_chat_ok', onOk);
      sock.once('end_chat_failed', onFail);

      try {
        sock.emit(
          'end_chat',
          {
            room_id: roomId,
            guest_session_id: state.guestSessionId
          },
          function (ack) {
            if (ack && ack.ok === false) finish(false);
            else finish(true);
          }
        );
      } catch (err) {
        console.error('[ChatWidget] end_chat emit failed:', err);
        finish(false);
      }
    });
  }

  async function confirmEndChat() {
    try {
      var SwalLib = await loadSweetAlert();
      var result = await SwalLib.fire({
        title: 'End this chat?',
        text: 'This will close the conversation. You can start a new chat anytime.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'End chat',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#6C63FF',
        cancelButtonColor: '#6b7280',
        heightAuto: false,
        customClass: {
          container: 'cw-swal-on-top'
        },
        didOpen: function () {
          setWidgetUnderSwal(true);
          var el = document.querySelector('.swal2-container.cw-swal-on-top');
          if (el) el.style.setProperty('z-index', String(SWAL_Z), 'important');
        },
        didClose: function () {
          setWidgetUnderSwal(false);
        },
        didDestroy: function () {
          setWidgetUnderSwal(false);
        }
      });
      return !!(result && result.isConfirmed);
    } catch (err) {
      console.error('[ChatWidget] SweetAlert2 unavailable:', err);
      try {
        return !!global.confirm('End this chat?');
      } catch (e2) {
        return true;
      }
    }
  }

  async function endAndHideSession(options) {
    options = options || {};
    state.endingSelf = true;
    emitTypingStop();

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
    state.agentName = null;
    state.unread = 0;
    updateBadge();
    hideTyping();
    hideCsatUi();
    setInputEnabled(false);

    if (!options.skipMinimize) {
      minimizeWidget();
    }

    state.endingSelf = false;
  }

  async function closeWidget() {
    var confirmed = await confirmEndChat();
    if (confirmed) {
      await endAndHideSession();
      return;
    }
    minimizeWidget();
  }

  function startNewChat() {
    Promise.resolve()
      .then(function () {
        if (state.roomId) {
          return endAndHideSession({ skipMinimize: true });
        }
      })
      .then(function () {
        state.resolved = false;
        state.agentName = null;
        state.unread = 0;
        state.renderedIds = Object.create(null);
        state.pendingFile = null;
        var msgs = document.getElementById('cw-messages');
        if (msgs) {
          msgs.innerHTML =
            '<div id="cw-typing" aria-hidden="true"><span></span><span></span><span></span></div>';
        }
        return bootstrap();
      })
      .then(function () {
        setupSendButton();
        openWidget();
      })
      .catch(function (err) {
        console.error('[ChatWidget] startNewChat failed:', err);
      });
  }

  function updateBadge() {
    var badge = $('cw-badge');
    if (!badge) return;
    if (state.unread > 0) {
      badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
      badge.classList.add('visible');
    } else {
      badge.textContent = '';
      badge.classList.remove('visible');
    }
  }

  /* ---------- messages ---------- */

  function scrollToBottom() {
    var box = $('cw-messages');
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }

  function getTypingEl() {
    var el = $('cw-typing');
    var box = $('cw-messages');
    if (!el && box) {
      el = document.createElement('div');
      el.id = 'cw-typing';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<span></span><span></span><span></span>';
      box.appendChild(el);
    }
    return el;
  }

  function showTyping() {
    var el = getTypingEl();
    if (!el) return;
    el.classList.add('visible');
    scrollToBottom();
  }

  function hideTyping() {
    var el = $('cw-typing');
    if (el) el.classList.remove('visible');
  }

  // Track previous message for grouping
  var _lastRenderedSender = null;
  var _lastRenderedSenderId = null;

  function isNewGroup(senderType, senderId) {
    var isNew =
      _lastRenderedSender !== senderType ||
      _lastRenderedSenderId !== senderId;
    _lastRenderedSender = senderType;
    _lastRenderedSenderId = senderId;
    return isNew;
  }

  function resetGroupTracking() {
    _lastRenderedSender = null;
    _lastRenderedSenderId = null;
  }

  function clearSystemPills() {
    var pills = document.querySelectorAll('.cw-msg.cw-system');
    pills.forEach(function (el) {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(function () {
        if (el.parentNode) el.remove();
      }, 500);
    });
  }

  function hideNonLastAvatars() {
    var box = $('cw-messages');
    if (!box) return;
    var rows = box.querySelectorAll('.cw-msg-row-agent');
    rows.forEach(function (row, i) {
      var slot = row.querySelector('.cw-msg-avatar-slot');
      if (!slot) return;
      var next = rows[i + 1];
      if (next) {
        slot.style.visibility = 'hidden';
      } else {
        slot.style.visibility = 'visible';
      }
    });
  }

  function renderMessage(msg, options) {
    options = options || {};
    ensureDom();
    hideTyping();

    if (!msg) return null;

    var msgId = msg._id || msg.id || null;
    if (msgId) {
      msgId = String(msgId);
      if (state.renderedIds[msgId]) return null;
      state.renderedIds[msgId] = true;
    }

    var quickReplies = msg && (msg.quick_replies || msg.quickReplies);
    // Dedup quick replies by message ID
    if (quickReplies && quickReplies.length && msgId) {
      if (state.renderedQR && state.renderedQR[msgId]) {
        quickReplies = null; // skip QR if already shown
      } else {
        if (!state.renderedQR) state.renderedQR = {};
        state.renderedQR[msgId] = true;
      }
    }

    var box = $('cw-messages');
    var type = String((msg.sender_type || msg.senderType || msg.sender || msg.type) || 'BOT').toUpperCase();
    if (type === 'CUSTOMER' || type === 'GUEST') type = 'USER';
    if (type === 'AI' || type === 'BOT_MESSAGE') type = 'BOT';
    if (type === 'HUMAN' || type === 'SUPPORT' || type === 'AGENT') type = 'AGENT';

    var content = msg.content || msg.message || msg.text || '';
    var createdAt = msg.created_at || msg.createdAt || msg.timestamp || Date.now();
    var attachment = msg.attachment || msg.attachments;
    var imageUrl = null;

    if (typeof attachment === 'string') {
      imageUrl = attachment;
    } else if (attachment && typeof attachment === 'object') {
      imageUrl = attachment.url || attachment.dataUrl || attachment.src || null;
      if (Array.isArray(attachment) && attachment[0]) {
        imageUrl = attachment[0].url || attachment[0].dataUrl || imageUrl;
      }
    }
    if (!imageUrl && msg && msg.image_url) imageUrl = msg.image_url;
    if (!imageUrl && msg && msg.imageUrl) imageUrl = msg.imageUrl;

    var wrap = document.createElement('div');
    if (msgId) {
      wrap.setAttribute('data-cw-id', msgId);
      wrap.id = 'msg-' + msgId;
    }

    if (type === 'SYSTEM') {
      wrap.className = 'cw-msg cw-system';
      wrap.innerHTML =
        '<div class="cw-bubble-text">' + escapeHtml(content) + '</div>';
      wrap.style.transition = 'opacity 0.5s ease';
      box.appendChild(wrap);
      if (!options.skipScroll) scrollToBottom();
      if (!options.fromHistory) {
        setTimeout(function () {
          wrap.style.opacity = '0';
          setTimeout(function () {
            if (wrap.parentNode) wrap.remove();
          }, 500);
        }, 4000);
      }
      return wrap;
    }

    var formattedTime = formatTime(createdAt);

    if (type === 'USER') {
      wrap.className = 'cw-msg cw-msg-row-customer';

      var customerBubble = document.createElement('div');
      customerBubble.className = 'cw-bubble-customer';
      if (content) {
        customerBubble.appendChild(document.createTextNode(content));
      }
      if (imageUrl) {
        var customerImgLink = document.createElement('a');
        customerImgLink.href = imageUrl;
        customerImgLink.target = '_blank';
        customerImgLink.rel = 'noopener noreferrer';
        var customerImg = document.createElement('img');
        customerImg.className = 'cw-img-thumb';
        customerImg.src = imageUrl;
        customerImg.alt = 'Attachment';
        customerImgLink.appendChild(customerImg);
        customerBubble.appendChild(customerImgLink);
      }

      wrap.appendChild(customerBubble);

      var statusWrap = document.createElement('div');
      statusWrap.style.cssText =
        'display:flex;align-items:center;' +
        'justify-content:flex-end;gap:2px;' +
        'margin-top:2px;padding-right:2px;';

      var statusEl = document.createElement('span');
      statusEl.className = 'cw-tick';
      var msgIdForTick = msg._id || msg.id || msgId || '';
      statusEl.setAttribute('data-tick-id', msgIdForTick);
      statusEl.innerHTML = tickSVG('grey');
      statusEl.title = 'Sent';
      statusWrap.appendChild(statusEl);
      wrap.appendChild(statusWrap);

      var customerTime = document.createElement('span');
      customerTime.className = 'cw-msg-time';
      customerTime.textContent = formattedTime;
      wrap.appendChild(customerTime);
    } else if (type === 'AGENT') {
      var agentName =
        (msg && (msg.sender_name || msg.senderName || state.agentName)) || 'Agent';
      var agentId =
        options.agentId ||
        msg.sender_id ||
        msg.senderId ||
        (msg.agent && (msg.agent._id || msg.agent.id)) ||
        'agent';
      var isFirst = isNewGroup('AGENT', agentId);

      wrap.className = 'cw-msg cw-msg-row-agent';
      if (isFirst) {
        wrap.classList.add('cw-group-first');
      }

      var body = document.createElement('div');
      body.className = 'cw-msg-body';

      if (isFirst) {
        var nameEl = document.createElement('span');
        nameEl.className = 'cw-msg-name';
        nameEl.textContent = agentName;
        body.appendChild(nameEl);
      }

      var bubble = document.createElement('div');
      bubble.className = 'cw-bubble-agent';
      if (content) {
        bubble.appendChild(document.createTextNode(content));
      }
      if (imageUrl) {
        var agentImgLink = document.createElement('a');
        agentImgLink.href = imageUrl;
        agentImgLink.target = '_blank';
        agentImgLink.rel = 'noopener noreferrer';
        var agentImg = document.createElement('img');
        agentImg.className = 'cw-img-thumb';
        agentImg.src = imageUrl;
        agentImg.alt = 'Attachment';
        agentImgLink.appendChild(agentImg);
        bubble.appendChild(agentImgLink);
      }
      body.appendChild(bubble);

      var timeEl = document.createElement('span');
      timeEl.className = 'cw-msg-time';
      timeEl.textContent = formattedTime;
      body.appendChild(timeEl);

      wrap.appendChild(body);
    } else if (type === 'BOT') {
      var botId = 'bot:aria';
      var botMessagesList = options.messagesList || null;
      var botIndex = typeof options.msgIndex === 'number' ? options.msgIndex : -1;
      var botIsLast =
        botMessagesList && botIndex >= 0
          ? !isSameBotAsNext(botMessagesList, botIndex)
          : true;

      wrap.className = 'cw-msg cw-msg-row-agent';

      var botAvatarSlot = document.createElement('div');
      if (botIsLast) {
        botAvatarSlot.className = 'cw-msg-avatar-slot';
        var botFallback = document.createElement('div');
        botFallback.className = 'cw-msg-avatar-fallback';
        botFallback.textContent = '🤖';
        botAvatarSlot.appendChild(botFallback);
      } else {
        botAvatarSlot.className = 'cw-msg-avatar-slot cw-avatar-spacer';
      }

      var botBody = document.createElement('div');
      botBody.className = 'cw-msg-body';

      var botBubble = document.createElement('div');
      botBubble.className = 'cw-bubble-agent';
      if (content) {
        botBubble.appendChild(document.createTextNode(content));
      }
      if (imageUrl) {
        var botImgLink = document.createElement('a');
        botImgLink.href = imageUrl;
        botImgLink.target = '_blank';
        botImgLink.rel = 'noopener noreferrer';
        var botImg = document.createElement('img');
        botImg.className = 'cw-img-thumb';
        botImg.src = imageUrl;
        botImg.alt = 'Attachment';
        botImgLink.appendChild(botImg);
        botBubble.appendChild(botImgLink);
      }
      botBody.appendChild(botBubble);

      var botTime = document.createElement('span');
      botTime.className = 'cw-msg-time';
      botTime.textContent = formattedTime;
      botBody.appendChild(botTime);

      wrap.appendChild(botAvatarSlot);
      wrap.appendChild(botBody);
    } else {
      wrap.className = 'cw-msg cw-bot';
      wrap.innerHTML =
        '<div class="cw-bubble-text">' +
          (content ? escapeHtml(content) : '') +
        '</div>' +
        '<div class="cw-msg-time">' + formattedTime + '</div>';
    }

    var typingEl = $('cw-typing');
    if (typingEl && typingEl.parentNode === box) {
      box.insertBefore(wrap, typingEl);
    } else {
      box.appendChild(wrap);
    }

    if (quickReplies && quickReplies.length && type === 'BOT') {
      var qrWrap = document.createElement('div');
      qrWrap.className = 'cw-quick-replies';
      quickReplies.forEach(function (qr) {
        var label = typeof qr === 'string' ? qr : (qr.label || qr.text || qr.value || '');
        if (!label) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cw-qr-btn';
        btn.textContent = label;
        btn.addEventListener('click', function () {
          qrWrap.remove();
          sendText(label);
        });
        qrWrap.appendChild(btn);
      });
      if (typingEl && typingEl.parentNode === box) {
        box.insertBefore(qrWrap, typingEl);
      } else {
        box.appendChild(qrWrap);
      }
    }

    if (type === 'AGENT') {
      hideNonLastAvatars();
    }

    if (!options.skipScroll) scrollToBottom();

    if (!options.fromHistory && type !== 'USER' && !state.isOpen) {
      state.unread += 1;
      updateBadge();
      playNotificationSound();
    }

    return wrap;
  }

  function showSystemBanner(text) {
    ensureDom();
    renderMessage({
      sender_type: 'SYSTEM',
      content: text || '',
      created_at: Date.now()
    });
  }

  function showSystemMessage(text) {
    showSystemBanner(text);
  }

  function showCsat() {
    ensureDom();
    var el = $('cw-csat');
    if (!el) return;

    el.classList.add('visible');
    setInputEnabled(false);

    if (isRoomRated(state.roomId)) {
      lockCsatUI(el, 0);
      var thanks = $('cw-csat-thanks');
      if (thanks) {
        thanks.hidden = false;
        thanks.textContent = 'রেটিং ইতিমধ্যে জমা হয়েছে। ধন্যবাদ!';
      }
    }
  }

  function lockCsatUI(csatEl, rating) {
    if (!csatEl) return;
    csatEl.setAttribute('data-rated', '1');
    var stars = csatEl.querySelectorAll('.cw-star');
    stars.forEach(function (s) {
      if (rating > 0) {
        s.classList.toggle('active', Number(s.getAttribute('data-rating')) <= rating);
      }
      s.disabled = true;
    });
    var thanks = csatEl.querySelector('#cw-csat-thanks') || $('cw-csat-thanks');
    if (thanks) {
      thanks.hidden = false;
      thanks.textContent = 'ধন্যবাদ আপনার মতামতের জন্য! 🙏';
    }
    markRoomRated(state.roomId);
  }

  function submitRating(rating, csatEl) {
    if (!state.socket || !state.roomId) return;
    if (isRoomRated(state.roomId)) {
      lockCsatUI(csatEl, rating);
      return;
    }
    state.socket.emit('submit_rating', {
      room_id: state.roomId,
      rating: rating
    });
    lockCsatUI(csatEl, rating);
  }

  function setInputEnabled(enabled) {
    var input = $('cw-input');
    var send = $('cw-send-btn');
    var attach = $('cw-attachment-btn');
    var footer = $('cw-footer');
    if (!input) return;
    input.disabled = !enabled;
    input.readOnly = !enabled;
    if (attach) attach.disabled = !enabled;
    if (footer) footer.classList.toggle('is-disabled', !enabled);
    if (enabled) {
      input.placeholder = 'আপনার বার্তা লিখুন...';
      updateSendButton();
    } else if (send) {
      send.disabled = true;
    }
  }

  /* ---------- input / typing / files ---------- */

  function autoResizeInput() {
    var input = $('cw-input');
    if (!input) return;
    input.style.height = 'auto';
    var max = parseFloat(getComputedStyle(input).lineHeight) * 3 + 20;
    input.style.height = Math.min(input.scrollHeight, max) + 'px';
  }

  function updateSendButton() {
    var send = $('cw-send-btn');
    var input = $('cw-input');
    if (!send || !input) return;
    var hasText = (input.value || '').trim().length > 0;
    var hasFile = !!state.pendingFile;
    send.disabled = state.resolved || (!hasText && !hasFile);
  }

  function onInputChange() {
    autoResizeInput();
    updateSendButton();
    emitTypingStart();
  }

  function emitTypingStart() {
    if (!state.socket || !state.roomId || state.resolved) return;
    if (!state.isTyping) {
      state.isTyping = true;
      state.socket.emit('typing_start', {
        room_id: state.roomId,
        guest_session_id: state.guestSessionId
      });
    }
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(emitTypingStop, 2000);
  }

  function emitTypingStop() {
    clearTimeout(state.typingTimer);
    state.typingTimer = null;
    if (!state.isTyping) return;
    state.isTyping = false;
    if (state.socket && state.roomId) {
      state.socket.emit('typing_stop', {
        room_id: state.roomId,
        guest_session_id: state.guestSessionId
      });
    }
  }

  function onFileSelected(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type || file.type.indexOf('image/') !== 0) {
      showSystemBanner('শুধুমাত্র ছবি আপলোড করা যাবে।');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showSystemBanner('ছবির সাইজ ৫ MB এর কম হতে হবে।');
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      state.pendingFile = file;
      var preview = $('cw-attach-preview');
      var thumb = $('cw-attach-thumb');
      var name = $('cw-attach-name');
      thumb.src = reader.result;
      name.textContent = file.name;
      preview.classList.add('visible');
      updateSendButton();
    };
    reader.readAsDataURL(file);
  }

  function clearAttachment() {
    state.pendingFile = null;
    var preview = $('cw-attach-preview');
    var thumb = $('cw-attach-thumb');
    if (preview) preview.classList.remove('visible');
    if (thumb) thumb.removeAttribute('src');
    updateSendButton();
  }

  /**
   * Always multipart FormData — never send data: URLs over the socket.
   * Prefer /api/upload/image when available; fall back to room upload route.
   */
  async function sendAttachment(file) {
    if (!file || !state.roomId) {
      throw new Error('Missing file or room');
    }

    var endpoints = [
      apiUrlFor('/api/upload/image'),
      apiUrlFor('/api/chat/' + encodeURIComponent(state.roomId) + '/upload')
    ];

    var lastError = null;
    for (var i = 0; i < endpoints.length; i++) {
      try {
        var form = new FormData();
        form.append('image', file, file.name);
        form.append('room_id', state.roomId);
        form.append('guest_session_id', state.guestSessionId || '');

        var res = await fetch(endpoints[i], {
          method: 'POST',
          body: form,
          headers: {
            'X-Guest-Session-Id': state.guestSessionId || ''
          },
          credentials: 'include'
        });
        var bodyText = await res.text();
        var data = null;
        try {
          data = bodyText ? JSON.parse(bodyText) : null;
        } catch (e) {
          data = null;
        }
        if (!res.ok) {
          // Auth required on /api/upload/image for guests — try next endpoint
          if (res.status === 401 || res.status === 403) {
            lastError = new Error((data && data.message) || 'Upload unauthorized');
            continue;
          }
          throw new Error((data && data.message) || ('HTTP ' + res.status));
        }
        if (!data || !data.url) {
          throw new Error('Upload response missing url');
        }
        if (String(data.url).indexOf('data:') === 0) {
          throw new Error('Data URL storage is not permitted');
        }
        return {
          url: data.url,
          thumbnail_url: data.thumbnail_url || data.url,
          type: 'IMAGE',
          filename: file.name,
          size: file.size
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Upload failed');
  }

  function sendText(text) {
    var input = $('cw-input');
    if (input) {
      input.value = text;
      autoResizeInput();
      updateSendButton();
    }
    doSend();
  }

  function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    var max = parseFloat(getComputedStyle(el).lineHeight) * 3 + 20;
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
  }

  function setupSendButton() {
    var sendBtn = document.getElementById('cw-send-btn');
    var input = document.getElementById('cw-input');

    if (!sendBtn || !input) {
      console.error('Send button or input not found!');
      return;
    }

    // Remove all existing event listeners by cloning
    var newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);

    var newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newSendBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      doSend();
    });

    newInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });

    newInput.addEventListener('input', function () {
      newSendBtn.disabled =
        state.resolved ||
        (newInput.value.trim().length === 0 && !state.pendingFile);
      autoResizeTextarea(newInput);
      if (state.socket && state.socket.connected && state.roomId && !state.resolved) {
        if (!state.isTyping) {
          state.isTyping = true;
          state.socket.emit('typing_start', { room_id: state.roomId });
        }
        clearTimeout(state.typingTimer);
        state.typingTimer = setTimeout(function () {
          state.isTyping = false;
          if (state.socket && state.roomId) {
            state.socket.emit('typing_stop', { room_id: state.roomId });
          }
        }, 2000);
      }
    });

    updateSendButton();
  }

  async function doSend() {
    var input = document.getElementById('cw-input');
    if (!input) return;
    if (state.resolved) return;

    var message = input.value.trim();
    var file = state.pendingFile;
    if (!message && !file) return;

    if (!state.roomId) {
      console.error('No room ID!');
      return;
    }
    if (!state.socket || !state.socket.connected) {
      console.error('Socket not connected!');
      showSystemMessage('Connection lost. Reconnecting...');
      try {
        if (state.socket) state.socket.connect();
      } catch (e) { /* ignore */ }
      return;
    }

    if (message && message.length > 5000) {
      showErrorToast('বার্তা খুব বড় (সর্বোচ্চ ৫০০০ অক্ষর)।');
      return;
    }

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    var sendBtn = document.getElementById('cw-send-btn');
    if (sendBtn) sendBtn.disabled = true;
    emitTypingStop();

    var attachments = [];
    try {
      if (file) {
        try {
          var uploaded = await sendAttachment(file);
          attachments.push(uploaded);
          clearAttachment();
        } catch (uploadErr) {
          console.error('[ChatWidget] upload failed:', uploadErr);
          showErrorToast(
            (uploadErr && uploadErr.message) ||
              'ছবি আপলোড ব্যর্থ হয়েছে। data URL পাঠানো হয়নি।'
          );
          if (message) input.value = message;
          updateSendButton();
          return;
        }
      }

      // Optimistic UI - show message immediately
      var tmpId = 'tmp-' + Date.now();
      renderMessage({
        _id: tmpId,
        sender_type: 'USER',
        message: message || (attachments.length ? '[Attachment]' : ''),
        content: message,
        attachments: attachments,
        attachment: attachments[0] || undefined,
        image_url: attachments[0] ? attachments[0].url : undefined,
        createdAt: new Date().toISOString()
      });
      scrollToBottom();

      // Send via socket
      state.socket.emit('send_message', {
        room_id: state.roomId,
        message: message || (attachments.length ? '[Attachment]' : ''),
        attachments: attachments,
        guest_session_id: state.guestSessionId,
        sender_name: state.guestName,
        sender_type: 'USER',
        content: message,
        attachment: attachments[0] || undefined,
        image_url: attachments[0] ? attachments[0].url : undefined
      });
    } catch (err) {
      console.error('[ChatWidget] send failed:', err);
      showErrorToast('বার্তা পাঠানো যায়নি। আবার চেষ্টা করুন।');
      updateSendButton();
    }
  }

  // Back-compat alias
  var sendMessage = doSend;

  /* ---------- socket ---------- */

  function bindSocketEvents() {
    var s = state.socket;
    if (!s) return;

    s.off('new_message');
    s.off('agent_typing');
    s.off('agent_stopped_typing');
    s.off('waiting_for_agent');
    s.off('handover_started');
    s.off('agent_joined');
    s.off('chat_resolved');
    s.off('end_chat_ok');
    s.off('end_chat_failed');
    s.off('chat_history');
    s.off('rating_submitted');
    s.off('error');
    s.off('connect');
    s.off('connect_error');
    s.off('disconnect');
    s.off('messages_read');
    s.off('agent_status_change');

    s.on('connect', function () {
      console.log('Chat socket connected:', s.id);
      if (state.roomId) {
        s.emit('join_room', {
          room_id: state.roomId,
          guest_session_id: state.guestSessionId
        });
      }
    });

    s.on('connect_error', function (err) {
      console.error('Socket connection error:', err && err.message ? err.message : err);
    });

    s.on('new_message', function (payload) {
      if (payload && payload.sender_type === 'INTERNAL') return;

      var msg = normalizeIncomingMessage(payload);
      if (!msg || typeof msg !== 'object') return;

      var payloadRoomId = payload.room_id || payload.roomId || msg.room_id || msg.roomId;
      if (payloadRoomId && state.roomId && String(payloadRoomId) !== String(state.roomId)) return;

      // Remove optimistic message if exists
      if (msg && msg._id) {
        var tmpEl = document.getElementById('msg-tmp-' + msg._id);
        if (tmpEl) tmpEl.remove();
      }

      // Drop optimistic tmp bubble when the real USER message arrives
      var type = String((msg && (msg.sender_type || msg.senderType || msg.sender)) || '').toUpperCase();
      var senderLower = String((msg && msg.sender) || '').toLowerCase();
      if (
        type === 'AGENT' ||
        type === 'HUMAN' ||
        type === 'SUPPORT' ||
        senderLower === 'agent'
      ) {
        clearSystemPills();
      }
      if (
        type === 'USER' ||
        type === 'CUSTOMER' ||
        type === 'GUEST'
      ) {
        var box = $('cw-messages');
        if (box) {
          var content = String(
            (msg && (msg.content || msg.message)) || ''
          ).trim();

          box.querySelectorAll(
            '.cw-msg-row-customer[data-cw-id]'
          ).forEach(function (el) {
            var id = el.getAttribute('data-cw-id') || '';
            if (id.indexOf('tmp-') !== 0) return;

            var textEl = el.querySelector(
              '.cw-bubble-customer'
            );
            var text = textEl
              ? String(textEl.textContent || '').trim()
              : '';

            if (!content || text === content) {
              delete state.renderedIds[id];
              el.remove();
            }
          });
        }
      }
      mergeAgentMeta(msg, payload);
      renderMessage(msg);
      scrollToBottom();
      playNotificationSound();
    });

    s.on('error', function (err) {
      var code = (err && err.message) || '';
      if (code === 'ALREADY_RATED') {
        markRoomRated(state.roomId);
        showErrorToast('আপনি ইতিমধ্যে রেটিং দিয়েছেন।');
        return;
      }
      if (code === 'UNAUTHORIZED' || code === 'SESSION_REQUIRED') {
        showErrorToast('সেশন অনুমোদিত নয়। পেজ রিফ্রেশ করুন।');
        return;
      }
      if (code === 'TOO_MANY_MESSAGES') {
        showErrorToast('অনেক বেশি বার্তা — একটু পরে চেষ্টা করুন।');
        return;
      }
    });

    s.on('rating_submitted', function () {
      markRoomRated(state.roomId);
    });

    s.on('agent_typing', function () {
      showTyping();
    });

    s.on('agent_stopped_typing', function () {
      hideTyping();
    });

    s.on('waiting_for_agent', function () {
      // Keep input enabled while waiting — customer may still send messages
      if (!state.resolved) setInputEnabled(true);
    });

    s.on('handover_started', function () {
      if (!state.resolved) setInputEnabled(true);
    });

    s.on('agent_joined', function (data) {
      var allPills = document.querySelectorAll('.cw-msg.cw-system');
      allPills.forEach(function (el) {
        var textEl = el.querySelector('.cw-bubble-text');
        var text = textEl ? (textEl.textContent || '') : '';

        var isWaiting =
          text.indexOf('প্রতিনিধি') !== -1 ||
          text.indexOf('শীঘ্রই') !== -1 ||
          text.indexOf('অপেক্ষা') !== -1;

        if (isWaiting) {
          el.style.transition = 'opacity 0.4s';
          el.style.opacity = '0';
          setTimeout(function () {
            if (el.parentNode) el.remove();
          }, 400);
        }
      });

      var name = (data && (data.agent_name || data.name || data.agentName)) || 'Agent';
      state.agentName = name;
      state.lastAgentName = name;
      state.agentAvatarUrl =
        (data && data.agent && (data.agent.avatar || data.agent.avatarUrl)) ||
        (data && (data.agent_avatar || data.agentAvatar)) ||
        null;
      state.resolved = false;
      state.roomStatus = 'ACTIVE';
      updateHeader();
      // Fully re-enable input when a live agent joins (ACTIVE)
      setInputEnabled(true);
      setupSendButton();
      var inputEl = $('cw-input');
      if (inputEl) {
        inputEl.disabled = false;
        inputEl.readOnly = false;
        inputEl.placeholder = 'আপনার বার্তা লিখুন...';
      }
      updateSendButton();
    });

    s.on('chat_resolved', function (payload) {
      var endedBy = payload && payload.ended_by;
      if (state.endingSelf || endedBy === 'CUSTOMER') {
        state.resolved = true;
        hideTyping();
        hideCsatUi();
        setInputEnabled(false);
        if (endedBy === 'CUSTOMER' && !state.endingSelf) {
          clearPersistedRoom();
          state.roomId = null;
          minimizeWidget();
        }
        return;
      }
      state.resolved = true;
      hideTyping();
      showSystemBanner('চ্যাট সম্পন্ন হয়েছে');
      showCsat();
    });

    s.on('chat_history', function (payload) {
      // Clear existing quick replies to prevent duplicates
      var existingQR = document.querySelectorAll('.cw-quick-replies');
      existingQR.forEach(function (el) { el.remove(); });

      // Reset QR tracking for fresh history load
      state.renderedQR = {};

      var messages = Array.isArray(payload)
        ? payload
        : (payload && (payload.messages || payload.history)) || [];
      state.renderedIds = Object.create(null);
      resetGroupTracking();
      var box = $('cw-messages');
      if (box) {
        box.querySelectorAll('.cw-msg').forEach(function (n) {
          n.remove();
        });
      }
      var payloadRoom = payload && payload.room ? payload.room : payload;
      var roomIsActive =
        (payloadRoom && (payloadRoom.status === 'ACTIVE' || payloadRoom.status === 'active')) ||
        state.roomStatus === 'ACTIVE';

      var hasAgentReplied = messages.some(function (histMsg) {
        var histType = normalizeMsgSenderType(histMsg);
        return histType === 'AGENT' || String(histMsg.sender || '').toLowerCase() === 'agent';
      });

      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        var sysType = normalizeMsgSenderType(m);
        var sysText = String((m && (m.content || m.message || m.text)) || '');
        var isWaitingPill =
          sysType === 'SYSTEM' &&
          sysText &&
          (sysText.indexOf('প্রতিনিধি') !== -1 ||
            sysText.indexOf('শীঘ্রই') !== -1 ||
            sysText.indexOf('অপেক্ষা') !== -1);
        var isJoinPill =
          sysType === 'SYSTEM' &&
          sysText &&
          (sysText.indexOf('সাহায্য করবেন') !== -1 ||
            sysText.indexOf('এখন আপনাকে') !== -1);

        if (isWaitingPill && roomIsActive) continue;
        if ((isWaitingPill || isJoinPill) && hasAgentReplied) continue;

        renderMessage(m, {
          fromHistory: true,
          skipScroll: true,
          messagesList: messages,
          msgIndex: i
        });
      }
      hideNonLastAvatars();
      scrollToBottom();
    });

    s.on('disconnect', function () {
      console.log('Socket disconnected, will reconnect...');
    });

    s.on('messages_read', function (data) {
      if (!data || data.readBy !== 'agent') return;
      document.querySelectorAll('.cw-tick').forEach(function (el) {
        el.innerHTML = doubleTickSVG();
        el.title = 'Seen';
      });
    });

    s.on('agent_status_change', function (data) {
      if (!data) return;

      if (data.is_online === false) {
        setStatusSubtext('Away');
        var dotOff = document.getElementById('cw-status-dot');
        if (dotOff) dotOff.style.background = '#9ca3af';
      } else {
        setStatusSubtext(
          state.agentName ? 'Connected with agent' : 'Online'
        );
      }
    });
  }

  function initSocket(socketUrl) {
    if (!global.io) throw new Error('socket.io not loaded');

    if (state.socket) {
      try { state.socket.disconnect(); } catch (e) { /* ignore */ }
      state.socket = null;
    }

    state.socket = global.io(String(socketUrl || state.socketUrl).replace(/\/$/, '') + '/customer', {
      path: state.socketPath || '/chat-socket/socket.io',
      auth: {
        guest_session_id: state.guestSessionId,
        user_id: state.userId || undefined
      },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000
    });

    bindSocketEvents();
    return state.socket;
  }

  function connectSocket() {
    return initSocket(state.socketUrl);
  }

  /* ---------- session / start ---------- */

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
    return STORAGE_ROOM_PREFIX + (widgetConfig.type || state.type || 'GENERAL');
  }

  function persistRoom(roomId) {
    state.roomId = roomId;
    try {
      localStorage.setItem(roomStorageKey(), roomId);
    } catch (e) { /* ignore */ }
  }

  function readPersistedRoom() {
    try {
      return (
        localStorage.getItem(roomStorageKey()) ||
        localStorage.getItem('cw_room_id')
      );
    } catch (e) {
      return null;
    }
  }

  async function startChat() {
    var body = {
      type: state.type,
      order_id: state.type === 'ORDER_SUPPORT' ? (state.orderId || null) : null,
      guest_session_id: state.guestSessionId,
      guest_name: state.guestName
    };

    if (state.guestEmail) body.guest_email = state.guestEmail;
    if (state.userId) body.user_id = state.userId;
    if (state.authToken) body.auth_token = state.authToken;
    if (state.userAvatar) {
      body.customer_avatar_url = state.userAvatar;
      body.customer_avatar = state.userAvatar;
    }
    if (state.type === 'ORDER_SUPPORT' && state.orderMetadata) {
      body.order_metadata = state.orderMetadata;
    }
    if (state.productMetadata) body.product_metadata = state.productMetadata;

    var data = await api('/api/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    var roomId = null;
    if (data) {
      roomId = data.room_id || data.roomId || null;
      if (!roomId && data.room) {
        roomId = data.room._id || data.room.id || null;
      }
    }
    if (roomId) roomId = String(roomId);

    if (!roomId) {
      throw new Error('No room_id returned from /api/chat/start');
    }

    persistRoom(roomId);
    return data;
  }

  async function bootstrap() {
    if (state.bootstrapping) return state.bootstrapping;

    state.bootstrapping = (async function () {
    ensureDom();
    updateHeader();
    setInputEnabled(true);
    state.resolved = false;
    state.agentName = null;
    state.unread = 0;
    state.renderedIds = Object.create(null);
    updateBadge();

    var box = $('cw-messages');
    if (box) {
      box.querySelectorAll('.cw-msg').forEach(function (n) { n.remove(); });
    }
    var csat = $('cw-csat');
    if (csat) {
      csat.classList.remove('visible');
      csat.removeAttribute('data-rated');
      csat.querySelectorAll('.cw-star').forEach(function (s) {
        s.classList.remove('active');
        s.disabled = false;
      });
      var thanks = $('cw-csat-thanks');
      if (thanks) {
        thanks.hidden = true;
        thanks.textContent = '';
      }
    }

    await loadSocketIo();
    connectSocket();

    var persisted = readPersistedRoom();
    if (persisted) {
      state.roomId = persisted;
      if (state.socket.connected) {
        state.socket.emit('join_room', {
          room_id: state.roomId,
          guest_session_id: state.guestSessionId
        });
      }
    }

    try {
      await startChat();
      if (state.socket) {
        state.socket.emit('join_room', {
          room_id: state.roomId,
          guest_session_id: state.guestSessionId
        });
      }
    } catch (err) {
      console.error('[ChatWidget] start failed:', err);
      showSystemBanner('চ্যাট শুরু করতে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।');
    }

    if (
      state.roomId &&
      state.roomStatus === 'ACTIVE' &&
      !state.agentName
    ) {
      state.agentName = state.lastAgentName || 'Support Agent';
      updateHeader();
    }
    })();

    try {
      await state.bootstrapping;
    } finally {
      state.bootstrapping = null;
    }
  }

  /* ---------- public API ---------- */

  function defaultChatApiUrl() {
    var LOCAL_CHAT_API = 'http://localhost:5001';
    var PROD_CHAT_API = 'https://eonlinebazar.com/chat-api';

    function strip(url) {
      return String(url || '').replace(/\/$/, '');
    }

    if (global.CHAT_API_URL) return strip(global.CHAT_API_URL);
    if (global.VITE_API_URL) return strip(global.VITE_API_URL);

    var runtimeEnv = global.__ENV__ || global.__RUNTIME_CONFIG__ || null;
    if (runtimeEnv) {
      if (runtimeEnv.VITE_API_URL) return strip(runtimeEnv.VITE_API_URL);
      if (runtimeEnv.CHAT_API_URL) return strip(runtimeEnv.CHAT_API_URL);
      if (runtimeEnv.API_URL) return strip(runtimeEnv.API_URL);
    }

    try {
      if (typeof process !== 'undefined' && process.env) {
        if (process.env.VITE_API_URL) return strip(process.env.VITE_API_URL);
        if (process.env.CHAT_API_URL) return strip(process.env.CHAT_API_URL);
      }
    } catch (e0) { /* ignore */ }

    try {
      var meta =
        document.querySelector('meta[name="chat-api-url"]') ||
        document.querySelector('meta[name="vite-api-url"]');
      if (meta && meta.content) return strip(meta.content);
    } catch (e1) { /* ignore */ }

    try {
      var origin = global.location && global.location.origin;
      var port = global.location && global.location.port;
      var host = (global.location && global.location.hostname) || '';
      if (origin && (port === '5001' || /:5001$/.test(origin))) {
        return strip(origin);
      }
      if (/(^|\.)eonlinebazar\.com$/i.test(host)) {
        return PROD_CHAT_API;
      }
    } catch (e2) { /* ignore */ }

    return LOCAL_CHAT_API;
  }

  async function _init(options) {
    options = options || {};
    loadCss();

    state.apiUrl = options.apiUrl || options.api_url || defaultChatApiUrl();
    // Socket connects to site origin; /chat-api is HTTP-only (nginx rewrite)
    var defaultSocket = state.apiUrl.replace(/\/chat-api\/?$/i, '') || state.apiUrl;
    state.socketUrl = options.socketUrl || options.socket_url || defaultSocket;
    state.socketPath =
      options.socketPath ||
      options.socket_path ||
      '/chat-socket/socket.io';
    state.guestName = options.guestName || options.guest_name || 'Guest';
    state.guestEmail = options.guestEmail || options.guest_email || null;
    state.userId = options.userId || options.user_id || null;
    state.userAvatar =
      options.userAvatar ||
      options.user_avatar ||
      options.customer_avatar_url ||
      null;
    state.authToken = options.authToken || options.auth_token || null;
    state.productMetadata = options.productMetadata || options.product_metadata || null;
    state.orderId = options.orderId || options.order_id || null;
    state.orderDisplayId =
      options.orderDisplayId ||
      options.order_display_id ||
      (options.orderMetadata && (options.orderMetadata.order_number || options.orderMetadata.orderNumber)) ||
      null;
    state.orderMetadata = options.orderMetadata || options.order_metadata || null;
    state.type = options.type || 'GENERAL';
    widgetConfig = {
      type: state.type,
      apiUrl: state.apiUrl,
      socketUrl: state.socketUrl
    };
    state.guestSessionId = getOrCreateSessionId();
    state.initialized = true;

    await bootstrap();
    setupSendButton();
    return ChatWidget;
  }

  function init(options) {
    options = options || {};
    if (document.readyState === 'loading') {
      return new Promise(function (resolve, reject) {
        document.addEventListener(
          'DOMContentLoaded',
          function () {
            _init(options).then(resolve).catch(reject);
          },
          { once: true }
        );
      });
    }
    return _init(options);
  }

  async function openOrderSupport(options) {
    options = options || {};
    if (state.initialized) destroy();
    await init({
      apiUrl: options.apiUrl || options.api_url,
      socketUrl: options.socketUrl || options.socket_url,
      socketPath: options.socketPath || options.socket_path,
      guestName: options.guestName || options.guest_name || 'Guest',
      guestEmail: options.guestEmail || options.guest_email || null,
      userId: options.userId || options.user_id || null,
      userAvatar:
        options.userAvatar ||
        options.user_avatar ||
        options.customer_avatar_url ||
        null,
      authToken: options.authToken || options.auth_token || null,
      productMetadata: options.productMetadata || options.product_metadata || null,
      orderId: options.orderId || options.order_id || null,
      orderDisplayId: options.orderDisplayId || options.order_display_id || null,
      orderMetadata: options.orderMetadata || options.order_metadata || null,
      type: 'ORDER_SUPPORT'
    });
    openWidget();
    return ChatWidget;
  }

  function destroy() {
    emitTypingStop();
    if (state.socket) {
      try { state.socket.disconnect(); } catch (e) { /* ignore */ }
      state.socket = null;
    }
    var bubble = $('cw-bubble');
    var container = $('cw-container');
    if (bubble) bubble.remove();
    if (container) container.remove();
    state.initialized = false;
    state.isOpen = false;
    state.orderMetadata = null;
    state.orderDisplayId = null;
    state.guestEmail = null;
    state.userId = null;
    state.userAvatar = null;
    state.authToken = null;
    state.productMetadata = null;
  }

  function readStoreUser() {
    try {
      var raw =
        localStorage.getItem('customerData') ||
        localStorage.getItem('userInfo') ||
        localStorage.getItem('user');
      if (!raw) return null;
      var user = JSON.parse(raw);
      if (!user.name && (user.firstName || user.lastName)) {
        user.name = [user.firstName, user.lastName].filter(Boolean).join(' ');
      }
      if (!user._id && user.id) user._id = user.id;
      return user;
    } catch (e) {
      return null;
    }
  }

  function readStoreToken() {
    try {
      return localStorage.getItem('token') || localStorage.getItem('customerToken') || null;
    } catch (e) {
      return null;
    }
  }

  async function linkRegisteredUser(options) {
    options = options || {};
    var user = options.user || readStoreUser();
    var token = options.token || readStoreToken();

    if (user) {
      state.userId = user._id || user.id || state.userId;
      state.guestName =
        user.name ||
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        state.guestName;
      state.guestEmail = user.email || state.guestEmail;
      state.userAvatar = user.avatarUrl || user.avatar || state.userAvatar;
    }
    if (token) state.authToken = token;

    updateHeader();

    if (!state.roomId) return ChatWidget;

    try {
      await api('/api/chat/link-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: state.roomId,
          guest_session_id: state.guestSessionId,
          user_id: state.userId || undefined,
          guest_name: state.guestName,
          guest_email: state.guestEmail,
          auth_token: state.authToken || undefined,
          customer_avatar_url: state.userAvatar || undefined,
          customer_avatar: state.userAvatar || undefined,
        }),
      });

      if (state.socket) {
        state.socket.auth = state.socket.auth || {};
        state.socket.auth.user_id = state.userId || undefined;
        state.socket.auth.guest_session_id = state.guestSessionId;
      }
    } catch (err) {
      console.warn('[ChatWidget] linkRegisteredUser failed:', err);
    }

    return ChatWidget;
  }

  var ChatWidget = {
    init: init,
    _init: _init,
    open: openWidget,
    close: minimizeWidget,
    minimize: minimizeWidget,
    destroy: destroy,
    startNewChat: startNewChat,
    openOrderSupport: openOrderSupport,
    linkRegisteredUser: linkRegisteredUser,
    getState: function () {
      return {
        roomId: state.roomId,
        guestSessionId: state.guestSessionId,
        type: state.type,
        orderId: state.orderId,
        isOpen: state.isOpen,
        unread: state.unread
      };
    }
  };

  global.ChatWidget = ChatWidget;
})(typeof window !== 'undefined' ? window : this);

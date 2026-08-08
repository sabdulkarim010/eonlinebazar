/**
 * EOnlineBazar Customer Chat Widget
 * Drop-in: <script src="/js/chat-widget.js"></script>
 * Init: ChatWidget.init({ apiUrl, socketUrl, guestName, orderId, type, orderMetadata })
 */
(function (global) {
  'use strict';

  var STORAGE_SESSION = 'cw_guest_session_id';
  var STORAGE_ROOM = 'cw_room_id';
  var STORAGE_RATED = 'cw_rated_rooms';
  var SOCKET_CDN = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
  var LOCAL_CHAT_ORIGIN = 'http://localhost:5001';
  var BUBBLE_SVG =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>' +
    '</svg>';
  var SEND_SVG =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>' +
    '</svg>';

  var state = {
    apiUrl: '',
    socketUrl: '',
    guestName: 'Guest',
    guestEmail: null,
    userId: null,
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
    agentName: null,
    initialized: false,
    cssLoaded: false,
    renderedIds: Object.create(null)
  };

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

  function api(path, options) {
    var url = state.apiUrl.replace(/\/$/, '') + path;
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
        '<div id="cw-avatar">🤖</div>' +
        '<div id="cw-header-info">' +
          '<p id="cw-agent-name">Aria</p>' +
          '<p id="cw-status">Online</p>' +
        '</div>' +
        '<div id="cw-header-actions">' +
          '<button type="button" id="cw-minimize-btn" aria-label="Minimize">−</button>' +
          '<button type="button" id="cw-close-btn" aria-label="Close">×</button>' +
        '</div>' +
      '</div>' +
      '<div id="cw-messages">' +
        '<div id="cw-typing" aria-hidden="true"><span></span><span></span><span></span></div>' +
      '</div>' +
      '<div id="cw-waiting-banner">একজন প্রতিনিধি শীঘ্রই যোগ দেবেন...</div>' +
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
        '<div id="cw-footer-row">' +
          '<button type="button" id="cw-attachment-btn" aria-label="Attach image">📎</button>' +
          '<textarea id="cw-input" rows="1" placeholder="আপনার বার্তা লিখুন..."></textarea>' +
          '<button type="button" id="cw-send-btn" aria-label="Send" disabled>' + SEND_SVG + '</button>' +
          '<input type="file" id="cw-file-input" accept="image/*" />' +
        '</div>' +
      '</div>';

    // Always append to document.body — never inside host page containers
    document.body.appendChild(bubble);
    document.body.appendChild(container);

    bubble.addEventListener('click', openWidget);
    $('cw-minimize-btn').addEventListener('click', minimizeWidget);
    $('cw-close-btn').addEventListener('click', closeWidget);
    $('cw-send-btn').addEventListener('click', sendMessage);
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

    var input = $('cw-input');
    input.addEventListener('input', onInputChange);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  function orderLabel() {
    return (
      state.orderDisplayId ||
      (state.orderMetadata && (state.orderMetadata.order_number || state.orderMetadata.orderNumber)) ||
      state.orderId ||
      '—'
    );
  }

  function updateHeader() {
    var label = $('cw-agent-name');
    var sub = $('cw-status');
    var avatar = $('cw-avatar');
    if (!label || !sub || !avatar) return;

    if (state.type === 'ORDER_SUPPORT') {
      sub.textContent = 'Order #' + orderLabel() + ' সাপোর্ট';
    } else {
      sub.textContent = state.agentName ? 'Connected with agent' : 'Online';
    }

    if (state.agentName) {
      label.textContent = state.agentName;
      avatar.textContent = '👤';
    } else {
      label.textContent = 'Aria';
      avatar.textContent = '🤖';
    }
  }

  /* ---------- open / close ---------- */

  function openWidget() {
    ensureDom();
    state.isOpen = true;
    state.unread = 0;
    updateBadge();
    var el = $('cw-container');
    if (!el) return;
    // Do NOT touch document.body overflow / scroll position
    el.classList.add('cw-open');
    scrollToBottom();
    setTimeout(function () {
      var input = $('cw-input');
      if (input && !input.disabled) input.focus();
    }, 260);
  }

  function minimizeWidget() {
    state.isOpen = false;
    var el = $('cw-container');
    if (!el) return;
    el.classList.remove('cw-open');
  }

  function closeWidget() {
    minimizeWidget();
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

  function showWaitingBanner(visible) {
    var el = $('cw-waiting-banner');
    if (!el) return;
    el.classList.toggle('visible', !!visible);
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

    var box = $('cw-messages');
    var type = String((msg.sender_type || msg.senderType || msg.type) || 'BOT').toUpperCase();
    if (type === 'CUSTOMER' || type === 'GUEST') type = 'USER';
    if (type === 'AI' || type === 'BOT_MESSAGE') type = 'BOT';
    if (type === 'HUMAN' || type === 'SUPPORT') type = 'AGENT';

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

    if (type === 'SYSTEM') {
      wrap.className = 'cw-msg cw-system';
      wrap.innerHTML =
        '<div class="cw-bubble-text">' + escapeHtml(content) + '</div>';
      box.appendChild(wrap);
      if (!options.skipScroll) scrollToBottom();
      return wrap;
    }

    var roleClass = type === 'USER' ? 'cw-user' : type === 'AGENT' ? 'cw-agent' : 'cw-bot';
    wrap.className = 'cw-msg ' + roleClass;

    var label = '';
    if (type === 'BOT') label = '<div class="cw-msg-label">Aria 🤖</div>';
    if (type === 'AGENT') {
      var agentLabel = (msg && (msg.sender_name || msg.senderName || state.agentName)) || 'Agent';
      label = '<div class="cw-msg-label">' + escapeHtml(agentLabel) + ' 👤</div>';
    }

    var imageHtml = '';
    if (imageUrl) {
      imageHtml =
        '<a href="' + escapeHtml(imageUrl) + '" target="_blank" rel="noopener noreferrer">' +
          '<img class="cw-img-thumb" src="' + escapeHtml(imageUrl) + '" alt="Attachment" />' +
        '</a>';
    }

    wrap.innerHTML =
      label +
      '<div class="cw-bubble-text">' +
        (content ? escapeHtml(content) : '') +
        imageHtml +
      '</div>' +
      '<div class="cw-msg-time">' + formatTime(createdAt) + '</div>';

    var typingEl = $('cw-typing');
    if (typingEl && typingEl.parentNode === box) {
      box.insertBefore(wrap, typingEl);
    } else {
      box.appendChild(wrap);
    }

    var quick = msg && (msg.quick_replies || msg.quickReplies);
    if (quick && Array.isArray(quick) && quick.length && type === 'BOT') {
      var qr = document.createElement('div');
      qr.className = 'cw-quick-replies';
      quick.forEach(function (item) {
        var text = typeof item === 'string' ? item : (item.label || item.text || item.value || '');
        if (!text) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cw-qr-btn';
        btn.textContent = text;
        btn.addEventListener('click', function () {
          qr.remove();
          sendText(text);
        });
        qr.appendChild(btn);
      });
      wrap.appendChild(qr);
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

  function showCsat() {
    ensureDom();
    var el = $('cw-csat');
    if (!el) return;

    showWaitingBanner(false);
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
    if (attach) attach.disabled = !enabled;
    if (footer) footer.classList.toggle('is-disabled', !enabled);
    updateSendButton();
    if (!enabled && send) send.disabled = true;
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

    var base = state.apiUrl.replace(/\/$/, '');
    var endpoints = [
      base + '/api/upload/image',
      base + '/api/chat/' + encodeURIComponent(state.roomId) + '/upload'
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
    sendMessage();
  }

  async function sendMessage() {
    if (state.resolved || !state.socket || !state.roomId) return;

    var input = $('cw-input');
    var text = (input && input.value ? input.value : '').trim();
    var file = state.pendingFile;

    if (!text && !file) return;
    if (text && text.length > 5000) {
      showErrorToast('বার্তা খুব বড় (সর্বোচ্চ ৫০০০ অক্ষর)।');
      return;
    }

    $('cw-send-btn').disabled = true;
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
          updateSendButton();
          return; // Do NOT send data URL fallback
        }
      }

      var payload = {
        room_id: state.roomId,
        guest_session_id: state.guestSessionId,
        content: text,
        message: text || (attachments.length ? '[Attachment]' : ''),
        sender_name: state.guestName,
        sender_type: 'USER',
        attachments: attachments
      };
      if (attachments[0]) {
        payload.attachment = attachments[0];
        payload.image_url = attachments[0].url;
      }

      // Rely on socket `new_message` broadcast for UI append (avoids duplicates)
      state.socket.emit('send_message', payload);

      if (input) {
        input.value = '';
        autoResizeInput();
      }
      updateSendButton();
    } catch (err) {
      console.error('[ChatWidget] send failed:', err);
      showErrorToast('বার্তা পাঠানো যায়নি। আবার চেষ্টা করুন।');
      updateSendButton();
    }
  }

  /* ---------- socket ---------- */

  function bindSocketEvents() {
    var s = state.socket;
    if (!s) return;

    s.off('new_message');
    s.off('agent_typing');
    s.off('agent_stopped_typing');
    s.off('waiting_for_agent');
    s.off('agent_joined');
    s.off('chat_resolved');
    s.off('chat_history');
    s.off('rating_submitted');
    s.off('error');
    s.off('connect');
    s.off('disconnect');

    s.on('connect', function () {
      if (state.roomId) {
        s.emit('join_room', {
          room_id: state.roomId,
          guest_session_id: state.guestSessionId
        });
      }
    });

    s.on('new_message', function (msg) {
      if (msg && msg.sender_type === 'INTERNAL') return;
      renderMessage(msg);
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
      showWaitingBanner(true);
      showSystemBanner('একজন প্রতিনিধি শীঘ্রই যোগ দেবেন...');
    });

    s.on('agent_joined', function (data) {
      var name = (data && (data.agent_name || data.name || data.agentName)) || 'Agent';
      state.agentName = name;
      updateHeader();
      showWaitingBanner(false);
      showSystemBanner(name + ' চ্যাটে যোগ দিয়েছেন');
    });

    s.on('chat_resolved', function () {
      state.resolved = true;
      hideTyping();
      showWaitingBanner(false);
      showSystemBanner('চ্যাট সম্পন্ন হয়েছে');
      showCsat();
    });

    s.on('chat_history', function (payload) {
      var messages = Array.isArray(payload)
        ? payload
        : (payload && (payload.messages || payload.history)) || [];
      state.renderedIds = Object.create(null);
      var box = $('cw-messages');
      if (box) {
        box.querySelectorAll('.cw-msg').forEach(function (n) {
          n.remove();
        });
      }
      messages.forEach(function (m) {
        renderMessage(m, { fromHistory: true, skipScroll: true });
      });
      scrollToBottom();
    });

    s.on('disconnect', function () {
      /* reconnect handled by socket.io */
    });
  }

  function connectSocket() {
    if (!global.io) throw new Error('socket.io not loaded');

    if (state.socket) {
      try { state.socket.disconnect(); } catch (e) { /* ignore */ }
      state.socket = null;
    }

    state.socket = global.io(state.socketUrl.replace(/\/$/, '') + '/customer', {
      auth: {
        guest_session_id: state.guestSessionId,
        user_id: state.userId || undefined
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000
    });

    bindSocketEvents();
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

  function persistRoom(roomId) {
    state.roomId = roomId;
    try {
      localStorage.setItem(STORAGE_ROOM, roomId);
    } catch (e) { /* ignore */ }
  }

  function readPersistedRoom() {
    try {
      return localStorage.getItem(STORAGE_ROOM);
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
    if (state.type === 'ORDER_SUPPORT' && state.orderMetadata) {
      body.order_metadata = state.orderMetadata;
    }

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
    ensureDom();
    updateHeader();
    setInputEnabled(true);
    state.resolved = false;
    state.agentName = null;
    state.unread = 0;
    state.renderedIds = Object.create(null);
    updateBadge();
    showWaitingBanner(false);

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
  }

  /* ---------- public API ---------- */

  function defaultChatApiUrl() {
    var LOCAL_CHAT_API = 'http://localhost:5001';
    var PROD_CHAT_API = 'https://eonlinebazar-chat-api.onrender.com';

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
      if (host === 'eonlinebazar-chat-api.onrender.com') {
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
    state.socketUrl = options.socketUrl || options.socket_url || state.apiUrl;
    state.guestName = options.guestName || options.guest_name || 'Guest';
    state.guestEmail = options.guestEmail || options.guest_email || null;
    state.userId = options.userId || options.user_id || null;
    state.orderId = options.orderId || options.order_id || null;
    state.orderDisplayId =
      options.orderDisplayId ||
      options.order_display_id ||
      (options.orderMetadata && (options.orderMetadata.order_number || options.orderMetadata.orderNumber)) ||
      null;
    state.orderMetadata = options.orderMetadata || options.order_metadata || null;
    state.type = options.type || 'GENERAL';
    state.guestSessionId = getOrCreateSessionId();
    state.initialized = true;

    await bootstrap();
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
      guestName: options.guestName || options.guest_name || 'Guest',
      guestEmail: options.guestEmail || options.guest_email || null,
      userId: options.userId || options.user_id || null,
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
  }

  var ChatWidget = {
    init: init,
    _init: _init,
    open: openWidget,
    close: closeWidget,
    minimize: minimizeWidget,
    destroy: destroy,
    openOrderSupport: openOrderSupport,
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

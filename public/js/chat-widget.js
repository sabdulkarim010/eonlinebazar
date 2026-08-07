/**
 * EOnlineBazar Customer Chat Widget
 * Drop-in: <script src="/js/chat-widget.js"></script>
 * Init: ChatWidget.init({ apiUrl, socketUrl, guestName, orderId, type, orderMetadata })
 */
(function (global) {
  'use strict';

  var STORAGE_SESSION = 'cw_guest_session_id';
  var SOCKET_CDN = 'https://cdn.socket.io/4.7.5/socket.io.min.js';

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
    pendingUserSend: false,
    resolved: false,
    agentName: null,
    initialized: false,
    cssLoaded: false,
    renderedIds: Object.create(null)
  };

  function roomStorageKey() {
    return 'cw_room_id_' + (state.type || 'GENERAL');
  }

  function resolveAssetUrl(relativePath) {
    try {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].src || '';
        if (src.indexOf('chat-widget.js') !== -1) {
          return new URL(relativePath, src).href;
        }
      }
    } catch (e) { /* ignore */ }
    return '/css/chat-widget.css';
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

  function loadCss() {
    if (state.cssLoaded || document.querySelector('link[data-cw-css]')) {
      state.cssLoaded = true;
      return;
    }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = resolveAssetUrl('../css/chat-widget.css');
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

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result || '';
        var base64 = String(result).split(',')[1] || '';
        resolve({
          base64: base64,
          dataUrl: result,
          mimeType: file.type,
          fileName: file.name,
          size: file.size
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---------- DOM build ---------- */

  function ensureDom() {
    if ($('cw-bubble')) return;

    var bubble = document.createElement('button');
    bubble.id = 'cw-bubble';
    bubble.type = 'button';
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>' +
      '<span id="cw-bubble-badge" aria-live="polite">0</span>';

    var container = document.createElement('div');
    container.id = 'cw-container';
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', 'Customer support chat');
    container.innerHTML =
      '<div id="cw-header">' +
        '<div class="cw-header-avatar" id="cw-avatar">🤖</div>' +
        '<div class="cw-header-info">' +
          '<div class="cw-header-name">' +
            '<span id="cw-agent-label">Aria</span>' +
            '<span class="cw-online-dot" title="Online"></span>' +
          '</div>' +
          '<div class="cw-header-sub" id="cw-header-sub">Online</div>' +
        '</div>' +
        '<div class="cw-header-actions">' +
          '<button type="button" class="cw-header-btn" id="cw-minimize" aria-label="Minimize">−</button>' +
          '<button type="button" class="cw-header-btn" id="cw-close" aria-label="Close">×</button>' +
        '</div>' +
      '</div>' +
      '<div id="cw-messages"></div>' +
      '<div id="cw-footer">' +
        '<div class="cw-attach-preview" id="cw-attach-preview">' +
          '<img id="cw-attach-thumb" alt="Attachment preview" />' +
          '<div class="cw-attach-preview-meta" id="cw-attach-name"></div>' +
          '<button type="button" class="cw-attach-remove" id="cw-attach-remove" aria-label="Remove attachment">×</button>' +
        '</div>' +
        '<div class="cw-footer-row">' +
          '<button type="button" id="cw-attachment-btn" aria-label="Attach image">📎</button>' +
          '<textarea id="cw-input" rows="1" placeholder="আপনার বার্তা লিখুন..."></textarea>' +
          '<button type="button" id="cw-send-btn" aria-label="Send" disabled>➤</button>' +
          '<input type="file" id="cw-file-input" accept="image/*" />' +
        '</div>' +
      '</div>';

    document.body.appendChild(bubble);
    document.body.appendChild(container);

    bubble.addEventListener('click', openWidget);
    $('cw-minimize').addEventListener('click', minimizeWidget);
    $('cw-close').addEventListener('click', closeWidget);
    $('cw-send-btn').addEventListener('click', sendMessage);
    $('cw-attachment-btn').addEventListener('click', function () {
      if (!state.resolved) $('cw-file-input').click();
    });
    $('cw-file-input').addEventListener('change', onFileSelected);
    $('cw-attach-remove').addEventListener('click', clearAttachment);

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
    var container = $('cw-container');
    var label = $('cw-agent-label');
    var sub = $('cw-header-sub');
    var avatar = $('cw-avatar');

    if (state.type === 'ORDER_SUPPORT') {
      container.classList.add('is-order-support');
    } else {
      container.classList.remove('is-order-support');
    }

    if (state.agentName) {
      label.textContent = state.agentName;
      avatar.textContent = '👤';
      avatar.classList.add('is-agent');
      sub.textContent = state.type === 'ORDER_SUPPORT'
        ? 'Order #' + orderLabel() + ' সাপোর্ট'
        : 'Online';
    } else {
      label.textContent = 'Aria';
      avatar.textContent = '🤖';
      avatar.classList.remove('is-agent');
      sub.textContent = state.type === 'ORDER_SUPPORT'
        ? 'Order #' + orderLabel() + ' সাপোর্ট'
        : 'Online';
    }
  }

  /* ---------- open / close ---------- */

  function openWidget() {
    ensureDom();
    state.isOpen = true;
    state.unread = 0;
    updateBadge();
    var el = $('cw-container');
    el.style.display = 'flex';
    // force reflow for animation
    void el.offsetWidth;
    el.classList.add('is-open');
    scrollToBottom();
    setTimeout(function () {
      var input = $('cw-input');
      if (input && !input.disabled) input.focus();
    }, 260);
  }

  function minimizeWidget() {
    state.isOpen = false;
    var el = $('cw-container');
    el.classList.remove('is-open');
    setTimeout(function () {
      if (!state.isOpen) el.style.display = 'none';
    }, 250);
  }

  function closeWidget() {
    minimizeWidget();
  }

  function updateBadge() {
    var badge = $('cw-bubble-badge');
    if (!badge) return;
    if (state.unread > 0) {
      badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
      badge.classList.add('is-visible');
    } else {
      badge.classList.remove('is-visible');
    }
  }

  /* ---------- messages ---------- */

  function scrollToBottom() {
    var box = $('cw-messages');
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }

  function getTypingEl() {
    var box = $('cw-messages');
    var el = box.querySelector('.cw-typing');
    if (!el) {
      el = document.createElement('div');
      el.className = 'cw-typing';
      el.innerHTML =
        '<div class="cw-msg-label"></div>' +
        '<div class="cw-typing-bubble">' +
          '<span class="cw-typing-dot"></span>' +
          '<span class="cw-typing-dot"></span>' +
          '<span class="cw-typing-dot"></span>' +
        '</div>';
      box.appendChild(el);
    }
    var label = el.querySelector('.cw-msg-label');
    if (label) {
      label.textContent = state.agentName
        ? state.agentName + ' 👤'
        : 'Aria 🤖';
    }
    return el;
  }

  function showTyping() {
    var el = getTypingEl();
    el.classList.add('is-visible');
    scrollToBottom();
  }

  function hideTyping() {
    var box = $('cw-messages');
    if (!box) return;
    var el = box.querySelector('.cw-typing');
    if (el) el.classList.remove('is-visible');
  }

  function normalizeMessage(raw) {
    if (!raw) return null;
    // Backend often wraps as { message, room }
    if (raw.message && typeof raw.message === 'object' && (raw.message.sender_type || raw.message.message != null)) {
      return raw.message;
    }
    return raw;
  }

  function extractImageUrl(msg) {
    if (!msg) return null;
    var attachment = msg.attachment || msg.attachments;
    if (typeof attachment === 'string') return attachment;
    if (Array.isArray(attachment) && attachment[0]) {
      return attachment[0].url || attachment[0].dataUrl || attachment[0].src || null;
    }
    if (attachment && typeof attachment === 'object') {
      return attachment.url || attachment.dataUrl || attachment.src || null;
    }
    return msg.image_url || msg.imageUrl || null;
  }

  function renderMessage(msg, options) {
    options = options || {};
    msg = normalizeMessage(msg);
    if (!msg) return null;

    ensureDom();
    hideTyping();

    var msgId = msg._id || msg.id || null;
    if (msgId) {
      msgId = String(msgId);
      if (state.renderedIds[msgId]) return null;
      state.renderedIds[msgId] = true;
    }

    var box = $('cw-messages');
    var type = String(msg.sender_type || msg.senderType || msg.type || 'BOT').toUpperCase();
    if (type === 'CUSTOMER' || type === 'GUEST') type = 'USER';
    if (type === 'AI' || type === 'BOT_MESSAGE') type = 'BOT';
    if (type === 'HUMAN' || type === 'SUPPORT') type = 'AGENT';

    var content = msg.content || msg.message || msg.text || '';
    var createdAt = msg.created_at || msg.createdAt || msg.timestamp || Date.now();
    var imageUrl = extractImageUrl(msg);

    var wrap = document.createElement('div');

    if (type === 'SYSTEM') {
      wrap.className = 'cw-msg cw-msg--system';
      wrap.innerHTML =
        '<div class="cw-msg-bubble">' + escapeHtml(content) + '</div>';
      box.appendChild(wrap);
      if (!options.skipScroll) scrollToBottom();
      return wrap;
    }

    var roleClass = type === 'USER' ? 'user' : type === 'AGENT' ? 'agent' : 'bot';
    wrap.className = 'cw-msg cw-msg--' + roleClass;

    var label = '';
    if (type === 'BOT') {
      var botName = msg.sender_name || msg.senderName || 'Aria';
      label = '<div class="cw-msg-label">' + escapeHtml(botName) + ' 🤖</div>';
    }
    if (type === 'AGENT') {
      var agentLabel = msg.sender_name || msg.senderName || state.agentName || 'Agent';
      label = '<div class="cw-msg-label">' + escapeHtml(agentLabel) + ' 👤</div>';
    }

    var imageHtml = '';
    if (imageUrl) {
      imageHtml =
        '<a href="' + escapeHtml(imageUrl) + '" target="_blank" rel="noopener noreferrer">' +
          '<img class="cw-msg-image" src="' + escapeHtml(imageUrl) + '" alt="Attachment" />' +
        '</a>';
    }

    wrap.innerHTML =
      label +
      '<div class="cw-msg-bubble">' +
        (content ? escapeHtml(content) : '') +
        imageHtml +
      '</div>' +
      '<div class="cw-msg-time">' + formatTime(createdAt) + '</div>';

    box.appendChild(wrap);

    var quick = msg.quick_replies || msg.quickReplies;
    if (quick && Array.isArray(quick) && quick.length && type === 'BOT') {
      var qr = document.createElement('div');
      qr.className = 'cw-quick-replies';
      quick.forEach(function (item) {
        var labelText = typeof item === 'string' ? item : (item.label || item.text || item.value || '');
        var sendValue = typeof item === 'string' ? item : (item.value || item.label || item.text || '');
        if (!labelText || !sendValue) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cw-quick-reply';
        btn.textContent = labelText;
        btn.addEventListener('click', function () {
          qr.remove();
          sendText(sendValue);
        });
        qr.appendChild(btn);
      });
      wrap.appendChild(qr);
    }

    if (!options.skipScroll) scrollToBottom();

    if (!options.fromHistory && type !== 'USER') {
      if (!state.isOpen) {
        state.unread += 1;
        updateBadge();
      }
      playNotificationSound();
    }

    return wrap;
  }

  function showSystemBanner(text) {
    ensureDom();
    var box = $('cw-messages');
    var el = document.createElement('div');
    el.className = 'cw-banner';
    el.textContent = text;
    box.appendChild(el);
    scrollToBottom();
  }

  function showCsat() {
    ensureDom();
    var box = $('cw-messages');
    if (box.querySelector('.cw-csat')) return;

    var el = document.createElement('div');
    el.className = 'cw-csat';
    el.innerHTML =
      '<div class="cw-csat-title">আমাদের সেবা কেমন লেগেছে?</div>' +
      '<div class="cw-csat-stars" role="group" aria-label="Rating">' +
        [1, 2, 3, 4, 5].map(function (n) {
          return '<button type="button" class="cw-star" data-rating="' + n + '" aria-label="' + n + ' star">★</button>';
        }).join('') +
      '</div>' +
      '<div class="cw-csat-thanks" id="cw-csat-thanks" hidden></div>';

    box.appendChild(el);

    var stars = el.querySelectorAll('.cw-star');
    stars.forEach(function (star) {
      star.addEventListener('mouseenter', function () {
        var r = Number(star.getAttribute('data-rating'));
        stars.forEach(function (s) {
          s.classList.toggle('is-active', Number(s.getAttribute('data-rating')) <= r);
        });
      });
      star.addEventListener('mouseleave', function () {
        stars.forEach(function (s) { s.classList.remove('is-active'); });
      });
      star.addEventListener('click', function () {
        var rating = Number(star.getAttribute('data-rating'));
        submitRating(rating, el);
      });
    });

    setInputEnabled(false);
    scrollToBottom();
  }

  function submitRating(rating, csatEl) {
    if (!state.socket || !state.roomId) return;
    state.socket.emit('submit_rating', {
      room_id: state.roomId,
      rating: rating
    });
    var stars = csatEl.querySelectorAll('.cw-star');
    stars.forEach(function (s) {
      s.classList.toggle('is-active', Number(s.getAttribute('data-rating')) <= rating);
      s.disabled = true;
    });
    var thanks = csatEl.querySelector('#cw-csat-thanks');
    thanks.hidden = false;
    thanks.textContent = 'ধন্যবাদ আপনার মতামতের জন্য! 🙏';
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
      preview.classList.add('is-visible');
      updateSendButton();
    };
    reader.readAsDataURL(file);
  }

  function clearAttachment() {
    state.pendingFile = null;
    var preview = $('cw-attach-preview');
    var thumb = $('cw-attach-thumb');
    if (preview) preview.classList.remove('is-visible');
    if (thumb) thumb.removeAttribute('src');
    updateSendButton();
  }

  async function uploadAttachment(file) {
    var encoded = await fileToBase64(file);
    var fallback = {
      url: encoded.dataUrl,
      type: 'image',
      filename: encoded.fileName,
      size: encoded.size
    };

    try {
      var result = await api('/api/chat/' + encodeURIComponent(state.roomId) + '/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_session_id: state.guestSessionId,
          file_name: encoded.fileName,
          mime_type: encoded.mimeType,
          size: encoded.size,
          data: encoded.base64
        })
      });
      return {
        url: (result && (result.url || result.attachment_url || result.dataUrl)) || encoded.dataUrl,
        type: (result && result.type) || 'image',
        filename: (result && (result.filename || result.file_name)) || encoded.fileName,
        size: (result && result.size) || encoded.size
      };
    } catch (err) {
      // Upload endpoint may be unimplemented — still send via socket with data URL
      console.warn('[ChatWidget] upload failed, using local preview URL:', err && err.message);
      return fallback;
    }
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

    $('cw-send-btn').disabled = true;
    emitTypingStop();

    var attachmentInfo = null;
    try {
      if (file) {
        attachmentInfo = await uploadAttachment(file);
        clearAttachment();
      }

      var payload = {
        room_id: state.roomId,
        guest_session_id: state.guestSessionId,
        sender_id: state.guestSessionId,
        sender_name: state.guestName,
        message: text || (attachmentInfo ? '[Attachment]' : ''),
        attachments: attachmentInfo ? [attachmentInfo] : []
      };

      // Rely on socket `new_message` broadcast for UI append (avoids duplicates)
      state.socket.emit('send_message', payload);

      if (input) {
        input.value = '';
        autoResizeInput();
      }
      updateSendButton();
    } catch (err) {
      console.error('[ChatWidget] send failed:', err);
      showSystemBanner('বার্তা পাঠানো যায়নি। আবার চেষ্টা করুন।');
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
    s.off('handover_started');
    s.off('agent_joined');
    s.off('chat_resolved');
    s.off('chat_history');
    s.off('rating_submitted');
    s.off('connect');
    s.off('disconnect');
    s.off('error');

    s.on('connect', function () {
      if (state.roomId) {
        s.emit('join_room', {
          room_id: state.roomId,
          guest_session_id: state.guestSessionId
        });
      }
    });

    s.on('new_message', function (payload) {
      var msg = normalizeMessage(payload);
      if (!msg) return;
      // Dedup by _id inside renderMessage
      renderMessage(msg);
    });

    s.on('agent_typing', function () {
      showTyping();
    });

    s.on('agent_stopped_typing', function () {
      hideTyping();
    });

    function onWaitingForAgent() {
      showSystemBanner('একজন প্রতিনিধি শীঘ্রই যোগ দেবেন...');
    }

    s.on('waiting_for_agent', onWaitingForAgent);
    s.on('handover_started', onWaitingForAgent);

    s.on('agent_joined', function (data) {
      var name =
        (data && data.agent && data.agent.name) ||
        (data && (data.agent_name || data.name || data.agentName)) ||
        'Agent';
      state.agentName = name;
      updateHeader();
      // System message also arrives via new_message — avoid duplicate
    });

    s.on('chat_resolved', function () {
      state.resolved = true;
      hideTyping();
      setInputEnabled(false);
      // System message also arrives via new_message — avoid duplicate
      showCsat();
    });

    s.on('chat_history', function (payload) {
      var messages = Array.isArray(payload)
        ? payload
        : (payload && (payload.messages || payload.history)) || [];

      state.renderedIds = Object.create(null);
      state.pendingUserSend = false;

      var box = $('cw-messages');
      if (box) {
        box.querySelectorAll('.cw-msg, .cw-banner, .cw-csat, .cw-typing').forEach(function (n) {
          n.remove();
        });
      }

      var room = payload && payload.room;
      if (room) {
        if (room.status === 'RESOLVED') {
          state.resolved = true;
          setInputEnabled(false);
        }
        if (room.assigned_agent_id && room.status === 'ACTIVE') {
          // Agent name may arrive via agent_joined; keep header ready
          updateHeader();
        }
      }

      messages.forEach(function (m) {
        renderMessage(m, { fromHistory: true, skipScroll: true });
      });

      if (state.resolved) showCsat();
      scrollToBottom();
    });

    s.on('rating_submitted', function (data) {
      if (data && data.message) renderMessage(data.message);
    });

    s.on('error', function (err) {
      var message = (err && err.message) || 'Connection error';
      console.error('[ChatWidget] socket error:', message);
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
    state.roomId = roomId ? String(roomId) : null;
    try {
      if (state.roomId) {
        localStorage.setItem(roomStorageKey(), state.roomId);
        // Legacy key for older demos
        localStorage.setItem('cw_room_id', state.roomId);
      }
    } catch (e) { /* ignore */ }
  }

  function readPersistedRoom() {
    try {
      return localStorage.getItem(roomStorageKey()) || localStorage.getItem('cw_room_id');
    } catch (e) {
      return null;
    }
  }

  function extractRoomId(data) {
    if (!data) return null;
    if (data.room_id) return String(data.room_id);
    if (data.roomId) return String(data.roomId);
    if (data.room) {
      var r = data.room;
      if (r._id) return String(r._id);
      if (r.id) return String(r.id);
    }
    return null;
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

    var roomId = extractRoomId(data);
    if (!roomId) {
      throw new Error('No room_id returned from /api/chat/start');
    }

    persistRoom(roomId);

    if (data.room && data.room.status === 'RESOLVED') {
      state.resolved = true;
    }

    return data;
  }

  function joinCurrentRoom() {
    if (!state.socket || !state.roomId) return;
    state.socket.emit('join_room', {
      room_id: state.roomId,
      guest_session_id: state.guestSessionId
    });
  }

  async function bootstrap() {
    ensureDom();
    updateHeader();
    setInputEnabled(true);
    state.resolved = false;
    state.agentName = null;
    state.unread = 0;
    state.pendingUserSend = false;
    state.renderedIds = Object.create(null);
    updateBadge();

    var box = $('cw-messages');
    if (box) box.innerHTML = '';

    await loadSocketIo();
    connectSocket();

    try {
      // Prefer API resume (correct room for type/order), fall back to localStorage
      try {
        await startChat();
      } catch (startErr) {
        var persisted = readPersistedRoom();
        if (!persisted) throw startErr;
        console.warn('[ChatWidget] start failed, rejoining persisted room:', startErr && startErr.message);
        persistRoom(persisted);
      }

      joinCurrentRoom();
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
      // Storefront production → hosted chat API
      if (/(^|\.)eonlinebazar\.com$/i.test(host)) {
        return PROD_CHAT_API;
      }
    } catch (e2) { /* ignore */ }

    return LOCAL_CHAT_API;
  }

  async function init(options) {
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

    if (document.readyState === 'loading') {
      await new Promise(function (resolve) {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
    }

    await bootstrap();
    return ChatWidget;
  }

  /**
   * Convenience: re-init as ORDER_SUPPORT for a specific order and open the widget.
   * options: { orderId, orderDisplayId, orderMetadata, guestName, guestEmail, userId, apiUrl, socketUrl }
   */
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

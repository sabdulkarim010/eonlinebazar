/**
 * Storefront live chat helper.
 *
 * Usage:
 *   OrderChat.openGeneral();              // GENERAL support (sidebar Live Support)
 *   OrderChat.openForOrder(orderObject);  // ORDER_SUPPORT with metadata
 *   OrderChat.openFromButton(buttonEl);
 */
(function (global) {
  'use strict';

  var SCRIPT_ID = 'eob-chat-widget-script';
  var loadingPromise = null;

  var DEFAULT_CHAT_API = 'http://localhost:5001';

  function resolveChatApiUrl() {
    if (global.CHAT_API_URL) {
      return String(global.CHAT_API_URL).replace(/\/$/, '');
    }
    try {
      var meta = document.querySelector('meta[name="chat-api-url"]');
      if (meta && meta.content) return String(meta.content).replace(/\/$/, '');
    } catch (e) { /* ignore */ }

    // Storefront (e.g. :5000 / :3000) must never treat itself as the chat API
    try {
      var origin = global.location && global.location.origin;
      var port = global.location && global.location.port;
      if (origin && (port === '5001' || /:5001$/.test(origin))) {
        return origin.replace(/\/$/, '');
      }
    } catch (e2) { /* ignore */ }

    return DEFAULT_CHAT_API;
  }

  function readUser() {
    try {
      var raw = localStorage.getItem('userInfo') || localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function ensureWidgetScript() {
    if (global.ChatWidget && typeof global.ChatWidget.init === 'function') {
      return Promise.resolve(global.ChatWidget);
    }
    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise(function (resolve, reject) {
      function done() {
        if (global.ChatWidget && typeof global.ChatWidget.init === 'function') {
          resolve(global.ChatWidget);
        } else {
          loadingPromise = null;
          reject(new Error('ChatWidget failed to initialize'));
        }
      }

      var existing = document.getElementById(SCRIPT_ID);
      if (existing) {
        if (global.ChatWidget) {
          done();
          return;
        }
        existing.addEventListener('load', done);
        existing.addEventListener('error', function () {
          loadingPromise = null;
          reject(new Error('Failed to load chat widget'));
        });
        return;
      }

      // Prefer same-origin storefront copy; API/socket still target chat server (:5001)
      var sources = ['/js/chat-widget.js', resolveChatApiUrl() + '/js/chat-widget.js'];
      var idx = 0;

      function tryNext() {
        if (idx >= sources.length) {
          loadingPromise = null;
          reject(new Error('Failed to load chat widget'));
          return;
        }
        var script = document.createElement('script');
        script.id = idx === 0 ? SCRIPT_ID : SCRIPT_ID + '-fallback';
        script.src = sources[idx++];
        script.async = true;
        script.onload = done;
        script.onerror = tryNext;
        document.head.appendChild(script);
      }

      tryNext();
    });

    return loadingPromise;
  }

  function buildMetadata(order) {
    if (!order || typeof order !== 'object') return null;

    var items = Array.isArray(order.items)
      ? order.items
      : Array.isArray(order.products)
        ? order.products
        : [];

    var displayId =
      order.orderId ||
      order.order_number ||
      order.orderNumber ||
      (order._id ? String(order._id).slice(-6).toUpperCase() : null);

    return {
      order_number: displayId || null,
      order_mongo_id: order._id ? String(order._id) : null,
      items: items.map(function (item) {
        return {
          name: item.name || item.productName || (item.product && item.product.name) || 'Item',
          quantity: Number(item.quantity ?? item.qty) || 1,
          price: Number(item.price) || 0
        };
      }),
      total_amount: Number(order.grandTotal ?? order.totalAmount ?? order.total) || 0,
      status: order.status || null,
      currency: 'BDT'
    };
  }

  function resolveOrderId(order, metadata) {
    if (!order) return null;
    // Prefer display order number for human-readable admin context;
    // fall back to Mongo id so rooms remain unique per order.
    return (
      order.orderId ||
      (metadata && metadata.order_number) ||
      (order._id ? String(order._id) : null)
    );
  }

  function showChatError(message) {
    if (global.Swal) {
      global.Swal.fire({
        icon: 'error',
        title: 'Chat unavailable',
        text: message || 'Unable to start chat right now. Please try again later.',
        confirmButtonColor: '#2563eb'
      });
    } else {
      alert(message || 'Unable to start chat right now. Please try again later.');
    }
  }

  async function launchWidget(payload) {
    var ChatWidget = await ensureWidgetScript();
    if (!ChatWidget) throw new Error('ChatWidget unavailable');

    if (payload.type === 'ORDER_SUPPORT' && typeof ChatWidget.openOrderSupport === 'function') {
      await ChatWidget.openOrderSupport(payload);
    } else {
      if (typeof ChatWidget.destroy === 'function') ChatWidget.destroy();
      await ChatWidget.init(payload);
      if (typeof ChatWidget.open === 'function') ChatWidget.open();
    }

    return ChatWidget;
  }

  async function openGeneral(extraOptions) {
    extraOptions = extraOptions || {};
    var user = readUser();
    var api = resolveChatApiUrl();

    try {
      return await launchWidget({
        apiUrl: extraOptions.apiUrl || api || DEFAULT_CHAT_API,
        socketUrl: extraOptions.socketUrl || api || DEFAULT_CHAT_API,
        guestName:
          extraOptions.guestName ||
          (user && (user.name || user.fullName)) ||
          'Guest',
        guestEmail:
          extraOptions.guestEmail ||
          (user && user.email) ||
          null,
        userId: extraOptions.userId || (user && (user._id || user.id)) || null,
        type: 'GENERAL'
      });
    } catch (err) {
      console.error('[OrderChat] Failed to open general support chat:', err);
      showChatError('Unable to start live support chat right now. Please try again later.');
      return null;
    }
  }

  async function openForOrder(order, extraOptions) {
    extraOptions = extraOptions || {};
    if (!order) {
      console.warn('[OrderChat] No order provided');
      return null;
    }

    var user = readUser();
    var api = resolveChatApiUrl();
    var metadata = buildMetadata(order);
    var orderId = resolveOrderId(order, metadata);
    var displayId =
      (metadata && metadata.order_number) ||
      order.orderId ||
      orderId;

    try {
      return await launchWidget({
        apiUrl: extraOptions.apiUrl || api || DEFAULT_CHAT_API,
        socketUrl: extraOptions.socketUrl || api || DEFAULT_CHAT_API,
        guestName:
          extraOptions.guestName ||
          (user && (user.name || user.fullName)) ||
          order.customerName ||
          'Guest',
        guestEmail:
          extraOptions.guestEmail ||
          (user && user.email) ||
          order.customerEmail ||
          null,
        userId: extraOptions.userId || (user && (user._id || user.id)) || null,
        orderId: orderId,
        orderDisplayId: displayId,
        orderMetadata: metadata,
        type: 'ORDER_SUPPORT'
      });
    } catch (err) {
      console.error('[OrderChat] Failed to open order support chat:', err);
      showChatError('Unable to start order support chat right now. Please try again later.');
      return null;
    }
  }

  function openFromButton(btn) {
    if (!btn) return Promise.resolve(null);

    var items = [];
    try {
      var raw = btn.getAttribute('data-order-items') || '[]';
      items = JSON.parse(decodeURIComponent(raw));
    } catch (e) {
      items = [];
    }

    var order = {
      _id: btn.getAttribute('data-order-mongo-id') || btn.getAttribute('data-id') || null,
      orderId: btn.getAttribute('data-order-number') || btn.getAttribute('data-order-id') || null,
      grandTotal: Number(btn.getAttribute('data-order-total')) || 0,
      status: btn.getAttribute('data-order-status') || null,
      customerName: btn.getAttribute('data-customer-name') || null,
      items: items
    };

    return openForOrder(order);
  }

  var OrderChat = {
    openGeneral: openGeneral,
    openForOrder: openForOrder,
    openFromButton: openFromButton,
    buildMetadata: buildMetadata,
    getChatApiUrl: resolveChatApiUrl
  };

  global.OrderChat = OrderChat;
})(typeof window !== 'undefined' ? window : this);

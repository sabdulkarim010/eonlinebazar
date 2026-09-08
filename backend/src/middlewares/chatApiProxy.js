/**
 * Reverse-proxy chat microservice HTTP API through the main store backend.
 * Must be mounted BEFORE express.json() so multipart uploads stream through.
 *
 * ALWAYS proxied to http://127.0.0.1:5001 (never main-backend 404):
 *   /api/chat-admin/*                    → /api/*
 *   /api/admin/me/avatar                 → /api/admin/me/avatar (GET/POST/PUT stream)
 *   /api/admin/customers/*               → chat CRM (always → 127.0.0.1:5001, except store /admin referer)
 *   /api/admin/orders/*                  → chat order lookup (always → 127.0.0.1:5001, except store actions)
 *   /chat-api/*                          → /api/*
 *   /chat-admin/admin/*                  → /api/admin/*
 *   /chat-socket/*                       → /chat-socket/* (Socket.io + polling)
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const jwt = require('jsonwebtoken');

const CHAT_PORT = Number(process.env.CHAT_SERVICE_PORT || 5001);
const CHAT_DIRECT_BASE = `http://127.0.0.1:${CHAT_PORT}`;
const HEALTH_CACHE_MS = 15_000;
/** Avatar / multipart stream proxy — equivalent to proxyTimeout + timeout in http-proxy-middleware */
const PROXY_STREAM_TIMEOUT_MS = Number(process.env.CHAT_PROXY_TIMEOUT_MS || 30_000);
/** Socket.io long-polling can block longer than generic API proxy timeout */
const CHAT_SOCKET_PROXY_TIMEOUT_MS = Number(
  process.env.CHAT_SOCKET_PROXY_TIMEOUT_MS || 120_000
);

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

/** Never rewrite — forward as-is to preserve multipart boundary + auth. */
const STREAM_PRESERVE_HEADERS = new Set([
  'content-type',
  'content-length',
  'authorization',
  'cookie',
  'x-chat-admin',
]);

function getIncomingHeader(reqHeaders, name) {
  if (!reqHeaders) return undefined;
  const target = String(name || '').toLowerCase();
  if (reqHeaders[target] !== undefined) return reqHeaders[target];
  for (const [key, value] of Object.entries(reqHeaders)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

/** Ensure Authorization / Cookie survive the hop to chat :5001. */
function applyPreservedAuthHeaders(outHeaders, reqHeaders) {
  for (const name of STREAM_PRESERVE_HEADERS) {
    const value = getIncomingHeader(reqHeaders, name);
    if (value !== undefined && value !== null && String(value).length > 0) {
      outHeaders[name] = value;
    }
  }

  const auth = getIncomingHeader(reqHeaders, 'authorization');
  if (auth) {
    outHeaders.Authorization = auth;
    outHeaders.authorization = auth;
  }

  const cookie = getIncomingHeader(reqHeaders, 'cookie');
  if (cookie) {
    outHeaders.Cookie = cookie;
    outHeaders.cookie = cookie;
  }
}

let cachedChatBase = null;
let cacheExpiresAt = 0;

function getChatServiceBaseUrls() {
  const fromEnv = (
    process.env.CHAT_SERVICE_URL ||
    process.env.MAIN_STORE_CHAT_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '');

  const defaults = [
    fromEnv,
    CHAT_DIRECT_BASE,
    `http://localhost:${CHAT_PORT}`,
  ].filter(Boolean);

  return [...new Set(defaults)];
}

/** Chat agent API paths that do not exist on the main store admin router. */
const CHAT_DIRECT_ADMIN_PREFIXES = [
  '/api/admin/rooms',
  '/api/admin/stats',
  '/api/admin/config',
  '/api/admin/agents',
];

function requestPathname(req) {
  const raw = req.originalUrl || req.url || req.path || '';
  return String(raw).split('?')[0];
}

/** Referer/Origin URL pathname, or '' when unavailable. */
function refererPathname(req) {
  const raw = String(
    req.headers.referer || req.headers.referrer || req.headers.origin || ''
  ).trim();
  if (!raw) return '';
  try {
    return new URL(raw).pathname || '';
  } catch {
    // Origin header has no path; treat as root
    return raw.includes('/chat-admin') ? '/chat-admin' : '';
  }
}

/** Positive signal that the caller is the Chat Admin dashboard. */
function isChatAdminRequest(req) {
  if (!req) return false;

  if (String(req.headers['x-chat-admin'] || '').trim() === '1') {
    return true;
  }

  const refererRaw = String(
    req.headers.referer || req.headers.referrer || ''
  ).trim();
  if (refererRaw.includes('/chat-admin')) {
    return true;
  }

  return refererPathname(req).startsWith('/chat-admin');
}

/**
 * Positive signal that the caller is the MAIN STORE admin panel (served at
 * /admin, not /chat-admin). Used to keep store customer management on the
 * main backend and NOT hijack it to the chat microservice.
 */
function isStoreAdminRequest(req) {
  if (!req) return false;
  if (isChatAdminRequest(req)) return false;

  const p = refererPathname(req);
  // /admin (store) but not /chat-admin (already excluded above)
  return p === '/admin' || p.startsWith('/admin/') || p.startsWith('/admin?');
}

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isAvatarPath(pathname) {
  return (
    pathname === '/api/admin/me/avatar' ||
    pathname.startsWith('/api/chat-admin/admin/me/avatar')
  );
}

function isAvatarUpload(req, pathname) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'POST' && method !== 'PUT') return false;
  return isAvatarPath(pathname);
}

/** Store admin order action routes — must stay on main backend. */
const STORE_ADMIN_ORDER_ACTIONS = new Set([
  'pending-payment-proof',
  'bulk-delete',
  'manual',
]);

function isChatSocketPath(pathname) {
  return pathname === '/chat-socket' || pathname.startsWith('/chat-socket/');
}

/** Default Socket.io path on port 5000 (chat-admin uses this; store /admin keeps local handler). */
function isStoreSocketIoPath(pathname) {
  return pathname === '/socket.io' || pathname.startsWith('/socket.io/');
}

const CHAT_AGENT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'AGENT']);

function extractBearerToken(reqHeaders) {
  const auth = getIncomingHeader(reqHeaders, 'authorization');
  if (!auth) return '';
  return String(auth).replace(/^Bearer\s+/i, '').trim();
}

/** Detect chat-admin or store-admin JWT on Socket.io handshake (WS may omit X-Chat-Admin). */
function isLikelyChatAdminSocket(req) {
  if (isChatAdminRequest(req)) return true;

  if (String(req.headers['x-chat-admin'] || '').trim() === '1') {
    return true;
  }

  const token = extractBearerToken(req.headers);
  if (!token) return false;

  const secret = process.env.JWT_SECRET;
  if (!secret) return false;

  try {
    const decoded = jwt.verify(token, secret);
    const role = String(decoded.role || '').toUpperCase();
    const accountRole = String(decoded.accountRole || '').toLowerCase();

    if ((decoded.id || decoded._id) && CHAT_AGENT_ROLES.has(role)) {
      return true;
    }

    if (
      decoded.username &&
      (decoded.role === 'admin' ||
        accountRole === 'superadmin' ||
        accountRole === 'super_admin')
    ) {
      return true;
    }
  } catch {
    /* not a valid shared JWT — fall through */
  }

  return false;
}

/** Proxy socket traffic to chat :5001 when path matches chat-admin or legacy socket.io. */
function shouldProxySocketToChat(pathname, req) {
  if (isChatSocketPath(pathname)) return true;
  if (isStoreSocketIoPath(pathname)) {
    if (isLikelyChatAdminSocket(req)) return true;
    if (isChatAdminRequest(req)) return true;
    if (String(req.headers['x-chat-admin'] || '').trim() === '1') return true;
  }
  return false;
}

/** Rewrite /socket.io/* → /chat-socket/socket.io/* for the chat microservice listener. */
function rewriteSocketUrlForChat(reqUrl) {
  const raw = String(reqUrl || '');
  if (raw.startsWith('/socket.io')) {
    return `/chat-socket/socket.io${raw.slice('/socket.io'.length)}`;
  }
  return raw;
}

const CHAT_PROXY_CUSTOMERS_PREFIX = '/api/admin/customers/';
const CHAT_PROXY_ORDERS_PREFIX = '/api/admin/orders/';

/** Chat CRM customer routes under /api/admin/customers/* (not the store list at /api/admin/customers). */
function isChatProxyCustomersPath(pathname) {
  return pathname.startsWith(CHAT_PROXY_CUSTOMERS_PREFIX);
}

/** Chat order lookup under /api/admin/orders/* (excludes store bulk/action routes). */
function isChatProxyOrdersPath(pathname) {
  if (!pathname.startsWith(CHAT_PROXY_ORDERS_PREFIX)) return false;
  const segment = pathname.slice(CHAT_PROXY_ORDERS_PREFIX.length).split('/')[0];
  return Boolean(segment) && !STORE_ADMIN_ORDER_ACTIONS.has(segment);
}

/** @deprecated use isChatProxyCustomersPath — kept for tests / external imports */
function isChatCustomerDetailPath(pathname) {
  return isChatProxyCustomersPath(pathname);
}

/** @deprecated use isChatProxyOrdersPath */
function isChatAdminOrderDetailPath(pathname) {
  return isChatProxyOrdersPath(pathname);
}

/**
 * CRM paths that must always hit chat :5001 — never main-backend 404 or store handlers.
 * Chat-admin signals always win; store /admin referer keeps customer CRM on main backend.
 */
function shouldAlwaysProxyToChat(pathname, req) {
  if (!pathname) return false;
  const isCrmPath =
    isChatCustomerDetailPath(pathname) || isChatAdminOrderDetailPath(pathname);
  if (!isCrmPath) return false;
  if (isChatAdminRequest(req)) return true;
  if (isStoreAdminRequest(req)) return false;
  return true;
}

/**
 * Paths that must never reach the main store 404 handler when chat signals match.
 */
function isAbsoluteChatProxyPath(pathname, req) {
  if (!pathname) return false;

  if (pathname === '/api/chat-admin' || pathname.startsWith('/api/chat-admin/')) {
    return true;
  }

  if (isAvatarPath(pathname)) {
    return true;
  }

  if (shouldAlwaysProxyToChat(pathname, req)) {
    return true;
  }

  // Explicit CRM prefixes — /api/admin/customers/* and /api/admin/orders/* → 127.0.0.1:5001
  if (isChatProxyCustomersPath(pathname) || isChatProxyOrdersPath(pathname)) {
    if (isChatAdminRequest(req)) return true;
    if (isStoreAdminRequest(req)) return false;
    return true;
  }

  if (pathname.startsWith('/chat-api/') || pathname === '/chat-api') {
    return true;
  }

  if (pathname.startsWith('/chat-admin/admin/')) {
    return true;
  }

  if (isChatSocketPath(pathname) || (isStoreSocketIoPath(pathname) && shouldProxySocketToChat(pathname, req))) {
    return true;
  }

  return false;
}

/**
 * Chat CRM customer routes — proxied to :5001 for chat-admin callers (or fresh=1
 * profile refresh with chat-admin signals).
 */
function isChatCustomerPath(pathname, req) {
  if (pathname.startsWith('/api/chat-admin/admin/customers')) {
    return true;
  }
  if (pathname.startsWith('/api/chat-admin/customers')) {
    return true;
  }
  if (isChatCustomerDetailPath(pathname)) {
    return !isStoreAdminRequest(req);
  }
  return false;
}

/**
 * Chat order lookup routes — proxied to :5001 for chat-admin callers.
 * Includes /api/orders/:id and /api/admin/orders/:id namespaces.
 */
function isChatOrdersPath(pathname, req) {
  if (pathname.startsWith('/api/chat-admin/orders')) {
    return true;
  }
  if (pathname.startsWith('/api/chat-admin/admin/orders')) {
    return true;
  }
  if (isChatAdminOrderDetailPath(pathname) && !isStoreAdminRequest(req)) {
    return true;
  }
  if (!isChatAdminRequest(req)) return false;
  if (matchesPrefix(pathname, '/api/admin/orders')) {
    return true;
  }

  return /^\/api\/orders\/[^/]+$/.test(pathname);
}

function isChatDirectAdminPath(pathname, req) {
  if (!pathname) return false;

  if (isAvatarUpload({ method: 'POST' }, pathname)) {
    return true;
  }

  if (isChatCustomerPath(pathname, req)) {
    return true;
  }

  if (isChatOrdersPath(pathname, req)) {
    return true;
  }

  return CHAT_DIRECT_ADMIN_PREFIXES.some((prefix) =>
    matchesPrefix(pathname, prefix)
  );
}

function mapToChatApiPath(pathname, req) {
  if (!pathname) return null;

  // Absolute chat paths — always map (never fall through to main backend 404)
  if (pathname.startsWith('/api/chat-admin/')) {
    return `/api/${pathname.slice('/api/chat-admin/'.length)}`;
  }
  if (pathname === '/api/chat-admin') {
    return '/api';
  }

  if (isAvatarPath(pathname)) {
    return '/api/admin/me/avatar';
  }

  if (shouldAlwaysProxyToChat(pathname, req)) {
    return pathname;
  }

  if (pathname.startsWith('/chat-api/')) {
    return `/api/${pathname.slice('/chat-api/'.length)}`;
  }
  if (pathname === '/chat-api') {
    return '/api';
  }

  if (pathname.startsWith('/chat-admin/admin/')) {
    return `/api/admin/${pathname.slice('/chat-admin/admin/'.length)}`;
  }

  if (shouldProxySocketToChat(pathname, req)) {
    // Pathname only — proxyOnce appends ?query from req.url (avoid duplicated EIO params)
    return rewriteSocketUrlForChat(pathname);
  }

  // Legacy conditional paths (rooms, stats, agents, …)
  if (isChatDirectAdminPath(pathname, req)) {
    return pathname;
  }

  if (pathname.startsWith('/api/knowledge')) {
    return pathname;
  }
  if (pathname.startsWith('/api/upload/')) {
    return pathname;
  }
  if (isChatOrdersPath(pathname, req)) {
    return pathname;
  }

  return null;
}

function shouldUseDirectChatBase(pathname, req) {
  return (
    isAbsoluteChatProxyPath(pathname, req) ||
    isAvatarPath(pathname) ||
    shouldAlwaysProxyToChat(pathname, req) ||
    pathname.startsWith('/api/chat-admin/')
  );
}

function pickStreamRequestHeaders(reqHeaders, targetHost) {
  const headers = {};
  for (const [key, value] of Object.entries(reqHeaders || {})) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    headers[key] = value;
  }
  headers.host = targetHost;
  applyPreservedAuthHeaders(headers, reqHeaders);
  return headers;
}

function pickProxyRequestHeaders(reqHeaders, targetHost, { stream = false } = {}) {
  if (stream) {
    return pickStreamRequestHeaders(reqHeaders, targetHost);
  }
  const headers = {};
  for (const [key, value] of Object.entries(reqHeaders || {})) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    headers[key] = value;
  }
  headers.host = targetHost;
  applyPreservedAuthHeaders(headers, reqHeaders);
  return headers;
}

function pickProxyResponseHeaders(resHeaders) {
  const headers = {};
  for (const [key, value] of Object.entries(resHeaders || {})) {
    if (value === undefined || HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers[key] = value;
  }
  return headers;
}

function pingChatBase(baseUrl) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL('/health', `${baseUrl.replace(/\/$/, '')}/`);
    } catch {
      resolve(false);
      return;
    }

    const isHttps = target.protocol === 'https:';
    const transport = isHttps ? https : http;

    const req = transport.request(
      {
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: target.pathname,
        method: 'GET',
        timeout: 2500,
        family: target.hostname === 'localhost' ? 4 : undefined,
      },
      (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 300);
        res.resume();
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function resolveChatBaseUrl() {
  if (cachedChatBase && Date.now() < cacheExpiresAt) {
    return cachedChatBase;
  }

  const candidates = getChatServiceBaseUrls();
  for (const base of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await pingChatBase(base)) {
      cachedChatBase = base.replace(/\/$/, '');
      cacheExpiresAt = Date.now() + HEALTH_CACHE_MS;
      return cachedChatBase;
    }
  }

  return CHAT_DIRECT_BASE;
}

function invalidateChatBaseCache() {
  cachedChatBase = null;
  cacheExpiresAt = 0;
}

function proxyTimeoutForPath(pathname) {
  return isChatSocketPath(pathname) || isStoreSocketIoPath(pathname)
    ? CHAT_SOCKET_PROXY_TIMEOUT_MS
    : PROXY_STREAM_TIMEOUT_MS;
}

/**
 * Raw multipart stream proxy — parseReqBody: false equivalent.
 * Pipes the incoming request directly to chat :5001 without buffering.
 */
function proxyStreamOnce(baseUrl, apiPath, req, res) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      target = new URL(`${apiPath}${query}`, `${baseUrl.replace(/\/$/, '')}/`);
    } catch (err) {
      reject(err);
      return;
    }

    const isHttps = target.protocol === 'https:';
    const transport = isHttps ? https : http;
    const headers = pickStreamRequestHeaders(req.headers, target.host);

    let settled = false;
    let proxyReq = null;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    const abortUpstream = (reason) => {
      if (proxyReq && !proxyReq.destroyed) {
        proxyReq.destroy(reason);
      }
    };

    const timeoutMs = proxyTimeoutForPath(apiPath);
    const proxyOptions = {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
      family: target.hostname === '127.0.0.1' || target.hostname === 'localhost' ? 4 : undefined,
      timeout: timeoutMs,
    };

    proxyReq = transport.request(proxyOptions, (proxyRes) => {
      if (res.headersSent) {
        proxyRes.resume();
        finish();
        return;
      }

      res.writeHead(
        proxyRes.statusCode,
        pickProxyResponseHeaders(proxyRes.headers)
      );

      proxyRes.on('error', (err) => {
        if (!res.writableEnded) {
          res.destroy(err);
        }
        finish(err);
      });

      proxyRes.pipe(res);
      proxyRes.on('end', () => finish());
    });

    proxyReq.setTimeout(timeoutMs, () => {
      const err = new Error(`Chat proxy timeout after ${timeoutMs}ms`);
      err.code = 'ETIMEDOUT';
      err._chatTarget = target.href;
      abortUpstream(err);
      finish(err);
    });

    proxyReq.on('error', (err) => {
      err._chatTarget = target.href;
      finish(err);
    });

    req.on('aborted', () => {
      abortUpstream(new Error('Client aborted upload'));
    });

    req.on('error', (err) => {
      abortUpstream(err);
      finish(err);
    });

    // Do NOT destroy the upstream on res.close while the client body may still
    // be streaming — that caused ERR_CONNECTION_RESET on multipart uploads.
    req.on('close', () => {
      if (!req.complete) {
        abortUpstream(new Error('Client connection closed before upload finished'));
      }
    });

    proxyReq.on('close', () => {
      if (!settled) finish();
    });

    // Stream raw body immediately — no buffering, no body-parser
    if (req.readableEnded) {
      proxyReq.end();
    } else {
      req.pipe(proxyReq, { end: true });
    }
  });
}

function proxyOnce(baseUrl, apiPath, req, res, { stream = false } = {}) {
  if (stream) {
    return proxyStreamOnce(baseUrl, apiPath, req, res);
  }

  return new Promise((resolve, reject) => {
    let target;
    try {
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      target = new URL(`${apiPath}${query}`, `${baseUrl.replace(/\/$/, '')}/`);
    } catch (err) {
      reject(err);
      return;
    }

    const isHttps = target.protocol === 'https:';
    const transport = isHttps ? https : http;
    const headers = pickProxyRequestHeaders(req.headers, target.host, { stream });

    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    const timeoutMs = proxyTimeoutForPath(apiPath);
    const proxyReq = transport.request(
      {
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers,
        family: target.hostname === '127.0.0.1' || target.hostname === 'localhost' ? 4 : undefined,
        timeout: timeoutMs,
      },
      (proxyRes) => {
        if (res.headersSent) {
          proxyRes.resume();
          finish();
          return;
        }

        res.writeHead(
          proxyRes.statusCode,
          pickProxyResponseHeaders(proxyRes.headers)
        );
        proxyRes.pipe(res);
        proxyRes.on('error', finish);
        proxyRes.on('end', () => finish());
      }
    );

    proxyReq.setTimeout(timeoutMs, () => {
      const err = new Error(`Chat proxy timeout after ${timeoutMs}ms`);
      err.code = 'ETIMEDOUT';
      err._chatTarget = target.href;
      proxyReq.destroy(err);
      finish(err);
    });

    proxyReq.on('error', (err) => {
      err._chatTarget = target.href;
      finish(err);
    });

    req.on('aborted', () => {
      proxyReq.destroy();
    });
    req.on('error', (err) => {
      proxyReq.destroy(err);
    });
    res.on('close', () => {
      if (!res.writableFinished) {
        proxyReq.destroy();
      }
    });

    req.pipe(proxyReq, { end: true });
  });
}

function handleProxyError(req, res, pathname, base, err) {
  if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
    invalidateChatBaseCache();
  }

  console.error(
    '[chatApiProxy]',
    req.method,
    pathname,
    '→',
    err._chatTarget || base,
    err.code || err.message
  );

  if (!res.headersSent) {
    const isUpload = isAvatarUpload(req, pathname);
    res.status(isUpload && err.code === 'ETIMEDOUT' ? 504 : 503).json({
      success: false,
      code: err.code || 'CHAT_SERVICE_UNAVAILABLE',
      message: isUpload
        ? 'Avatar upload failed — chat service unreachable or upload timed out'
        : 'Chat microservice is not running. Start it with: npm run dev:chat',
      hint: `No listener on port ${CHAT_PORT}. Run: cd ecommerce-chat && npm run dev`,
      path: pathname,
    });
  }
}

function markProxyRequest(req, pathname) {
  req._chatProxyHandled = true;
  // parseReqBody: false — tell downstream middleware not to consume the body
  req._chatProxySkipBodyParse = true;
  if (isAvatarUpload(req, pathname)) {
    req._chatAvatarStreamProxy = true;
  }
}

function forwardAvatarStream(req, res, pathname) {
  markProxyRequest(req, pathname);
  const apiPath = '/api/admin/me/avatar';
  proxyStreamOnce(CHAT_DIRECT_BASE, apiPath, req, res).catch((err) => {
    handleProxyError(req, res, pathname, CHAT_DIRECT_BASE, err);
  });
}

function forwardAvatarJson(req, res, pathname) {
  markProxyRequest(req, pathname);
  forwardToChatServiceDirect(req, res, '/api/admin/me/avatar', pathname);
}

/** Fast path: stream directly to 127.0.0.1:5001 with no health-check delay. */
function forwardToChatServiceDirect(req, res, apiPath, pathname) {
  const method = String(req.method || 'GET').toUpperCase();
  const stream = isAvatarPath(pathname) && method === 'POST';
  const base = CHAT_DIRECT_BASE;

  const run = stream ? proxyStreamOnce : proxyOnce;
  run(base, apiPath, req, res, stream ? undefined : { stream: false }).catch((err) => {
    handleProxyError(req, res, pathname, base, err);
  });
}

async function forwardToChatService(req, res, apiPath, pathname) {
  const base = await resolveChatBaseUrl();

  try {
    await proxyOnce(base, apiPath, req, res, {
      stream: isAvatarUpload(req, pathname),
    });
  } catch (err) {
    handleProxyError(req, res, pathname, base, err);
  }
}

function mountChatServiceProxy(app) {
  // Chat API — single early handler; always direct to 127.0.0.1:5001 for absolute paths
  app.use((req, res, next) => {
    const pathname = requestPathname(req);
    const apiPath = mapToChatApiPath(pathname, req);
    if (!apiPath) return next();

    markProxyRequest(req, pathname);

    const method = String(req.method || 'GET').toUpperCase();

    // Multipart avatar POST must stream before express.json() / multer
    if (isAvatarPath(pathname) && method === 'POST') {
      forwardAvatarStream(req, res, pathname);
      return;
    }

    // All other chat paths — fast path to :5001 (no health-check delay)
    forwardToChatServiceDirect(req, res, apiPath, pathname);
  });
}

function isBenignSocketError(err) {
  const code = err?.code || '';
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNABORTED' ||
    code === 'EPIPE' ||
    code === 'ERR_STREAM_WRITE_AFTER_END'
  );
}

/**
 * Proxy WebSocket upgrades for /chat-socket/* and chat-admin /socket.io/* → ecommerce-chat :5001.
 * Register on the HTTP server BEFORE the main store Socket.IO server.
 */
function mountChatWebSocketProxy(httpServer) {
  if (!httpServer || typeof httpServer.on !== 'function') return;

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = requestPathname(req);
    if (!shouldProxySocketToChat(pathname, req)) return;

    const targetPort = CHAT_PORT;
    const targetHost = '127.0.0.1';
    const proxyPath = `${rewriteSocketUrlForChat(pathname)}${
      req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    }`;

    const headers = { ...req.headers, host: `${targetHost}:${targetPort}` };
    applyPreservedAuthHeaders(headers, req.headers);

    const proxyReq = http.request({
      hostname: targetHost,
      port: targetPort,
      path: proxyPath,
      method: req.method,
      headers,
      family: 4,
    });

    const destroyBoth = (err) => {
      if (err && !isBenignSocketError(err)) {
        console.warn(
          '[chatApiProxy] WS',
          pathname,
          '→',
          `${targetHost}:${targetPort}`,
          err.code || err.message
        );
      }
      if (!socket.destroyed) socket.destroy();
      if (!proxyReq.destroyed) proxyReq.destroy();
    };

    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      try {
        const statusLine = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
        const headerBlock = Object.entries(proxyRes.headers)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) =>
            Array.isArray(value)
              ? value.map((v) => `${key}: ${v}`).join('\r\n')
              : `${key}: ${value}`
          )
          .join('\r\n');
        socket.write(`${statusLine}${headerBlock}\r\n\r\n`);
        if (proxyHead?.length) proxySocket.unshift(proxyHead);
        if (head?.length) proxySocket.unshift(head);
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
        proxySocket.on('error', destroyBoth);
        socket.on('error', destroyBoth);
      } catch (err) {
        destroyBoth(err);
      }
    });

    proxyReq.on('error', destroyBoth);
    proxyReq.on('response', (res) => {
      // Non-upgrade response (shouldn't happen for WS) — drain and close
      if (res.statusCode !== 101) {
        res.resume();
        destroyBoth();
      }
    });

    // Do not pass client head as request body — forward after 101 upgrade instead
    proxyReq.end();
  });

  console.log(
    `💬 Chat WebSocket proxy: /chat-socket/* + chat-admin /socket.io/* → ${CHAT_DIRECT_BASE}/chat-socket/*`
  );
}

function logChatProxyConfig() {
  const bases = getChatServiceBaseUrls();
  console.log(
    `💬 Chat API proxy targets: ${bases.join(' | ')} (direct stream: ${CHAT_DIRECT_BASE})`
  );
}

module.exports = {
  mountChatServiceProxy,
  mountChatWebSocketProxy,
  mapToChatApiPath,
  isChatDirectAdminPath,
  isChatAdminRequest,
  isStoreAdminRequest,
  isAvatarUpload,
  isAvatarPath,
  isAbsoluteChatProxyPath,
  isChatCustomerPath,
  isChatCustomerDetailPath,
  isChatProxyCustomersPath,
  isChatProxyOrdersPath,
  isChatSocketPath,
  shouldProxySocketToChat,
  rewriteSocketUrlForChat,
  shouldAlwaysProxyToChat,
  isChatOrdersPath,
  getChatServiceBaseUrls,
  logChatProxyConfig,
  proxyStreamOnce,
  PROXY_STREAM_TIMEOUT_MS,
  invalidateChatBaseCache,
};

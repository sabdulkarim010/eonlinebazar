/**
 * Reverse-proxy chat microservice HTTP API through the main store backend.
 * Must be mounted BEFORE express.json() so multipart uploads stream through.
 *
 * Incoming paths → chat service (port 5001):
 *   /api/chat-admin/*              → /api/*  (dashboard namespace, always chat)
 *   /api/admin/me/avatar           → /api/admin/me/avatar (raw multipart stream)
 *   /api/admin/customers*          → chat CRM by default; store-admin referer
 *                                    (/admin) falls through to main backend
 *   /chat-api/*                    → /api/*
 *   /chat-admin/admin/*            → /api/admin/*
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const CHAT_PORT = Number(process.env.CHAT_SERVICE_PORT || 5001);
const CHAT_DIRECT_BASE = `http://127.0.0.1:${CHAT_PORT}`;
const HEALTH_CACHE_MS = 15_000;
/** Avatar / multipart stream proxy — equivalent to proxyTimeout + timeout in http-proxy-middleware */
const PROXY_STREAM_TIMEOUT_MS = Number(process.env.CHAT_PROXY_TIMEOUT_MS || 30_000);

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

/** Never rewrite — forward as-is to preserve multipart boundary. */
const STREAM_PRESERVE_HEADERS = new Set([
  'content-type',
  'content-length',
  'authorization',
  'cookie',
]);

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

function isAvatarUpload(req, pathname) {
  return (
    req.method === 'POST' &&
    (pathname === '/api/admin/me/avatar' ||
      pathname.startsWith('/api/chat-admin/admin/me/avatar'))
  );
}

/**
 * Chat CRM customer routes.
 *   - /api/chat-admin/admin/customers/*  → always chat (namespaced).
 *   - /api/admin/customers/*             → chat by DEFAULT, so the dashboard
 *     works even when it calls the bare path; falls through to the main
 *     backend only when the request is a positive store-admin request.
 */
function isChatCustomerPath(pathname, req) {
  if (pathname.startsWith('/api/chat-admin/admin/customers')) {
    return true;
  }
  if (matchesPrefix(pathname, '/api/admin/customers')) {
    return !isStoreAdminRequest(req);
  }
  return false;
}

function isChatDirectAdminPath(pathname, req) {
  if (!pathname) return false;

  if (isAvatarUpload({ method: 'POST' }, pathname)) {
    return true;
  }

  if (isChatCustomerPath(pathname, req)) {
    return true;
  }

  return CHAT_DIRECT_ADMIN_PREFIXES.some((prefix) =>
    matchesPrefix(pathname, prefix)
  );
}

function mapToChatApiPath(pathname, req) {
  if (!pathname) return null;

  // Primary chat admin namespace — includes /api/chat-admin/admin/customers/*
  if (pathname.startsWith('/api/chat-admin/')) {
    return `/api/${pathname.slice('/api/chat-admin/'.length)}`;
  }
  if (pathname === '/api/chat-admin') {
    return '/api';
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

  if (isChatDirectAdminPath(pathname, req)) {
    return pathname;
  }

  if (pathname.startsWith('/api/knowledge')) {
    return pathname;
  }
  if (pathname.startsWith('/api/upload/')) {
    return pathname;
  }
  if (/^\/api\/orders\/[^/]+$/.test(pathname)) {
    return pathname;
  }

  return null;
}

function shouldUseDirectChatBase(pathname, req) {
  return (
    isAvatarUpload(req, pathname) ||
    isChatCustomerPath(pathname, req) ||
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
  // Preserve multipart boundary exactly (lowercase keys on Node IncomingMessage)
  for (const name of STREAM_PRESERVE_HEADERS) {
    const value = reqHeaders[name];
    if (value !== undefined) {
      headers[name] = value;
    }
  }
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

    const proxyOptions = {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
      family: target.hostname === '127.0.0.1' || target.hostname === 'localhost' ? 4 : undefined,
      timeout: PROXY_STREAM_TIMEOUT_MS,
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

    proxyReq.setTimeout(PROXY_STREAM_TIMEOUT_MS, () => {
      const err = new Error(`Chat proxy timeout after ${PROXY_STREAM_TIMEOUT_MS}ms`);
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

    const proxyReq = transport.request(
      {
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers,
        family: target.hostname === '127.0.0.1' || target.hostname === 'localhost' ? 4 : undefined,
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

/** Fast path: stream directly to 127.0.0.1:5001 with no health-check delay. */
function forwardToChatServiceDirect(req, res, apiPath, pathname) {
  const stream = isAvatarUpload(req, pathname);
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
  // Dedicated avatar stream handler — highest priority, no body parsing
  app.post('/api/admin/me/avatar', (req, res) => {
    forwardAvatarStream(req, res, '/api/admin/me/avatar');
  });

  app.post('/api/chat-admin/admin/me/avatar', (req, res) => {
    forwardAvatarStream(req, res, '/api/chat-admin/admin/me/avatar');
  });

  app.use((req, res, next) => {
    const pathname = requestPathname(req);
    const apiPath = mapToChatApiPath(pathname, req);
    if (!apiPath) return next();

    markProxyRequest(req, pathname);

    if (shouldUseDirectChatBase(pathname, req)) {
      forwardToChatServiceDirect(req, res, apiPath, pathname);
      return;
    }

    forwardToChatService(req, res, apiPath, pathname).catch((err) => {
      console.error('[chatApiProxy] unexpected error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Chat proxy internal error',
        });
      }
    });
  });
}

function logChatProxyConfig() {
  const bases = getChatServiceBaseUrls();
  console.log(
    `💬 Chat API proxy targets: ${bases.join(' | ')} (direct stream: ${CHAT_DIRECT_BASE})`
  );
}

module.exports = {
  mountChatServiceProxy,
  mapToChatApiPath,
  isChatDirectAdminPath,
  isChatAdminRequest,
  isStoreAdminRequest,
  isAvatarUpload,
  isChatCustomerPath,
  getChatServiceBaseUrls,
  logChatProxyConfig,
  proxyStreamOnce,
  PROXY_STREAM_TIMEOUT_MS,
  invalidateChatBaseCache,
};

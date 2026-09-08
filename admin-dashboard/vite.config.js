import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const CHAT_SERVICE_TARGET = 'http://127.0.0.1:5001';

/** Benign when chat :5001 restarts or the browser aborts an in-flight WS upgrade. */
function isBenignProxyError(err) {
  const code = err?.code || '';
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNABORTED' ||
    code === 'EPIPE' ||
    code === 'ERR_STREAM_WRITE_AFTER_END'
  );
}

/** Forward auth headers and swallow noisy proxy/WS abort errors. */
function configureChatProxy(proxy) {
  proxy.on('proxyReq', (proxyReq, req) => {
    const auth = req.headers.authorization || req.headers.Authorization;
    if (auth) {
      proxyReq.setHeader('Authorization', auth);
    }
    const cookie = req.headers.cookie || req.headers.Cookie;
    if (cookie) {
      proxyReq.setHeader('Cookie', cookie);
    }
    const chatAdmin = req.headers['x-chat-admin'] || req.headers['X-Chat-Admin'];
    if (chatAdmin) {
      proxyReq.setHeader('X-Chat-Admin', chatAdmin);
    }
  });

  proxy.on('error', (err, _req, res) => {
    if (isBenignProxyError(err)) return;
    if (res && !res.headersSent && typeof res.writeHead === 'function') {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Chat proxy error' }));
    }
  });

  proxy.on('close', (_res, _socket, _head) => {
    /* ignore — client navigated away mid-request */
  });
}

/**
 * Proxy to ecommerce-chat :5001.
 * @param {((path: string) => string) | undefined} rewrite - optional path rewrite only for namespace prefixes
 * @param {{ ws?: boolean }} [options]
 */
function chatServiceProxy(rewrite, options = {}) {
  return {
    target: CHAT_SERVICE_TARGET,
    changeOrigin: true,
    ws: Boolean(options.ws),
    ...(rewrite ? { rewrite } : {}),
    configure: configureChatProxy,
  };
}

export default defineConfig({
  base: '/chat-admin/',
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      // /api/chat-admin/admin/rooms → http://127.0.0.1:5001/api/admin/rooms
      '/api/chat-admin': chatServiceProxy((path) =>
        path.replace(/^\/api\/chat-admin/, '/api')
      ),
      // Preserve full path: /api/admin/me/avatar → :5001/api/admin/me/avatar
      '/api/admin/me/avatar': chatServiceProxy(),
      // Preserve full path: /api/admin/customers/:id → :5001/api/admin/customers/:id
      '/api/admin/customers': chatServiceProxy(),
      // Chat CRM order lookup (CustomerContext sidebar)
      '/api/admin/orders': chatServiceProxy(),
      '/api/chat-admin/orders': chatServiceProxy((path) =>
        path.replace(/^\/api\/chat-admin/, '/api')
      ),
      '/chat-api': chatServiceProxy((path) => path.replace(/^\/chat-api/, '/api')),
      // Chat-admin Socket.io on :5000 /socket.io → chat :5001 /chat-socket/socket.io
      '/socket.io': chatServiceProxy(
        (path) => path.replace(/^\/socket.io/, '/chat-socket/socket.io'),
        { ws: true }
      ),
      '/chat-socket': chatServiceProxy(undefined, { ws: true }),
    },
  },
});

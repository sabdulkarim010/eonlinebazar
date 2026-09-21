# Nginx WebSocket Fix — Store Admin Socket.IO (`/socket.io/`)

**Issue:** Admin panel realtime (Socket.IO namespace `/admin`) connects on the default path `/socket.io/`. Production Nginx proxies chat WebSocket at `/chat-socket/socket.io/` with `Upgrade` headers, but the main store `location /` block does **not** — causing connection timeout / xhr poll errors in the browser console.

**Apply on server:** `/etc/nginx/sites-available/eonlinebazar` (or the active site file that proxies to `:5000`).  
**Do not** rely on repo `devops/nginx.conf` alone — that file is a reference; production must be updated on the droplet.

---

## 1. Add dedicated Socket.IO location (before `location /`)

Insert **above** the catch-all `location / { proxy_pass http://localhost:5000; ... }` block:

```nginx
    # Store admin + storefront Socket.IO (Node :5000)
    location /socket.io/ {
        proxy_pass http://localhost:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
```

This mirrors the existing chat block at `/chat-socket/socket.io/` → `:5001`.

---

## 2. Test and reload

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 3. Verify

1. Open admin panel → DevTools → Network → filter `socket.io`.
2. Confirm WebSocket (or long-polling) requests to `https://eonlinebazar.com/socket.io/?EIO=...` return **101 Switching Protocols** or **200** (polling), not pending forever.
3. Console should show `[Socket] Admin connected` (green status briefly in `core-realtime.js`).

---

## 4. Optional — explicit client path (code already correct)

Admin client: `io('/admin', { auth: { token } })` in `client/js/admin/modules/core-realtime.js` — uses default `/socket.io/` path. No code change required once Nginx is fixed.

---

## 5. Rollback

Remove the `location /socket.io/` block and reload Nginx. Admin realtime toasts will stop working but REST API is unaffected.

**Last updated:** 2026-09-21

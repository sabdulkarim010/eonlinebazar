# EonlineBazar — Private Admin Notes & Roadmap

## To-Do List

- [ ] Note down feature ideas here…

## Important Reminders

- Shared secrets (`JWT_SECRET`, `INTERNAL_API_KEY`, Cloudinary) belong in **repo-root `.env`** only.
- Chat microservice: `npm run dev:chat` (port 5001). Store gateway: `npm run dev:store` (port 5000).
- Admin dashboard local dev: Vite on `:3000` or built SPA at `http://localhost:5000/chat-admin`.
- Rebuild chat-admin after env changes: `cd admin-dashboard && npm run build`, then copy `dist/` → `backend/public/chat-admin/`.

## Chat env quick reference

| Variable | Where |
|----------|--------|
| `CHAT_SERVICE_URL` / `CHAT_SERVICE_PORT` | repo-root `.env` |
| `INTERNAL_API_KEY` | repo-root `.env` (same value chat service reads via loadEnv) |
| `MAIN_STORE_API_URL`, `SOCKET_CORS_ORIGIN` | `ecommerce-chat/.env` |
| `VITE_API_URL`, `VITE_SOCKET_URL` | `admin-dashboard/.env` (use `:5000` for gateway) |










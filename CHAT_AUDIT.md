# Live Chat Close / End Session Audit

**Date:** 2026-08-25  
**Scope:** Customer widget, Staff/Admin dashboard, and backend socket teardown  
**Status:** Audit only — no fix code in this pass

---

## 1. Summary

Closing or ending a live chat currently fails on two independent axes:

1. **Alerts** — close/end confirmation uses the browser’s native `confirm()`, not SweetAlert2 (`Swal.fire`).
2. **Session / UI teardown** — confirming close does **not** hide the customer widget or mark the room resolved. Staff/Admin “Resolve” updates status locally but never deselects the open chat window, never leaves the socket room, and never waits for a server ack.

Staff (`AGENT`) and Admin (`ADMIN` / `SUPER_ADMIN`) share the same dashboard UI and the same `resolve_chat` socket path. There is no role-specific close handler.

---

## 2. File locations that trigger default browser alerts

These are the **chat close / end / resolve** paths only. Other `window.confirm` calls (logout, settings, file manager, etc.) are listed at the end as out of scope.

| Role | File | Line | Trigger | Dialog |
|------|------|------|---------|--------|
| **Customer** | `ecommerce-chat/public/js/chat-widget.js` | `closeWidget()` ~381–393 | Header **×** (`#cw-close-btn`) | `global.confirm('End this chat?')` |
| **Staff / Admin** | `admin-dashboard/src/components/ChatWindow.jsx` | `handleResolve()` ~228–243 | **Resolve** button (visible when `room.status === 'ACTIVE'`) | `window.confirm('Resolve this chat?')` |

Public API alias: `ChatWidget.close` is bound to the same `closeWidget` function (`ecommerce-chat/public/js/chat-widget.js` ~1438).

### Why SweetAlert2 is not used today

| Surface | SweetAlert2 present? | What the chat code uses |
|---------|----------------------|-------------------------|
| Profile (`client/profile/partials/scripts.html`) | Yes — CDN `sweetalert2@11` | Widget ignores `window.Swal` |
| Order details (`client/order-details.html`) | Yes | Same |
| Widget demo (`ecommerce-chat/public/chat-widget.html`) | **No** | Native `confirm()` |
| Chat admin dashboard (`admin-dashboard/`) | **No** — only `react-hot-toast` | Native `confirm()` |

`client/js/orderChat.js` already uses `Swal.fire` for **start-chat errors** (~206–216), so the storefront pattern exists. The widget close path never follows it.

---

## 3. Current flow by role

### 3.1 Customer (storefront widget)

**Entry points**

- Profile Live Support → `OrderChat.openGeneral()` (`client/js/profile/tabs.js`, `client/js/orderChat.js`)
- Order details → `OrderChat.openForOrder()` / `openFromButton()`
- Widget header: **−** = minimize, **×** = close/end

**Close (×) — actual behavior**

```
#cw-close-btn click
  → closeWidget()
      → window.confirm('End this chat?')
      → OK  → startNewChat()
      → Cancel → minimizeWidget()   // hide panel, show bubble
```

`startNewChat()` (~395–424):

1. Deletes `localStorage` key `cw_room_id_<type>` (and legacy `cw_room_id`).
2. Nulls `state.roomId` in memory only.
3. Clears the message DOM.
4. Calls `minimizeWidget()`.
5. Immediately runs `bootstrap()` then **`openWidget()`**.

`bootstrap()` (~1238–1294) then:

1. Reconnects the `/customer` socket (`initSocket` disconnects + reconnects).
2. Calls `POST /api/chat/start`.
3. Re-joins the room.

**Minimize (−)** only toggles CSS (`#cw-container.cw-open` removed, `#cw-bubble.cw-hidden` removed). Socket and room stay alive. That path is fine for “hide panel”.

**Agent-resolved customer path** (`chat_resolved` ~1107–1113): sets `state.resolved = true`, shows CSAT, disables input. Does **not** hide the panel, leave the room, or disconnect.

### 3.2 Staff / Admin (React chat dashboard)

**Entry:** `admin-dashboard/src/pages/DashboardPage.jsx` mounts `ChatWindow` and `connectSocket()` to namespace `/admin`.

**Resolve — actual behavior** (`ChatWindow.jsx` `handleResolve`):

```
Resolve click
  → window.confirm('Resolve this chat?')
  → socket.emit('resolve_chat', { room_id })
  → optimistic updateRoomStatus(RESOLVED) + toast
  → ChatWindow stays mounted on the same activeRoomId
```

`admin-dashboard/src/services/socket.js` listens for `chat_resolved` (~177–189) and patches the Zustand store. It does **not** call `setActiveRoom(null)`, switch `mobileView` back to `'list'`, or emit `leave_room`.

Roles `AGENT`, `ADMIN`, and `SUPER_ADMIN` all use this same button. There is no Staff-only vs Admin-only close path.

### 3.3 Backend (`ecommerce-chat/socket/chat.socket.js`)

| Event | Namespace | Who may emit | Effect |
|-------|-----------|--------------|--------|
| `resolve_chat` | `/admin` only | Authenticated agent | Sets room `status = 'RESOLVED'`, system message, `$pull` from `agent.active_chats`, emits `chat_resolved` + `new_message` to `/customer` room and `/admin` |
| `join_room` | `/customer`, `/admin` | Guest (ownership-checked) / agent | `socket.join(room_id)` |
| `end_chat` / `leave_room` / `close_session` | **none** | — | **Not implemented** |
| Customer `disconnect` | `/customer` | automatic | Clears typing timer only. Room status unchanged |

There is also **no REST resolve/end endpoint** in `ecommerce-chat/routes/chat.routes.js`. Teardown is socket-only and admin-only.

`POST /api/chat/start` (`chat.routes.js` ~93–122) reuses any room with status in `['BOT', 'WAITING_FOR_AGENT', 'ACTIVE']` for the same `guest_session_id` / `user_id` / `type` / `order_id`. A locally “ended” chat that was never resolved is therefore returned as the same session.

---

## 4. Root causes (why the widget / session does not close)

### RC-1 — Confirming customer close **re-opens** the widget

`closeWidget()` treats “End this chat?” OK as `startNewChat()`, and `startNewChat()` always calls `openWidget()` after bootstrap.

So the × button cannot hide the panel. The user sees: native confirm → panel briefly minimizes → panel comes back with a (usually identical) conversation.

`ChatWidget.destroy()` (~1416–1432) **does** remove `#cw-bubble` / `#cw-container` and disconnect the socket. Close never calls it.

### RC-2 — Customer close never tells the server to end the room

Customer `closeWidget` / `startNewChat` do **not** emit any of:

- `resolve_chat` (admin-only; customer would be ignored even if emitted)
- `leave_room`
- `end_chat`
- `socket.leave(...)` (never used anywhere in the repo)

They also keep `localStorage` key `cw_guest_session_id`. Combined with RC-3, the “new” chat is the old room.

### RC-3 — `/api/chat/start` resurrects the open room

After localStorage `cw_room_id_*` is cleared, `startChat()` still posts the same `guest_session_id`. The API returns `is_existing: true` for any non-`RESOLVED` room. Result: end-chat is a UI flicker, not a new session, and Staff/Admin still see the room as `BOT` / `WAITING_FOR_AGENT` / `ACTIVE`.

### RC-4 — No customer-side end/leave socket listener

Even if the widget emitted `end_chat` today, `chat.socket.js` has nothing to handle it. Only `/admin` `resolve_chat` can set `RESOLVED`. Customers cannot terminate a session by design of the current server.

### RC-5 — Staff/Admin Resolve does not close the chat pane

After a successful (or optimistic) resolve:

- `activeRoomId` stays set → `ChatWindow` keeps rendering that room (`DashboardPage.jsx` ~163–171).
- Desktop always shows the center pane; mobile stays on `mobileView: 'chat'`.
- Composer hides because `canReply` requires `ACTIVE` (~194, ~567), so the window looks “stuck” on a dead session rather than returning to the list / empty state.
- Socket remains joined; there is no `socket.leave(room_id)`.

Optimistic `updateRoomStatus` + toast run **before** any server ack. If the socket emit fails after `connected` is true, the UI can show RESOLVED while Mongo still has `ACTIVE`.

### RC-6 — `resolve_chat` has no assignment / ack contract

`resolve_chat` (~926–983) does not check that `socket.data.agent` is `assigned_agent_id`. It does not emit a dedicated `resolve_chat_ok` / `resolve_chat_failed` to the caller (unlike `take_chat` → `take_chat_failed`). The client cannot wait for teardown before closing the pane.

### RC-7 — Native `confirm()` is synchronous; SweetAlert2 is not

Replacing `confirm()` with `Swal.fire` requires making `closeWidget` / `handleResolve` **async** and branching on `result.isConfirmed`. A naive swap that still calls `confirm()` as a fallback will keep the reported bug.

### RC-8 — Widget z-index would hide SweetAlert2 unless raised

`#cw-bubble` uses `z-index: 2147483647` and `#cw-container` uses `2147483646` (`ecommerce-chat/public/css/chat-widget.css`). SweetAlert2’s default container z-index is ~1060. Native `confirm()` sits in browser chrome, so it appears on top. A default `Swal.fire` on the storefront would render **behind** the widget unless `zIndex` (or equivalent) is set above the widget.

Admin dashboard ChatWindow is normal stacking context; Swal z-index is not a problem there.

### RC-9 — CSS hide classes are not the primary bug

`#cw-container.cw-open` and `#cw-bubble.cw-hidden` correctly show/hide. `minimizeWidget()` works. The failure is control flow (`openWidget()` after end) plus missing server teardown — not a broken CSS toggle.

---

## 5. Sequence diagrams (current vs intended)

### Customer × (current)

```
User clicks ×
  → native confirm
  → startNewChat()
  → clear local room id (keep guest session)
  → minimize (1 frame)
  → bootstrap() → POST /chat/start → same OPEN room
  → join_room
  → openWidget()     // panel visible again
Server room status: unchanged
Admin list: still live
```

### Customer × (intended)

```
User clicks ×
  → Swal.fire (z-index above widget)
  → Cancel: minimizeWidget() only
  → Confirm:
       emitTypingStop()
       emit customer end_chat { room_id, guest_session_id }
       wait for ack (or timeout)
       socket.leave / disconnect as designed
       clear cw_room_id_* (keep or rotate guest id per product choice)
       hide panel (minimize or destroy); do NOT openWidget()
Server: status RESOLVED (or equivalent), notify /admin
Admin: room leaves ACTIVE/WAITING, pane closes if that room was open
```

### Staff/Admin Resolve (current)

```
Agent clicks Resolve
  → native confirm
  → emit resolve_chat (no ack)
  → optimistic RESOLVED
  → ChatWindow stays on that room
```

### Staff/Admin Resolve (intended)

```
Agent clicks Resolve
  → Swal.fire
  → emit resolve_chat
  → on chat_resolved for that room_id (or ack):
       leave room
       setActiveRoom(null) + mobileView 'list'
       toast success
  → customer widget: existing chat_resolved → CSAT (keep panel for rating; do not auto-destroy until rated or timed out)
```

---

## 6. Step-by-step fix plan (no code in this audit)

Do this in order. Do not ship widget UI changes without the customer socket event, or `/api/chat/start` will undo the close.

### Step 1 — Add a customer end-session socket contract

**File:** `ecommerce-chat/socket/chat.socket.js` (`/customer` namespace)

1. Add `socket.on('end_chat', …)` (name can be `end_chat` or `leave_room`; pick one and use it on both ends).
2. Auth: reuse `roomOwnedBySocket(room, socket)` — same as `join_room` / `send_message`.
3. If room already `RESOLVED`, ack success (idempotent) and return.
4. Set `status = 'RESOLVED'`, `resolved_at = now`, write a SYSTEM message (customer ended vs agent resolved — distinct copy).
5. If `assigned_agent_id` is set, `$pull` that room from `Agent.active_chats`.
6. `socket.leave(String(room_id))`.
7. Emit to `/customer` room: `chat_resolved` (or `chat_ended`) + `new_message`.
8. Emit to `/admin`: `chat_resolved` with `room` payload (dashboard already listens).
9. Ack the caller: `end_chat_ok` / `end_chat_failed` (mirror `take_chat_failed`).

**Do not** allow customers to emit `resolve_chat` on `/admin`. Keep agent resolve on `/admin`.

### Step 2 — Harden admin `resolve_chat`

**File:** `ecommerce-chat/socket/chat.socket.js`

1. Require `socket.data.agent`.
2. Optionally require assignment (or SUPER_ADMIN override) so random agents cannot resolve others’ ACTIVE rooms — product decision, document it.
3. Emit `resolve_chat_ok` / `resolve_chat_failed` to the requesting socket.
4. After persist, have the resolving socket `leave` the room (and optionally broadcast so other agent tabs leave).

### Step 3 — Customer widget: SweetAlert2 + real close

**File:** `ecommerce-chat/public/js/chat-widget.js`

1. Add a small `confirmEndChat()` helper:
   - If `global.Swal` exists, `await Swal.fire({ icon: 'warning', showCancelButton: true, …, zIndex: 2147483647 })` (or `customClass.container` with a z-index above `#cw-container`).
   - Else dynamically load SweetAlert2 from the same CDN the storefront already uses (`cdn.jsdelivr.net/npm/sweetalert2@11`), then fire.
   - Do **not** call `window.confirm` except as a last-resort fallback if the CDN fails.
2. Make `closeWidget` **async**.
3. **Cancel** → `minimizeWidget()` only (current Cancel behavior).
4. **Confirm** → new `endAndHideSession()` (do **not** call `startNewChat()`):
   - `emitTypingStop()`.
   - If `state.socket` + `state.roomId`, emit `end_chat` and wait for ack (timeout ~5s; still hide UI on timeout, log error).
   - `socket.leave` is server-side; client should `s.off(...)` for that room’s events or disconnect if no other room is kept.
   - Clear `cw_room_id_*`, set `state.roomId = null`, `state.resolved = true`.
   - `minimizeWidget()` **or** hide panel + show bubble. **Never** `openWidget()` in this path.
   - Leave `cw_guest_session_id` unless product wants a brand-new guest identity; if kept, Step 1 + `RESOLVED` status is enough for `/api/chat/start` to create a **new** room on next open.
5. Next bubble click (`openWidget`): if `!state.roomId`, call `bootstrap()` / `startChat()` once, then open. That is how a *new* session starts — not inside close.
6. Keep `startNewChat()` only if product still wants an explicit “new conversation” control; it must run **after** end_chat ack, and must not be wired to ×.

**Files:** `ecommerce-chat/public/chat-widget.html` — add SweetAlert2 script in the demo so local testing matches production.

**CSS (only if needed):** `ecommerce-chat/public/css/chat-widget.css` — a `.swal2-container` z-index rule scoped so host pages are not broken; prefer Swal `zIndex` option first.

### Step 4 — Storefront loader (optional hardening)

**File:** `client/js/orderChat.js`

- After `ensureWidgetScript()`, no change required for close if the widget loads Swal itself.
- If the widget depends on host `window.Swal`, document that profile/order-details already include it; other embed pages must include SweetAlert2 or rely on the widget CDN load.

### Step 5 — Staff/Admin dashboard: SweetAlert2 + pane teardown

**Package:** add `sweetalert2` to `admin-dashboard/package.json` (dashboard has no Swal today).

**File:** `admin-dashboard/src/components/ChatWindow.jsx`

1. Replace `window.confirm('Resolve this chat?')` with `Swal.fire` (warning, cancel, confirm “Resolve”).
2. Make `handleResolve` async.
3. Emit `resolve_chat`; wait for `resolve_chat_ok` **or** `chat_resolved` for `activeRoomId` (one-shot listener, then unsubscribe).
4. On success: `setActiveRoom(null)`, `setMobileView('list')`, toast. Do not optimistic-RESOLVE before ack (or roll back on `resolve_chat_failed`).
5. `socket.emit('leave_room', { room_id })` once Step 2 supports it, or rely on server `leave`.

**File:** `admin-dashboard/src/services/socket.js`

- On `chat_resolved`, if `roomIdOf(payload) === activeRoomId`, clear the active room (same as step 4) so other tabs/agents also close the pane.
- Keep list/status updates already in `updateRoomStatus`.

**File:** `admin-dashboard/src/store/chatStore.js`

- No new store required if `setActiveRoom(null)` is called from the socket handler / ChatWindow.

Staff (`AGENT`) and Admin share this path — one implementation covers both roles.

### Step 6 — Customer `chat_resolved` (agent-ended) vs customer-ended

**File:** `ecommerce-chat/public/js/chat-widget.js` `s.on('chat_resolved')`

- **Agent resolved:** keep CSAT + disabled input (current). Optional: after rating, minimize.
- **Customer self-end:** skip CSAT if the end was local (flag `state.endingSelf`) so the user is not forced to rate a chat they just abandoned — product choice; default recommendation: skip CSAT on self-end, show CSAT on agent resolve only.

### Step 7 — Verify across roles (manual)

| # | Role | Action | Expect |
|---|------|--------|--------|
| 1 | Customer | × → Cancel | Native/Swal cancel; panel hides; bubble shows; room still open on server |
| 2 | Customer | × → Confirm | Swal, not `confirm()`; panel stays hidden; bubble visible; Mongo `RESOLVED`; admin list updates |
| 3 | Customer | Confirm then bubble | New room (`is_existing: false`), new `cw_room_id_*` |
| 4 | Customer | Agent Resolve while widget open | CSAT; input disabled; admin pane closes |
| 5 | AGENT | Resolve | Swal; on ack, empty/list state; customer gets `chat_resolved` |
| 6 | ADMIN / SUPER_ADMIN | Same Resolve | Identical to AGENT |
| 7 | AGENT | Resolve with socket down | Swal still; error toast; room stays ACTIVE; pane stays open |
| 8 | Regression | Minimize − | No Swal; panel hides; session continues |

Use profile Live Support, order-details chat, widget demo on `:5001`, and `admin-dashboard` Vite app. Confirm Swal appears **above** the purple widget (z-index).

### Step 8 — Tests / sockets

- Add a socket unit or integration test for customer `end_chat` ownership (unauthorized guest cannot resolve another session).
- Existing `npm test` at repo root after implementation.

---

## 7. Out of scope (same `confirm()` anti-pattern, not chat close)

Do not treat these as part of this chat-close ticket unless product expands scope:

- `admin-dashboard/src/components/HeaderBar.jsx` ~69 — logout
- `admin-dashboard/src/pages/SettingsPage.jsx` ~579, ~698, ~855 — settings / delete agent
- Storefront admin modules (`settings-security.js`, `settings-2fa.js`, `core-realtime.js`, `admin-staff.js`, etc.)

---

## 8. Files to touch in the implementation pass (preview)

| File | Change type |
|------|-------------|
| `ecommerce-chat/socket/chat.socket.js` | Customer `end_chat` + admin ack/`leave` |
| `ecommerce-chat/public/js/chat-widget.js` | Swal close; stop `startNewChat` on × |
| `ecommerce-chat/public/css/chat-widget.css` | Only if Swal z-index needs a class |
| `ecommerce-chat/public/chat-widget.html` | Load SweetAlert2 on demo |
| `admin-dashboard/package.json` | Add `sweetalert2` |
| `admin-dashboard/src/components/ChatWindow.jsx` | Swal Resolve; close pane on ack |
| `admin-dashboard/src/services/socket.js` | Clear `activeRoomId` on `chat_resolved` |
| `client/js/orderChat.js` | Only if host-side Swal load is required |

Do **not** put chat close logic in `admin-core.js`, `admin.css`, `profile.css`, or `style.css` barrels.

---

## 9. Verdict

| Symptom | Root cause |
|---------|------------|
| Browser `confirm()` instead of SweetAlert2 | Hard-coded `global.confirm` / `window.confirm` in widget close and dashboard Resolve; dashboard has no SweetAlert2 dependency |
| Customer × does not hide the widget | `startNewChat()` → `openWidget()` after confirm |
| Customer × does not end the session | No customer socket end event; `/api/chat/start` returns the still-open room; guest session id reused |
| Staff/Admin Resolve does not hide the chat window | `activeRoomId` never cleared; no `leave_room`; no resolve ack |
| Same bug for Staff and Admin | Shared `ChatWindow` + `/admin` `resolve_chat`; roles do not branch |

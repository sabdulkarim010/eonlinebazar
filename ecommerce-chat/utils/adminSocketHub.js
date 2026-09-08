/**
 * Fan-out admin namespace broadcasts across every Socket.io Server instance
 * (e.g. /chat-socket/socket.io and legacy /socket.io on the same HTTP server).
 */
const ADMIN_ROOM = 'admin_room';

/** @type {import('socket.io').Namespace[]} */
const adminNamespaces = [];

function registerAdminNamespace(adminNs) {
  if (!adminNs || adminNamespaces.includes(adminNs)) return;
  adminNamespaces.push(adminNs);
}

function getAdminNamespaces() {
  return adminNamespaces;
}

function emitAdminAliases(primaryNs, event, payload, ...rest) {
  switch (event) {
    case 'new_message':
      primaryNs.to(ADMIN_ROOM).emit('chat_message', payload, ...rest);
      if (payload?.message?.sender_type === 'AGENT') {
        primaryNs.to(ADMIN_ROOM).emit('admin_message', payload, ...rest);
      }
      break;
    case 'room_updated':
    case 'room_status_changed':
    case 'chat_taken':
    case 'chat_resolved':
    case 'new_handover_request':
    case 'handover_started':
    case 'waiting_for_agent':
      primaryNs.to(ADMIN_ROOM).emit('chat_updated', payload, ...rest);
      break;
    default:
      break;
  }
}

/** Patch namespace .emit so broadcasts target admin_room on every registered path. */
function patchAdminBroadcast(adminNs) {
  const originalEmit = adminNs.emit.bind(adminNs);

  adminNs.emit = (event, payload, ...rest) => {
    for (const ns of adminNamespaces) {
      ns.to(ADMIN_ROOM).emit(event, payload, ...rest);
      emitAdminAliases(ns, event, payload, ...rest);
    }
    return originalEmit(event, payload, ...rest);
  };
}

function broadcastToAdminRoom(event, payload, ...rest) {
  for (const ns of adminNamespaces) {
    ns.to(ADMIN_ROOM).emit(event, payload, ...rest);
    emitAdminAliases(ns, event, payload, ...rest);
  }
}

/** Normalize admin message payload — room_id must be a string for admin-dashboard listeners. */
function normalizeAdminMessagePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const room_id = String(
    payload.room_id ||
      payload.room?._id ||
      payload.room?.id ||
      ''
  );
  return { ...payload, room_id };
}

/**
 * Fan-out customer/agent message to every admin socket path:
 * 1) namespace-wide new_message
 * 2) admin_room chat_message (and admin_message for agent sends)
 */
function broadcastAdminNewMessage(payload) {
  const normalized = normalizeAdminMessagePayload(payload);
  for (const ns of adminNamespaces) {
    // Namespace-wide + admin_room — every connected admin socket must receive USER messages
    const emitAll = ns._originalEmit || ns.emit.bind(ns);
    emitAll('new_message', normalized);
    ns.to(ADMIN_ROOM).emit('chat_message', normalized);
    if (normalized?.message?.sender_type === 'AGENT') {
      ns.to(ADMIN_ROOM).emit('admin_message', normalized);
    }
  }
}

/** After all admin namespaces are registered, patch .emit to fan-out via admin_room. */
function wireAdminBroadcast() {
  for (const adminNs of adminNamespaces) {
    if (adminNs._adminBroadcastWired) continue;
    adminNs._adminBroadcastWired = true;
    adminNs._originalEmit = adminNs.emit.bind(adminNs);
    adminNs.emit = (event, payload, ...rest) => {
      broadcastToAdminRoom(event, payload, ...rest);
      return adminNs._originalEmit(event, payload, ...rest);
    };
  }
}

module.exports = {
  ADMIN_ROOM,
  registerAdminNamespace,
  getAdminNamespaces,
  patchAdminBroadcast,
  broadcastToAdminRoom,
  broadcastAdminNewMessage,
  normalizeAdminMessagePayload,
  wireAdminBroadcast,
};

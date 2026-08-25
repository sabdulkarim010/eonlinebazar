/**
 * Pure ownership / role checks for chat socket events (no I/O).
 */

function roomOwnedBySocket(room, socket) {
  if (!room || !socket) return false;
  const guestSessionId = socket.data && socket.data.guest_session_id;
  if (guestSessionId && room.guest_session_id === guestSessionId) {
    return true;
  }
  const userId = socket.data && socket.data.user_id;
  if (userId && room.user_id && String(room.user_id) === String(userId)) {
    return true;
  }
  return false;
}

function isPrivilegedAgent(agent) {
  const role = String((agent && agent.role) || '');
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

/**
 * Assigned agent may resolve their ACTIVE room.
 * ADMIN / SUPER_ADMIN may resolve any room.
 * Unassigned rooms (BOT / WAITING) may be resolved by any authenticated agent.
 */
function canAgentResolveRoom(room, agent) {
  if (!room || !agent || !agent._id) return false;
  if (isPrivilegedAgent(agent)) return true;
  if (!room.assigned_agent_id) return true;
  return String(room.assigned_agent_id) === String(agent._id);
}

function socketReply(socket, ack, okEvent, failEvent, data) {
  const payload = data && typeof data === 'object' ? data : {};
  if (typeof ack === 'function') {
    try {
      ack(payload);
    } catch {
      /* ignore */
    }
  }
  if (!socket || typeof socket.emit !== 'function') return;
  if (payload.ok) socket.emit(okEvent, payload);
  else socket.emit(failEvent, payload);
}

module.exports = {
  roomOwnedBySocket,
  isPrivilegedAgent,
  canAgentResolveRoom,
  socketReply,
};

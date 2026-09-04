import { buildChatApiUrl } from '../config/chatConfig';

export async function startChatSession(payload) {
  const url = buildChatApiUrl('/api/chat/start');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `Chat start failed (${response.status})`);
  }
  return data;
}

export function extractRoomId(data) {
  if (!data) return null;
  let roomId = data.room_id || data.roomId || null;
  if (!roomId && data.room) {
    roomId = data.room._id || data.room.id || null;
  }
  return roomId ? String(roomId) : null;
}

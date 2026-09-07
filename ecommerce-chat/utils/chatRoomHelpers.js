const ChatRoom = require('../models/ChatRoom.model');

function senderPreviewType(senderType, attachments = []) {
  if (attachments?.length) {
    const att = attachments[0];
    const t = String(att?.type || '').toUpperCase();
    if (t === 'IMAGE' || String(att?.url || '').match(/\.(jpg|jpeg|png|webp|gif)/i)) {
      return 'image';
    }
    return 'file';
  }
  if (senderType === 'SYSTEM') return 'system_event';
  return 'text';
}

function mapSenderPreview(senderType) {
  const map = {
    USER: 'customer',
    AGENT: 'agent',
    BOT: 'bot',
    SYSTEM: 'system',
    INTERNAL: 'agent',
  };
  return map[senderType] || 'system';
}

function applyLastMessage(room, { text, senderType, messageType, attachments }) {
  const previewText = String(text || '').slice(0, 500);
  const sentAt = new Date();
  room.last_message = previewText;
  room.last_message_at = sentAt;
  room.last_message_preview = {
    text: previewText,
    sender: mapSenderPreview(senderType),
    sentAt,
    type: messageType || senderPreviewType(senderType, attachments),
  };
}

async function refreshQueueMetrics(roomId) {
  const room = await ChatRoom.findById(roomId).select('status createdAt');
  if (!room || room.status !== 'WAITING_FOR_AGENT') return null;

  const ahead = await ChatRoom.countDocuments({
    status: 'WAITING_FOR_AGENT',
    createdAt: { $lte: room.createdAt },
    _id: { $ne: room._id },
  });

  const position = ahead + 1;
  const estimatedWaitMinutes = Math.min(30, Math.max(1, position * 3));

  await ChatRoom.findByIdAndUpdate(roomId, {
    queue_position: position,
    estimated_wait_minutes: estimatedWaitMinutes,
  });

  return { queue_position: position, estimated_wait_minutes: estimatedWaitMinutes };
}

async function syncWaitingQueuePositions() {
  const waiting = await ChatRoom.find({ status: 'WAITING_FOR_AGENT' })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean();

  await Promise.all(
    waiting.map((room, index) =>
      ChatRoom.findByIdAndUpdate(room._id, {
        queue_position: index + 1,
        estimated_wait_minutes: Math.min(30, Math.max(1, (index + 1) * 3)),
      })
    )
  );
}

function syncLabelsAndTags(labels) {
  const normalized = (Array.isArray(labels) ? labels : [])
    .map((l) => String(l || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
  return { labels: normalized, tags: normalized };
}

module.exports = {
  applyLastMessage,
  refreshQueueMetrics,
  syncWaitingQueuePositions,
  syncLabelsAndTags,
  mapSenderPreview,
};

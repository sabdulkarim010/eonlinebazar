const ChatRoom = require('../models/ChatRoom.model');

const CUSTOMER_USER_SELECT =
  'firstName lastName name email avatar avatarUrl image profilePic';

const CUSTOMER_VIRTUAL_SELECT = 'name email avatar avatarUrl image profilePic';

/** Populate registered customer from main-store users collection. */
function withCustomerUserPopulate(query) {
  return query
    .populate('user_id', CUSTOMER_USER_SELECT)
    .populate('user', CUSTOMER_VIRTUAL_SELECT)
    .populate('customerId', CUSTOMER_VIRTUAL_SELECT);
}

function populatedUserId(userIdField) {
  if (!userIdField) return null;
  if (typeof userIdField === 'object') {
    return String(userIdField._id || userIdField.id || '');
  }
  return String(userIdField);
}

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

function pickCustomerAvatarFromRoom(room) {
  if (!room) return null;
  const cp = room.customer_profile || {};
  const customer = room.customer || {};
  const customerId = customer.customerId || {};
  const userRef = room.user || {};
  const userIdField = room.user_id;
  const userFromId =
    userIdField && typeof userIdField === 'object' ? userIdField : null;

  return (
    cp.avatarUrl ||
    cp.avatar ||
    cp.profileImage ||
    cp.image ||
    cp.profilePic ||
    room.customer_avatar_url ||
    customer.avatar ||
    customer.image ||
    customer.avatarUrl ||
    customer.profilePic ||
    customer.user?.avatar ||
    customer.user?.image ||
    customerId.avatar ||
    customerId.image ||
    userRef.avatar ||
    userRef.image ||
    userRef.avatarUrl ||
    userFromId?.avatar ||
    userFromId?.image ||
    userFromId?.avatarUrl ||
    room.avatar ||
    room.image ||
    room.guest_avatar ||
    room.profilePic ||
    null
  );
}

/** Attach avatar / profilePic on room payloads for admin sidebar lists. */
function attachCustomerAvatarFields(room) {
  if (!room) return room;
  const plain =
    typeof room.toObject === 'function' ? room.toObject() : { ...room };
  const avatar = pickCustomerAvatarFromRoom(plain);
  const cp = plain.customer_profile || {};
  const image = cp.image || cp.avatarUrl || cp.avatar || avatar || null;
  const populatedUser =
    plain.user_id && typeof plain.user_id === 'object' ? plain.user_id : null;
  const userId = populatedUserId(plain.user_id) || cp.user_id || null;
  const populatedAvatar =
    populatedUser?.avatar ||
    populatedUser?.avatarUrl ||
    populatedUser?.image ||
    populatedUser?.profilePic ||
    null;
  const resolvedAvatar = avatar || populatedAvatar || null;
  const resolvedImage = image || populatedAvatar || null;

  return {
    ...plain,
    avatar: resolvedAvatar || plain.avatar || null,
    image: resolvedImage,
    guest_avatar: resolvedAvatar,
    profilePic: resolvedAvatar,
    user: {
      ...(plain.user || {}),
      _id: userId,
      name:
        plain.user?.name ||
        populatedUser?.displayName ||
        populatedUser?.name ||
        null,
      avatar: resolvedAvatar || plain.user?.avatar || null,
      image: resolvedImage,
    },
    customer: {
      ...(plain.customer || {}),
      avatar: resolvedAvatar || plain.customer?.avatar || null,
      image: resolvedImage,
      customerId: populatedUser
        ? {
            _id: populatedUser._id,
            name:
              populatedUser.displayName ||
              populatedUser.name ||
              [populatedUser.firstName, populatedUser.lastName]
                .filter(Boolean)
                .join(' ')
                .trim() ||
              null,
            avatar: populatedUser.avatar || populatedUser.avatarUrl || resolvedAvatar,
            image:
              populatedUser.image ||
              populatedUser.profilePic ||
              populatedUser.avatarUrl ||
              resolvedImage,
          }
        : plain.customer?.customerId || null,
    },
    customer_profile: {
      ...cp,
      user_id: cp.user_id || userId,
      avatar: cp.avatar || resolvedAvatar || '',
      avatarUrl: cp.avatarUrl || resolvedAvatar || null,
      image: resolvedImage,
      profilePic: cp.profilePic || resolvedAvatar || null,
    },
  };
}

/**
 * Hydrate missing customer avatars from main store (cached) for registered users.
 */
async function enrichRoomCustomerAvatar(room, { fetchProfileByUserId } = {}) {
  const enriched = attachCustomerAvatarFields(room);
  const hasAvatar = Boolean(pickCustomerAvatarFromRoom(enriched));
  const userId =
    populatedUserId(enriched.user_id) ||
    enriched.customer_profile?.user_id ||
    null;

  if (hasAvatar || !userId || typeof fetchProfileByUserId !== 'function') {
    return enriched;
  }

  try {
    const profile = await fetchProfileByUserId(userId);
    if (!profile) return enriched;

    const avatar = profile.avatarUrl || profile.avatar || profile.image || null;
    const image = profile.image || profile.avatarUrl || profile.avatar || avatar || null;
    enriched.customer_profile = {
      ...(enriched.customer_profile || {}),
      ...profile,
      avatar: profile.avatar || avatar || '',
      avatarUrl: profile.avatarUrl || avatar || null,
      image,
      profilePic: profile.profilePic || avatar || null,
    };
    enriched.avatar = avatar;
    enriched.image = image;
    enriched.guest_avatar = avatar;
    enriched.profilePic = avatar;
    enriched.user = {
      ...(enriched.user || {}),
      _id: String(userId),
      avatar,
      image,
    };
    enriched.customer = {
      ...(enriched.customer || {}),
      avatar,
      image,
    };

    if (room?._id && avatar) {
      ChatRoom.findByIdAndUpdate(room._id, {
        customer_profile: enriched.customer_profile,
      }).catch(() => {});
    }
  } catch {
    /* non-fatal — list still renders initials */
  }

  return enriched;
}

module.exports = {
  applyLastMessage,
  refreshQueueMetrics,
  syncWaitingQueuePositions,
  syncLabelsAndTags,
  mapSenderPreview,
  enrichRoomCustomerAvatar,
  attachCustomerAvatarFields,
  withCustomerUserPopulate,
  CUSTOMER_USER_SELECT,
};

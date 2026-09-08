const express = require('express');
const multer = require('multer');
const ChatRoom = require('../models/ChatRoom.model');
const ChatMessage = require('../models/ChatMessage.model');
const { StoreConfig } = require('../models/AIKnowledgeBase.model');
const { getWelcomeQuickReplies } = require('../services/ai.service');
const {
  uploadChatImage,
  uploadChatFile,
  uploadFromBase64,
} = require('../services/upload.service');
const { resolveCustomerProfile, fetchProfileByUserId } = require('../services/storeProfile.service');
const {
  attachCustomerAvatarFields,
  enrichRoomCustomerAvatar,
} = require('../utils/chatRoomHelpers');
const chatAdminController = require('../controllers/chatAdminController');

const router = express.Router();

async function roomPayloadForAdmin(room) {
  if (!room) return room;
  const enriched = await enrichRoomCustomerAvatar(room, {
    fetchProfileByUserId,
  });
  return attachCustomerAvatarFields(enriched);
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, GIF images and PDF/DOC files are allowed'));
    }
  },
});

function normalizeOrderMetadata(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const items = Array.isArray(raw.items)
    ? raw.items.slice(0, 50).map((item) => ({
        name: String(item?.name || item?.productName || 'Item').slice(0, 200),
        quantity: Number(item?.quantity ?? item?.qty) || 1,
        price: Number(item?.price) || 0,
      }))
    : [];

  const orderNumber =
    raw.order_number || raw.orderNumber || raw.orderId || null;
  const mongoId = raw.order_mongo_id || raw.orderMongoId || raw._id || null;
  const total =
    raw.total_amount ?? raw.totalAmount ?? raw.grandTotal ?? raw.total ?? null;

  return {
    order_number: orderNumber ? String(orderNumber) : null,
    order_mongo_id: mongoId ? String(mongoId) : null,
    items,
    total_amount: total == null || Number.isNaN(Number(total)) ? null : Number(total),
    status: raw.status ? String(raw.status) : null,
    currency: raw.currency ? String(raw.currency) : 'BDT',
  };
}

function normalizeProductMetadata(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const priceRaw = raw.price ?? raw.salePrice ?? raw.regularPrice ?? null;
  const price =
    priceRaw == null || Number.isNaN(Number(priceRaw)) ? null : Number(priceRaw);

  return {
    product_id: raw.product_id || raw.productId || raw._id || raw.id || null,
    title: String(raw.title || raw.name || '').slice(0, 300),
    image: String(raw.image || raw.imageUrl || raw.thumbnail || '').slice(0, 500),
    price,
    url: String(raw.url || raw.productUrl || '').slice(0, 500),
    slug: String(raw.slug || '').slice(0, 200),
    currency: raw.currency ? String(raw.currency) : 'BDT',
  };
}

function isPlaceholderGuestName(name) {
  const n = String(name || '').trim().toLowerCase();
  return !n || n === 'guest' || n === 'customer';
}

/**
 * Apply registered-user identity + profile snapshot to an open room.
 */
async function enrichRoomWithCustomer(room, payload = {}) {
  if (!room) return room;

  const {
    user_id = null,
    guest_name = null,
    guest_email = null,
    auth_token = null,
    customer_avatar = null,
    customer_avatar_url = null,
    product_metadata = null,
  } = payload;

  let changed = false;

  if (product_metadata) {
    room.product_metadata = product_metadata;
    changed = true;
  }

  const resolvedUserId = user_id || room.user_id || null;
  const shouldRegister = Boolean(resolvedUserId || auth_token);

  if (shouldRegister) {
    const profile = await resolveCustomerProfile({
      user_id: resolvedUserId,
      auth_token,
      guest_name,
      guest_email,
      avatar: customer_avatar,
      avatarUrl: customer_avatar_url || customer_avatar,
    });

    if (profile) {
      if (resolvedUserId) {
        room.user_id = resolvedUserId;
      } else if (profile.user_id) {
        room.user_id = profile.user_id;
      }
      room.is_registered = true;

      const displayName =
        (guest_name && !isPlaceholderGuestName(guest_name) ? guest_name : null) ||
        profile.name ||
        room.guest_name;
      if (displayName && room.guest_name !== displayName) {
        room.guest_name = displayName;
        changed = true;
      } else if (isPlaceholderGuestName(room.guest_name) && profile.name) {
        room.guest_name = profile.name;
        changed = true;
      }

      const email = guest_email || profile.email;
      if (email && room.guest_email !== email) {
        room.guest_email = email;
        changed = true;
      }

      room.is_registered = true;
      const avatarUrl =
        profile.avatarUrl || profile.avatar || profile.image || null;
      room.customer_profile = {
        ...profile,
        user_id: String(profile.user_id || resolvedUserId || room.user_id || ''),
        avatar: profile.avatar || avatarUrl || '',
        avatarUrl: profile.avatarUrl || avatarUrl || null,
        image: profile.image || profile.avatarUrl || profile.avatar || avatarUrl || null,
        profilePic: profile.profilePic || avatarUrl || null,
      };
      changed = true;
    } else if (resolvedUserId) {
      room.user_id = resolvedUserId;
      room.is_registered = true;
      if (guest_name && !isPlaceholderGuestName(guest_name)) {
        room.guest_name = guest_name;
      }
      if (guest_email) room.guest_email = guest_email;
      const avatarHint = customer_avatar_url || customer_avatar || null;
      if (avatarHint) {
        room.customer_profile = {
          ...(room.customer_profile || {}),
          user_id: String(resolvedUserId),
          avatar: avatarHint,
          avatarUrl: avatarHint,
          image: avatarHint,
          profilePic: avatarHint,
        };
      }
      changed = true;
    }
  } else {
    if (guest_name && !isPlaceholderGuestName(guest_name) && room.guest_name !== guest_name) {
      room.guest_name = guest_name;
      changed = true;
    }
    if (guest_email && room.guest_email !== guest_email) {
      room.guest_email = guest_email;
      changed = true;
    }
  }

  if (changed) {
    await room.save();
    return room;
  }

  return room;
}

/** POST /api/chat/rating — submit customer rating by roomId in body */
router.post('/rating', async (req, res) => {
  try {
    const { roomId, rating, label } = req.body || {};
    if (!roomId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rating',
      });
    }

    await ChatRoom.findByIdAndUpdate(roomId, {
      rating: Number(rating),
      rating_feedback: label ? String(label).slice(0, 2000) : null,
      rated_at: new Date(),
      is_rated: true,
      rating_detail: {
        score: Number(rating),
        label: label || null,
        submittedAt: new Date(),
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/chat/rating]', err);
    return res.status(500).json({ success: false });
  }
});

/**
 * POST /api/chat/start
 * Start a new chat or return existing open room.
 */
router.post('/start', async (req, res) => {
  try {
    const {
      type = 'GENERAL',
      order_id = null,
      order_metadata = null,
      product_metadata = null,
      guest_session_id,
      guest_name = 'Guest',
      guest_email = null,
      user_id = null,
      auth_token = null,
      customer_avatar = null,
      customer_avatar_url = null,
      source = 'web',
    } = req.body || {};

    if (!guest_session_id && !user_id && !auth_token) {
      return res.status(400).json({
        success: false,
        message: 'guest_session_id, user_id, or auth_token is required',
      });
    }

    if (!['ORDER_SUPPORT', 'GENERAL'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'type must be ORDER_SUPPORT or GENERAL',
      });
    }

    const metadata =
      type === 'ORDER_SUPPORT' ? normalizeOrderMetadata(order_metadata) : null;
    const productMeta = normalizeProductMetadata(product_metadata);
    const validSources = ['web', 'mobile', 'order_page', 'product_page', 'whatsapp'];
    const chatSource = validSources.includes(source) ? source : 'web';

    const openStatuses = ['BOT', 'WAITING_FOR_AGENT', 'ACTIVE'];
    const query = {
      type,
      status: { $in: openStatuses },
    };

    if (guest_session_id) query.guest_session_id = guest_session_id;
    if (user_id) query.user_id = user_id;
    query.order_id = order_id || null;

    let room = await ChatRoom.findOne(query).sort({ createdAt: -1 });

    // Fallback: guest started chat, then logged in — find open room by session only
    if (!room && guest_session_id && user_id) {
      room = await ChatRoom.findOne({
        guest_session_id,
        type,
        status: { $in: openStatuses },
        order_id: order_id || null,
      }).sort({ createdAt: -1 });
    }

    if (room) {
      if (metadata) {
        room.order_metadata = metadata;
      }
      if (productMeta) {
        room.product_metadata = productMeta;
      }
      if (chatSource && !room.source) {
        room.source = chatSource;
      }
      room = await enrichRoomWithCustomer(room, {
        user_id,
        guest_name,
        guest_email,
        auth_token,
        customer_avatar,
        customer_avatar_url: customer_avatar_url || customer_avatar,
        product_metadata: productMeta,
      });

      const welcome = await ChatMessage.findOne({
        room_id: room._id,
        sender_type: 'BOT',
      }).sort({ createdAt: 1 });

      const io = req.app.get('io');
      if (io) {
        const adminRoom = await roomPayloadForAdmin(room);
        io.of('/admin').emit('room_updated', { room: adminRoom });
        io.of('/admin').emit('chat_updated', { room: adminRoom });
        io.of('/admin').emit('new_room', { room: adminRoom });
        if (room.status === 'WAITING_FOR_AGENT') {
          io.of('/admin').emit('new_handover_request', { room: adminRoom });
        } else if (openStatuses.includes(room.status)) {
          io.of('/admin').emit('new_chat', { room: adminRoom });
        }
      }

      return res.json({
        success: true,
        room: await roomPayloadForAdmin(room),
        welcome_message: welcome,
        is_existing: true,
      });
    }

    let resolvedName = guest_name;
    if (isPlaceholderGuestName(resolvedName) && user_id) {
      resolvedName = 'Customer';
    }

    room = await ChatRoom.create({
      user_id: user_id || null,
      guest_session_id: guest_session_id || null,
      guest_name: resolvedName,
      guest_email,
      is_registered: Boolean(user_id || auth_token),
      type,
      order_id: order_id || null,
      order_metadata: metadata,
      product_metadata: productMeta,
      status: 'BOT',
      source: chatSource,
      last_message: '',
      last_message_at: new Date(),
      unread_count: 0,
      tags: [type.toLowerCase()],
    });

    room = await enrichRoomWithCustomer(room, {
      user_id,
      guest_name: resolvedName,
      guest_email,
      auth_token,
      customer_avatar,
      customer_avatar_url: customer_avatar_url || customer_avatar,
      product_metadata: productMeta,
    });

    const store = await StoreConfig.findOne().lean();
    const persona = store?.ai_persona_name || 'Aria';
    const storeName = store?.store_name || 'Our Store';

    const quick_replies = getWelcomeQuickReplies(type);

    const welcomeText =
      type === 'ORDER_SUPPORT'
        ? `আস্সালামু আলাইকুম! আমি ${persona}, ${storeName} এর AI সহায়ক। আপনার অর্ডার সম্পর্কে কীভাবে সাহায্য করতে পারি?`
        : `আস্সালামু আলাইকুম! আমি ${persona}, ${storeName} এর AI সহায়ক। আজ আপনাকে কীভাবে সাহায্য করতে পারি?`;

    const welcome_message = await ChatMessage.create({
      room_id: room._id,
      sender_type: 'BOT',
      sender_id: 'ai-bot',
      sender_name: persona,
      message: welcomeText,
      quick_replies,
      is_read_by_user: false,
      is_read_by_agent: true,
      ai_confidence: 1,
    });

    room.last_message = welcome_message.message;
    room.last_message_at = new Date();
    await room.save();

    const io = req.app.get('io');
    if (io) {
      const adminRoom = await roomPayloadForAdmin(room);
      io.of('/admin').emit('new_chat', { room: adminRoom });
      io.of('/admin').emit('new_room', { room: adminRoom });
      io.of('/admin').emit('room_updated', { room: adminRoom });
      io.of('/admin').emit('chat_updated', { room: adminRoom });
    }

    return res.status(201).json({
      success: true,
      room: await roomPayloadForAdmin(room),
      welcome_message,
      is_existing: false,
    });
  } catch (err) {
    console.error('[POST /api/chat/start]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to start chat',
      error: err.message,
    });
  }
});

/**
 * POST /api/chat/link-user
 * Link an open guest room to a registered user after login (same session).
 */
router.post('/link-user', async (req, res) => {
  try {
    const {
      room_id,
      guest_session_id,
      user_id = null,
      guest_name = null,
      guest_email = null,
      auth_token = null,
      customer_avatar = null,
      customer_avatar_url = null,
    } = req.body || {};

    if (!room_id) {
      return res.status(400).json({
        success: false,
        message: 'room_id is required',
      });
    }

    const room = await ChatRoom.findById(room_id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found',
      });
    }

    if (
      guest_session_id &&
      room.guest_session_id &&
      room.guest_session_id !== guest_session_id
    ) {
      return res.status(403).json({
        success: false,
        message: 'UNAUTHORIZED',
      });
    }

    const openStatuses = ['BOT', 'WAITING_FOR_AGENT', 'ACTIVE'];
    if (!openStatuses.includes(room.status)) {
      return res.status(400).json({
        success: false,
        message: 'Room is not open for linking',
      });
    }

    const updated = await enrichRoomWithCustomer(room, {
      user_id: user_id || room.user_id,
      guest_name,
      guest_email,
      auth_token,
      customer_avatar,
      customer_avatar_url: customer_avatar_url || customer_avatar,
    });

    const io = req.app.get('io');
    if (io) {
      const adminRoom = await roomPayloadForAdmin(updated);
      const plain = updated.toObject ? updated.toObject() : updated;
      io.of('/admin').emit('room_updated', { room: adminRoom });
      io.of('/admin').emit('chat_updated', { room: adminRoom });
      io.of('/customer').to(String(room_id)).emit('room_updated', { room: plain });
    }

    return res.json({ success: true, room: await roomPayloadForAdmin(updated) });
  } catch (err) {
    console.error('[POST /api/chat/link-user]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to link user',
      error: err.message,
    });
  }
});

/**
 * GET /api/chat/:room_id/messages?page=1&limit=30
 */
router.get('/:room_id/messages', async (req, res) => {
  try {
    const { room_id } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const skip = (page - 1) * limit;

    const room = await ChatRoom.findById(room_id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found',
      });
    }

    const messageFilter = {
      room_id,
      sender_type: { $ne: 'INTERNAL' },
    };

    const [messages, total] = await Promise.all([
      ChatMessage.find(messageFilter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ChatMessage.countDocuments(messageFilter),
    ]);

    return res.json({
      success: true,
      room_id,
      messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error('[GET /api/chat/:room_id/messages]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: err.message,
    });
  }
});

/**
 * POST /api/chat/:room_id/upload
 * Accepts BOTH multipart (multer) AND JSON base64 in the same route.
 * Multipart: field `image` or `file` → req.file.buffer
 * JSON: { base64|data, guest_session_id?, file_name? } — max decoded 3MB
 */
router.post(
  '/:room_id/upload',
  (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      return next();
    }

    upload.single('image')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE' || !req.file) {
          return upload.single('file')(req, res, (err2) => {
            if (err2) {
              return res.status(400).json({
                success: false,
                message: err2.message || 'Upload failed',
              });
            }
            next();
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || 'Upload failed',
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { room_id } = req.params;

      const room = await ChatRoom.findById(room_id);
      if (!room) {
        return res.status(404).json({
          success: false,
          message: 'Chat room not found',
        });
      }

      // Guest ownership check when session provided
      const guestSessionId =
        req.body?.guest_session_id || req.headers['x-guest-session-id'];
      if (
        guestSessionId &&
        room.guest_session_id &&
        room.guest_session_id !== guestSessionId
      ) {
        return res.status(403).json({
          success: false,
          message: 'UNAUTHORIZED',
        });
      }

      let uploaded;
      let filename;
      let isImage = true;

      if (req.file?.buffer) {
        isImage = String(req.file.mimetype || '').startsWith('image/');
        uploaded = isImage
          ? await uploadChatImage(req.file.buffer, req.file.mimetype, room_id)
          : await uploadChatFile(
              req.file.buffer,
              req.file.mimetype,
              room_id,
              req.file.originalname
            );
        filename =
          req.file.originalname || `file.${uploaded.format || 'bin'}`;
      } else {
        const base64 =
          req.body?.base64 ||
          req.body?.data ||
          req.body?.image_base64;
        if (!base64) {
          return res.status(400).json({
            success: false,
            message:
              'Provide multipart image file or JSON base64 payload',
          });
        }
        if (
          typeof base64 === 'string' &&
          base64.startsWith('data:') &&
          !base64.includes(';base64,')
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Data URL storage is not permitted. Use multipart upload.',
          });
        }
        uploaded = await uploadFromBase64(base64, room_id);
        filename =
          req.body?.file_name ||
          req.body?.filename ||
          `image.${uploaded.format || 'jpg'}`;
      }

      const systemMsg = await ChatMessage.create({
        room_id,
        sender_type: 'SYSTEM',
        sender_name: 'System',
        message: `📎 ফাইল আপলোড হয়েছে: ${filename}`,
        attachments: [
          {
            url: uploaded.url,
            thumbnail_url: uploaded.thumbnail_url,
            type: isImage ? 'IMAGE' : 'FILE',
            filename,
            size: uploaded.bytes || req.file?.size || 0,
            public_id: uploaded.public_id,
          },
        ],
        is_read_by_user: true,
        is_read_by_agent: false,
      });

      room.last_message = systemMsg.message;
      room.last_message_at = new Date();
      room.unread_count = (room.unread_count || 0) + 1;
      await room.save();

      const io = req.app.get('io');
      if (io) {
        io.of('/customer').to(String(room_id)).emit('new_message', systemMsg);
        io.of('/admin').emit('new_message', {
          room_id,
          message: systemMsg,
          room,
        });
      }

      return res.status(201).json({
        success: true,
        url: uploaded.url,
        thumbnail_url: uploaded.thumbnail_url,
        public_id: uploaded.public_id,
        message: systemMsg,
      });
    } catch (err) {
      console.error('[POST /api/chat/:room_id/upload]', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Upload failed',
        error: err.message,
      });
    }
  }
);

/** POST /api/chat/:room_id/rate — REST rating (socket submit_rating also supported) */
router.post('/:room_id/rate', chatAdminController.rateConversation);

/** POST /api/chat/:room_id/attachment — alias for customer file upload */
router.post(
  '/:room_id/attachment',
  upload.single('attachment'),
  chatAdminController.sendAttachment
);

module.exports = router;

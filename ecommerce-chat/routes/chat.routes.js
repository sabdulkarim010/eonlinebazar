const express = require('express');
const multer = require('multer');
const ChatRoom = require('../models/ChatRoom.model');
const ChatMessage = require('../models/ChatMessage.model');
const { StoreConfig } = require('../models/AIKnowledgeBase.model');
const { getWelcomeQuickReplies } = require('../services/ai.service');
const {
  uploadChatImage,
  uploadFromBase64,
} = require('../services/upload.service');

const router = express.Router();

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
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
      guest_session_id,
      guest_name = 'Guest',
      guest_email = null,
      user_id = null,
    } = req.body || {};

    if (!guest_session_id && !user_id) {
      return res.status(400).json({
        success: false,
        message: 'guest_session_id or user_id is required',
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

    const openStatuses = ['BOT', 'WAITING_FOR_AGENT', 'ACTIVE'];
    const query = {
      type,
      status: { $in: openStatuses },
    };

    if (guest_session_id) query.guest_session_id = guest_session_id;
    if (user_id) query.user_id = user_id;
    query.order_id = order_id || null;

    let room = await ChatRoom.findOne(query).sort({ createdAt: -1 });

    if (room) {
      if (metadata) {
        room.order_metadata = metadata;
        await room.save();
      }

      const welcome = await ChatMessage.findOne({
        room_id: room._id,
        sender_type: 'BOT',
      }).sort({ createdAt: 1 });

      return res.json({
        success: true,
        room,
        welcome_message: welcome,
        is_existing: true,
      });
    }

    room = await ChatRoom.create({
      user_id: user_id || null,
      guest_session_id: guest_session_id || null,
      guest_name,
      guest_email,
      type,
      order_id: order_id || null,
      order_metadata: metadata,
      status: 'BOT',
      last_message: '',
      last_message_at: new Date(),
      unread_count: 0,
      tags: [type.toLowerCase()],
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

    return res.status(201).json({
      success: true,
      room,
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

      if (req.file?.buffer) {
        uploaded = await uploadChatImage(
          req.file.buffer,
          req.file.mimetype,
          room_id
        );
        filename =
          req.file.originalname || `image.${uploaded.format || 'jpg'}`;
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
            type: 'IMAGE',
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

module.exports = router;

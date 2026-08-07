const express = require('express');
const jwt = require('jsonwebtoken');
const Agent = require('../models/Agent.model');
const ChatRoom = require('../models/ChatRoom.model');
const ChatMessage = require('../models/ChatMessage.model');
const { StoreConfig } = require('../models/AIKnowledgeBase.model');
const { authMiddleware, roleGuard } = require('../middleware/auth.middleware');
const { sendDailyReport } = require('../services/notification.service');

const router = express.Router();

/**
 * POST /api/admin/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const agent = await Agent.findOne({ email: email.toLowerCase() }).select(
      '+password'
    );

    if (!agent) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const valid = await agent.comparePassword(password);
    if (!valid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'JWT_SECRET is not configured',
      });
    }

    const token = jwt.sign(
      {
        id: agent._id,
        email: agent.email,
        role: agent.role,
        name: agent.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    agent.last_seen = new Date();
    await agent.save();

    return res.json({
      success: true,
      token,
      agent: {
        id: agent._id,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        avatar: agent.avatar,
        is_online: agent.is_online,
        max_concurrent_chats: agent.max_concurrent_chats,
      },
    });
  } catch (err) {
    console.error('[POST /api/admin/login]', err);
    return res.status(500).json({
      success: false,
      message: 'Login failed',
      error: err.message,
    });
  }
});

/**
 * GET /api/admin/rooms?status=WAITING_FOR_AGENT
 */
router.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [rooms, statusCounts] = await Promise.all([
      ChatRoom.find(filter)
        .populate('assigned_agent_id', 'name email avatar is_online')
        .sort({ last_message_at: -1 })
        .lean(),
      ChatRoom.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const counts = {
      BOT: 0,
      WAITING_FOR_AGENT: 0,
      ACTIVE: 0,
      RESOLVED: 0,
    };

    statusCounts.forEach((row) => {
      counts[row._id] = row.count;
    });

    return res.json({
      success: true,
      rooms,
      counts,
      total: rooms.length,
    });
  } catch (err) {
    console.error('[GET /api/admin/rooms]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch rooms',
      error: err.message,
    });
  }
});

/**
 * GET /api/admin/rooms/:room_id
 * Marks messages as read by agent, unread_count = 0
 */
router.get('/rooms/:room_id', authMiddleware, async (req, res) => {
  try {
    const { room_id } = req.params;

    const room = await ChatRoom.findById(room_id)
      .populate('assigned_agent_id', 'name email avatar is_online')
      .lean();

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found',
      });
    }

    await Promise.all([
      ChatMessage.updateMany(
        { room_id, is_read_by_agent: false },
        { $set: { is_read_by_agent: true } }
      ),
      ChatRoom.findByIdAndUpdate(room_id, { unread_count: 0 }),
    ]);

    const messages = await ChatMessage.find({ room_id })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({
      success: true,
      room: { ...room, unread_count: 0 },
      messages,
    });
  } catch (err) {
    console.error('[GET /api/admin/rooms/:room_id]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch room',
      error: err.message,
    });
  }
});

/**
 * GET /api/admin/stats
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [total_today, resolved_today, waiting_for_agent, ratingAgg] =
      await Promise.all([
        ChatRoom.countDocuments({ createdAt: { $gte: startOfDay } }),
        ChatRoom.countDocuments({
          status: 'RESOLVED',
          resolved_at: { $gte: startOfDay },
        }),
        ChatRoom.countDocuments({ status: 'WAITING_FOR_AGENT' }),
        ChatRoom.aggregate([
          { $match: { rating: { $ne: null } } },
          {
            $group: {
              _id: null,
              avg_rating: { $avg: '$rating' },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

    return res.json({
      success: true,
      stats: {
        total_today,
        resolved_today,
        waiting_for_agent,
        avg_rating: ratingAgg[0]
          ? Math.round(ratingAgg[0].avg_rating * 10) / 10
          : null,
        rated_count: ratingAgg[0]?.count || 0,
      },
    });
  } catch (err) {
    console.error('[GET /api/admin/stats]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: err.message,
    });
  }
});

/**
 * POST /api/admin/daily-report — send end-of-day email summary
 */
router.post(
  '/daily-report',
  authMiddleware,
  roleGuard(['SUPER_ADMIN', 'ADMIN']),
  async (req, res) => {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [total_today, resolved_today, ratingAgg] = await Promise.all([
        ChatRoom.countDocuments({ createdAt: { $gte: startOfDay } }),
        ChatRoom.countDocuments({
          status: 'RESOLVED',
          resolved_at: { $gte: startOfDay },
        }),
        ChatRoom.aggregate([
          {
            $match: {
              rating: { $ne: null },
              resolved_at: { $gte: startOfDay },
            },
          },
          {
            $group: {
              _id: null,
              avg_rating: { $avg: '$rating' },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      const stats = {
        total_today,
        resolved_today,
        avg_rating: ratingAgg[0]
          ? Math.round(ratingAgg[0].avg_rating * 10) / 10
          : null,
        rated_count: ratingAgg[0]?.count || 0,
      };

      const result = await sendDailyReport(stats);

      return res.json({
        success: true,
        stats,
        email: result,
      });
    } catch (err) {
      console.error('[POST /api/admin/daily-report]', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to send daily report',
        error: err.message,
      });
    }
  }
);

/**
 * PUT /api/admin/config — upsert StoreConfig (SUPER_ADMIN only)
 */
router.put(
  '/config',
  authMiddleware,
  roleGuard(['SUPER_ADMIN']),
  async (req, res) => {
    try {
      const allowed = [
        'store_name',
        'store_tagline',
        'contact_phone',
        'contact_email',
        'address',
        'shipping_policy',
        'return_policy',
        'delivery_time',
        'business_hours',
        'ai_persona_name',
        'ai_language',
        'handover_keywords',
        'canned_responses',
      ];

      const updates = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          updates[key] = req.body[key];
        }
      }

      const config = await StoreConfig.findOneAndUpdate({}, updates, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      });

      return res.json({
        success: true,
        config,
      });
    } catch (err) {
      console.error('[PUT /api/admin/config]', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to update config',
        error: err.message,
      });
    }
  }
);

/**
 * GET /api/admin/config
 */
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const config = await StoreConfig.findOne().lean();
    return res.json({ success: true, config });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch config',
      error: err.message,
    });
  }
});

/**
 * GET /api/admin/me — current agent profile
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent.id).select('-password');
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    return res.json({ success: true, agent });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: err.message,
    });
  }
});

module.exports = router;

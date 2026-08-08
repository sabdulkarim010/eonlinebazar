const express = require('express');
const jwt = require('jsonwebtoken');
const Agent = require('../models/Agent.model');
const ChatRoom = require('../models/ChatRoom.model');
const ChatMessage = require('../models/ChatMessage.model');
const { StoreConfig } = require('../models/AIKnowledgeBase.model');
const { DEFAULT_STORE_CONFIG } = require('../data/defaultKnowledge');
const { authMiddleware, roleGuard } = require('../middleware/auth.middleware');
const { sendDailyReport } = require('../services/notification.service');

const router = express.Router();

const AGENT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'AGENT'];

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
      { expiresIn: '24h' }
    );

    agent.last_seen = new Date();
    await agent.save();

    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24h
    });

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
 * GET /api/admin/rooms?status=WAITING_FOR_AGENT&page=1&limit=25
 */
router.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 25)
    );
    const skip = (page - 1) * limit;

    const [rooms, total, statusCounts] = await Promise.all([
      ChatRoom.find(filter)
        .populate('assigned_agent_id', 'name email avatar is_online')
        .sort({ last_message_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ChatRoom.countDocuments(filter),
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
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      hasMore: skip + rooms.length < total,
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
 * GET /api/admin/rooms/:room_id?page=1&limit=50
 * Includes INTERNAL messages. Marks messages as read by agent.
 */
router.get('/rooms/:room_id', authMiddleware, async (req, res) => {
  try {
    const { room_id } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 50)
    );
    const skip = (page - 1) * limit;

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

    const [messages, total] = await Promise.all([
      ChatMessage.find({ room_id })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ChatMessage.countDocuments({ room_id }),
    ]);

    return res.json({
      success: true,
      room: { ...room, unread_count: 0 },
      messages,
      total,
      page,
      limit,
      hasMore: skip + messages.length < total,
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
 * POST /api/admin/rooms/:room_id/messages
 * HTTP fallback for agent messages when socket fails
 */
router.post('/rooms/:room_id/messages', authMiddleware, async (req, res) => {
  try {
    const { message, attachments = [] } = req.body || {};
    const agent = await Agent.findById(req.agent.id);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const room = await ChatRoom.findById(req.params.room_id);
    if (!room || room.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Room not active' });
    }
    if (room.assigned_agent_id?.toString() !== String(req.agent.id)) {
      return res.status(403).json({ message: 'Not your room' });
    }

    if (!message || String(message).length > 5000) {
      return res.status(400).json({ message: 'INVALID_MESSAGE_LENGTH' });
    }

    const msg = await ChatMessage.create({
      room_id: req.params.room_id,
      sender_type: 'AGENT',
      sender_id: String(agent._id),
      sender_name: agent.name,
      message,
      attachments,
      is_read_by_agent: true,
    });

    await ChatRoom.findByIdAndUpdate(req.params.room_id, {
      last_message: message.slice(0, 100),
      last_message_at: new Date(),
      unread_count: 0,
    });

    const io = req.app.get('io');
    if (io) {
      io.of('/customer').to(req.params.room_id).emit('new_message', msg);
      io.of('/admin').to(req.params.room_id).emit('new_message', msg);
      io.of('/admin').emit('new_message', {
        room_id: req.params.room_id,
        message: msg,
        room,
      });
    }

    return res.json({ success: true, message: msg });
  } catch (err) {
    console.error('[POST /api/admin/rooms/:room_id/messages]', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /api/admin/rooms/:room_id/tags
 */
router.patch('/rooms/:room_id/tags', authMiddleware, async (req, res) => {
  try {
    const { tag } = req.body || {};
    if (!tag || typeof tag !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'tag is required',
      });
    }

    const normalized = tag.trim().toLowerCase().slice(0, 50);
    if (!normalized) {
      return res.status(400).json({
        success: false,
        message: 'tag is required',
      });
    }

    const room = await ChatRoom.findByIdAndUpdate(
      req.params.room_id,
      { $addToSet: { tags: normalized } },
      { new: true }
    ).lean();

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found',
      });
    }

    return res.json({ success: true, room });
  } catch (err) {
    console.error('[PATCH /api/admin/rooms/:room_id/tags]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to update tags',
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
 * GET /api/admin/config — current StoreConfig or defaults
 */
router.get('/config', authMiddleware, async (req, res) => {
  try {
    let config = await StoreConfig.findOne().lean();
    if (!config) {
      config = { ...DEFAULT_STORE_CONFIG, _isDefault: true };
    }
    return res.json({ success: true, config });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch config / কনফিগ লোড করা যায়নি',
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

function serializeAgent(agent) {
  const a = agent?.toObject ? agent.toObject() : { ...agent };
  delete a.password;
  const activeCount = Array.isArray(a.active_chats) ? a.active_chats.length : 0;
  return {
    id: a._id,
    _id: a._id,
    name: a.name,
    email: a.email,
    role: a.role,
    avatar: a.avatar || null,
    is_online: Boolean(a.is_online),
    last_seen: a.last_seen || null,
    active_chats: activeCount,
    max_concurrent_chats: a.max_concurrent_chats ?? 5,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

/**
 * GET /api/admin/agents — list all staff agents
 */
router.get(
  '/agents',
  authMiddleware,
  roleGuard(['SUPER_ADMIN', 'ADMIN']),
  async (req, res) => {
    try {
      const agents = await Agent.find()
        .select('-password')
        .sort({ role: 1, name: 1 })
        .lean();

      const list = agents.map(serializeAgent);

      return res.json({ success: true, count: list.length, agents: list });
    } catch (err) {
      console.error('[GET /api/admin/agents]', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to list agents / স্টাফ তালিকা লোড ব্যর্থ',
        error: err.message,
      });
    }
  }
);

/**
 * POST /api/admin/agents — create staff account
 */
router.post(
  '/agents',
  authMiddleware,
  roleGuard(['SUPER_ADMIN', 'ADMIN']),
  async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        role = 'AGENT',
        max_concurrent_chats = 5,
      } = req.body || {};

      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message:
            'Name, email and password are required / নাম, ইমেইল ও পাসওয়ার্ড আবশ্যক',
        });
      }

      if (!AGENT_ROLES.includes(role)) {
        return res.status(400).json({
          success: false,
          message: `Role must be one of: ${AGENT_ROLES.join(', ')}`,
        });
      }

      if (role === 'SUPER_ADMIN' && req.agent.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message:
            'Only SUPER_ADMIN can create SUPER_ADMIN / শুধু SUPER_ADMIN তৈরি করতে পারবেন',
        });
      }

      if (String(password).length < 8) {
        return res.status(400).json({
          success: false,
          message:
            'Password must be at least 8 characters / পাসওয়ার্ড কমপক্ষে ৮ অক্ষর',
        });
      }

      const exists = await Agent.findOne({ email: String(email).toLowerCase() });
      if (exists) {
        return res.status(409).json({
          success: false,
          message: 'Email already in use / এই ইমেইল ইতিমধ্যে ব্যবহৃত',
        });
      }

      const agent = await Agent.create({
        name: String(name).trim(),
        email: String(email).toLowerCase().trim(),
        password: String(password),
        role,
        max_concurrent_chats: Number(max_concurrent_chats) || 5,
      });

      return res.status(201).json({
        success: true,
        message: 'Staff created / স্টাফ তৈরি হয়েছে',
        agent: serializeAgent(agent),
      });
    } catch (err) {
      console.error('[POST /api/admin/agents]', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to create agent / স্টাফ তৈরি ব্যর্থ',
        error: err.message,
      });
    }
  }
);

/**
 * PUT /api/admin/agents/:id — update name, role, max chats
 */
router.put(
  '/agents/:id',
  authMiddleware,
  roleGuard(['SUPER_ADMIN', 'ADMIN']),
  async (req, res) => {
    try {
      const isSelf = String(req.params.id) === String(req.agent.id);
      const updates = {};

      if (req.body.name !== undefined) {
        updates.name = String(req.body.name).trim();
      }
      if (req.body.max_concurrent_chats !== undefined) {
        updates.max_concurrent_chats = Number(req.body.max_concurrent_chats) || 5;
      }

      if (req.body.role !== undefined) {
        if (isSelf) {
          return res.status(403).json({
            success: false,
            message:
              'Cannot change your own role / নিজের রোল পরিবর্তন করতে পারবেন না',
          });
        }
        if (!AGENT_ROLES.includes(req.body.role)) {
          return res.status(400).json({
            success: false,
            message: `Role must be one of: ${AGENT_ROLES.join(', ')}`,
          });
        }
        if (req.body.role === 'SUPER_ADMIN' && req.agent.role !== 'SUPER_ADMIN') {
          return res.status(403).json({
            success: false,
            message:
              'Only SUPER_ADMIN can assign SUPER_ADMIN / শুধু SUPER_ADMIN রোল দিতে পারবেন',
          });
        }
        updates.role = req.body.role;
      }

      const agent = await Agent.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      }).select('-password');

      if (!agent) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found / স্টাফ পাওয়া যায়নি',
        });
      }

      return res.json({
        success: true,
        message: 'Agent updated / স্টাফ আপডেট হয়েছে',
        agent: serializeAgent(agent),
      });
    } catch (err) {
      console.error('[PUT /api/admin/agents/:id]', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to update agent / স্টাফ আপডেট ব্যর্থ',
        error: err.message,
      });
    }
  }
);

/**
 * POST /api/admin/agents/:id/reset-password — SUPER_ADMIN only
 */
router.post(
  '/agents/:id/reset-password',
  authMiddleware,
  roleGuard(['SUPER_ADMIN']),
  async (req, res) => {
    try {
      const { new_password, password } = req.body || {};
      const nextPassword = new_password || password;

      if (!nextPassword || String(nextPassword).length < 8) {
        return res.status(400).json({
          success: false,
          message:
            'Password must be at least 8 characters / পাসওয়ার্ড কমপক্ষে ৮ অক্ষর',
        });
      }

      const agent = await Agent.findById(req.params.id).select('+password');
      if (!agent) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found / স্টাফ পাওয়া যায়নি',
        });
      }

      agent.password = String(nextPassword);
      await agent.save();

      return res.json({
        success: true,
        message: 'Password reset / পাসওয়ার্ড রিসেট হয়েছে',
      });
    } catch (err) {
      console.error('[POST /api/admin/agents/:id/reset-password]', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to reset password / পাসওয়ার্ড রিসেট ব্যর্থ',
        error: err.message,
      });
    }
  }
);

/**
 * DELETE /api/admin/agents/:id — cannot delete self or last SUPER_ADMIN
 */
router.delete(
  '/agents/:id',
  authMiddleware,
  roleGuard(['SUPER_ADMIN', 'ADMIN']),
  async (req, res) => {
    try {
      if (String(req.params.id) === String(req.agent.id)) {
        return res.status(400).json({
          success: false,
          message:
            'Cannot delete your own account / নিজের অ্যাকাউন্ট মুছতে পারবেন না',
        });
      }

      const target = await Agent.findById(req.params.id);
      if (!target) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found / স্টাফ পাওয়া যায়নি',
        });
      }

      if (target.role === 'SUPER_ADMIN' && req.agent.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message:
            'Only SUPER_ADMIN can delete SUPER_ADMIN / SUPER_ADMIN মুছতে পারবেন না',
        });
      }

      if (target.role === 'SUPER_ADMIN') {
        const superCount = await Agent.countDocuments({ role: 'SUPER_ADMIN' });
        if (superCount <= 1) {
          return res.status(400).json({
            success: false,
            message:
              'Cannot delete the last SUPER_ADMIN / শেষ SUPER_ADMIN মুছতে পারবেন না',
          });
        }
      }

      // Remove from all active chat rooms first
      await ChatRoom.updateMany(
        {
          assigned_agent_id: target._id,
          status: { $in: ['ACTIVE', 'WAITING_FOR_AGENT'] },
        },
        {
          $set: {
            assigned_agent_id: null,
            status: 'WAITING_FOR_AGENT',
          },
        }
      );

      await Agent.findByIdAndDelete(req.params.id);

      return res.json({ success: true });
    } catch (err) {
      console.error('[DELETE /api/admin/agents/:id]', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete agent / স্টাফ মুছা ব্যর্থ',
        error: err.message,
      });
    }
  }
);

module.exports = router;

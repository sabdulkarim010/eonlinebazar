const ChatRoom = require('../models/ChatRoom.model');
const ChatMessage = require('../models/ChatMessage.model');
const Agent = require('../models/Agent.model');
const CannedResponse = require('../models/CannedResponse.model');
require('../models/StoreUser.model');
const {
  fetchProfileByUserId,
  fetchCustomerOrders,
} = require('../services/storeProfile.service');
const { uploadChatImage } = require('../services/upload.service');
const {
  applyLastMessage,
  syncLabelsAndTags,
  withCustomerUserPopulate,
} = require('../utils/chatRoomHelpers');

function roomOwnedByGuest(room, guestSessionId, userId) {
  if (guestSessionId && room.guest_session_id === guestSessionId) return true;
  if (userId && room.user_id && String(room.user_id) === String(userId)) {
    return true;
  }
  return false;
}

/** POST /api/chat/:room_id/rate */
exports.rateConversation = async (req, res) => {
  try {
    const { room_id } = req.params;
    const { score, feedback, rating, guest_session_id, user_id } = req.body || {};
    const finalScore = Number(score ?? rating);

    if (!finalScore || finalScore < 1 || finalScore > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      });
    }

    const room = await ChatRoom.findById(room_id);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    if (!roomOwnedByGuest(room, guest_session_id, user_id)) {
      return res.status(403).json({ success: false, message: 'UNAUTHORIZED' });
    }

    if (room.status !== 'RESOLVED') {
      return res.status(400).json({
        success: false,
        message: 'Can only rate resolved conversations',
      });
    }

    if (room.is_rated) {
      return res.status(400).json({ success: false, message: 'ALREADY_RATED' });
    }

    room.rating = finalScore;
    room.rating_feedback = feedback ? String(feedback).slice(0, 2000) : null;
    room.rated_at = new Date();
    room.is_rated = true;
    await room.save();

    const io = req.app.get('io');
    if (io) {
      io.of('/admin').emit('rating_submitted', {
        room_id,
        rating: room.rating,
        feedback: room.rating_feedback,
      });
    }

    return res.json({
      success: true,
      message: 'Rating submitted. Thank you!',
      rating: room.rating,
    });
  } catch (err) {
    console.error('[rateConversation]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** POST /api/chat/:room_id/attachment */
exports.sendAttachment = async (req, res) => {
  try {
    const { room_id } = req.params;
    const { guest_session_id, user_id } = req.body || {};

    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const room = await ChatRoom.findById(room_id);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    if (!roomOwnedByGuest(room, guest_session_id, user_id)) {
      return res.status(403).json({ success: false, message: 'UNAUTHORIZED' });
    }

    if (!['BOT', 'WAITING_FOR_AGENT', 'ACTIVE'].includes(room.status)) {
      return res.status(400).json({
        success: false,
        message: 'Conversation is not open for attachments',
      });
    }

    const uploaded = await uploadChatImage(
      req.file.buffer,
      req.file.mimetype,
      room_id
    );

    const filename = req.file.originalname || `file.${uploaded.format || 'jpg'}`;
    const isImage = String(req.file.mimetype || '').startsWith('image/');

    const message = await ChatMessage.create({
      room_id,
      sender_type: 'USER',
      sender_id: user_id || room.user_id || room.guest_session_id,
      sender_name: room.guest_name || 'Guest',
      message: `📎 ${filename}`,
      message_type: isImage ? 'image' : 'file',
      attachments: [
        {
          url: uploaded.url,
          thumbnail_url: uploaded.thumbnail_url,
          type: isImage ? 'IMAGE' : 'FILE',
          filename,
          size: uploaded.bytes || req.file.size || 0,
          public_id: uploaded.public_id,
        },
      ],
      is_read_by_user: true,
      is_read_by_agent: false,
    });

    applyLastMessage(room, {
      text: message.message,
      senderType: 'USER',
      messageType: message.message_type,
      attachments: message.attachments,
    });
    room.unread_count = (room.unread_count || 0) + 1;
    await room.save();

    const io = req.app.get('io');
    if (io) {
      io.of('/customer').to(String(room_id)).emit('new_message', message);
      io.of('/admin').emit('new_message', { room_id, message, room });
    }

    return res.json({ success: true, message });
  } catch (err) {
    console.error('[sendAttachment]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** POST /api/admin/rooms/:room_id/notes */
exports.addInternalNote = async (req, res) => {
  try {
    const { room_id } = req.params;
    const { text } = req.body || {};
    const agent = req.agent;

    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: 'Note text required' });
    }

    const noteEntry = {
      text: text.trim().slice(0, 5000),
      agent_id: agent.id,
      agent_name: agent.name,
      created_at: new Date(),
    };

    const room = await ChatRoom.findByIdAndUpdate(
      room_id,
      { $push: { internal_notes: noteEntry } },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const note = room.internal_notes[room.internal_notes.length - 1];

    const chatNote = await ChatMessage.create({
      room_id,
      sender_type: 'INTERNAL',
      sender_id: String(agent.id),
      sender_name: agent.name,
      message: noteEntry.text,
      is_internal: true,
      is_read_by_agent: true,
    });

    const io = req.app.get('io');
    if (io) {
      io.of('/admin').to(String(room_id)).emit('new_message', chatNote);
      io.of('/admin').emit('new_message', { room_id, message: chatNote });
    }

    return res.json({ success: true, note, message: chatNote });
  } catch (err) {
    console.error('[addInternalNote]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** PATCH /api/admin/rooms/:room_id/assign */
exports.assignAgent = async (req, res) => {
  try {
    const { room_id } = req.params;
    const { agentId, agent_id } = req.body || {};
    const targetId = agentId || agent_id;

    const agent = await Agent.findById(targetId).select('name avatar is_online');
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const room = await ChatRoom.findByIdAndUpdate(
      room_id,
      {
        assigned_agent_id: agent._id,
        assigned_at: new Date(),
        status: 'ACTIVE',
        unread_count: 0,
      },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    await Agent.findByIdAndUpdate(agent._id, {
      $addToSet: { active_chats: room_id },
    });

    const systemMsg = await ChatMessage.create({
      room_id,
      sender_type: 'SYSTEM',
      message: `Chat assigned to ${agent.name}`,
      message_type: 'system_event',
    });

    applyLastMessage(room, {
      text: systemMsg.message,
      senderType: 'SYSTEM',
      messageType: 'system_event',
    });
    await room.save();

    const io = req.app.get('io');
    if (io) {
      io.of('/admin').to(`agent:${agent._id}`).emit('chatAssigned', {
        room_id,
        room,
      });
      io.of('/customer').to(String(room_id)).emit('agent_joined', {
        room_id,
        agent_name: agent.name,
        agent: { id: agent._id, name: agent.name, avatar: agent.avatar },
      });
      io.of('/customer').to(String(room_id)).emit('new_message', systemMsg);
    }

    return res.json({ success: true, conversation: room, room });
  } catch (err) {
    console.error('[assignAgent]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** PATCH /api/admin/rooms/:room_id/labels */
exports.setLabels = async (req, res) => {
  try {
    const { id, room_id } = req.params;
    const targetId = room_id || id;
    const { labels } = req.body || {};
    const synced = syncLabelsAndTags(labels);

    const room = await ChatRoom.findByIdAndUpdate(
      targetId,
      { labels: synced.labels, tags: synced.tags },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    return res.json({ success: true, labels: room.labels, tags: room.tags });
  } catch (err) {
    console.error('[setLabels]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** PATCH /api/admin/rooms/:room_id/priority */
exports.setPriority = async (req, res) => {
  try {
    const { room_id } = req.params;
    const { priority } = req.body || {};
    const valid = ['low', 'normal', 'high', 'urgent'];

    if (!valid.includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority' });
    }

    const room = await ChatRoom.findByIdAndUpdate(
      room_id,
      {
        priority,
        is_urgent: priority === 'urgent' || priority === 'high',
      },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    return res.json({ success: true, priority: room.priority, room });
  } catch (err) {
    console.error('[setPriority]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** GET /api/admin/canned */
exports.getCannedResponses = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};
    if (search) {
      const re = new RegExp(String(search).trim(), 'i');
      filter.$or = [{ title: re }, { text: re }, { shortcut: re }];
    }

    const responses = await CannedResponse.find(filter)
      .sort({ usage_count: -1, title: 1 })
      .lean();

    return res.json({ success: true, responses });
  } catch (err) {
    console.error('[getCannedResponses]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** POST /api/admin/canned */
exports.createCannedResponse = async (req, res) => {
  try {
    const { title, text, shortcut, category } = req.body || {};
    if (!title?.trim() || !text?.trim()) {
      return res.status(400).json({ success: false, message: 'Title and text required' });
    }

    const response = await CannedResponse.create({
      title: title.trim(),
      text: text.trim(),
      shortcut: shortcut ? String(shortcut).trim() : '',
      category: category || 'general',
      created_by: req.agent?.id || null,
    });

    return res.json({ success: true, response });
  } catch (err) {
    console.error('[createCannedResponse]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** DELETE /api/admin/canned/:id */
exports.deleteCannedResponse = async (req, res) => {
  try {
    await CannedResponse.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    console.error('[deleteCannedResponse]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** GET /api/admin/analytics */
exports.getChatAnalytics = async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    const days = period === '30d' ? 30 : period === '7d' ? 7 : 1;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalChats,
      resolvedChats,
      avgFirstResponse,
      ratingStats,
      chatsByDay,
      topLabels,
    ] = await Promise.all([
      ChatRoom.countDocuments({ createdAt: { $gte: since } }),
      ChatRoom.countDocuments({ createdAt: { $gte: since }, status: 'RESOLVED' }),
      ChatRoom.aggregate([
        {
          $match: {
            createdAt: { $gte: since },
            first_response_time: { $exists: true, $ne: null },
          },
        },
        { $group: { _id: null, avg: { $avg: '$first_response_time' } } },
      ]),
      ChatRoom.aggregate([
        { $match: { createdAt: { $gte: since }, rating: { $ne: null } } },
        {
          $group: {
            _id: null,
            avgScore: { $avg: '$rating' },
            count: { $sum: 1 },
          },
        },
      ]),
      ChatRoom.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      ChatRoom.aggregate([
        {
          $match: {
            createdAt: { $gte: since },
            labels: { $exists: true, $ne: [] },
          },
        },
        { $unwind: '$labels' },
        { $group: { _id: '$labels', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    return res.json({
      success: true,
      analytics: {
        totalChats,
        resolvedChats,
        resolutionRate:
          totalChats > 0 ? Math.round((resolvedChats / totalChats) * 100) : 0,
        avgFirstResponseSeconds: Math.round(avgFirstResponse[0]?.avg || 0),
        avgRating: Math.round((ratingStats[0]?.avgScore || 0) * 10) / 10,
        ratedChats: ratingStats[0]?.count || 0,
        chatsByDay,
        topLabels,
      },
    });
  } catch (err) {
    console.error('[getChatAnalytics]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** GET /api/admin/rooms/:room_id/customer-profile */
exports.getChatCustomerProfile = async (req, res) => {
  try {
    const { room_id } = req.params;

    const room = await withCustomerUserPopulate(ChatRoom.findById(room_id)).lean();
    if (!room) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    const profileSnap = room.customer_profile || {};
    const userId = room.user_id || profileSnap.user_id;

    if (!userId) {
      return res.json({
        success: true,
        profile: {
          name: room.guest_name || 'Guest',
          email: room.guest_email || null,
          isGuest: true,
          orderContext: room.order_metadata || null,
        },
      });
    }

    let liveProfile = null;
    let recentOrders = [];

    if (process.env.MAIN_STORE_API_URL) {
      liveProfile = await fetchProfileByUserId(String(userId));
      recentOrders = await fetchCustomerOrders(String(userId), 5);
    }

    const profile = liveProfile || profileSnap;
    const avatarUrl =
      profile.avatarUrl ||
      profile.avatar ||
      profile.image ||
      profileSnap.avatarUrl ||
      profileSnap.avatar ||
      null;

    return res.json({
      success: true,
      profile: {
        _id: userId,
        name: profile.name || room.guest_name,
        email: profile.email || room.guest_email,
        phone: profile.mobile || profile.phone || null,
        avatar: avatarUrl,
        image: avatarUrl,
        profilePic: avatarUrl,
        isVerified: profile.isVerified || false,
        memberSince: profile.memberSince || profile.fetched_at || null,
        orderCount: profile.totalOrders || 0,
        totalSpent: profile.totalSpent || 0,
        recentOrders: recentOrders || [],
        orderContext: room.order_metadata || null,
        productContext: room.product_metadata || null,
        isGuest: false,
      },
    });
  } catch (err) {
    console.error('[getChatCustomerProfile]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

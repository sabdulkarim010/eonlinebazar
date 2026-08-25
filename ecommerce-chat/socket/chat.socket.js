const jwt = require('jsonwebtoken');
const ChatRoom = require('../models/ChatRoom.model');
const ChatMessage = require('../models/ChatMessage.model');
const Agent = require('../models/Agent.model');
const { StoreConfig } = require('../models/AIKnowledgeBase.model');
const {
  getAIResponse,
  detectHandoverNeeded,
} = require('../services/ai.service');
const { sendHandoverAlert } = require('../services/notification.service');
const { sanitizeAttachments } = require('../services/upload.service');
const {
  roomOwnedBySocket,
  canAgentResolveRoom,
  socketReply,
} = require('./chatAuth');

/**
 * Notify admins after handover — email failure must not break socket flow.
 */
async function handleHandoverNotify(room, lastMessagePreview) {
  try {
    await sendHandoverAlert({
      room_id: room._id,
      guest_name: room.guest_name || 'Guest',
      last_message: lastMessagePreview || room.last_message || '',
      order_id: room.order_id || null,
    });
  } catch (err) {
    console.error('[handleHandoverNotify] email failed:', err.message);
  }
}

/** Simple in-memory rate limiter for socket events (per socket.id). */
function createSocketRateLimiter(maxPerMinute) {
  const counts = new Map();
  return function rateLimited(socket, next) {
    const key = socket.id;
    const now = Date.now();
    const windowStart = now - 60000;
    const timestamps = (counts.get(key) || []).filter((t) => t > windowStart);
    if (timestamps.length >= maxPerMinute) {
      socket.emit('error', { message: 'TOO_MANY_MESSAGES' });
      return;
    }
    timestamps.push(now);
    counts.set(key, timestamps);
    next();
  };
}

function roomPlain(room) {
  if (!room) return room;
  return typeof room.toObject === 'function' ? room.toObject() : room;
}

async function persistResolvedRoom(room, { endedBy, agent, systemText }) {
  room.status = 'RESOLVED';
  room.resolved_at = new Date();

  const systemMsg = await ChatMessage.create({
    room_id: room._id,
    sender_type: 'SYSTEM',
    sender_id: agent ? String(agent._id) : null,
    sender_name: 'System',
    message: systemText,
    is_read_by_user: endedBy === 'CUSTOMER',
    is_read_by_agent: endedBy === 'AGENT',
  });

  room.last_message = systemMsg.message;
  room.last_message_at = new Date();
  await room.save();

  const aid = (agent && agent._id) || room.assigned_agent_id;
  if (aid) {
    await Agent.findByIdAndUpdate(aid, {
      $pull: { active_chats: room._id },
      last_seen: new Date(),
    });
  }

  return { room, systemMsg };
}

function broadcastChatResolved(customerNs, adminNs, room, systemMsg, extra) {
  const room_id = String(room._id);
  const payload = {
    room_id,
    message: systemMsg,
    room: roomPlain(room),
    ...(extra || {}),
  };
  customerNs.to(room_id).emit('chat_resolved', payload);
  if (systemMsg) {
    customerNs.to(room_id).emit('new_message', systemMsg);
  }
  adminNs.emit('chat_resolved', payload);
  return payload;
}

/**
 * Initialize Socket.io namespaces: /customer and /admin
 */
function initChatSocket(io) {
  const customerNs = io.of('/customer');
  const adminNs = io.of('/admin');
  const messageRateLimiter = createSocketRateLimiter(30);
  const typingTimers = new Map();

  // ─── Customer auth: require guest session ────────────────────────
  customerNs.use(async (socket, next) => {
    const guestSessionId =
      socket.handshake.auth?.guest_session_id ||
      socket.handshake.headers?.['x-guest-session-id'];
    if (!guestSessionId) {
      return next(new Error('SESSION_REQUIRED'));
    }
    socket.data.guest_session_id = String(guestSessionId);
    if (socket.handshake.auth?.user_id) {
      socket.data.user_id = String(socket.handshake.auth.user_id);
    }
    next();
  });

  // ─── Admin auth: JWT required before connection handler ──────────
  adminNs.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization || '').replace(
          /^Bearer\s+/i,
          ''
        );
      if (!token) return next(new Error('AUTH_REQUIRED'));
      if (!process.env.JWT_SECRET) {
        return next(new Error('JWT_SECRET_MISSING'));
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const agent = await Agent.findById(decoded.id).select('-password');
      if (!agent) return next(new Error('AGENT_NOT_FOUND'));
      socket.data.agent = agent; // bind from token only
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  // ─── Customer namespace ───────────────────────────────────────────
  customerNs.on('connection', (socket) => {
    console.log(`[Customer] connected: ${socket.id}`);

    socket.on('join_room', async ({ room_id }) => {
      try {
        if (!room_id) return;

        const room = await ChatRoom.findById(room_id);
        if (!room) {
          socket.emit('error', { message: 'Chat room not found' });
          return;
        }

        if (!roomOwnedBySocket(room, socket)) {
          socket.emit('error', { message: 'UNAUTHORIZED' });
          return;
        }

        socket.join(String(room_id));
        socket.data.room_id = String(room_id);

        const messages = await ChatMessage.find({
          room_id,
          sender_type: { $ne: 'INTERNAL' },
        })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();

        messages.reverse();

        await ChatMessage.updateMany(
          {
            room_id,
            is_read_by_user: false,
            sender_type: { $ne: 'INTERNAL' },
          },
          { $set: { is_read_by_user: true } }
        );

        socket.emit('chat_history', { room_id, messages });
      } catch (err) {
        console.error('[join_room]', err.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('send_message', async (payload) => {
      messageRateLimiter(socket, async () => {
        try {
          const {
            room_id,
            message,
            sender_name,
            sender_id,
            attachments: rawAttachments = [],
          } = payload || {};

          if (!message || String(message).length > 5000) {
            if (!rawAttachments?.length) {
              return socket.emit('error', {
                message: 'INVALID_MESSAGE_LENGTH',
              });
            }
            if (message && String(message).length > 5000) {
              return socket.emit('error', {
                message: 'INVALID_MESSAGE_LENGTH',
              });
            }
          }

          if (!room_id || (!message && (!rawAttachments || !rawAttachments.length))) {
            socket.emit('error', { message: 'Invalid message payload' });
            return;
          }

          const room = await ChatRoom.findById(room_id);
          if (!room) {
            socket.emit('error', { message: 'Chat room not found' });
            return;
          }

          if (!roomOwnedBySocket(room, socket)) {
            socket.emit('error', { message: 'UNAUTHORIZED' });
            return;
          }

          if (room.status === 'RESOLVED') {
            socket.emit('error', { message: 'This chat is already resolved' });
            return;
          }

          let attachments = [];
          try {
            attachments = sanitizeAttachments(rawAttachments);
          } catch (attErr) {
            socket.emit('error', { message: attErr.message });
            return;
          }

          const userMsg = await ChatMessage.create({
            room_id,
            sender_type: 'USER',
            sender_id:
              sender_id || room.user_id || room.guest_session_id,
            sender_name: sender_name || room.guest_name || 'Guest',
            message:
              message || (attachments.length ? '[Attachment]' : ''),
            attachments,
            is_read_by_user: true,
            is_read_by_agent: false,
          });

          room.last_message = userMsg.message;
          room.last_message_at = new Date();
          room.unread_count = (room.unread_count || 0) + 1;
          await room.save();

          customerNs.to(String(room_id)).emit('new_message', userMsg);
          adminNs.emit('new_message', { room_id, message: userMsg, room });

          // Agent-handled rooms: no bot reply
          if (
            room.status === 'ACTIVE' ||
            room.status === 'WAITING_FOR_AGENT'
          ) {
            return;
          }

          // BOT status flow
          if (room.status === 'BOT') {
            let handover =
              (attachments && attachments.length > 0) ||
              (await detectHandoverNeeded(message || ''));

            let botText = '';
            let confidence = null;
            let triggered_handover = false;

            let aiError = false;

            if (attachments && attachments.length > 0) {
              botText =
                'আপনার ফাইলটি পেয়েছি। একজন লাইভ এজেন্ট শীঘ্রই এটি পর্যালোচনা করে সাহায্য করবেন।';
              handover = true;
            } else {
              const history = await ChatMessage.find({
                room_id,
                sender_type: { $ne: 'INTERNAL' },
              })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();
              history.reverse();

              const orderContext = room.order_id
                ? { order_id: room.order_id, type: room.type }
                : null;

              const ai = await getAIResponse(history, orderContext);
              botText = ai.message || '';
              confidence = ai.confidence;
              handover = handover || ai.handover;
              aiError = Boolean(ai.error);
            }

            triggered_handover = handover;

            const store = await StoreConfig.findOne()
              .select('ai_persona_name')
              .lean();
            const botName = store?.ai_persona_name || 'Aria';

            // On AI API/format error: skip BOT error bubble — SYSTEM handover only
            let botMsg = null;
            if (!aiError && botText) {
              botMsg = await ChatMessage.create({
                room_id,
                sender_type: 'BOT',
                sender_id: 'ai-bot',
                sender_name: botName,
                message: botText,
                ai_confidence: confidence,
                triggered_handover,
                is_read_by_user: false,
                is_read_by_agent: false,
              });

              room.last_message = botMsg.message;
              room.last_message_at = new Date();
            }

            if (handover) {
              room.status = 'WAITING_FOR_AGENT';
              room.is_urgent = true;
              if (!room.tags.includes('handover')) {
                room.tags.push('handover');
              }

              const systemText = aiError
                ? 'একজন প্রতিনিধি শীঘ্রই যোগ দেবেন। ⏳'
                : 'আপনার চ্যাটটি একজন লাইভ এজেন্টের কাছে পাঠানো হয়েছে। অনুগ্রহ করে অপেক্ষা করুন।';

              const systemMsg = await ChatMessage.create({
                room_id,
                sender_type: 'SYSTEM',
                sender_name: 'System',
                message: systemText,
                triggered_handover: true,
                is_read_by_user: false,
                is_read_by_agent: false,
              });

              room.last_message = systemMsg.message;
              room.last_message_at = new Date();
              await room.save();

              if (botMsg) {
                customerNs.to(String(room_id)).emit('new_message', botMsg);
                adminNs.emit('new_message', {
                  room_id,
                  message: botMsg,
                  room,
                });
              }
              customerNs.to(String(room_id)).emit('new_message', systemMsg);
              customerNs.to(String(room_id)).emit('handover_started', {
                room_id,
                status: room.status,
              });
              customerNs.to(String(room_id)).emit('waiting_for_agent', {
                room_id,
                status: room.status,
              });
              adminNs.emit('handover_started', {
                room_id,
                status: room.status,
                room,
              });
              adminNs.emit('waiting_for_agent', {
                room_id,
                status: room.status,
                room,
              });

              adminNs.emit('new_handover_request', {
                room,
                last_message: botMsg || systemMsg,
                system_message: systemMsg,
              });
              adminNs.emit('new_message', {
                room_id,
                message: systemMsg,
                room,
              });

              handleHandoverNotify(
                room,
                (botMsg && botMsg.message) || systemMsg.message
              );
            } else if (botMsg) {
              await room.save();
              customerNs.to(String(room_id)).emit('new_message', botMsg);
              adminNs.emit('new_message', {
                room_id,
                message: botMsg,
                room,
              });
            }
          }
        } catch (err) {
          console.error('[send_message]', err.message);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });
    });

    socket.on('typing_start', ({ room_id, name }) => {
      if (!room_id) return;
      if (
        socket.data.room_id &&
        String(socket.data.room_id) !== String(room_id)
      ) {
        return;
      }

      socket.to(String(room_id)).emit('user_typing', { room_id });
      socket.to(String(room_id)).emit('typing_start', {
        room_id,
        name: name || 'Guest',
      });
      adminNs.emit('customer_typing', {
        room_id,
        name: name || 'Guest',
      });
      adminNs.emit('user_typing', { room_id, name: name || 'Guest' });

      clearTimeout(typingTimers.get(socket.id));
      typingTimers.set(
        socket.id,
        setTimeout(() => {
          socket.to(String(room_id)).emit('user_stopped_typing', {
            room_id,
          });
          socket.to(String(room_id)).emit('typing_stop', { room_id });
          adminNs.emit('customer_stopped_typing', { room_id });
          adminNs.emit('user_stopped_typing', { room_id });
          typingTimers.delete(socket.id);
        }, 5000)
      );
    });

    socket.on('typing_stop', ({ room_id }) => {
      if (!room_id) return;
      clearTimeout(typingTimers.get(socket.id));
      typingTimers.delete(socket.id);
      socket.to(String(room_id)).emit('user_stopped_typing', { room_id });
      socket.to(String(room_id)).emit('typing_stop', { room_id });
      adminNs.emit('customer_stopped_typing', { room_id });
      adminNs.emit('user_stopped_typing', { room_id });
    });

    socket.on('submit_rating', async ({ room_id, rating }) => {
      try {
        if (!room_id || !rating || rating < 1 || rating > 5) {
          socket.emit('error', { message: 'Invalid rating' });
          return;
        }

        const owned = await ChatRoom.findById(room_id).select(
          'guest_session_id user_id'
        );
        if (!owned) {
          socket.emit('error', { message: 'Chat room not found' });
          return;
        }
        if (!roomOwnedBySocket(owned, socket)) {
          socket.emit('error', { message: 'UNAUTHORIZED' });
          return;
        }

        const room = await ChatRoom.findOneAndUpdate(
          { _id: room_id, is_rated: false },
          { rating: Number(rating), is_rated: true },
          { new: true }
        );

        if (!room) {
          return socket.emit('error', { message: 'ALREADY_RATED' });
        }

        customerNs.to(String(room_id)).emit('rating_submitted', {
          room_id,
          rating: room.rating,
        });
        adminNs.emit('rating_submitted', {
          room_id,
          rating: room.rating,
        });
      } catch (err) {
        console.error('[submit_rating]', err.message);
        socket.emit('error', { message: 'Failed to submit rating' });
      }
    });

    socket.on('end_chat', async (payload, ack) => {
      const reply = (data) =>
        socketReply(socket, ack, 'end_chat_ok', 'end_chat_failed', data);

      try {
        const room_id = payload && payload.room_id;
        if (!room_id) {
          return reply({ ok: false, message: 'room_id required' });
        }

        const room = await ChatRoom.findById(room_id);
        if (!room) {
          return reply({ ok: false, message: 'Chat room not found' });
        }

        if (!roomOwnedBySocket(room, socket)) {
          return reply({ ok: false, message: 'UNAUTHORIZED' });
        }

        if (room.status === 'RESOLVED') {
          socket.leave(String(room_id));
          return reply({
            ok: true,
            room_id: String(room_id),
            already_resolved: true,
            ended_by: 'CUSTOMER',
          });
        }

        const { systemMsg } = await persistResolvedRoom(room, {
          endedBy: 'CUSTOMER',
          agent: null,
          systemText: 'গ্রাহক চ্যাটটি শেষ করেছেন।',
        });

        broadcastChatResolved(customerNs, adminNs, room, systemMsg, {
          ended_by: 'CUSTOMER',
        });
        socket.leave(String(room_id));

        return reply({
          ok: true,
          room_id: String(room_id),
          already_resolved: false,
          ended_by: 'CUSTOMER',
        });
      } catch (err) {
        console.error('[end_chat]', err.message);
        return reply({ ok: false, message: 'Failed to end chat' });
      }
    });

    socket.on('disconnect', () => {
      clearTimeout(typingTimers.get(socket.id));
      typingTimers.delete(socket.id);
      console.log(`[Customer] disconnected: ${socket.id}`);
    });
  });

  // ─── Admin namespace ──────────────────────────────────────────────
  adminNs.on('connection', (socket) => {
    console.log(`[Admin] connected: ${socket.id}`);

    // Auto-bind online status from authenticated agent (token only)
    const authAgent = socket.data.agent;
    if (authAgent) {
      Agent.findByIdAndUpdate(authAgent._id, {
        is_online: true,
        socket_id: socket.id,
        last_seen: new Date(),
      })
        .then((agent) => {
          if (!agent) return;
          socket.join(`agent:${agent._id}`);
          adminNs.emit('agent_status_change', {
            agent_id: agent._id,
            is_online: true,
            name: agent.name,
          });
        })
        .catch((err) =>
          console.error('[admin auto-online]', err.message)
        );
    }

    socket.on('agent_online', async () => {
      try {
        const agent = socket.data.agent;
        if (!agent) {
          socket.emit('error', { message: 'AUTH_REQUIRED' });
          return;
        }

        const updated = await Agent.findByIdAndUpdate(
          agent._id,
          {
            is_online: true,
            socket_id: socket.id,
            last_seen: new Date(),
          },
          { new: true }
        ).select('-password');

        if (!updated) {
          socket.emit('error', { message: 'Agent not found' });
          return;
        }

        socket.data.agent = updated;
        socket.data.presence = 'online';
        socket.join(`agent:${updated._id}`);

        adminNs.emit('agent_status_change', {
          agent_id: updated._id,
          is_online: true,
          status: 'online',
          name: updated.name,
          role: updated.role,
          active_chats: Array.isArray(updated.active_chats)
            ? updated.active_chats.length
            : 0,
        });
      } catch (err) {
        console.error('[agent_online]', err.message);
        socket.emit('error', { message: 'Failed to set agent online' });
      }
    });

    socket.on('agent_away', async () => {
      try {
        const agent = socket.data.agent;
        if (!agent) {
          socket.emit('error', { message: 'AUTH_REQUIRED' });
          return;
        }

        const updated = await Agent.findByIdAndUpdate(
          agent._id,
          {
            is_online: true,
            socket_id: socket.id,
            last_seen: new Date(),
          },
          { new: true }
        ).select('-password');

        if (!updated) {
          socket.emit('error', { message: 'Agent not found' });
          return;
        }

        socket.data.agent = updated;
        socket.data.presence = 'away';

        adminNs.emit('agent_status_change', {
          agent_id: updated._id,
          is_online: true,
          status: 'away',
          name: updated.name,
          role: updated.role,
          active_chats: Array.isArray(updated.active_chats)
            ? updated.active_chats.length
            : 0,
        });
      } catch (err) {
        console.error('[agent_away]', err.message);
        socket.emit('error', { message: 'Failed to set agent away' });
      }
    });

    socket.on('agent_offline', async () => {
      try {
        const agent = socket.data.agent;
        if (!agent) {
          socket.emit('error', { message: 'AUTH_REQUIRED' });
          return;
        }

        const updated = await Agent.findByIdAndUpdate(
          agent._id,
          {
            is_online: false,
            socket_id: null,
            last_seen: new Date(),
          },
          { new: true }
        ).select('-password');

        if (!updated) {
          socket.emit('error', { message: 'Agent not found' });
          return;
        }

        socket.data.presence = 'offline';

        adminNs.emit('agent_status_change', {
          agent_id: updated._id,
          is_online: false,
          status: 'offline',
          name: updated.name,
          role: updated.role,
          active_chats: 0,
        });
      } catch (err) {
        console.error('[agent_offline]', err.message);
        socket.emit('error', { message: 'Failed to set agent offline' });
      }
    });

    socket.on('join_room', async ({ room_id }) => {
      try {
        if (!room_id || !socket.data.agent) return;
        const room = await ChatRoom.findById(room_id).select('_id');
        if (!room) {
          socket.emit('error', { message: 'Chat room not found' });
          return;
        }
        socket.join(String(room_id));
      } catch (err) {
        console.error('[admin join_room]', err.message);
      }
    });

    socket.on('leave_room', ({ room_id }) => {
      if (!room_id || !socket.data.agent) return;
      socket.leave(String(room_id));
    });

    socket.on('take_chat', async ({ room_id }) => {
      try {
        const agent = socket.data.agent;
        if (!agent || !room_id) {
          socket.emit('error', {
            message: 'room_id required and agent must be authenticated',
          });
          return;
        }

        const currentAgent = await Agent.findById(agent._id);
        if (!currentAgent) {
          socket.emit('error', { message: 'Agent not found' });
          return;
        }

        if (
          currentAgent.active_chats.length >=
          currentAgent.max_concurrent_chats
        ) {
          return socket.emit('error', { message: 'MAX_CHATS_REACHED' });
        }

        // Atomic findOneAndUpdate — only succeeds if still WAITING
        const room = await ChatRoom.findOneAndUpdate(
          {
            _id: room_id,
            status: 'WAITING_FOR_AGENT',
            assigned_agent_id: null,
          },
          {
            status: 'ACTIVE',
            assigned_agent_id: agent._id,
            unread_count: 0,
            is_urgent: false,
          },
          { new: true }
        );

        if (!room) {
          return socket.emit('take_chat_failed', {
            message:
              'এই চ্যাটটি ইতিমধ্যে অন্য একজন নিয়ে নিয়েছেন।',
          });
        }

        socket.join(String(room_id));

        const systemMsg = await ChatMessage.create({
          room_id,
          sender_type: 'SYSTEM',
          message: `${agent.name} এখন আপনাকে সাহায্য করবেন। 👋`,
        });

        room.last_message = systemMsg.message;
        room.last_message_at = new Date();
        await room.save();

        io.of('/customer').to(String(room_id)).emit('new_message', systemMsg);
        io.of('/customer').to(String(room_id)).emit('agent_joined', {
          room_id,
          agent_name: agent.name,
          agent: {
            id: agent._id,
            name: agent.name,
            avatar: agent.avatar,
          },
          message: systemMsg,
        });

        adminNs.emit('room_status_changed', {
          room_id,
          status: 'ACTIVE',
          agent,
          room,
        });
        adminNs.emit('chat_taken', {
          room_id,
          agent_id: agent._id,
          agent_name: agent.name,
          room,
          message: systemMsg,
        });

        await Agent.findByIdAndUpdate(agent._id, {
          $addToSet: { active_chats: room_id },
          $inc: { total_chats_handled: 1 },
          last_seen: new Date(),
        });
      } catch (err) {
        console.error('[take_chat]', err.message);
        socket.emit('error', { message: 'Failed to take chat' });
      }
    });

    socket.on('agent_message', async (payload) => {
      messageRateLimiter(socket, async () => {
        try {
          const agent = socket.data.agent;
          const { room_id, message, attachments: rawAttachments = [] } =
            payload || {};

          if (
            !room_id ||
            !agent ||
            (!message && !rawAttachments.length)
          ) {
            socket.emit('error', {
              message: 'Invalid agent message payload',
            });
            return;
          }

          if (message && String(message).length > 5000) {
            return socket.emit('error', {
              message: 'INVALID_MESSAGE_LENGTH',
            });
          }

          const room = await ChatRoom.findById(room_id);
          if (!room) {
            socket.emit('error', { message: 'Agent or room not found' });
            return;
          }

          if (room.status !== 'ACTIVE') {
            return socket.emit('error', {
              message: 'Room is not active',
            });
          }

          if (
            !room.assigned_agent_id ||
            String(room.assigned_agent_id) !== String(agent._id)
          ) {
            return socket.emit('error', {
              message: 'Not assigned to this room',
            });
          }

          let attachments = [];
          try {
            attachments = sanitizeAttachments(rawAttachments);
          } catch (attErr) {
            socket.emit('error', { message: attErr.message });
            return;
          }

          const agentMsg = await ChatMessage.create({
            room_id,
            sender_type: 'AGENT',
            sender_id: String(agent._id),
            sender_name: agent.name,
            message: message || '[Attachment]',
            attachments,
            is_read_by_agent: true,
            is_read_by_user: false,
          });

          room.last_message = agentMsg.message;
          room.last_message_at = new Date();
          room.unread_count = 0;
          await room.save();

          customerNs.to(String(room_id)).emit('new_message', agentMsg);
          adminNs.emit('new_message', {
            room_id,
            message: agentMsg,
            room,
          });
        } catch (err) {
          console.error('[agent_message]', err.message);
          socket.emit('error', { message: 'Failed to send agent message' });
        }
      });
    });

    socket.on('internal_note', async ({ room_id, message }) => {
      try {
        const agent = socket.data.agent;
        if (!agent || !room_id || !message) {
          socket.emit('error', { message: 'Invalid internal note' });
          return;
        }
        if (String(message).length > 5000) {
          return socket.emit('error', {
            message: 'INVALID_MESSAGE_LENGTH',
          });
        }

        const note = await ChatMessage.create({
          room_id,
          sender_type: 'INTERNAL',
          sender_id: String(agent._id),
          sender_name: agent.name,
          message,
          is_read_by_agent: true,
          is_read_by_user: false,
        });

        // Emit ONLY to admin namespace, never to /customer
        adminNs.to(String(room_id)).emit('new_message', note);
        adminNs.emit('new_message', {
          room_id,
          message: note,
        });
      } catch (err) {
        console.error('[internal_note]', err.message);
        socket.emit('error', { message: 'Failed to save internal note' });
      }
    });

    socket.on('transfer_chat', async ({ room_id, target_agent_id, to_agent_id }) => {
      try {
        const fromAgent = socket.data.agent;
        const targetId = target_agent_id || to_agent_id;
        const room = await ChatRoom.findById(room_id);

        if (
          !room ||
          room.assigned_agent_id?.toString() !== fromAgent._id.toString()
        ) {
          return socket.emit('error', {
            message: 'Not authorized to transfer this chat',
          });
        }

        const targetAgent = await Agent.findById(targetId);
        if (!targetAgent || !targetAgent.is_online) {
          return socket.emit('error', {
            message: 'Target agent not available',
          });
        }

        if (
          targetAgent.active_chats.length >=
          targetAgent.max_concurrent_chats
        ) {
          return socket.emit('error', {
            message: 'Target agent at max capacity',
          });
        }

        await ChatRoom.findByIdAndUpdate(room_id, {
          assigned_agent_id: targetId,
        });

        await Agent.findByIdAndUpdate(fromAgent._id, {
          $pull: { active_chats: room_id },
        });
        await Agent.findByIdAndUpdate(targetId, {
          $addToSet: { active_chats: room_id },
        });

        const sysMsg = await ChatMessage.create({
          room_id,
          sender_type: 'SYSTEM',
          message: `চ্যাটটি ${targetAgent.name}-এর কাছে ট্রান্সফার করা হয়েছে।`,
        });

        io.of('/customer').to(String(room_id)).emit('new_message', sysMsg);
        adminNs.emit('chat_transferred', {
          room_id,
          from_agent: fromAgent.name,
          to_agent: targetAgent.name,
        });
        adminNs.emit('new_message', {
          room_id,
          message: sysMsg,
        });

        const targetSocketId = targetAgent.socket_id;
        if (targetSocketId) {
          const targetSocket = adminNs.sockets.get(targetSocketId);
          if (targetSocket) targetSocket.join(String(room_id));
        }
      } catch (err) {
        console.error('[transfer_chat]', err.message);
        socket.emit('error', { message: 'Failed to transfer chat' });
      }
    });

    socket.on('resolve_chat', async (payload, ack) => {
      const reply = (data) =>
        socketReply(socket, ack, 'resolve_chat_ok', 'resolve_chat_failed', data);

      try {
        const agent = socket.data.agent;
        const room_id = payload && payload.room_id;

        if (!agent) {
          return reply({ ok: false, message: 'AUTH_REQUIRED' });
        }
        if (!room_id) {
          return reply({ ok: false, message: 'room_id required' });
        }

        const room = await ChatRoom.findById(room_id);
        if (!room) {
          return reply({ ok: false, message: 'Chat room not found' });
        }

        if (!canAgentResolveRoom(room, agent)) {
          return reply({
            ok: false,
            message: 'Not assigned to this room',
          });
        }

        if (room.status === 'RESOLVED') {
          socket.leave(String(room_id));
          return reply({
            ok: true,
            room_id: String(room_id),
            already_resolved: true,
            ended_by: 'AGENT',
          });
        }

        const { systemMsg } = await persistResolvedRoom(room, {
          endedBy: 'AGENT',
          agent,
          systemText:
            'এই চ্যাটটি সমাধান করা হয়েছে। অনুগ্রহ করে আমাদের সেবা রেট করুন (১–৫)।',
        });

        broadcastChatResolved(customerNs, adminNs, room, systemMsg, {
          ended_by: 'AGENT',
        });
        socket.leave(String(room_id));

        return reply({
          ok: true,
          room_id: String(room_id),
          already_resolved: false,
          ended_by: 'AGENT',
        });
      } catch (err) {
        console.error('[resolve_chat]', err.message);
        return reply({ ok: false, message: 'Failed to resolve chat' });
      }
    });

    socket.on('agent_typing', ({ room_id, agent_name }) => {
      if (!room_id) return;
      const agent = socket.data.agent;
      customerNs.to(String(room_id)).emit('agent_typing', {
        room_id,
        name: agent_name || agent?.name || 'Agent',
      });
    });

    socket.on('agent_stopped_typing', ({ room_id }) => {
      if (!room_id) return;
      customerNs.to(String(room_id)).emit('agent_stopped_typing', {
        room_id,
      });
    });

    socket.on('disconnect', async () => {
      try {
        const agent = socket.data.agent;
        if (!agent) {
          console.log(`[Admin] disconnected: ${socket.id}`);
          return;
        }

        const updated = await Agent.findOneAndUpdate(
          { _id: agent._id, socket_id: socket.id },
          {
            is_online: false,
            socket_id: null,
            last_seen: new Date(),
          },
          { new: true }
        ).select('-password');

        if (updated) {
          adminNs.emit('agent_status_change', {
            agent_id: updated._id,
            is_online: false,
            name: updated.name,
          });
        }

        console.log(`[Admin] disconnected: ${socket.id}`);
      } catch (err) {
        console.error('[admin disconnect]', err.message);
      }
    });
  });

  return { customerNs, adminNs };
}

module.exports = { initChatSocket };

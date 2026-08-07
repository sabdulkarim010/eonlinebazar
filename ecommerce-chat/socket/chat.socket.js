const ChatRoom = require('../models/ChatRoom.model');
const ChatMessage = require('../models/ChatMessage.model');
const Agent = require('../models/Agent.model');
const { StoreConfig } = require('../models/AIKnowledgeBase.model');
const {
  getAIResponse,
  detectHandoverNeeded,
} = require('../services/ai.service');
const { sendHandoverAlert } = require('../services/notification.service');

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

/**
 * Initialize Socket.io namespaces: /customer and /admin
 */
function initChatSocket(io) {
  const customerNs = io.of('/customer');
  const adminNs = io.of('/admin');

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

        socket.join(String(room_id));
        socket.data.room_id = String(room_id);

        const messages = await ChatMessage.find({ room_id })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();

        messages.reverse();

        await ChatMessage.updateMany(
          { room_id, is_read_by_user: false },
          { $set: { is_read_by_user: true } }
        );

        socket.emit('chat_history', { room_id, messages });
      } catch (err) {
        console.error('[join_room]', err.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('send_message', async (payload) => {
      try {
        const {
          room_id,
          message,
          sender_name,
          sender_id,
          attachments = [],
        } = payload || {};

        if (!room_id || (!message && (!attachments || !attachments.length))) {
          socket.emit('error', { message: 'Invalid message payload' });
          return;
        }

        const room = await ChatRoom.findById(room_id);
        if (!room) {
          socket.emit('error', { message: 'Chat room not found' });
          return;
        }

        if (room.status === 'RESOLVED') {
          socket.emit('error', { message: 'This chat is already resolved' });
          return;
        }

        const userMsg = await ChatMessage.create({
          room_id,
          sender_type: 'USER',
          sender_id: sender_id || room.user_id || room.guest_session_id,
          sender_name: sender_name || room.guest_name || 'Guest',
          message: message || (attachments.length ? '[Attachment]' : ''),
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
        if (room.status === 'ACTIVE' || room.status === 'WAITING_FOR_AGENT') {
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

          if (attachments && attachments.length > 0) {
            botText =
              'আপনার ফাইলটি পেয়েছি। একজন লাইভ এজেন্ট শীঘ্রই এটি পর্যালোচনা করে সাহায্য করবেন।';
            handover = true;
          } else {
            const history = await ChatMessage.find({ room_id })
              .sort({ createdAt: -1 })
              .limit(10)
              .lean();
            history.reverse();

            const orderContext = room.order_id
              ? { order_id: room.order_id, type: room.type }
              : null;

            const ai = await getAIResponse(history, orderContext);
            botText = ai.message;
            confidence = ai.confidence;
            handover = handover || ai.handover;
          }

          triggered_handover = handover;

          const store = await StoreConfig.findOne().select('ai_persona_name').lean();
          const botName = store?.ai_persona_name || 'Aria';

          const botMsg = await ChatMessage.create({
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

          if (handover) {
            room.status = 'WAITING_FOR_AGENT';
            room.is_urgent = true;
            if (!room.tags.includes('handover')) {
              room.tags.push('handover');
            }

            const systemMsg = await ChatMessage.create({
              room_id,
              sender_type: 'SYSTEM',
              sender_name: 'System',
              message:
                'আপনার চ্যাটটি একজন লাইভ এজেন্টের কাছে পাঠানো হয়েছে। অনুগ্রহ করে অপেক্ষা করুন।',
              triggered_handover: true,
              is_read_by_user: false,
              is_read_by_agent: false,
            });

            await room.save();

            customerNs.to(String(room_id)).emit('new_message', botMsg);
            customerNs.to(String(room_id)).emit('new_message', systemMsg);
            customerNs.to(String(room_id)).emit('handover_started', {
              room_id,
              status: room.status,
            });

            adminNs.emit('new_handover_request', {
              room,
              last_message: botMsg,
              system_message: systemMsg,
            });
            adminNs.emit('new_message', { room_id, message: botMsg, room });
            adminNs.emit('new_message', { room_id, message: systemMsg, room });

            // Email alert (non-blocking for socket flow)
            handleHandoverNotify(room, botMsg.message);
          } else {
            await room.save();
            customerNs.to(String(room_id)).emit('new_message', botMsg);
            adminNs.emit('new_message', { room_id, message: botMsg, room });
          }
        }
      } catch (err) {
        console.error('[send_message]', err.message);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('typing_start', ({ room_id, name }) => {
      if (!room_id) return;
      socket.to(String(room_id)).emit('typing_start', {
        room_id,
        name: name || 'Guest',
      });
      adminNs.emit('customer_typing', { room_id, name: name || 'Guest' });
    });

    socket.on('typing_stop', ({ room_id }) => {
      if (!room_id) return;
      socket.to(String(room_id)).emit('typing_stop', { room_id });
      adminNs.emit('customer_stopped_typing', { room_id });
    });

    socket.on('submit_rating', async ({ room_id, rating }) => {
      try {
        if (!room_id || !rating || rating < 1 || rating > 5) {
          socket.emit('error', { message: 'Invalid rating' });
          return;
        }

        const room = await ChatRoom.findByIdAndUpdate(
          room_id,
          { rating: Number(rating) },
          { new: true }
        );

        if (!room) {
          socket.emit('error', { message: 'Chat room not found' });
          return;
        }

        customerNs.to(String(room_id)).emit('rating_submitted', {
          room_id,
          rating: room.rating,
        });
        adminNs.emit('rating_submitted', { room_id, rating: room.rating });
      } catch (err) {
        console.error('[submit_rating]', err.message);
        socket.emit('error', { message: 'Failed to submit rating' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Customer] disconnected: ${socket.id}`);
    });
  });

  // ─── Admin namespace ──────────────────────────────────────────────
  adminNs.on('connection', (socket) => {
    console.log(`[Admin] connected: ${socket.id}`);

    socket.on('agent_online', async ({ agent_id }) => {
      try {
        if (!agent_id) return;

        const agent = await Agent.findByIdAndUpdate(
          agent_id,
          {
            is_online: true,
            socket_id: socket.id,
            last_seen: new Date(),
          },
          { new: true }
        ).select('-password');

        if (!agent) {
          socket.emit('error', { message: 'Agent not found' });
          return;
        }

        socket.data.agent_id = String(agent_id);
        socket.join(`agent:${agent_id}`);

        adminNs.emit('agent_status_change', {
          agent_id: agent._id,
          is_online: true,
          name: agent.name,
        });
      } catch (err) {
        console.error('[agent_online]', err.message);
        socket.emit('error', { message: 'Failed to set agent online' });
      }
    });

    socket.on('take_chat', async ({ room_id, agent_id }) => {
      try {
        if (!room_id || !agent_id) {
          socket.emit('error', { message: 'room_id and agent_id required' });
          return;
        }

        const agent = await Agent.findById(agent_id);
        if (!agent) {
          socket.emit('error', { message: 'Agent not found' });
          return;
        }

        if (
          agent.active_chats.length >= agent.max_concurrent_chats &&
          !agent.active_chats.map(String).includes(String(room_id))
        ) {
          socket.emit('error', {
            message: 'Maximum concurrent chats reached',
          });
          return;
        }

        const room = await ChatRoom.findById(room_id);
        if (!room) {
          socket.emit('error', { message: 'Chat room not found' });
          return;
        }

        if (room.status === 'RESOLVED') {
          socket.emit('error', { message: 'Chat already resolved' });
          return;
        }

        room.status = 'ACTIVE';
        room.assigned_agent_id = agent._id;
        room.is_urgent = false;
        await room.save();

        socket.join(String(room_id));

        if (!agent.active_chats.map(String).includes(String(room_id))) {
          agent.active_chats.push(room._id);
        }
        agent.total_chats_handled += 1;
        agent.last_seen = new Date();
        await agent.save();

        const systemMsg = await ChatMessage.create({
          room_id,
          sender_type: 'SYSTEM',
          sender_id: String(agent._id),
          sender_name: 'System',
          message: `${agent.name} চ্যাটে যোগ দিয়েছেন। এখন আপনি লাইভ সাপোর্ট পাচ্ছেন।`,
          is_read_by_user: false,
          is_read_by_agent: true,
        });

        room.last_message = systemMsg.message;
        room.last_message_at = new Date();
        await room.save();

        customerNs.to(String(room_id)).emit('agent_joined', {
          room_id,
          agent: {
            id: agent._id,
            name: agent.name,
            avatar: agent.avatar,
          },
          message: systemMsg,
        });
        customerNs.to(String(room_id)).emit('new_message', systemMsg);

        adminNs.emit('chat_taken', {
          room_id,
          agent_id: agent._id,
          agent_name: agent.name,
          room,
          message: systemMsg,
        });
      } catch (err) {
        console.error('[take_chat]', err.message);
        socket.emit('error', { message: 'Failed to take chat' });
      }
    });

    socket.on('agent_message', async (payload) => {
      try {
        const { room_id, agent_id, message, attachments = [] } = payload || {};

        if (!room_id || !agent_id || (!message && !attachments.length)) {
          socket.emit('error', { message: 'Invalid agent message payload' });
          return;
        }

        const agent = await Agent.findById(agent_id);
        const room = await ChatRoom.findById(room_id);

        if (!agent || !room) {
          socket.emit('error', { message: 'Agent or room not found' });
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
        // Broadcast once to all admins (avoid room+global double emit duplicates)
        adminNs.emit('new_message', { room_id, message: agentMsg, room });
      } catch (err) {
        console.error('[agent_message]', err.message);
        socket.emit('error', { message: 'Failed to send agent message' });
      }
    });

    socket.on('resolve_chat', async ({ room_id, agent_id }) => {
      try {
        if (!room_id) {
          socket.emit('error', { message: 'room_id required' });
          return;
        }

        const room = await ChatRoom.findById(room_id);
        if (!room) {
          socket.emit('error', { message: 'Chat room not found' });
          return;
        }

        room.status = 'RESOLVED';
        room.resolved_at = new Date();
        await room.save();

        const systemMsg = await ChatMessage.create({
          room_id,
          sender_type: 'SYSTEM',
          sender_id: agent_id || null,
          sender_name: 'System',
          message:
            'এই চ্যাটটি সমাধান করা হয়েছে। অনুগ্রহ করে আমাদের সেবা রেট করুন (১–৫)।',
          is_read_by_user: false,
          is_read_by_agent: true,
        });

        room.last_message = systemMsg.message;
        room.last_message_at = new Date();
        await room.save();

        if (agent_id || room.assigned_agent_id) {
          const aid = agent_id || room.assigned_agent_id;
          await Agent.findByIdAndUpdate(aid, {
            $pull: { active_chats: room._id },
            last_seen: new Date(),
          });
        }

        customerNs.to(String(room_id)).emit('chat_resolved', {
          room_id,
          message: systemMsg,
          room,
        });
        customerNs.to(String(room_id)).emit('new_message', systemMsg);

        adminNs.emit('chat_resolved', {
          room_id,
          message: systemMsg,
          room,
        });
      } catch (err) {
        console.error('[resolve_chat]', err.message);
        socket.emit('error', { message: 'Failed to resolve chat' });
      }
    });

    socket.on('agent_typing', ({ room_id, agent_name }) => {
      if (!room_id) return;
      customerNs.to(String(room_id)).emit('agent_typing', {
        room_id,
        name: agent_name || 'Agent',
      });
    });

    socket.on('agent_stopped_typing', ({ room_id }) => {
      if (!room_id) return;
      customerNs.to(String(room_id)).emit('agent_stopped_typing', { room_id });
    });

    socket.on('disconnect', async () => {
      try {
        const agentId = socket.data.agent_id;
        if (!agentId) {
          console.log(`[Admin] disconnected: ${socket.id}`);
          return;
        }

        const agent = await Agent.findOneAndUpdate(
          { _id: agentId, socket_id: socket.id },
          {
            is_online: false,
            socket_id: null,
            last_seen: new Date(),
          },
          { new: true }
        ).select('-password');

        if (agent) {
          adminNs.emit('agent_status_change', {
            agent_id: agent._id,
            is_online: false,
            name: agent.name,
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

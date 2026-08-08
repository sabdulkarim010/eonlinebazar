const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    guest_session_id: {
      type: String,
      default: null,
      index: true,
    },
    guest_name: {
      type: String,
      default: 'Guest',
      trim: true,
    },
    guest_email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    type: {
      type: String,
      enum: ['ORDER_SUPPORT', 'GENERAL'],
      required: true,
      default: 'GENERAL',
    },
    order_id: {
      type: String,
      default: null,
      index: true,
    },
    /**
     * Snapshot of order context at chat start so admins see
     * order number / items / total without a live store lookup.
     */
    order_metadata: {
      type: new mongoose.Schema(
        {
          order_number: { type: String, default: null },
          order_mongo_id: { type: String, default: null },
          items: [
            {
              name: { type: String, default: '' },
              quantity: { type: Number, default: 1 },
              price: { type: Number, default: 0 },
            },
          ],
          total_amount: { type: Number, default: null },
          status: { type: String, default: null },
          currency: { type: String, default: 'BDT' },
        },
        { _id: false }
      ),
      default: null,
    },
    status: {
      type: String,
      enum: ['BOT', 'WAITING_FOR_AGENT', 'ACTIVE', 'RESOLVED'],
      default: 'BOT',
      index: true,
    },
    assigned_agent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null,
    },
    last_message: {
      type: String,
      default: '',
    },
    last_message_at: {
      type: Date,
      default: Date.now,
    },
    unread_count: {
      type: Number,
      default: 0,
    },
    is_urgent: {
      type: Boolean,
      default: false,
    },
    tags: {
      type: [String],
      default: [],
    },
    resolved_at: {
      type: Date,
      default: null,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    is_rated: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

chatRoomSchema.index({ guest_session_id: 1, type: 1, order_id: 1, status: 1 });
chatRoomSchema.index({ status: 1, last_message_at: -1 });

module.exports = mongoose.model('ChatRoom', chatRoomSchema);

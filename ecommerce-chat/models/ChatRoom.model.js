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
    is_registered: {
      type: Boolean,
      default: false,
      index: true,
    },
    /**
     * Snapshot of registered customer profile from main store at chat start / link.
     */
    customer_profile: {
      type: new mongoose.Schema(
        {
          user_id: { type: String, default: null },
          name: { type: String, default: null },
          email: { type: String, default: null },
          mobile: { type: String, default: null },
          avatar: { type: String, default: '' },
          avatarUrl: { type: String, default: null },
          defaultAddress: {
            type: new mongoose.Schema(
              {
                label: { type: String, default: 'Home' },
                fullAddress: { type: String, default: '' },
                upazilaOrThana: { type: String, default: '' },
                district: { type: String, default: '' },
                phone: { type: String, default: '' },
                formatted: { type: String, default: '' },
              },
              { _id: false }
            ),
            default: null,
          },
          fetched_at: { type: Date, default: null },
          totalOrders: { type: Number, default: 0 },
          totalSpent: { type: Number, default: 0 },
          memberSince: { type: Date, default: null },
          isVerified: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: null,
    },
    /**
     * Product page context when chat started from PDP.
     */
    product_metadata: {
      type: new mongoose.Schema(
        {
          product_id: { type: String, default: null },
          title: { type: String, default: '' },
          image: { type: String, default: '' },
          price: { type: Number, default: null },
          url: { type: String, default: '' },
          slug: { type: String, default: '' },
          currency: { type: String, default: 'BDT' },
        },
        { _id: false }
      ),
      default: null,
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
              image: { type: String, default: '' },
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
    assigned_at: {
      type: Date,
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
    last_message_preview: {
      type: new mongoose.Schema(
        {
          text: { type: String, default: '' },
          sender: { type: String, default: '' },
          sentAt: { type: Date, default: null },
          type: { type: String, default: 'text' },
        },
        { _id: false }
      ),
      default: null,
    },
    /** Agent-side unread count (legacy field name kept for compatibility). */
    unread_count: {
      type: Number,
      default: 0,
    },
    unread_by_customer: {
      type: Number,
      default: 0,
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
      index: true,
    },
    is_urgent: {
      type: Boolean,
      default: false,
    },
    tags: {
      type: [String],
      default: [],
    },
    /** Alias-friendly labels — kept in sync with tags via API. */
    labels: {
      type: [String],
      default: [],
    },
    internal_notes: {
      type: [
        new mongoose.Schema(
          {
            text: { type: String, required: true },
            agent_id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'Agent',
              default: null,
            },
            agent_name: { type: String, default: '' },
            created_at: { type: Date, default: Date.now },
          },
          { _id: true }
        ),
      ],
      default: [],
    },
    resolved_at: {
      type: Date,
      default: null,
    },
    closed_at: {
      type: Date,
      default: null,
    },
    closed_by: {
      type: String,
      enum: ['agent', 'customer', 'system', null],
      default: null,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    rating_feedback: {
      type: String,
      default: null,
      maxlength: 2000,
    },
    rated_at: {
      type: Date,
      default: null,
    },
    is_rated: {
      type: Boolean,
      default: false,
    },
    source: {
      type: String,
      enum: ['web', 'mobile', 'order_page', 'product_page', 'whatsapp'],
      default: 'web',
      index: true,
    },
    first_response_at: {
      type: Date,
      default: null,
    },
    first_response_time: {
      type: Number,
      default: null,
    },
    avg_response_time: {
      type: Number,
      default: null,
    },
    queue_position: {
      type: Number,
      default: null,
    },
    estimated_wait_minutes: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

chatRoomSchema.index({ guest_session_id: 1, type: 1, order_id: 1, status: 1 });
chatRoomSchema.index({ status: 1, last_message_at: -1 });
chatRoomSchema.index({ assigned_agent_id: 1, status: 1 });
chatRoomSchema.index({ user_id: 1 });
chatRoomSchema.index({ order_id: 1 });

module.exports = mongoose.model('ChatRoom', chatRoomSchema);

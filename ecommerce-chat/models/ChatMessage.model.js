const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    thumbnail_url: { type: String, default: '' },
    type: { type: String, default: 'file' },
    filename: { type: String, default: '' },
    size: { type: Number, default: 0 },
    public_id: { type: String, default: '' },
  },
  { _id: false }
);

const quickReplySchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    room_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatRoom',
      required: true,
      index: true,
    },
    sender_type: {
      type: String,
      enum: ['USER', 'BOT', 'AGENT', 'SYSTEM', 'INTERNAL'],
      required: true,
    },
    sender_id: {
      type: String,
      default: null,
    },
    sender_name: {
      type: String,
      default: '',
    },
    sender_avatar: {
      type: String,
      default: '',
    },
    message_type: {
      type: String,
      enum: [
        'text',
        'image',
        'file',
        'order_card',
        'quick_reply',
        'system_event',
        'typing',
      ],
      default: 'text',
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    order_card: {
      type: new mongoose.Schema(
        {
          order_id: { type: mongoose.Schema.Types.ObjectId, default: null },
          order_number: { type: String, default: '' },
          status: { type: String, default: '' },
          total: { type: Number, default: null },
          items: [
            {
              name: { type: String, default: '' },
              image: { type: String, default: '' },
            },
          ],
        },
        { _id: false }
      ),
      default: null,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
      validate: {
        validator(v) {
          return !v || v.length <= 5;
        },
        message: 'Maximum 5 attachments per message',
      },
    },
    quick_replies: {
      type: [quickReplySchema],
      default: [],
    },
    is_read_by_agent: {
      type: Boolean,
      default: false,
    },
    is_read_by_user: {
      type: Boolean,
      default: false,
    },
    read_by: {
      type: [
        new mongoose.Schema(
          {
            user_id: { type: mongoose.Schema.Types.ObjectId, default: null },
            role: { type: String, default: '' },
            read_at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
    is_internal: {
      type: Boolean,
      default: false,
    },
    ai_confidence: {
      type: Number,
      default: null,
    },
    triggered_handover: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

chatMessageSchema.index({ room_id: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);

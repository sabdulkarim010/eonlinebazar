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
      enum: ['USER', 'BOT', 'AGENT', 'SYSTEM'],
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
    message: {
      type: String,
      required: true,
      trim: true,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
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

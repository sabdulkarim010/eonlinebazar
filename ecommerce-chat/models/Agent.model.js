const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const agentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['SUPER_ADMIN', 'ADMIN', 'AGENT'],
      default: 'AGENT',
    },
    avatar: {
      type: String,
      default: null,
    },
    is_online: {
      type: Boolean,
      default: false,
    },
    socket_id: {
      type: String,
      default: null,
    },
    active_chats: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ChatRoom',
      },
    ],
    max_concurrent_chats: {
      type: Number,
      default: 5,
    },
    total_chats_handled: {
      type: Number,
      default: 0,
    },
    avg_response_time_seconds: {
      type: Number,
      default: 0,
    },
    last_seen: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

agentSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

agentSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('Agent', agentSchema);

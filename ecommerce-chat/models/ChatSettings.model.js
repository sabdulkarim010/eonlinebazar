const mongoose = require('mongoose');

const chatSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'global',
      unique: true,
    },
    botName: {
      type: String,
      default: 'Aria',
    },
    botAvatar: {
      type: String,
      default: null,
    },
    botAvatarPublicId: {
      type: String,
      default: null,
    },
    quickReplies: [
      {
        id: String,
        label: String,
        value: String,
        isVisible: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
      },
    ],
    welcomeMessage: {
      type: String,
      default:
        'আস্সালামু আলাইকুম! আমি Aria, Our Store এর AI সহায়ক। আজ আপনাকে কীভাবে সাহায্য করতে পারি?',
    },
    isMaintenanceMode: {
      type: Boolean,
      default: false,
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatSettings', chatSettingsSchema);

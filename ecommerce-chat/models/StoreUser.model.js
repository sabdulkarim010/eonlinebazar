/**
 * Read-only view of main-store customers for ChatRoom.user_id populate().
 * Uses the shared `users` collection when chat DB matches the store DB.
 */
const mongoose = require('mongoose');

const storeUserSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    avatar: { type: String, default: '' },
    avatarUrl: { type: String, default: null },
    image: { type: String, default: null },
    profilePic: { type: String, default: null },
  },
  { collection: 'users' }
);

storeUserSchema.virtual('displayName').get(function displayName() {
  const parts = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
  return parts || this.name || 'Customer';
});

storeUserSchema.set('toJSON', { virtuals: true });
storeUserSchema.set('toObject', { virtuals: true });

module.exports =
  mongoose.models.User || mongoose.model('User', storeUserSchema);

const mongoose = require('mongoose');

const cannedResponseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true },
    shortcut: { type: String, default: '', trim: true },
    category: {
      type: String,
      enum: ['greeting', 'shipping', 'payment', 'return', 'general'],
      default: 'general',
    },
    usage_count: { type: Number, default: 0 },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null,
    },
  },
  { timestamps: true }
);

cannedResponseSchema.index({ title: 'text', text: 'text' });
cannedResponseSchema.index({ shortcut: 1 });

cannedResponseSchema.statics.seedDefaults = async function seedDefaults() {
  const count = await this.countDocuments();
  if (count > 0) return;

  await this.insertMany([
    {
      title: 'Greeting',
      text: 'Hello! Welcome to EOnlineBazar. How can I help you today?',
      shortcut: '/hello',
      category: 'greeting',
    },
    {
      title: 'Shipping info',
      text: 'We deliver across Bangladesh. Dhaka takes 1-2 days, outside Dhaka 3-5 days.',
      shortcut: '/ship',
      category: 'shipping',
    },
    {
      title: 'Return policy',
      text: 'You can return products within 7 days of delivery. Please initiate from your order details page.',
      shortcut: '/return',
      category: 'return',
    },
    {
      title: 'Payment methods',
      text: 'We currently accept Cash on Delivery (COD). Online payment coming soon.',
      shortcut: '/pay',
      category: 'payment',
    },
    {
      title: 'Order tracking',
      text: 'You can track your order from Profile → My Orders → Order Details.',
      shortcut: '/track',
      category: 'shipping',
    },
    {
      title: 'Closing',
      text: 'Thank you for contacting EOnlineBazar. Have a great day!',
      shortcut: '/bye',
      category: 'general',
    },
  ]);
};

module.exports = mongoose.model('CannedResponse', cannedResponseSchema);

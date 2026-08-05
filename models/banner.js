const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  imageUrl: { type: String, required: true },
  mobileImageUrl: { type: String, default: null },
  linkUrl: { type: String, default: null },
  linkText: { type: String, default: 'Shop Now' },
  textColor: { type: String, default: '#ffffff' },
  overlayOpacity: { type: Number, default: 0.3, min: 0, max: 1 },
  position: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const bannerSettingsSchema = new mongoose.Schema({
  autoPlay: { type: Boolean, default: true },
  autoPlayInterval: { type: Number, default: 4000 },
  showDots: { type: Boolean, default: true },
  showArrows: { type: Boolean, default: true },
  height: { type: String, default: '300px' },
  mobileHeight: { type: String, default: '180px' },
  transitionEffect: {
    type: String,
    enum: ['slide', 'fade'],
    default: 'slide'
  },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = {
  Banner: mongoose.model('Banner', bannerSchema),
  BannerSettings: mongoose.model('BannerSettings', bannerSettingsSchema)
};

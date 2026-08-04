const { Banner, BannerSettings } = require('../models/banner');
const cloudinary = require('../config/cloudinary');
const multer = require('multer');

const DEFAULT_SETTINGS = {
  autoPlay: true,
  autoPlayInterval: 4000,
  showDots: true,
  showArrows: true,
  height: '420px',
  mobileHeight: '220px',
  transitionEffect: 'slide'
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(String(file.mimetype || '').toLowerCase())) {
      cb(null, true);
      return;
    }
    cb(new Error('Only JPG, PNG, and WebP images are allowed.'), false);
  }
});

exports.uploadMiddleware = upload.fields([
  { name: 'bannerImage', maxCount: 1 },
  { name: 'mobileBannerImage', maxCount: 1 }
]);

async function uploadBannerImage(file, opts = {}) {
  const b64 = Buffer.from(file.buffer).toString('base64');
  const dataURI = `data:${file.mimetype};base64,${b64}`;
  const result = await cloudinary.uploader.upload(dataURI, {
    folder: 'eonlinebazar/banners',
    transformation: opts.mobile
      ? [{ width: 768, height: 400, crop: 'limit', quality: 'auto' }]
      : [{ width: 1920, height: 600, crop: 'limit', quality: 'auto' }]
  });
  return result.secure_url;
}

// GET /api/store/banners — PUBLIC
exports.getActiveBanners = async (req, res) => {
  try {
    const [banners, settings] = await Promise.all([
      Banner.find({ isActive: true }).sort({ position: 1 }),
      BannerSettings.findOne()
    ]);

    res.json({
      success: true,
      banners,
      settings: settings || DEFAULT_SETTINGS
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/admin/banners — ADMIN
exports.getAllBanners = async (req, res) => {
  try {
    const [banners, settings] = await Promise.all([
      Banner.find().sort({ position: 1 }),
      BannerSettings.findOne()
    ]);
    res.json({ success: true, banners, settings: settings || DEFAULT_SETTINGS });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/admin/banners — ADMIN
exports.createBanner = async (req, res) => {
  try {
    const {
      title, subtitle, linkUrl, linkText,
      textColor, overlayOpacity, position
    } = req.body;

    if (!req.files?.bannerImage?.[0]) {
      return res.status(400).json({
        success: false,
        message: 'Banner image is required'
      });
    }

    const imageUrl = await uploadBannerImage(req.files.bannerImage[0]);
    const mobileImageUrl = req.files.mobileBannerImage?.[0]
      ? await uploadBannerImage(req.files.mobileBannerImage[0], { mobile: true })
      : null;

    const count = await Banner.countDocuments();

    const banner = new Banner({
      title: title || '',
      subtitle: subtitle || '',
      imageUrl,
      mobileImageUrl,
      linkUrl: linkUrl || null,
      linkText: linkText || 'Shop Now',
      textColor: textColor || '#ffffff',
      overlayOpacity: parseFloat(overlayOpacity) || 0.3,
      position: Number.isFinite(parseInt(position, 10)) ? parseInt(position, 10) : count,
      isActive: true
    });

    await banner.save();
    res.status(201).json({ success: true, banner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/admin/banners/:id — ADMIN
exports.updateBanner = async (req, res) => {
  try {
    const {
      title, subtitle, linkUrl, linkText,
      textColor, overlayOpacity, position, isActive
    } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (subtitle !== undefined) updates.subtitle = subtitle;
    if (linkUrl !== undefined) updates.linkUrl = linkUrl || null;
    if (linkText !== undefined) updates.linkText = linkText;
    if (textColor !== undefined) updates.textColor = textColor;
    if (overlayOpacity !== undefined && overlayOpacity !== '') {
      updates.overlayOpacity = parseFloat(overlayOpacity);
    }
    if (position !== undefined && position !== '') {
      updates.position = parseInt(position, 10);
    }
    if (isActive !== undefined) {
      updates.isActive = isActive === 'true' || isActive === true;
    }

    if (req.files?.bannerImage?.[0]) {
      updates.imageUrl = await uploadBannerImage(req.files.bannerImage[0]);
    }
    if (req.files?.mobileBannerImage?.[0]) {
      updates.mobileImageUrl = await uploadBannerImage(req.files.mobileBannerImage[0], { mobile: true });
    }

    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );

    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }

    res.json({ success: true, banner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/admin/banners/:id — ADMIN
exports.deleteBanner = async (req, res) => {
  try {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Banner deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/admin/banners/reorder — ADMIN
exports.reorderBanners = async (req, res) => {
  try {
    const { order } = req.body; // [{id, position}]
    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, message: 'order array is required' });
    }
    await Promise.all(
      order.map((item) =>
        Banner.findByIdAndUpdate(item.id, { position: item.position })
      )
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/admin/banners/settings — ADMIN
exports.updateSettings = async (req, res) => {
  try {
    const settings = await BannerSettings.findOneAndUpdate(
      {},
      { ...req.body, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const express = require('express');
const multer = require('multer');
const {
  uploadChatImage,
  uploadFromBase64,
  deleteChatImage,
} = require('../services/upload.service');
const { authMiddleware, roleGuard } = require('../middleware/auth.middleware');

const router = express.Router();

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  },
});

/**
 * POST /api/upload/image
 * multipart: image + room_id
 */
router.post(
  '/image',
  authMiddleware,
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'Upload failed',
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'image file is required (field: image)',
        });
      }

      const room_id = req.body.room_id;
      if (!room_id) {
        return res.status(400).json({
          success: false,
          message: 'room_id is required',
        });
      }

      const result = await uploadChatImage(
        req.file.buffer,
        req.file.mimetype,
        room_id
      );

      return res.json({
        success: true,
        url: result.url,
        thumbnail_url: result.thumbnail_url,
        public_id: result.public_id,
        bytes: result.bytes,
        format: result.format,
      });
    } catch (err) {
      console.error('[POST /api/upload/image]', err);
      return res.status(500).json({
        success: false,
        message: 'Image upload failed',
        error: err.message,
      });
    }
  }
);

/**
 * POST /api/upload/base64
 * body: { base64, room_id }
 */
router.post('/base64', authMiddleware, async (req, res) => {
  try {
    const { base64, room_id } = req.body || {};

    if (!base64 || !room_id) {
      return res.status(400).json({
        success: false,
        message: 'base64 and room_id are required',
      });
    }

    // Prefer multipart; reject storing raw data: URLs as attachment URLs
    if (
      typeof base64 === 'string' &&
      base64.startsWith('data:') &&
      !/^data:[^;]+;base64,/.test(base64)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Data URL storage is not permitted. Use multipart upload.',
      });
    }

    const result = await uploadFromBase64(base64, room_id);

    return res.json({
      success: true,
      url: result.url,
      thumbnail_url: result.thumbnail_url,
      public_id: result.public_id,
      bytes: result.bytes,
      format: result.format,
    });
  } catch (err) {
    console.error('[POST /api/upload/base64]', err);
    return res.status(500).json({
      success: false,
      message: 'Base64 upload failed',
      error: err.message,
    });
  }
});

/**
 * DELETE /api/upload/:public_id
 * public_id may contain slashes — URL-encode it, e.g.
 *   DELETE /api/upload/chat-attachments%2FroomId%2Fabc
 * or unencoded multi-segment path:
 *   DELETE /api/upload/chat-attachments/roomId/abc
 * ADMIN / SUPER_ADMIN only
 */
router.delete(
  '/*',
  authMiddleware,
  roleGuard(['SUPER_ADMIN', 'ADMIN']),
  async (req, res) => {
    try {
      const raw = req.params[0] || req.path.replace(/^\//, '');
      const public_id = decodeURIComponent(raw).replace(/\/$/, '');

      if (!public_id) {
        return res.status(400).json({
          success: false,
          message: 'public_id is required',
        });
      }

      await deleteChatImage(public_id);

      return res.json({ success: true });
    } catch (err) {
      console.error('[DELETE /api/upload/:public_id]', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete image',
        error: err.message,
      });
    }
  }
);

module.exports = router;

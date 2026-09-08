const multer = require('multer');
const Agent = require('../models/Agent.model');
const {
  uploadAgentAvatar,
  deleteChatImage,
} = require('../services/upload.service');
const { syncStoreAdminAvatar } = require('../services/storeAdminSync.service');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  },
});

function agentAvatarMulter(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Upload failed',
      });
    }
    next();
  });
}

async function handleAgentAvatarUpload(req, res) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'image file is required (field: image)',
      });
    }

    const agent =
      req.resolvedAgent ||
      (await Agent.findById(req.agent.id).select('-password'));
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
      });
    }

    const uploaded = await uploadAgentAvatar(
      req.file.buffer,
      req.file.mimetype,
      String(agent._id)
    );

    if (
      agent.avatar_public_id &&
      agent.avatar_public_id !== uploaded.public_id
    ) {
      try {
        await deleteChatImage(agent.avatar_public_id);
      } catch (deleteErr) {
        console.warn('[agent-avatar] old image delete failed:', deleteErr.message);
      }
    }

    agent.avatar = uploaded.url;
    agent.avatar_public_id = uploaded.public_id;
    await agent.save();

    const authHeader =
      req.headers.authorization || req.headers.Authorization || '';
    await syncStoreAdminAvatar(agent, agent.avatar, authHeader);

    return res.json({
      success: true,
      url: uploaded.url,
      thumbnail_url: uploaded.thumbnail_url,
      public_id: uploaded.public_id,
      agent: {
        id: agent._id,
        _id: agent._id,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        avatar: agent.avatar,
      },
    });
  } catch (err) {
    console.error('[POST agent-avatar]', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Profile photo upload failed',
    });
  }
}

module.exports = {
  agentAvatarMulter,
  handleAgentAvatarUpload,
};

const express = require('express');
const { AIKnowledgeBase } = require('../models/AIKnowledgeBase.model');
const { authMiddleware, roleGuard } = require('../middleware/auth.middleware');

const router = express.Router();

const VALID_CATEGORIES = [
  'SHIPPING',
  'RETURN',
  'PAYMENT',
  'SIZE_GUIDE',
  'PRODUCT',
  'ORDER',
  'CONTACT',
  'GENERAL',
];

/**
 * GET /api/knowledge
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.is_active !== undefined) {
      filter.is_active = req.query.is_active === 'true';
    }

    const entries = await AIKnowledgeBase.find(filter)
      .sort({ category: 1, usage_count: -1 })
      .lean();

    return res.json({
      success: true,
      count: entries.length,
      entries,
    });
  } catch (err) {
    console.error('[GET /api/knowledge]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch knowledge base',
      error: err.message,
    });
  }
});

/**
 * POST /api/knowledge
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { category, question, answer, keywords = [], is_active = true } =
      req.body || {};

    if (!category || !question || !answer) {
      return res.status(400).json({
        success: false,
        message: 'category, question, and answer are required',
      });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    const entry = await AIKnowledgeBase.create({
      category,
      question,
      answer,
      keywords,
      is_active,
    });

    return res.status(201).json({
      success: true,
      entry,
    });
  } catch (err) {
    console.error('[POST /api/knowledge]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to create knowledge entry',
      error: err.message,
    });
  }
});

/**
 * PUT /api/knowledge/:id
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updates = {};
    const allowed = [
      'category',
      'question',
      'answer',
      'keywords',
      'is_active',
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (updates.category && !VALID_CATEGORIES.includes(updates.category)) {
      return res.status(400).json({
        success: false,
        message: `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    const entry = await AIKnowledgeBase.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge entry not found',
      });
    }

    return res.json({
      success: true,
      entry,
    });
  } catch (err) {
    console.error('[PUT /api/knowledge/:id]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to update knowledge entry',
      error: err.message,
    });
  }
});

/**
 * DELETE /api/knowledge/:id — SUPER_ADMIN + ADMIN only
 */
router.delete(
  '/:id',
  authMiddleware,
  roleGuard(['SUPER_ADMIN', 'ADMIN']),
  async (req, res) => {
    try {
      const entry = await AIKnowledgeBase.findByIdAndDelete(req.params.id);

      if (!entry) {
        return res.status(404).json({
          success: false,
          message: 'Knowledge entry not found',
        });
      }

      return res.json({
        success: true,
        message: 'Knowledge entry deleted',
        id: entry._id,
      });
    } catch (err) {
      console.error('[DELETE /api/knowledge/:id]', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete knowledge entry',
        error: err.message,
      });
    }
  }
);

module.exports = router;

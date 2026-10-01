/********************************************************************
 * Project: EonlineBazar
 * File: productAiController.js
 * Description: Admin AI product assist (text + vision, multilingual).
 ********************************************************************/

'use strict';

const { generateProductAssistContent } = require('../../services/productAiAssistService');

async function aiProductAssist(req, res) {
  try {
    const productName = req.body?.productName;
    const additionalContext = req.body?.additionalContext;
    const contentLanguage = req.body?.contentLanguage;
    const nameLanguage = req.body?.nameLanguage;
    const files = req.files || [];

    const data = await generateProductAssistContent({
      productName,
      additionalContext,
      contentLanguage,
      nameLanguage,
      files
    });

    return res.json({ success: true, data });
  } catch (err) {
    const status = Number(err.statusCode) || 500;
    if (status >= 500) {
      console.error('AI Product Assist Error:', err);
    }
    return res.status(status).json({
      success: false,
      message: err.message || 'AI assist failed'
    });
  }
}

module.exports = {
  aiProductAssist
};

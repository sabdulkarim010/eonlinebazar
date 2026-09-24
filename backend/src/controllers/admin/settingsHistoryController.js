/********************************************************************
 * Project: EonlineBazar
 * File: settingsHistoryController.js
 * Description: Read-only API for settings change audit history.
 ********************************************************************/

'use strict';

const {
  fetchSettingsHistoryPage,
  countSettingsHistoryRecords
} = require('../../services/settingsHistoryReadService');

async function getSettingsHistory(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      fetchSettingsHistoryPage({ skip, limit }),
      countSettingsHistoryRecords()
    ]);

    const data = logs.map((log) => ({
      _id: log._id,
      action: log.action,
      actor: log.actor,
      actorType: log.actorType,
      ipAddress: log.ipAddress,
      details: log.details,
      resourceType: log.resourceType || null,
      resourceId: log.resourceId || null,
      timestamp: log.createdAt
    }));

    res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    });
  } catch (error) {
    console.error('Get Settings History Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings history.' });
  }
}

module.exports = {
  getSettingsHistory
};

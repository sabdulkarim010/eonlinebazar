/********************************************************************
 * Project: EonlineBazar
 * File: settingsHistoryReadService.js
 * Description: Routed reads for settings-related SecurityLog entries.
 ********************************************************************/

'use strict';

const SecurityLog = require('../models/securityLog');
const { routedRead } = require('./readRouter');
const { mapSecurityLogsToMongo } = require('./readShapeHelpers');
const { SETTINGS_HISTORY_MONGO_FILTER } = require('../utils/settingsHistoryFilter');

function getSecurityLogRepository() {
  return require('../repositories/securityLogRepository');
}

async function fetchSettingsHistoryPage({ skip = 0, limit = 50 } = {}) {
  const safeSkip = Math.max(0, Number(skip) || 0);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  return routedRead(
    'securitylog',
    () => SecurityLog.find(SETTINGS_HISTORY_MONGO_FILTER)
      .sort({ createdAt: -1 })
      .skip(safeSkip)
      .limit(safeLimit)
      .lean(),
    async () => {
      const rows = await getSecurityLogRepository().findSettingsHistory({
        offset: safeSkip,
        limit: safeLimit
      });
      return mapSecurityLogsToMongo(rows);
    }
  );
}

async function countSettingsHistoryRecords() {
  return routedRead(
    'securitylog',
    () => SecurityLog.countDocuments(SETTINGS_HISTORY_MONGO_FILTER),
    () => getSecurityLogRepository().countSettingsHistory()
  );
}

module.exports = {
  fetchSettingsHistoryPage,
  countSettingsHistoryRecords
};

/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: securityAuditReadService.js
 * Description: Routed reads for SecurityLog, LoginAttempt, BlacklistedIp,
 *   and StockAlert (Mongo default; Postgres when READ_PG_* flags ON).
 ********************************************************************/

'use strict';

const SecurityLog = require('../models/securityLog');
const LoginAttempt = require('../models/loginAttempt');
const BlacklistedIP = require('../models/blacklistedIp');
const StockAlert = require('../models/stockAlert');
const { routedRead } = require('./readRouter');
const {
  securityLogToMongoShape,
  mapSecurityLogsToMongo,
  loginAttemptToMongoShape,
  mapLoginAttemptsToMongo,
  blacklistedIpToMongoShape,
  mapBlacklistedIpsToMongo,
  stockAlertToMongoShape,
  mapStockAlertsToMongo
} = require('./readShapeHelpers');

function getSecurityLogRepository() {
  return require('../repositories/securityLogRepository');
}

function getLoginAttemptRepository() {
  return require('../repositories/loginAttemptRepository');
}

function getBlacklistedIpRepository() {
  return require('../repositories/blacklistedIpRepository');
}

function getStockAlertRepository() {
  return require('../repositories/stockAlertRepository');
}

async function fetchActiveBanByIp(ip) {
  if (!ip) return null;
  const now = new Date();
  return routedRead(
    'blacklistedip',
    () => BlacklistedIP.findOne({
      ip,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    }).lean(),
    async () => {
      const row = await getBlacklistedIpRepository().findActiveByIp(ip);
      return row ? blacklistedIpToMongoShape(row) : null;
    }
  );
}

async function fetchAllBlacklistedIps() {
  return routedRead(
    'blacklistedip',
    () => BlacklistedIP.find({}).sort({ blockedAt: -1 }).lean(),
    async () => {
      const rows = await getBlacklistedIpRepository().findAll();
      return mapBlacklistedIpsToMongo(rows);
    }
  );
}

async function countActiveBlacklistedIps() {
  const now = new Date();
  return routedRead(
    'blacklistedip',
    () => BlacklistedIP.countDocuments({
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    }),
    () => getBlacklistedIpRepository().countActive()
  );
}

async function fetchActiveBlacklistedIpsLimited(limit = 50) {
  const now = new Date();
  return routedRead(
    'blacklistedip',
    () => BlacklistedIP.find({
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    })
      .select('ip reason createdAt expiresAt blockedAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    async () => {
      const rows = await getBlacklistedIpRepository().findAll();
      return mapBlacklistedIpsToMongo(rows)
        .filter((entry) => !entry.expiresAt || new Date(entry.expiresAt) > now)
        .slice(0, limit);
    }
  );
}

function toMongoLoginAttemptFilter(filter = {}) {
  const mongoFilter = {};
  if (filter.statusIn) {
    mongoFilter.status = { $in: filter.statusIn };
  } else if (filter.status) {
    mongoFilter.status = filter.status;
  }
  if (filter.createdAtGte) {
    mongoFilter.createdAt = { $gte: filter.createdAtGte };
  }
  if (filter.ipAddress) mongoFilter.ipAddress = filter.ipAddress;
  return mongoFilter;
}

async function countRecentLoginAttempts(filter = {}) {
  return routedRead(
    'loginattempt',
    () => LoginAttempt.countDocuments(toMongoLoginAttemptFilter(filter)),
    () => getLoginAttemptRepository().count(filter)
  );
}

async function countRecentFailuresByIp(ip, since, statuses) {
  return routedRead(
    'loginattempt',
    () => LoginAttempt.countDocuments({
      ipAddress: ip,
      status: { $in: statuses },
      createdAt: { $gte: since }
    }),
    () => getLoginAttemptRepository().count({
      ipAddress: ip,
      statusIn: statuses,
      createdAtGte: since
    })
  );
}

async function fetchLoginHistoryPage({ skip, limit }) {
  return routedRead(
    'loginattempt',
    () => LoginAttempt.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    async () => {
      const rows = await getLoginAttemptRepository().findAll({ offset: skip, limit });
      return mapLoginAttemptsToMongo(rows);
    }
  );
}

async function fetchTopFailedLoginIps({ since, limit }) {
  const FAILURE_STATUSES = ['failed', 'otp_failed'];
  return routedRead(
    'loginattempt',
    () => LoginAttempt.aggregate([
      {
        $match: {
          status: { $in: FAILURE_STATUSES },
          createdAt: { $gte: since },
          ipAddress: { $nin: ['Unknown', '', null] }
        }
      },
      { $group: { _id: '$ipAddress', failedCount: { $sum: 1 } } },
      { $sort: { failedCount: -1 } },
      { $limit: limit }
    ]),
    () => getLoginAttemptRepository().aggregateTopFailedIps({ since, limit, statuses: FAILURE_STATUSES })
  );
}

function toPgSecurityLogFilter(filter = {}) {
  return {
    actorType: filter.actorType,
    actor: filter.actor,
    resourceType: filter.resourceType,
    dateFrom: filter.dateFrom || filter.createdAt?.$gte,
    dateTo: filter.dateTo || filter.createdAt?.$lte
  };
}

async function fetchSecurityLogsPage({ skip, limit, filter = {} }) {
  return routedRead(
    'securitylog',
    () => SecurityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    async () => {
      const rows = await getSecurityLogRepository().findAll({
        ...toPgSecurityLogFilter(filter),
        offset: skip,
        limit
      });
      return mapSecurityLogsToMongo(rows);
    }
  );
}

async function countSecurityLogs(filter = {}) {
  return routedRead(
    'securitylog',
    () => SecurityLog.countDocuments(filter),
    () => getSecurityLogRepository().count(toPgSecurityLogFilter(filter))
  );
}

async function fetchDistinctSecurityLogActors() {
  return routedRead(
    'securitylog',
    () => SecurityLog.distinct('actor', { actor: { $nin: [null, '', 'system'] } }),
    () => getSecurityLogRepository().distinctActors()
  );
}

async function fetchStaffAuditGroups({ skip, limit }) {
  return routedRead(
    'securitylog',
    async () => {
      const [groups, totalGroups] = await Promise.all([
        SecurityLog.aggregate([
          { $match: { actorType: 'admin' } },
          {
            $group: {
              _id: '$actor',
              totalActions: { $sum: 1 },
              lastActivityAt: { $max: '$createdAt' },
              resourceBreakdown: {
                $push: {
                  $cond: [
                    { $ifNull: ['$resourceType', false] },
                    '$resourceType',
                    'other'
                  ]
                }
              }
            }
          },
          { $sort: { lastActivityAt: -1 } },
          { $skip: skip },
          { $limit: limit }
        ]),
        SecurityLog.aggregate([
          { $match: { actorType: 'admin' } },
          { $group: { _id: '$actor' } },
          { $count: 'total' }
        ])
      ]);
      const total = totalGroups[0]?.total || 0;
      const data = groups.map((group) => {
        const breakdown = {};
        (group.resourceBreakdown || []).forEach((type) => {
          const key = type || 'other';
          breakdown[key] = (breakdown[key] || 0) + 1;
        });
        return {
          username: group._id || 'unknown',
          totalActions: group.totalActions,
          lastActivityAt: group.lastActivityAt,
          resourceBreakdown: breakdown
        };
      });
      return { data, total };
    },
    async () => {
      const [data, total] = await Promise.all([
        getSecurityLogRepository().findStaffAuditGroups({ skip, limit }),
        getSecurityLogRepository().countStaffAuditGroups()
      ]);
      return {
        data: data.map((group) => ({
          username: group.actor || 'unknown',
          totalActions: group.totalActions,
          lastActivityAt: group.lastActivityAt,
          resourceBreakdown: group.resourceBreakdown
        })),
        total
      };
    }
  );
}

async function fetchRecentSecurityLogs(limit = 20) {
  return routedRead(
    'securitylog',
    () => SecurityLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('action ipAddress actor createdAt details')
      .lean(),
    async () => {
      const rows = await getSecurityLogRepository().findAll({ limit });
      return mapSecurityLogsToMongo(rows).map((log) => ({
        _id: log._id,
        action: log.action,
        ipAddress: log.ipAddress,
        actor: log.actor,
        createdAt: log.createdAt,
        details: log.details
      }));
    }
  );
}

async function fetchStockAlertsPage({ skip, limit }) {
  return routedRead(
    'stockalert',
    () => StockAlert.find({})
      .sort({ checkedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    async () => {
      const rows = await getStockAlertRepository().findPaginated({ skip, limit, includeItems: true });
      return mapStockAlertsToMongo(rows);
    }
  );
}

async function countStockAlerts() {
  return routedRead(
    'stockalert',
    () => StockAlert.countDocuments({}),
    () => getStockAlertRepository().countAll()
  );
}

module.exports = {
  fetchActiveBanByIp,
  fetchAllBlacklistedIps,
  countActiveBlacklistedIps,
  fetchActiveBlacklistedIpsLimited,
  countRecentLoginAttempts,
  countRecentFailuresByIp,
  fetchLoginHistoryPage,
  fetchTopFailedLoginIps,
  fetchSecurityLogsPage,
  countSecurityLogs,
  fetchDistinctSecurityLogActors,
  fetchStaffAuditGroups,
  fetchRecentSecurityLogs,
  fetchStockAlertsPage,
  countStockAlerts,
  securityLogToMongoShape,
  loginAttemptToMongoShape,
  blacklistedIpToMongoShape,
  stockAlertToMongoShape
};

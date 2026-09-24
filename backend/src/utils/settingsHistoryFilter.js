/********************************************************************
 * Project: EonlineBazar
 * File: settingsHistoryFilter.js
 * Description: Shared filter for settings-related SecurityLog reads.
 *   Matches resourceType "setting" OR action text that represents
 *   a platform / store configuration change.
 ********************************************************************/

'use strict';

/** Substrings matched case-insensitively against SecurityLog.action */
const SETTINGS_ACTION_SUBSTRINGS = [
  'settings updated',
  'branding updated',
  'admin settings',
  'store branding',
  'delivery settings',
  'cache settings',
  'service worker',
  'rate limit',
  'notification settings',
  'attendance settings',
  'backup',
  'footer settings',
  'footer payment',
  'payment method',
  'payment config',
  'menu label',
  'sidebar label',
  'expense category',
  'settings backup'
];

const SETTINGS_ACTION_REGEX = new RegExp(
  SETTINGS_ACTION_SUBSTRINGS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

const SETTINGS_HISTORY_MONGO_FILTER = {
  $or: [
    { resourceType: 'setting' },
    { action: { $regex: SETTINGS_ACTION_REGEX } }
  ]
};

function buildSettingsHistoryPrismaWhere() {
  return {
    OR: [
      { resourceType: 'SETTING' },
      ...SETTINGS_ACTION_SUBSTRINGS.map((pattern) => ({
        action: { contains: pattern, mode: 'insensitive' }
      }))
    ]
  };
}

function isSettingsHistoryAction(action) {
  if (!action) return false;
  return SETTINGS_ACTION_REGEX.test(String(action));
}

module.exports = {
  SETTINGS_ACTION_SUBSTRINGS,
  SETTINGS_ACTION_REGEX,
  SETTINGS_HISTORY_MONGO_FILTER,
  buildSettingsHistoryPrismaWhere,
  isSettingsHistoryAction
};

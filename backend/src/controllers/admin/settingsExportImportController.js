/********************************************************************
 * Project: EonlineBazar
 * File: settingsExportImportController.js
 * Description: Settings JSON export/import (sanitized, non-secret).
 ********************************************************************/

'use strict';

const {
  buildSettingsExportPayload,
  applySettingsImportPayload
} = require('../../services/settingsExportImportService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

function exportFilename() {
  const date = new Date().toISOString().slice(0, 10);
  return `settings-backup-${date}.json`;
}

async function exportSettingsBackup(req, res) {
  try {
    const username = req.admin?.username || req.account?.username || 'admin';
    const payload = await buildSettingsExportPayload({ username });

    await logSecurityEvent({
      action: 'Settings Backup Exported',
      actor: username,
      actorType: 'admin',
      ipAddress: getClientIp(req),
      details: `JSON export — ${Object.keys(payload.sidebarLabels || {}).length} sidebar labels, ${payload.categories?.length || 0} categories`,
      resourceType: 'setting',
      resourceId: 'settings-export'
    });

    const json = JSON.stringify(payload, null, 2);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename()}"`);
    res.status(200).send(json);
  } catch (error) {
    console.error('Export Settings Backup Error:', error);
    res.status(500).json({ success: false, message: 'Failed to export settings backup.' });
  }
}

async function importSettingsBackup(req, res) {
  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({
        success: false,
        message: 'Import requires explicit confirmation (confirm: true).'
      });
    }

    const backup = req.body?.backup ?? req.body?.payload ?? req.body;
    const username = req.admin?.username || req.account?.username || 'admin';
    const actorId = req.admin?._id || req.account?._id || username;

    const summary = await applySettingsImportPayload(backup, { username, actorId });

    await logSecurityEvent({
      action: 'Settings Backup Imported',
      actor: username,
      actorType: 'admin',
      ipAddress: getClientIp(req),
      details: [
        `${summary.settingsFields} settings field(s)`,
        `${summary.sidebarLabelsSaved} sidebar label(s)`,
        `${summary.categoriesUpdated} categor(ies) updated`
      ].join(', '),
      resourceType: 'setting',
      resourceId: 'settings-import'
    });

    res.status(200).json({
      success: true,
      message: 'Settings backup imported successfully.',
      data: summary
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) {
      console.error('Import Settings Backup Error:', error);
    }
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to import settings backup.'
    });
  }
}

module.exports = {
  exportSettingsBackup,
  importSettingsBackup
};

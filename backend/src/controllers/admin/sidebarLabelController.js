/********************************************************************
 * Project: EonlineBazar — Admin Sidebar Labels
 * File: sidebarLabelController.js
 * Description: Super Admin custom sidebar menu labels (PG primary + Mongo fallback).
 ********************************************************************/

const sidebarLabelRepository = require('../../repositories/sidebarLabelRepository');

function resolveAdminId(req) {
    return String(req.adminAccount?._id || req.admin?.id || 'superadmin');
}

exports.listSidebarLabels = async (req, res) => {
    try {
        const labels = await sidebarLabelRepository.findAllMap();
        return res.status(200).json({ success: true, labels });
    } catch (error) {
        console.warn('listSidebarLabels Error:', error.message);
        return res.status(200).json({ success: true, labels: {} });
    }
};

exports.batchUpsertSidebarLabels = async (req, res) => {
    try {
        const labels = req.body?.labels;
        if (!labels || typeof labels !== 'object' || Array.isArray(labels)) {
            return res.status(400).json({
                success: false,
                message: 'Request body must include a labels object.'
            });
        }

        const adminId = resolveAdminId(req);
        const result = await sidebarLabelRepository.bulkUpsertLabels(labels, adminId);

        return res.status(200).json({
            success: true,
            message: result.saved
                ? `${result.saved} menu label${result.saved === 1 ? '' : 's'} saved.`
                : 'No labels were saved.',
            saved: result.saved,
            labels: result.labels,
            errors: result.errors
        });
    } catch (error) {
        console.warn('batchUpsertSidebarLabels Error:', error.message);
        const status = error.statusCode === 400 ? 400 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || 'Failed to save sidebar labels.',
            errors: error.details
        });
    }
};

exports.upsertSidebarLabel = async (req, res) => {
    try {
        const menuKey = String(req.params.key || '').trim();
        const label = String(req.body.label || '').trim();

        if (!menuKey) {
            return res.status(400).json({ success: false, message: 'Menu key is required.' });
        }
        if (!label || label.length > 80) {
            return res.status(400).json({ success: false, message: 'Label must be 1–80 characters.' });
        }

        const adminId = resolveAdminId(req);
        const record = await sidebarLabelRepository.upsertLabel(menuKey, label, adminId);

        res.status(200).json({
            success: true,
            menuKey: record.menuKey,
            label: record.label
        });
    } catch (error) {
        console.error('upsertSidebarLabel Error:', error);
        const status = error.statusCode === 400 ? 400 : 500;
        res.status(status).json({
            success: false,
            message: error.message || 'Failed to save sidebar label.'
        });
    }
};

exports.resetSidebarLabels = async (req, res) => {
    try {
        const removed = await sidebarLabelRepository.deleteAll();
        res.status(200).json({ success: true, removed });
    } catch (error) {
        console.error('resetSidebarLabels Error:', error);
        res.status(500).json({ success: false, message: 'Failed to reset sidebar labels.' });
    }
};

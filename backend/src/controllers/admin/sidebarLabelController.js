/********************************************************************
 * Project: EonlineBazar — Admin Sidebar Labels
 * File: sidebarLabelController.js
 * Description: Super Admin custom sidebar menu labels (PG primary).
 ********************************************************************/

const sidebarLabelRepository = require('../../repositories/sidebarLabelRepository');

exports.listSidebarLabels = async (req, res) => {
    try {
        const labels = await sidebarLabelRepository.findAllMap();
        return res.status(200).json({ success: true, labels });
    } catch (error) {
        console.warn('listSidebarLabels Error:', error.message);
        return res.status(200).json({ success: true, labels: {} });
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

        const adminId = String(req.adminAccount?._id || req.admin?.id || 'superadmin');
        await sidebarLabelRepository.upsertLabel(menuKey, label, adminId);

        res.status(200).json({ success: true, menuKey, label });
    } catch (error) {
        console.error('upsertSidebarLabel Error:', error);
        res.status(500).json({ success: false, message: 'Failed to save sidebar label.' });
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

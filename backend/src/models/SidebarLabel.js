/********************************************************************
 * Project: EonlineBazar
 * File: SidebarLabel.js
 * Location: models/SidebarLabel.js
 * Description: Super Admin custom sidebar menu labels (Mongo fallback +
 *   dual-write mirror for PostgreSQL SidebarLabel table).
 ********************************************************************/

const mongoose = require('mongoose');

const sidebarLabelSchema = new mongoose.Schema({
    menuKey: {
        type: String,
        required: [true, 'Menu key is required.'],
        trim: true,
        maxlength: 120,
        unique: true
    },
    label: {
        type: String,
        required: [true, 'Label is required.'],
        trim: true,
        maxlength: 80
    },
    adminId: {
        type: String,
        required: true,
        trim: true,
        default: 'superadmin'
    }
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.models.SidebarLabel
    || mongoose.model('SidebarLabel', sidebarLabelSchema);

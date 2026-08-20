/********************************************************************
 * Project: EonlineBazar
 * File: attributeController.js
 * Location: controllers/attributeController.js
 * Author: Abdul Karim Sheikh
 * Description: CRUD controller for product attributes (Size, Color, etc.)
 * and their values. Used by Manage Attributes and the variant matrix builder.
 ********************************************************************/

const Attribute = require('../models/attribute');

// Parse comma-separated strings, JSON arrays, or plain arrays into unique trimmed values
function normalizeValues(raw) {
    if (raw === undefined || raw === null) return [];

    let list = [];
    if (Array.isArray(raw)) {
        list = raw.map(v => String(v).trim());
    } else if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    list = parsed.map(v => String(v).trim());
                }
            } catch (e) {
                /* fall through to comma-separated parsing */
            }
        }
        if (!list.length) {
            list = trimmed.split(',').map(v => v.trim());
        }
    } else {
        list = [String(raw).trim()];
    }

    const seen = new Set();
    const out = [];
    for (const v of list) {
        if (!v) continue;
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatAttributeError(error) {
    if (!error) return 'An unexpected error occurred. Please try again.';

    if (error.code === 11000) {
        return 'An attribute with this name already exists.';
    }

    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors || {}).map(e => e.message).filter(Boolean);
        if (messages.length) return messages.join(' ');
    }

    return error.message || 'An unexpected error occurred. Please try again.';
}

// 1. Fetch all attributes (public)
const getAttributes = async (req, res) => {
    try {
        const attributes = await Attribute.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: attributes });
    } catch (error) {
        console.error('Attribute Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load attributes. Please try again.' });
    }
};

// 2. Create attribute (admin)
const createAttribute = async (req, res, next) => {
    try {
        const body = req.body || {};
        const name = String(body.name || '').trim();
        const rawValues = body.values !== undefined ? body.values : body.terms;
        const values = normalizeValues(rawValues);
        const status = body.status === 'inactive' ? 'inactive' : 'active';

        if (!name) {
            return res.status(400).json({ success: false, message: 'Attribute name is required.' });
        }

        const existing = await Attribute.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Attribute '${existing.name}' already exists. Click the Edit button on the table below to add more values.`
            });
        }

        const newAttribute = new Attribute({ name, values, status });
        await newAttribute.save();

        res.status(201).json({
            success: true,
            message: 'Attribute saved successfully.',
            data: newAttribute
        });
    } catch (error) {
        console.error('Attribute Create Error:', error);
        const message = formatAttributeError(error);
        const status = error.code === 11000 || error.name === 'ValidationError' ? 400 : 500;
        return res.status(status).json({ success: false, message });
    }
};

// 3. Update attribute (admin)
const updateAttribute = async (req, res) => {
    try {
        const attribute = await Attribute.findById(req.params.id);
        if (!attribute) {
            return res.status(404).json({ success: false, message: 'Attribute not found.' });
        }

        const body = req.body || {};

        if (body.name !== undefined) {
            const name = String(body.name || '').trim();
            if (!name) {
                return res.status(400).json({ success: false, message: 'Attribute name is required.' });
            }

            const dup = await Attribute.findOne({
                _id: { $ne: attribute._id },
                name: new RegExp(`^${escapeRegex(name)}$`, 'i')
            });
            if (dup) {
                return res.status(400).json({ success: false, message: 'An attribute with this name already exists.' });
            }

            attribute.name = name;
            attribute.slug = Attribute.slugify(name);
        }

        if (body.values !== undefined) attribute.values = normalizeValues(body.values);
        else if (body.terms !== undefined) attribute.values = normalizeValues(body.terms);

        if (body.status !== undefined) {
            attribute.status = body.status === 'inactive' ? 'inactive' : 'active';
        }

        await attribute.save();

        res.status(200).json({
            success: true,
            message: 'Attribute updated successfully.',
            data: attribute
        });
    } catch (error) {
        console.error('Attribute Update Error:', error);
        const message = formatAttributeError(error);
        const status = error.code === 11000 || error.name === 'ValidationError' ? 400 : 500;
        res.status(status).json({ success: false, message });
    }
};

// 4. Delete attribute (admin)
const deleteAttribute = async (req, res) => {
    try {
        const deleted = await Attribute.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Attribute not found.' });
        }
        res.status(200).json({ success: true, message: 'Attribute deleted successfully.' });
    } catch (error) {
        console.error('Attribute Delete Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete attribute. Please try again.' });
    }
};

module.exports = { getAttributes, createAttribute, updateAttribute, deleteAttribute };

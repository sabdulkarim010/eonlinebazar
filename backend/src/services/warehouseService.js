/********************************************************************
 * Project: EonlineBazar — ERP Core
 * File: warehouseService.js
 * Location: services/warehouseService.js
 * Author: Abdul Karim Sheikh
 * Description: Warehouse bootstrap. Products carry an optional
 * warehouseId, so a store with a single stock room still needs one
 * location to select — this seeds it on first startup and repairs the
 * isDefault flag if every location somehow lost it.
 ********************************************************************/

const Warehouse = require('../models/warehouse');

const DEFAULT_WAREHOUSE = {
    name: 'Main Warehouse',
    location: 'Head Office',
    address: '',
    managerName: '',
    phone: '',
    isDefault: true,
    status: 'active'
};

/**
 * Ensure exactly one default warehouse exists.
 * Returns the default warehouse document, or null if the write failed.
 */
async function seedDefaultWarehouse() {
    const total = await Warehouse.countDocuments();

    if (total === 0) {
        const created = await Warehouse.create(DEFAULT_WAREHOUSE);
        console.log(`🏭 Seeded default warehouse: ${created.name}`);
        return created;
    }

    const existingDefault = await Warehouse.findOne({ isDefault: true });
    if (existingDefault) return existingDefault;

    // Locations exist but none is flagged default (e.g. the old default was
    // removed directly in the database) — promote the oldest active one.
    const fallback = await Warehouse.findOne({ status: 'active' }).sort({ createdAt: 1 })
        || await Warehouse.findOne().sort({ createdAt: 1 });

    if (!fallback) return null;

    fallback.isDefault = true;
    await fallback.save();
    console.log(`🏭 Promoted "${fallback.name}" to default warehouse.`);
    return fallback;
}

/** The warehouse new stock lands in when a PO does not name one. */
async function getDefaultWarehouseId() {
    const warehouse = await Warehouse.findOne({ isDefault: true }).select('_id').lean();
    return warehouse ? warehouse._id : null;
}

module.exports = { seedDefaultWarehouse, getDefaultWarehouseId, DEFAULT_WAREHOUSE };

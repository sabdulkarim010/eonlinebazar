/********************************************************************
 * Phase 3.1 — WMS engine: ledger, transfers, reservations
 ********************************************************************/

const request = require('supertest');
const Product = require('../../backend/src/models/product');
const Warehouse = require('../../backend/src/models/warehouse');
const StockLedger = require('../../backend/src/models/StockLedger');
const WarehouseStock = require('../../backend/src/models/WarehouseStock');
const Order = require('../../backend/src/models/order');
const { seedDefaultWarehouse } = require('../../backend/src/services/warehouseService');
const {
    recordStockMovement
} = require('../../backend/src/services/stockLedgerService');
const wmsService = require('../../backend/src/services/wmsService');
const { getApp, createTestAdmin, createTestUser } = require('../setup');

describe('Phase 3.1 — WMS engine', () => {
    const app = getApp();

    async function adminToken() {
        const { username, password } = await createTestAdmin();
        const res = await request(app)
            .post('/admin/api/login')
            .send({ username, password });
        expect(res.status).toBe(200);
        return res.body.token;
    }

    function auth(token) {
        return { Authorization: `Bearer ${token}` };
    }

    async function createWarehouses() {
        await seedDefaultWarehouse();
        const source = await Warehouse.create({
            name: 'Source WH',
            location: 'Dhaka North',
            status: 'active'
        });
        const destination = await Warehouse.create({
            name: 'Destination WH',
            location: 'Chittagong',
            status: 'active'
        });
        return { source, destination };
    }

    async function createProduct(overrides = {}) {
        return Product.create({
            productId: `WMS-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            name: 'WMS Test Product',
            price: 500,
            stock: 0,
            stockQuantity: 0,
            ...overrides
        });
    }

    test('StockLedger rows are immutable', async () => {
        const defaultWh = await seedDefaultWarehouse();
        const product = await createProduct();

        await recordStockMovement({
            productId: product._id,
            warehouseId: defaultWh._id,
            changeQuantity: 10,
            movementType: 'MANUAL_ADJUSTMENT',
            referenceType: 'Test'
        });

        const entry = await StockLedger.findOne({ productId: product._id }).sort({ createdAt: -1 });
        expect(entry).toBeTruthy();

        await expect(
            StockLedger.updateOne({ _id: entry._id }, { $set: { notes: 'tampered' } })
        ).rejects.toThrow(/immutable/i);
    });

    test('recordStockMovement updates warehouse stock and creates audit row', async () => {
        const defaultWh = await seedDefaultWarehouse();
        const product = await createProduct();

        const { ledger, warehouseStock } = await recordStockMovement({
            productId: product._id,
            warehouseId: defaultWh._id,
            changeQuantity: 15,
            movementType: 'PO_RECEIPT',
            referenceId: 'PO-TEST-1',
            referenceType: 'PurchaseOrder'
        });

        expect(ledger.movementType).toBe('PO_RECEIPT');
        expect(ledger.previousQuantity).toBe(0);
        expect(ledger.newQuantity).toBe(15);
        expect(warehouseStock.quantity).toBe(15);

        const reloadedProduct = await Product.findById(product._id);
        expect(reloadedProduct.stockQuantity).toBe(15);
    });

    test('transfer state machine — draft → in_transit → received', async () => {
        const { source, destination } = await createWarehouses();
        const product = await createProduct();

        await recordStockMovement({
            productId: product._id,
            warehouseId: source._id,
            changeQuantity: 20,
            movementType: 'MANUAL_ADJUSTMENT'
        });

        const transfer = await wmsService.createTransferDraft({
            sourceWarehouseId: source._id,
            destinationWarehouseId: destination._id,
            items: [{ productId: product._id, qty: 8 }]
        });
        expect(transfer.status).toBe('draft');

        const shipped = await wmsService.shipTransfer(transfer._id);
        expect(shipped.status).toBe('in_transit');
        expect(shipped.items[0].shippedQty).toBe(8);

        const sourceStock = await WarehouseStock.findOne({
            warehouseId: source._id,
            productId: product._id
        });
        expect(sourceStock.quantity).toBe(12);

        const outLedger = await StockLedger.findOne({
            referenceId: String(transfer._id),
            movementType: 'TRANSFER_OUT'
        });
        expect(outLedger.changeQuantity).toBe(-8);

        const received = await wmsService.receiveTransfer(transfer._id, [{
            productId: product._id,
            receivedQty: 8
        }]);
        expect(received.status).toBe('received');

        const destStock = await WarehouseStock.findOne({
            warehouseId: destination._id,
            productId: product._id
        });
        expect(destStock.quantity).toBe(8);

        const inLedger = await StockLedger.findOne({
            referenceId: String(transfer._id),
            movementType: 'TRANSFER_IN'
        });
        expect(inLedger.changeQuantity).toBe(8);
    });

    test('transfer discrepancy logs DAMAGE_WRITE_OFF audit without double-deducting stock', async () => {
        const { source, destination } = await createWarehouses();
        const product = await createProduct();

        await recordStockMovement({
            productId: product._id,
            warehouseId: source._id,
            changeQuantity: 10,
            movementType: 'MANUAL_ADJUSTMENT'
        });

        const transfer = await wmsService.createTransferDraft({
            sourceWarehouseId: source._id,
            destinationWarehouseId: destination._id,
            items: [{ productId: product._id, qty: 10 }]
        });

        await wmsService.shipTransfer(transfer._id);
        const received = await wmsService.receiveTransfer(transfer._id, [{
            productId: product._id,
            receivedQty: 7
        }]);

        expect(received.status).toBe('discrepancy');
        expect(received.discrepancyDetails.lines[0].variance).toBe(3);

        const sourceStock = await WarehouseStock.findOne({
            warehouseId: source._id,
            productId: product._id
        });
        expect(sourceStock.quantity).toBe(0);

        const destStock = await WarehouseStock.findOne({
            warehouseId: destination._id,
            productId: product._id
        });
        expect(destStock.quantity).toBe(7);

        const damageLedger = await StockLedger.findOne({
            referenceId: String(transfer._id),
            movementType: 'DAMAGE_WRITE_OFF'
        });
        expect(damageLedger).toBeTruthy();
        expect(damageLedger.changeQuantity).toBe(-3);
        expect(damageLedger.previousQuantity).toBe(damageLedger.newQuantity);
    });

    test('reserveStockForOrder and fulfillReservedStock pipeline', async () => {
        const defaultWh = await seedDefaultWarehouse();
        const { user } = await createTestUser();
        const product = await createProduct();

        await recordStockMovement({
            productId: product._id,
            warehouseId: defaultWh._id,
            changeQuantity: 12,
            movementType: 'MANUAL_ADJUSTMENT'
        });

        const order = await Order.create({
            orderId: `WMS-ORD-${Date.now()}`,
            user: user._id,
            customerName: 'WMS Customer',
            customerPhone: user.mobile,
            customerAddress: 'Dhaka',
            subTotal: 500,
            grandTotal: 500,
            items: [{
                productId: product._id,
                name: product.name,
                price: 500,
                quantity: 3
            }],
            status: 'Processing',
            paymentMethod: 'COD'
        });

        const reserveResult = await wmsService.reserveStockForOrder(order._id);
        expect(reserveResult.reserved).toBe(1);

        const stockAfterReserve = await WarehouseStock.findOne({
            warehouseId: defaultWh._id,
            productId: product._id
        });
        expect(stockAfterReserve.quantity).toBe(12);
        expect(stockAfterReserve.reservedStockQuantity).toBe(3);

        const reservationLedger = await StockLedger.findOne({
            referenceId: String(order._id),
            movementType: 'RESERVATION'
        });
        expect(reservationLedger.changeQuantity).toBe(3);

        const fulfillResult = await wmsService.fulfillReservedStock(order._id);
        expect(fulfillResult.fulfilled).toBe(1);

        const stockAfterSale = await WarehouseStock.findOne({
            warehouseId: defaultWh._id,
            productId: product._id
        });
        expect(stockAfterSale.quantity).toBe(9);
        expect(stockAfterSale.reservedStockQuantity).toBe(0);

        const saleLedger = await StockLedger.findOne({
            referenceId: String(order._id),
            movementType: 'SALE'
        });
        expect(saleLedger.changeQuantity).toBe(-3);
    });

    test('warehouse API — create and ship transfer via HTTP', async () => {
        const token = await adminToken();
        const { source, destination } = await createWarehouses();
        const product = await createProduct();

        await recordStockMovement({
            productId: product._id,
            warehouseId: source._id,
            changeQuantity: 5,
            movementType: 'MANUAL_ADJUSTMENT'
        });

        const createRes = await request(app)
            .post('/api/admin/warehouse-transfers')
            .set(auth(token))
            .send({
                sourceWarehouseId: source._id,
                destinationWarehouseId: destination._id,
                items: [{ productId: product._id, qty: 4 }]
            });

        expect(createRes.status).toBe(201);
        expect(createRes.body.data.status).toBe('draft');

        const transferId = createRes.body.data._id;
        const shipRes = await request(app)
            .post(`/api/admin/warehouse-transfers/${transferId}/ship`)
            .set(auth(token));

        expect(shipRes.status).toBe(200);
        expect(shipRes.body.data.status).toBe('in_transit');

        const ledgerCount = await StockLedger.countDocuments({
            referenceId: String(transferId),
            movementType: 'TRANSFER_OUT'
        });
        expect(ledgerCount).toBe(1);
    });

    test('warehouse schema supports location hierarchy', async () => {
        const warehouse = await Warehouse.create({
            name: 'Layout WH',
            locationHierarchy: [{
                zone: 'Zone A',
                aisles: [{
                    name: 'Aisle 2',
                    racks: [{
                        name: 'Rack B',
                        shelves: [{
                            name: 'Shelf 1',
                            bins: [{ code: '104', label: 'Bin 104' }]
                        }]
                    }]
                }]
            }]
        });

        expect(warehouse.locationHierarchy[0].zone).toBe('Zone A');
        expect(warehouse.locationHierarchy[0].aisles[0].racks[0].shelves[0].bins[0].code).toBe('104');
    });
});

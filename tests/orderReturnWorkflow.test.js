const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ORW = require('../client/js/orderReturnWorkflow.js');

function loadOrderStatusTimeline() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'orderStatusTimeline.js'),
        'utf8'
    );
    const sandbox = {
        document: { getElementById: () => null },
        OrderReturnWorkflow: ORW
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.OrderStatusTimeline;
}

describe('Order return workflow', () => {
    const deliveredRecent = {
        status: 'Delivered',
        deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        items: [
            { productId: 'p1', name: 'Shirt', price: 500, quantity: 2, sku: 'SKU-1' }
        ]
    };

    test('eligible only for delivered orders within policy window', () => {
        expect(ORW.isOrderReturnEligible(deliveredRecent)).toBe(true);
        expect(ORW.isOrderReturnEligible({ ...deliveredRecent, status: 'Processing' })).toBe(false);
        expect(ORW.isOrderReturnEligible({
            ...deliveredRecent,
            deliveredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        })).toBe(false);
    });

    test('blocks repeat return when request already exists', () => {
        const withReturn = {
            ...deliveredRecent,
            status: 'Return Requested',
            returnItems: [{ productId: 'p1', quantity: 1 }]
        };
        expect(ORW.isOrderReturnEligible(withReturn)).toBe(false);
    });

    test('validateReturnForm requires reason and item selection', () => {
        const selections = ORW.buildInitialSelections(deliveredRecent).map((s) => ({
            ...s,
            selected: true,
            quantity: 1
        }));

        const missingReason = ORW.validateReturnForm({ selections, reasonCode: '' });
        expect(missingReason.ok).toBe(false);

        const valid = ORW.validateReturnForm({ selections, reasonCode: 'defective' });
        expect(valid.ok).toBe(true);
    });

    test('buildReturnRequestPayload includes productId, sku, and reason label', () => {
        const selections = ORW.buildInitialSelections(deliveredRecent).map((s) => ({
            ...s,
            selected: true,
            quantity: 1
        }));

        const payload = ORW.buildReturnRequestPayload(deliveredRecent, {
            reasonCode: 'wrong_item',
            notes: 'Received wrong size',
            proofUrl: 'https://cdn.example/proof.jpg',
            selections
        });

        expect(payload.items).toHaveLength(1);
        expect(payload.items[0].productId).toBe('p1');
        expect(payload.items[0].sku).toBe('SKU-1');
        expect(payload.items[0].reason).toBe('Wrong Size / Item');
        expect(payload.reasonCode).toBe('wrong_item');
        expect(payload.notes).toBe('Received wrong size');
        expect(payload.photos).toEqual(['https://cdn.example/proof.jpg']);
        expect(payload.estimatedRefund).toBe(500);
    });

    test('default returnRequest.pending on new orders is not an active return', () => {
        const freshOrder = {
            status: 'Pending',
            returnRequest: { status: 'pending', refundAmount: 0 }
        };
        expect(ORW.hasActiveReturnRequest(freshOrder)).toBe(false);
        expect(ORW.mapReturnStatusTag(freshOrder)).toBeNull();
        expect(ORW.resolveReturnProgressFromOrder(freshOrder)).toBeNull();
    });

    test('resolveReturnProgressFromOrder maps pending and refunded states', () => {
        const pending = ORW.resolveReturnProgressFromOrder({
            status: 'Return Requested',
            returnRequestedAt: new Date().toISOString(),
            returnRequest: { status: 'pending', refundAmount: 500 }
        });
        expect(pending.activeId).toBe('pending');
        expect(pending.steps.find((s) => s.id === 'pending').state).toBe('active');

        const refunded = ORW.resolveReturnProgressFromOrder({
            status: 'Refunded',
            refundAmount: 500,
            returnRequestedAt: new Date().toISOString(),
            returnRequest: { status: 'approved', refundAmount: 500 }
        });
        expect(refunded.activeId).toBe('refunded');
    });
});

describe('Order return progress timeline UI', () => {
    test('renderReturnProgressTrack outputs return steps', () => {
        const OST = loadOrderStatusTimeline();
        const host = {
            innerHTML: '',
            classList: { add: jest.fn(), remove: jest.fn() },
            setAttribute: jest.fn()
        };

        OST.renderReturnProgressTrack(host, {
            status: 'Return Requested',
            returnRequestedAt: new Date().toISOString(),
            returnRequest: { status: 'pending', refundAmount: 250 }
        });

        expect(host.classList.remove).toHaveBeenCalledWith('hidden');
        expect(host.innerHTML).toMatch(/Return Pending/);
        expect(host.innerHTML).toMatch(/Estimated refund/);
    });
});

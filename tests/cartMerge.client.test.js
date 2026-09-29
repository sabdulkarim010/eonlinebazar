const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCartMergeHarness() {
    const guestCart = [{
        id: 'p1',
        productId: 'p1',
        price: 1,
        quantity: 2,
        variantId: 'v1'
    }];
    let cartStorage = JSON.parse(JSON.stringify(guestCart));
    const sessionData = {};

    const window = {
        EOBStorageKeys: { CART: 'cart' },
        EOBStorage: {
            getJSON(key, fallback) {
                if (key === 'cart') return cartStorage.length ? cartStorage : fallback;
                return fallback;
            },
            remove(key) {
                if (key === 'cart') cartStorage = [];
            },
            session: {
                getJSON(key, fallback) {
                    return Object.prototype.hasOwnProperty.call(sessionData, key)
                        ? sessionData[key]
                        : fallback;
                },
                setJSON(key, value) {
                    sessionData[key] = value;
                },
                remove(key) {
                    delete sessionData[key];
                }
            }
        },
        globalProductCatalog: [],
        CustomEvent: class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init && init.detail;
            }
        },
        dispatchEvent: () => {},
        fetch: async () => ({
            ok: true,
            json: async () => ({
                data: [{
                    productId: 'p1',
                    variantId: 'v1',
                    quantity: 2,
                    price: 499
                }]
            })
        })
    };

    window.CartDisplayUtils = {
        stripGuestCartForMerge(items) {
            return items.map((item) => ({
                productId: item.productId || item.id,
                variantId: item.variantId,
                quantity: item.quantity
            }));
        },
        mergeCartItems(serverItems, localItems) {
            return serverItems.map((row) => ({
                ...row,
                id: row.productId,
                price: Number(row.price) || 0,
                __serverSynced: true
            }));
        },
        computeTotalCartQuantity(items) {
            return items.reduce((t, i) => t + (Number(i.quantity) || 0), 0);
        },
        applyCartBadgeCount: () => {},
        broadcastCartCrossTabChange: () => {}
    };

    let syncedItems = null;
    window.syncCartFromServerItems = (items) => {
        syncedItems = items;
    };

    const utilsCode = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'cart-merge.js'),
        'utf8'
    );
    window.window = window;
    vm.createContext(window);
    vm.runInContext(utilsCode, window);

    return { window, getSyncedItems: () => syncedItems, getGuestStorage: () => cartStorage };
}

describe('Guest cart merge client', () => {
    test('applyMergedCartToClient clears guest storage and uses server prices', async () => {
        const { window, getSyncedItems, getGuestStorage } = loadCartMergeHarness();
        const guest = window.CartMerge.getGuestCartFromStorage();
        expect(guest.length).toBe(1);
        expect(guest[0].price).toBe(1);

        window.CartMerge.applyMergedCartToClient([{
            productId: 'p1',
            variantId: 'v1',
            quantity: 2,
            price: 499
        }], guest);

        expect(getGuestStorage()).toEqual([]);
        const synced = getSyncedItems();
        expect(synced).toHaveLength(1);
        expect(synced[0].price).toBe(499);
    });

    test('mergeGuestCartViaApi posts minimal payload and clears guest cart', async () => {
        const { window, getGuestStorage } = loadCartMergeHarness();
        let postedBody = null;
        window.fetch = async (_url, init) => {
            postedBody = JSON.parse(init.body);
            return {
                ok: true,
                json: async () => ({
                    data: [{ productId: 'p1', variantId: 'v1', quantity: 2, price: 120 }]
                })
            };
        };

        await window.CartMerge.mergeGuestCartViaApi('test-token', window.CartMerge.getGuestCartFromStorage());

        expect(postedBody.cartItems).toEqual([{
            productId: 'p1',
            variantId: 'v1',
            quantity: 2
        }]);
        expect(getGuestStorage()).toEqual([]);
    });
});

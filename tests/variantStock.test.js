const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createBadgeEl() {
    return {
        className: 'stock-status-badge',
        classList: {
            _set: new Set(['stock-status-badge']),
            add(...c) { c.forEach((x) => this._set.add(x)); this._owner.className = [...this._set].join(' '); },
            remove(...c) { c.forEach((x) => this._set.delete(x)); this._owner.className = [...this._set].join(' '); },
            contains(c) { return this._set.has(c); }
        },
        textContent: '',
        style: {},
        attributes: {},
        setAttribute(k, v) { this.attributes[k] = v; },
        get _owner() { return this; }
    };
}

function loadVariantStock() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'pdp', 'variantStock.js'),
        'utf8'
    );
    const badge = createBadgeEl();
    badge.classList._owner = badge;
    const addBtn = {
        id: 'addToCartBtn',
        _disabled: false,
        get disabled() { return this._disabled; },
        set disabled(v) { this._disabled = Boolean(v); },
        style: {},
        attributes: {},
        dataset: {},
        querySelector: () => ({ textContent: 'Add to Cart' }),
        setAttribute(k, v) { this.attributes[k] = v; }
    };
    const sandbox = {
        document: {
            getElementById(id) {
                if (id === 'stockStatus') return badge;
                if (id === 'addToCartBtn') return addBtn;
                return null;
            }
        },
        currentProductData: { lowStockThreshold: 5 },
        i18n: null
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return { sandbox, badge, addBtn };
}

function loadVariantUtils() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'variantUtils.js'),
        'utf8'
    );
    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.VariantUtils;
}

describe('PDP variant stock (Step 3.2.2)', () => {
    test('resolveEntityStock prefers stockQuantity over stock', () => {
        const { sandbox } = loadVariantStock();
        expect(sandbox.PdpVariantStock.resolveEntityStock({ stockQuantity: 3, stock: 99 })).toBe(3);
        expect(sandbox.PdpVariantStock.resolveEntityStock({ stock: 7 })).toBe(7);
    });

    test('classifyStockLevel maps in / low / out thresholds', () => {
        const { sandbox } = loadVariantStock();
        const VS = sandbox.PdpVariantStock;
        expect(VS.classifyStockLevel(10, 5)).toBe('in');
        expect(VS.classifyStockLevel(5, 5)).toBe('low');
        expect(VS.classifyStockLevel(2, 5)).toBe('low');
        expect(VS.classifyStockLevel(0, 5)).toBe('out');
    });

    test('paintStockBadge updates text and CSS classes for low stock', () => {
        const { sandbox, badge } = loadVariantStock();
        sandbox.PdpVariantStock.paintStockBadge(3, { lowStockThreshold: 5 });
        expect(badge.textContent).toMatch(/Low Stock — Only 3 left!/);
        expect(badge.classList.contains('stock-status-badge--low')).toBe(true);
        expect(badge.attributes['data-stock-level']).toBe('low');

        sandbox.PdpVariantStock.paintStockBadge(12, { lowStockThreshold: 5 });
        expect(badge.classList.contains('stock-status-badge--in')).toBe(true);
        expect(badge.textContent).toBe('In Stock');

        sandbox.PdpVariantStock.paintStockBadge(0, { lowStockThreshold: 5 });
        expect(badge.classList.contains('stock-status-badge--out')).toBe(true);
    });

    test('syncCartCtaState disables add to cart and sets Out of Stock label', () => {
        const { sandbox, addBtn } = loadVariantStock();
        const span = { textContent: 'Add to Cart' };
        addBtn.querySelector = () => span;
        sandbox.PdpVariantStock.syncCartCtaState(false, { reason: 'out' });
        expect(addBtn.disabled).toBe(true);
        expect(span.textContent).toBe('Out of Stock');

        sandbox.PdpVariantStock.syncCartCtaState(true);
        expect(addBtn.disabled).toBe(false);
        expect(span.textContent).toBe('Add to Cart');
    });

    test('matrix getOptionState marks unavailable and oos combinations', () => {
        const VU = loadVariantUtils();
        const variants = [
            { attributes: { Color: 'Red', Size: 'M' }, stockQuantity: 4 },
            { attributes: { Color: 'Red', Size: 'L' }, stockQuantity: 0 },
            { attributes: { Color: 'Blue', Size: 'M' }, stockQuantity: 0 }
        ];

        expect(VU.getOptionState(variants, { Size: 'M' }, 'Color', 'Red')).toBe('in-stock');
        expect(VU.getOptionState(variants, { Size: 'M' }, 'Color', 'Blue')).toBe('oos');
        expect(VU.getOptionState(variants, { Size: 'M' }, 'Color', 'Green')).toBe('unavailable');
        expect(VU.getOptionState(variants, { Color: 'Red' }, 'Size', 'L')).toBe('oos');
    });

    test('selection incomplete badge uses select state', () => {
        const { sandbox, badge } = loadVariantStock();
        sandbox.PdpVariantStock.paintStockBadge(0, {}, { selectionIncomplete: true });
        expect(badge.classList.contains('stock-status-badge--select')).toBe(true);
        expect(badge.textContent).toBe('Select options');
    });
});

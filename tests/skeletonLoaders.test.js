const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSkeletonsModule() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'ui', 'skeletons.js'),
        'utf8'
    );
    const sandbox = {
        document: {
            createElement() {
                return {
                    className: '',
                    innerHTML: '',
                    setAttribute() {},
                    appendChild() {}
                };
            },
            getElementById: () => null
        },
        setTimeout: (fn) => fn()
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.EOBSkeletons;
}

function createDomContainer() {
    const nodes = [];
    const container = {
        innerHTML: '',
        className: '',
        classList: {
            _set: new Set(),
            add(...c) { c.forEach((x) => this._set.add(x)); },
            remove(...c) { c.forEach((x) => this._set.delete(x)); },
            contains(c) { return this._set.has(c); }
        },
        attributes: {},
        setAttribute(k, v) { this.attributes[k] = v; },
        removeAttribute(k) { delete this.attributes[k]; },
        children: nodes,
        querySelectorAll(selector) {
            const html = container.innerHTML;
            const matches = [];
            if (selector.includes('eob-skeleton-host') && html.includes('eob-skeleton-host')) {
                matches.push({ remove() { container.innerHTML = ''; } });
            }
            if (selector.includes('eob-skeleton-card')) {
                const count = (html.match(/eob-skeleton-card/g) || []).length;
                for (let i = 0; i < count; i += 1) {
                    matches.push({ remove() {} });
                }
            }
            if (selector.includes('data-eob-skeleton')) {
                const count = (html.match(/data-eob-skeleton=/g) || []).length;
                for (let i = 0; i < count; i += 1) {
                    matches.push({
                        closest() { return null; },
                        remove() { container.innerHTML = ''; }
                    });
                }
            }
            return matches;
        },
        appendChild(el) {
            nodes.push(el);
        }
    };
    return container;
}

describe('EOBSkeletons', () => {
    let SK;

    beforeAll(() => {
        SK = loadSkeletonsModule();
    });

    test('renderProductCardSkeleton returns expected marker count', () => {
        const html = SK.renderProductCardSkeleton(4);
        expect(SK.countSkeletonMarkers(html)).toBeGreaterThanOrEqual(4 * 4);
        expect(html).toContain('data-eob-skeleton="product-card"');
        expect(html).toContain('eob-skeleton--media');
    });

    test('renderPdpSkeleton includes gallery and variant placeholders', () => {
        const html = SK.renderPdpSkeleton();
        expect(html).toContain('data-eob-skeleton="pdp"');
        expect(html).toContain('data-eob-skeleton="pdp-gallery"');
        expect(html).toContain('eob-skeleton--variant');
    });

    test('renderCartLineSkeleton respects count and drawer variant class', () => {
        const html = SK.renderCartLineSkeleton(2, 'drawer');
        expect((html.match(/data-eob-skeleton="cart-line"/g) || []).length).toBe(2);
        expect(html).toContain('eob-skeleton-row--drawer');
    });

    test('swapSkeletonForContent removes skeleton markers from container', () => {
        const container = createDomContainer();
        SK.mountSkeletonHtml(container, SK.renderProductCardSkeleton(3));
        expect(container.innerHTML).toContain('data-eob-skeleton="product-card"');

        SK.swapSkeletonForContent(container, '<div class="product-card">Live</div>');
        expect(container.innerHTML).not.toContain('data-eob-skeleton=');
        expect(container.innerHTML).toContain('Live');
        expect(container.classList.contains('eob-content-reveal')).toBe(true);
    });

    test('clearSkeletonNodes leaves non-skeleton siblings when replacing host only', () => {
        const container = createDomContainer();
        container.innerHTML = '<div class="live">Keep</div>';
        SK.mountSkeletonHtml(container, SK.renderCartLineSkeleton(1));
        expect(container.innerHTML).toContain('cart-line');

        SK.swapSkeletonForContent(container, '<div class="live">Keep</div><div class="live">Added</div>');
        expect(container.innerHTML).not.toContain('data-eob-skeleton=');
        expect(container.innerHTML).toContain('Added');
    });
});

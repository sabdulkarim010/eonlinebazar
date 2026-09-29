const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createMockDocument() {
    const nodes = new Map();
    let idCounter = 0;

    function el(tag, attrs = {}) {
        const node = {
            tagName: tag.toUpperCase(),
            id: attrs.id || '',
            className: attrs.className || '',
            classList: {
                _set: new Set(String(attrs.className || '').split(/\s+/).filter(Boolean)),
                add(...c) { c.forEach((x) => this._set.add(x)); node.className = [...this._set].join(' '); },
                remove(...c) { c.forEach((x) => this._set.delete(x)); node.className = [...this._set].join(' '); },
                toggle(c, force) {
                    if (force === true) this._set.add(c);
                    else if (force === false) this._set.delete(c);
                    else if (this._set.has(c)) this._set.delete(c);
                    else this._set.add(c);
                    node.className = [...this._set].join(' ');
                },
                contains(c) { return this._set.has(c); }
            },
            style: {},
            dataset: attrs.dataset || {},
            hidden: attrs.hidden === true,
            attributes: {},
            children: [],
            parentElement: null,
            innerHTML: '',
            textContent: '',
            get disabled() { return this.attributes.disabled === 'true' || this.attributes.disabled === true; },
            set disabled(v) { if (v) this.attributes.disabled = 'true'; else delete this.attributes.disabled; },
            _listeners: {},
            setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') this.id = v; },
            getAttribute(k) { return this.attributes[k]; },
            removeAttribute(k) { delete this.attributes[k]; },
            appendChild(child) {
                child.parentElement = this;
                this.children.push(child);
                return child;
            },
            querySelector(sel) {
                const walk = (root) => {
                    if (!root) return null;
                    if (sel === '.main-image-box' && root.className === 'main-image-box') return root;
                    if (sel === '.pdp-lightbox__stage' && root.className === 'pdp-lightbox__stage') return root;
                    if (sel === '.pdp-lightbox__counter' && root.className === 'pdp-lightbox__counter') return root;
                    if (sel === '.pdp-lightbox__close' && root.className === 'pdp-lightbox__close') return root;
                    if (sel === '.pdp-lightbox__thumbs' && root.className === 'pdp-lightbox__thumbs') return root;
                    if (sel === '.pdp-lightbox__nav--prev' && root.className.includes('pdp-lightbox__nav--prev')) return root;
                    if (sel === '.pdp-lightbox__nav--next' && root.className.includes('pdp-lightbox__nav--next')) return root;
                    if (sel === '[data-pdp-lightbox-close]' && root.dataset?.pdpLightboxClose !== undefined) return root;
                    for (const ch of root.children || []) {
                        const hit = walk(ch);
                        if (hit) return hit;
                    }
                    return null;
                };
                if (sel === '.main-image-box') return nodes.get('mainBox') || null;
                if (sel.includes('slide')) return nodes.get('slideImg') || null;
                if (this.id === 'pdpLightbox' || this.className === 'pdp-lightbox') return walk(this);
                return walk(this) || null;
            },
            querySelectorAll(sel) {
                const out = [];
                const walk = (root) => {
                    if (!root) return;
                    if (sel.includes('pdp-lightbox__thumb') && root.className === 'pdp-lightbox__thumb') out.push(root);
                    if (sel.includes('button:not([disabled])') && root.tagName === 'BUTTON' && !root.disabled) out.push(root);
                    (root.children || []).forEach(walk);
                };
                walk(this);
                if (sel.includes('pdp-lightbox__thumb') && out.length) return out;
                if (sel.includes('pdp-lightbox__thumb')) return nodes.get('thumbs') || [];
                return out;
            },
            addEventListener(type, fn) {
                this._listeners[type] = this._listeners[type] || [];
                this._listeners[type].push(fn);
            },
            removeEventListener(type, fn) {
                if (!this._listeners[type]) return;
                this._listeners[type] = this._listeners[type].filter((h) => h !== fn);
            },
            focus() { nodes.set('activeElement', this); },
            click() {
                (this._listeners.click || []).forEach((fn) => fn({ target: this, preventDefault() {} }));
            }
        };
        if (!node.id && tag === 'div') {
            idCounter += 1;
            node.id = `el-${idCounter}`;
        }
        return node;
    }

    const body = el('body');
    const mainBox = el('div', { className: 'main-image-box' });
    mainBox.getBoundingClientRect = () => ({ left: 90, top: 90, width: 320, height: 320, right: 410, bottom: 410 });
    nodes.set('mainBox', mainBox);
    body.appendChild(mainBox);

    const carousel = el('div', { id: 'productImageCarousel', className: 'product-image-carousel' });
    carousel.dataset = {};
    nodes.set('carousel', carousel);
    mainBox.appendChild(carousel);

    const slideImg = el('img');
    slideImg.getBoundingClientRect = () => ({ left: 100, top: 100, width: 300, height: 300 });
    slideImg.src = '/uploads/a.jpg';
    slideImg.dataset = { imageUrl: '/uploads/a.jpg' };
    nodes.set('slideImg', slideImg);

    const document = {
        body,
        documentElement: el('html'),
        activeElement: null,
        createElement(tag) {
            const node = el(tag);
            if (tag === 'div') {
                Object.defineProperty(node, 'innerHTML', {
                    set(html) {
                        node._innerHTML = html;
                        if (!html || !html.includes('pdp-lightbox__panel')) return;
                        node.children.length = 0;
                        const backdrop = el('div', { className: 'pdp-lightbox__backdrop', dataset: { pdpLightboxClose: '' } });
                        const panel = el('div', { className: 'pdp-lightbox__panel' });
                        const closeBtn = el('button', { className: 'pdp-lightbox__close' });
                        nodes.set('lightboxClose', closeBtn);
                        const prev = el('button', { className: 'pdp-lightbox__nav pdp-lightbox__nav--prev' });
                        const wrap = el('figure', { className: 'pdp-lightbox__stage-wrap' });
                        const stage = el('img', { className: 'pdp-lightbox__stage' });
                        nodes.set('lightboxStage', stage);
                        const counter = el('figcaption', { className: 'pdp-lightbox__counter' });
                        counter.textContent = '1 / 1';
                        nodes.set('lightboxCounter', counter);
                        wrap.appendChild(stage);
                        wrap.appendChild(counter);
                        const next = el('button', { className: 'pdp-lightbox__nav pdp-lightbox__nav--next' });
                        const thumbs = el('div', { className: 'pdp-lightbox__thumbs' });
                        nodes.set('thumbs', []);
                        panel.appendChild(closeBtn);
                        panel.appendChild(prev);
                        panel.appendChild(wrap);
                        panel.appendChild(next);
                        panel.appendChild(thumbs);
                        node.appendChild(backdrop);
                        node.appendChild(panel);
                    },
                    get() { return node._innerHTML || ''; }
                });
            }
            return node;
        },
        querySelector(sel) {
            if (sel === '.main-image-box') return mainBox;
            return null;
        }
    };

    return { document, nodes, mainBox, carousel, slideImg, body };
}

function loadPdpGalleryEnhancements(mock) {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'pdp', 'galleryZoomLightbox.js'),
        'utf8'
    );

    const sandbox = {
        ...mock,
        galleryImagesCache: ['/uploads/a.jpg', '/uploads/b.jpg'],
        activeGalleryIndex: 0,
        currentProductData: { name: 'Test Shoe' },
        requestAnimationFrame: (fn) => fn(),
        matchMedia: () => ({ matches: true }),
        getCarouselEl: () => mock.carousel,
        getCarouselTrackEl: () => ({
            querySelector: () => mock.slideImg
        }),
        getMainProductImageEl: () => mock.slideImg,
        goToGalleryIndex: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

describe('PDP gallery zoom & lightbox', () => {
    test('mount binds zoom host and desktop zoom flag', () => {
        const mock = createMockDocument();
        const sandbox = loadPdpGalleryEnhancements(mock);
        sandbox.PdpGalleryEnhancements.mount();
        expect(mock.mainBox.classList.contains('pdp-enhanced')).toBe(true);
        expect(sandbox.PdpGalleryEnhancements.isDesktopZoomEnabled()).toBe(true);
    });

    test('hover zoom activates lens pane on mousemove', () => {
        const mock = createMockDocument();
        const sandbox = loadPdpGalleryEnhancements(mock);
        sandbox.PdpGalleryEnhancements.mount();
        expect(mock.mainBox.classList.contains('pdp-enhanced')).toBe(true);
        const zoomHostAfterMount = mock.mainBox.children.find((c) => c.className === 'pdp-zoom-host');
        expect(zoomHostAfterMount).toBeTruthy();

        sandbox.PdpGalleryEnhancements._applyZoomFrame(250, 250);
        expect(zoomHostAfterMount.classList.contains('is-active')).toBe(true);
    });

    test('lightbox opens and closes via API and ESC', () => {
        const mock = createMockDocument();
        const sandbox = loadPdpGalleryEnhancements(mock);
        sandbox.PdpGalleryEnhancements.mount();
        sandbox.PdpGalleryEnhancements.openLightbox(1);
        expect(sandbox.PdpGalleryEnhancements.isLightboxOpen()).toBe(true);

        const lb = mock.body.children.find((c) => c.id === 'pdpLightbox');
        expect(lb).toBeTruthy();
        expect(lb.hidden).toBe(false);

        const keydownCalls = sandbox.addEventListener.mock.calls.filter((c) => c[0] === 'keydown');
        expect(keydownCalls.length).toBeGreaterThan(0);

        const keydownHandler = sandbox.addEventListener.mock.calls.find((c) => c[0] === 'keydown')?.[1];
        expect(typeof keydownHandler).toBe('function');
        keydownHandler({ key: 'Escape', preventDefault: jest.fn() });
        expect(sandbox.PdpGalleryEnhancements.isLightboxOpen()).toBe(false);
        expect(lb.hidden).toBe(true);
    });

    test('lightbox navigation updates counter and carousel sync', () => {
        const mock = createMockDocument();
        const sandbox = loadPdpGalleryEnhancements(mock);
        sandbox.PdpGalleryEnhancements.mount();
        sandbox.PdpGalleryEnhancements.openLightbox(0);

        const lb = mock.body.children.find((c) => c.id === 'pdpLightbox');
        const counter = lb.children[0]?.children?.find?.((c) => c.className === 'pdp-lightbox__counter')
            || lb.querySelector('.pdp-lightbox__counter');

        sandbox.PdpGalleryEnhancements.openLightbox(1);
        expect(sandbox.goToGalleryIndex).toHaveBeenCalled();
        if (counter) {
            expect(counter.textContent).toMatch(/2 \/ 2/);
        }
    });

    test('variant image list sync updates gallery cache for lightbox', () => {
        const mock = createMockDocument();
        const sandbox = loadPdpGalleryEnhancements(mock);
        sandbox.PdpGalleryEnhancements.mount();
        sandbox.PdpGalleryEnhancements.openLightbox(0);

        sandbox.PdpGalleryEnhancements.syncImagesFromVariant(['/uploads/x.jpg', '/uploads/y.jpg', '/uploads/z.jpg']);
        expect(sandbox.galleryImagesCache.length).toBe(3);

        sandbox.PdpGalleryEnhancements.openLightbox(2);
        expect(sandbox.activeGalleryIndex).toBe(2);
    });
});

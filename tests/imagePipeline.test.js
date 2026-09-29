const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadImagePipeline() {
    const iuCode = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'utils', 'imageUtils.js'),
        'utf8'
    );
    const ptCode = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'productThumbnail.js'),
        'utf8'
    );

    const sandbox = {
        location: { origin: 'https://eonlinebazar.com' },
        document: null
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(iuCode, sandbox);
    vm.runInContext(ptCode, sandbox);
    return { IU: sandbox.EOBImageUtils, PT: sandbox.ProductThumbnail };
}

describe('Image pipeline (EOBImageUtils)', () => {
    let IU;

    beforeAll(() => {
        IU = loadImagePipeline().IU;
    });

    test('product card attributes use lazy loading and async decoding', () => {
        const attrs = IU.buildProductImageAttributes('/uploads/products/shoe.jpg', {
            variant: 'card',
            alt: 'Shoe',
            priority: 'lazy'
        });
        expect(attrs.loading).toBe('lazy');
        expect(attrs.decoding).toBe('async');
        expect(attrs.width).toBe(120);
        expect(attrs.height).toBe(120);
        expect(attrs.onerror).toContain('fallback');
    });

    test('hero / LCP attributes are eager with high fetch priority', () => {
        const hero = IU.buildHeroBannerAttributes('https://res.cloudinary.com/demo/image/upload/banner.jpg', {
            alt: 'Hero'
        });
        expect(hero.loading).toBe('eager');
        expect(hero.fetchPriority).toBe('high');
        expect(hero.loading).not.toBe('lazy');
    });

    test('buildImgHtml includes width, height, and onerror fallback', () => {
        const html = IU.buildImgHtml(IU.buildProductImageAttributes('/products/a.jpg', {
            variant: 'compact',
            alt: 'A'
        }));
        expect(html).toContain('loading="lazy"');
        expect(html).toContain('decoding="async"');
        expect(html).toMatch(/width="\d+"/);
        expect(html).toMatch(/height="\d+"/);
        expect(html).toContain('onerror=');
    });

    test('sanitizeCatalogImageUrl rejects unsafe paths', () => {
        expect(IU.sanitizeCatalogImageUrl('&evil')).toBe('');
        expect(IU.sanitizeCatalogImageUrl('/uploads/products/x.webp')).toContain('/uploads/products/x.webp');
    });

    test('Cloudinary URLs receive srcset variants', () => {
        const url = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg';
        const srcset = IU.buildSrcSet(url, [120, 240]);
        expect(srcset).toContain('120w');
        expect(srcset).toContain('240w');
        expect(srcset).toContain('w_120');
    });
});

describe('ProductThumbnail + image pipeline integration', () => {
    let PT;

    beforeAll(() => {
        PT = loadImagePipeline().PT;
    });

    test('buildThumbnailHtml card includes lazy/async and dimensions', () => {
        const html = PT.buildThumbnailHtml(
            { name: 'Test', image: '/uploads/products/p1.jpg' },
            { variant: 'card', priority: 'lazy' }
        );
        expect(html).toContain('loading="lazy"');
        expect(html).toContain('decoding="async"');
        expect(html).toContain('width="120"');
        expect(html).toContain('height="120"');
        expect(html).toContain('onerror=');
    });

    test('PDP-style LCP thumbnail uses eager high priority', () => {
        const html = PT.buildThumbnailHtml(
            { name: 'Hero Product', image: '/uploads/products/p1.jpg' },
            { variant: 'detail', priority: 'lcp' }
        );
        expect(html).toContain('loading="eager"');
        expect(html).toContain('fetchpriority="high"');
        expect(html).not.toContain('loading="lazy"');
    });
});

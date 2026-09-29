const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSanitizer() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'client', 'js', 'utils', 'sanitizer.js'),
        'utf8'
    );
    const window = { document: null };
    window.window = window;
    vm.createContext(window);
    vm.runInContext(code, window);
    return window.EOBSanitizer;
}

describe('EOBSanitizer', () => {
    let S;

    beforeAll(() => {
        S = loadSanitizer();
    });

    test('escapeHtml neutralizes script tags', () => {
        const payload = '<script>alert(1)</script>';
        expect(S.escapeHtml(payload)).not.toContain('<script');
        expect(S.escapeHtml(payload)).toContain('&lt;script');
    });

    test('escapeHtml neutralizes img onerror', () => {
        const payload = '<img src=x onerror=alert(1)>';
        const out = S.escapeHtml(payload);
        expect(out).not.toMatch(/<img/i);
        expect(out).toContain('&lt;img');
    });

    test('sanitizeRichText strips script and event handlers (regex fallback)', () => {
        const dirty = '<p>Hello</p><script>alert(1)</script><img src=x onerror=alert(1)>';
        const clean = S.sanitizeRichText(dirty);
        expect(clean.toLowerCase()).not.toContain('<script');
        expect(clean).not.toMatch(/\sonerror\s*=/i);
    });

    test('sanitizeDisplayText trims control characters', () => {
        expect(S.sanitizeDisplayText('  hello\x00world  ')).toBe('helloworld');
    });

    test('setTextContent assigns plain text', () => {
        const el = { textContent: '' };
        S.setTextContent(el, '<b>x</b>');
        expect(el.textContent).toBe('<b>x</b>');
    });
});

/**
 * Customer storefront XSS helpers — escape, rich-text sanitize, safe DOM text.
 */
(function initEOBSanitizer(global) {
    'use strict';

    var BLOCKED_TAGS = /^(script|iframe|object|embed|link|meta|base|form)$/i;
    var EVENT_ATTR = /^on/i;
    var JS_URL = /^\s*javascript:/i;

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\//g, '&#x2F;');
    }

    function escapeUrlForAttr(url) {
        return escapeHtml(String(url == null ? '' : url));
    }

    /** Reflected query / form display — strip control chars, limit length. */
    function sanitizeDisplayText(str, maxLen) {
        var limit = typeof maxLen === 'number' && maxLen > 0 ? maxLen : 256;
        var cleaned = String(str == null ? '' : str)
            .replace(/[\u0000-\u001F\u007F]/g, '')
            .trim();
        if (cleaned.length > limit) cleaned = cleaned.slice(0, limit);
        return cleaned;
    }

    function stripDangerousAttributes(el) {
        if (!el || !el.attributes) return;
        var attrs = Array.prototype.slice.call(el.attributes);
        attrs.forEach(function (attr) {
            var name = String(attr.name || '').toLowerCase();
            var val = String(attr.value || '');
            if (EVENT_ATTR.test(name)) {
                el.removeAttribute(attr.name);
                return;
            }
            if ((name === 'href' || name === 'src' || name === 'xlink:href') && JS_URL.test(val)) {
                el.removeAttribute(attr.name);
            }
            if (name === 'style' && /expression\s*\(|url\s*\(\s*javascript:/i.test(val)) {
                el.removeAttribute(attr.name);
            }
        });
    }

    function sanitizeRichText(htmlStr) {
        var raw = String(htmlStr == null ? '' : htmlStr);
        if (!raw.trim()) return '';

        if (typeof DOMParser !== 'undefined' && global.document) {
            try {
                var parser = new DOMParser();
                var doc = parser.parseFromString(raw, 'text/html');
                var body = doc.body;
                if (body) {
                    body.querySelectorAll('script, iframe, object, embed, link, meta, base, form').forEach(function (node) {
                        node.remove();
                    });
                    body.querySelectorAll('*').forEach(function (node) {
                        if (BLOCKED_TAGS.test(node.tagName)) {
                            node.remove();
                            return;
                        }
                        stripDangerousAttributes(node);
                    });
                    return body.innerHTML;
                }
            } catch (_) { /* fall through */ }
        }

        return raw
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
            .replace(/<object[\s\S]*?<\/object>/gi, '')
            .replace(/<embed[\s\S]*?>/gi, '')
            .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
            .replace(/javascript:/gi, '');
    }

    function setTextContent(element, text) {
        if (!element) return;
        try {
            element.textContent = text == null ? '' : String(text);
        } catch (_) { /* ignore */ }
    }

    var EOBSanitizer = {
        escapeHtml: escapeHtml,
        escapeUrlForAttr: escapeUrlForAttr,
        sanitizeRichText: sanitizeRichText,
        sanitizeDisplayText: sanitizeDisplayText,
        setTextContent: setTextContent
    };

    global.EOBSanitizer = EOBSanitizer;
    global.escapeHtml = escapeHtml;
    if (!global.profileEscapeHtml) {
        global.profileEscapeHtml = escapeHtml;
    }
})(typeof window !== 'undefined' ? window : globalThis);

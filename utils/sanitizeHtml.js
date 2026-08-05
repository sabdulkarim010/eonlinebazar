/********************************************************************
 * Project: EonlineBazar
 * File: sanitizeHtml.js
 * Description: Lightweight HTML sanitizer for CMS / Quill content.
 * Strips scripts, event handlers, and dangerous URLs — keeps rich text.
 ********************************************************************/

const ALLOWED_TAGS = new Set([
    'p', 'br', 'hr', 'div', 'span', 'pre', 'blockquote', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup',
    'ul', 'ol', 'li',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'figure', 'figcaption', 'iframe'
]);

const VOID_TAGS = new Set(['br', 'hr', 'img']);

function isSafeUrl(raw) {
    const url = String(raw || '').trim();
    if (!url) return false;
    if (url.startsWith('#') || url.startsWith('/') || url.startsWith('mailto:') || url.startsWith('tel:')) {
        return true;
    }
    if (/^https?:\/\//i.test(url)) return true;
    if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(url)) return true;
    return false;
}

function isSafeIframeSrc(raw) {
    const url = String(raw || '').trim();
    return /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com|maps\.google\.com|www\.google\.com\/maps)\//i.test(url);
}

/**
 * Sanitize rich HTML from Quill / paste. Not a full HTML parser — good enough
 * for trusted admin authors while blocking script / javascript: payloads.
 */
function sanitizeHtml(input, { maxLength = 200000 } = {}) {
    let html = String(input || '').slice(0, maxLength);
    if (!html.trim()) return '';

    // Remove comments, scripts, styles, and event handlers early
    html = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\s*(script|style|link|meta|object|embed|form|input|button|textarea|select)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|style|link|meta|object|embed|form|input|button|textarea|select)[^>]*\/?\s*>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript\s*:/gi, '')
        .replace(/vbscript\s*:/gi, '')
        .replace(/data\s*:\s*text\/html/gi, '');

    // Filter tags / attributes
    html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tagName, attrs) => {
        const tag = String(tagName || '').toLowerCase();
        const isClose = match.startsWith('</');
        if (!ALLOWED_TAGS.has(tag)) return '';
        if (isClose) return VOID_TAGS.has(tag) ? '' : `</${tag}>`;

        const kept = [];
        const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
        let m;
        while ((m = attrRe.exec(attrs || '')) !== null) {
            const name = m[1].toLowerCase();
            const value = m[3] ?? m[4] ?? m[5] ?? '';
            if (name.startsWith('on')) continue;

            if (tag === 'a' && name === 'href' && isSafeUrl(value)) {
                kept.push(`href="${value.replace(/"/g, '&quot;')}"`);
                kept.push('rel="noopener noreferrer"');
                continue;
            }
            if (tag === 'a' && (name === 'target' || name === 'title' || name === 'class' || name === 'style')) {
                if (name === 'target' && value !== '_blank' && value !== '_self') continue;
                kept.push(`${name}="${String(value).replace(/"/g, '&quot;')}"`);
                continue;
            }
            if (tag === 'img' && name === 'src' && isSafeUrl(value)) {
                kept.push(`src="${value.replace(/"/g, '&quot;')}"`);
                continue;
            }
            if (tag === 'img' && (name === 'alt' || name === 'title' || name === 'width' || name === 'height' || name === 'class' || name === 'style' || name === 'loading')) {
                kept.push(`${name}="${String(value).replace(/"/g, '&quot;')}"`);
                continue;
            }
            if (tag === 'iframe' && name === 'src' && isSafeIframeSrc(value)) {
                kept.push(`src="${value.replace(/"/g, '&quot;')}"`);
                kept.push('frameborder="0"', 'allowfullscreen', 'loading="lazy"');
                continue;
            }
            if (tag === 'iframe' && (name === 'width' || name === 'height' || name === 'title' || name === 'class' || name === 'style' || name === 'allow')) {
                kept.push(`${name}="${String(value).replace(/"/g, '&quot;')}"`);
                continue;
            }
            if (['class', 'style', 'id', 'title', 'align', 'dir'].includes(name)) {
                // Block expression() / url(javascript) in style
                if (name === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*javascript/i.test(value)) continue;
                if (name === 'id' && !/^[a-zA-Z][\w:-]*$/.test(value)) continue;
                kept.push(`${name}="${String(value).replace(/"/g, '&quot;')}"`);
            }
        }

        const selfClose = VOID_TAGS.has(tag) || /\/\s*$/.test(match);
        const attrStr = kept.length ? ` ${kept.join(' ')}` : '';
        return selfClose && VOID_TAGS.has(tag) ? `<${tag}${attrStr}>` : `<${tag}${attrStr}>`;
    });

    return html.trim().slice(0, maxLength);
}

module.exports = { sanitizeHtml, isSafeUrl };

/**
 * Lightweight markdown → HTML (headings, bold, italic, links, lists, paragraphs).
 * Used server-side for page content and client-side in admin preview.
 */
function markdownToHtml(markdown = '') {
    if (!markdown || typeof markdown !== 'string') return '';

    const escaped = markdown
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const lines = escaped.split(/\r?\n/);
    const html = [];
    let inList = false;

    const closeList = () => {
        if (inList) {
            html.push('</ul>');
            inList = false;
        }
    };

    const inlineFormat = (text) => text
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');

    lines.forEach((rawLine) => {
        const line = rawLine.trimEnd();

        if (!line.trim()) {
            closeList();
            return;
        }

        if (/^###\s+/.test(line)) {
            closeList();
            html.push(`<h3>${inlineFormat(line.replace(/^###\s+/, ''))}</h3>`);
            return;
        }

        if (/^##\s+/.test(line)) {
            closeList();
            html.push(`<h2>${inlineFormat(line.replace(/^##\s+/, ''))}</h2>`);
            return;
        }

        if (/^#\s+/.test(line)) {
            closeList();
            html.push(`<h1>${inlineFormat(line.replace(/^#\s+/, ''))}</h1>`);
            return;
        }

        if (/^[-*]\s+/.test(line)) {
            if (!inList) {
                html.push('<ul>');
                inList = true;
            }
            html.push(`<li>${inlineFormat(line.replace(/^[-*]\s+/, ''))}</li>`);
            return;
        }

        closeList();
        html.push(`<p>${inlineFormat(line)}</p>`);
    });

    closeList();
    return html.join('\n');
}

module.exports = { markdownToHtml };

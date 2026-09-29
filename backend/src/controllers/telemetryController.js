/**
 * Lightweight storefront error telemetry ingest (no persistence by default).
 */

const MAX_REPORTS = 50;
const MAX_MESSAGE_LEN = 2000;
const MAX_STACK_LEN = 8000;

function sanitizeString(value, maxLen) {
    if (value == null) return '';
    return String(value).slice(0, maxLen);
}

function normalizeReports(body) {
    const raw = body && Array.isArray(body.reports) ? body.reports : [];
    return raw.slice(0, MAX_REPORTS).map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        return {
            level: sanitizeString(entry.level || 'error', 32),
            message: sanitizeString(entry.message, MAX_MESSAGE_LEN),
            stack: sanitizeString(entry.stack, MAX_STACK_LEN),
            url: sanitizeString(entry.url, 500),
            source: sanitizeString(entry.source, 500),
            line: Number(entry.line) || 0,
            column: Number(entry.column) || 0
        };
    }).filter(Boolean);
}

function ingestClientErrors(req, res) {
    const reports = normalizeReports(req.body || {});
    if (process.env.NODE_ENV !== 'test' && reports.length > 0) {
        const sample = reports[0];
        console.warn(
            '[telemetry]',
            sample.level || 'error',
            sample.message || '(no message)',
            sample.url ? `@ ${sample.url}` : ''
        );
    }
    return res.status(200).json({
        success: true,
        message: 'Telemetry received',
        received: reports.length
    });
}

module.exports = {
    ingestClientErrors
};

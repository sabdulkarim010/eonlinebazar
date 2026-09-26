/**
 * Project: EOnlineBazar — HRM Shared API Layer
 * File: js/admin/modules/hrm-api.js
 * Description: Resilient fetch with timeout, debounced error toasts, and
 * shared inline table error helpers for all HRM + Staff modules.
 */
import '../admin-core.js';

export const HRM_FETCH_TIMEOUT_MS = 25000;
export const HRM_TOAST_DEBOUNCE_MS = 300;
export const HRM_INLINE_LOAD_ERROR = 'Failed to load data. Please refresh.';

let lastHrmErrorToast = { message: '', at: 0 };

/**
 * Show an error toast at most once per debounce window for identical messages.
 */
export function hrmNotifyError(message, type = 'error', { silent = false } = {}) {
    if (silent) return;

    const msg = String(message || 'Request failed.').trim();
    const now = Date.now();

    if (msg === lastHrmErrorToast.message && now - lastHrmErrorToast.at < HRM_TOAST_DEBOUNCE_MS) {
        return;
    }

    lastHrmErrorToast = { message: msg, at: now };

    if (typeof window.showToast === 'function') {
        window.showToast(msg, type, 3000);
        return;
    }

    if (typeof window.showHrmToast === 'function') {
        window.showHrmToast(msg, type);
    }
}

export function hrmEscapeInline(value) {
    if (typeof window.hrmEscape === 'function') {
        return window.hrmEscape(value);
    }
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

/** Generic inline table error row — message kept separate from toast text. */
export function hrmTableErrorRow(colspan, message = HRM_INLINE_LOAD_ERROR) {
    return `<tr><td colspan="${colspan}" class="table-status-error">${hrmEscapeInline(message)}</td></tr>`;
}

export function hrmHandleLoadError(err, { silent = false, context = '' } = {}) {
    if (context) {
        console.error(context, err);
    } else {
        console.error(err);
    }
    hrmNotifyError(err?.message || 'Request failed.', 'error', { silent });
}

function stripFetchMeta(options = {}) {
    const {
        silent: _silent,
        timeoutMs: _timeoutMs,
        throwOnHttpError: _throwOnHttpError,
        parseJson: _parseJson,
        ...fetchOptions
    } = options;
    return fetchOptions;
}

function buildFetchError(message, status, result) {
    const error = new Error(message);
    error.status = status;
    error.result = result;
    return error;
}

/** Ensure relative admin API paths always start with `/`. */
export function hrmNormalizeApiPath(url) {
    const s = String(url ?? '').trim();
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return s;
    return s.startsWith('/') ? s : `/${s}`;
}

export function hrmStripStaffPrefix(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return raw;
    const lower = raw.toLowerCase();
    if (lower.startsWith('employee:')) return raw.slice('employee:'.length).trim();
    if (lower.startsWith('admin:')) return raw.slice('admin:'.length).trim();
    return raw;
}

/**
 * Parse `<select>` values such as `admin:jdoe` or `employee:EMP 002`.
 */
export function hrmParseStaffSelect(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return {};
    if (raw.includes(':')) {
        const idx = raw.indexOf(':');
        const staffType = raw.slice(0, idx).trim().toLowerCase();
        const id = raw.slice(idx + 1).trim();
        if (staffType === 'employee') {
            return { staffType: 'employee', staffId: id, employeeId: id };
        }
        return { staffType: 'admin', staffUsername: id, staffId: id };
    }
    return { staffType: 'admin', staffUsername: raw };
}

/**
 * Strip prefixed selectors and merge typed staff fields for API payloads.
 */
export function hrmSanitizeStaffFields(payload = {}) {
    const out = { ...payload };

    ['staffUsername', 'staffId', 'employeeId'].forEach((key) => {
        if (out[key] != null && out[key] !== '') {
            out[key] = hrmStripStaffPrefix(out[key]);
        }
    });

    const selector = out.staffSelect ?? out.staffValue ?? null;
    if (selector) {
        Object.assign(out, hrmParseStaffSelect(selector));
        delete out.staffSelect;
    }

    const combined = payload.staffUsername || payload.staffId || payload.employeeId;
    if (combined && String(combined).includes(':') && !out.staffType) {
        Object.assign(out, hrmParseStaffSelect(combined));
    }

    return out;
}

/**
 * Fetch with timeout + JSON parse. Throws on HTTP error by default.
 * Options: silent, timeoutMs, throwOnHttpError (default true), parseJson (default true).
 */
export async function hrmFetchJson(url, options = {}, config = {}) {
    url = hrmNormalizeApiPath(url);
    const silent = options.silent ?? config.silent ?? false;
    const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? HRM_FETCH_TIMEOUT_MS;
    const throwOnHttpError = options.throwOnHttpError ?? config.throwOnHttpError ?? true;
    const parseJson = options.parseJson ?? config.parseJson ?? true;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const fetchOptions = stripFetchMeta(options);

    try {
        const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
        let result = {};

        if (parseJson) {
            try {
                result = await res.json();
            } catch {
                result = {};
            }
        }

        if (throwOnHttpError && !res.ok) {
            throw buildFetchError(result.message || `Server error: ${res.status}`, res.status, result);
        }

        if (throwOnHttpError && parseJson && Object.prototype.hasOwnProperty.call(result, 'success') && result.success === false) {
            throw buildFetchError(result.message || 'Request failed.', res.status, result);
        }

        return { res, result };
    } catch (err) {
        if (err.name === 'AbortError') {
            throw buildFetchError('Request timed out. Click Refresh to retry.', 408, {});
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/** Convenience wrapper — returns parsed JSON body (throws on failure). */
export async function hrmApi(url, options = {}, config = {}) {
    const { result } = await hrmFetchJson(url, options, config);
    return result;
}

/** Binary download with shared timeout (CSV, PDF, etc.). */
export async function hrmFetchBlob(url, options = {}, config = {}) {
    url = hrmNormalizeApiPath(url);
    const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? HRM_FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const fetchOptions = stripFetchMeta(options);

    try {
        const res = await fetch(url, { ...fetchOptions, signal: controller.signal });

        if (!res.ok) {
            let result = {};
            try {
                result = await res.json();
            } catch {
                result = {};
            }
            throw buildFetchError(result.message || `Server error: ${res.status}`, res.status, result);
        }

        return res.blob();
    } catch (err) {
        if (err.name === 'AbortError') {
            throw buildFetchError('Request timed out. Click Refresh to retry.', 408, {});
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

Object.assign(window, {
    HRM_FETCH_TIMEOUT_MS,
    HRM_TOAST_DEBOUNCE_MS,
    HRM_INLINE_LOAD_ERROR,
    hrmFetchJson,
    hrmApi,
    hrmFetchBlob,
    hrmNotifyError,
    hrmHandleLoadError,
    hrmTableErrorRow,
    hrmNormalizeApiPath,
    hrmStripStaffPrefix,
    hrmParseStaffSelect,
    hrmSanitizeStaffFields
});

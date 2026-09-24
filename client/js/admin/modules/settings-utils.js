/**
 * Shared fetch helper for System Settings modules — timeout + graceful errors.
 */
export const SETTINGS_FETCH_TIMEOUT_MS = 15000;

export const SETTINGS_TIMEOUT_MESSAGE =
    'Request timed out. Please check connection and retry.';

function settingsNotify(message, type = 'error') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    }
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {{ timeoutMs?: number, showToast?: boolean }} [config]
 * @returns {Promise<
 *   { success: true, res: Response, data: any } |
 *   { success: false, timeout?: boolean, error: string, res?: Response, data?: any }
 * >}
 */
export async function settingsFetchJson(url, options = {}, config = {}) {
    const timeoutMs = config.timeoutMs ?? SETTINGS_FETCH_TIMEOUT_MS;
    const showToastOnError = config.showToast !== false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        let data = {};
        try {
            data = await res.json();
        } catch {
            data = {};
        }

        if (!res.ok) {
            const isServerError = res.status >= 500;
            const isRateLimited = res.status === 429;
            const error = isServerError
                ? SETTINGS_TIMEOUT_MESSAGE
                : (data.message || `Request failed: ${res.status}`);

            console.warn('[settingsFetchJson]', url, error);

            if (showToastOnError) {
                if (isServerError) {
                    settingsNotify(SETTINGS_TIMEOUT_MESSAGE, 'error');
                } else if (!isRateLimited && res.status !== 403) {
                    settingsNotify(error, 'error');
                }
            }

            return {
                success: false,
                timeout: false,
                error,
                res,
                data
            };
        }

        return { success: true, res, data };
    } catch (err) {
        const isTimeout = err?.name === 'AbortError';
        const isNetwork = err instanceof TypeError;
        const error = (isTimeout || isNetwork)
            ? SETTINGS_TIMEOUT_MESSAGE
            : (err?.message || 'Network error');

        console.warn('[settingsFetchJson]', url, error);

        if (showToastOnError) {
            settingsNotify(
                (isTimeout || isNetwork) ? SETTINGS_TIMEOUT_MESSAGE : error,
                'error'
            );
        }

        return {
            success: false,
            timeout: isTimeout,
            error
        };
    } finally {
        clearTimeout(timer);
    }
}

/** @param {any} response */
export function isSettingsFetchFailure(response) {
    return Boolean(response && response.success === false);
}

/** Normalize failure into legacy `{ success: false, message }` JSON shapes. */
export function settingsFailurePayload(response, fallbackMessage = 'Request failed.') {
    if (!isSettingsFetchFailure(response)) {
        return { success: false, message: fallbackMessage };
    }
    return {
        success: false,
        message: response.error || fallbackMessage,
        timeout: response.timeout === true
    };
}

Object.assign(window, {
    settingsFetchJson,
    isSettingsFetchFailure,
    settingsFailurePayload,
    SETTINGS_FETCH_TIMEOUT_MS,
    SETTINGS_TIMEOUT_MESSAGE
});

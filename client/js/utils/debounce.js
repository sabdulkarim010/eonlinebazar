/**
 * Shared debounce + abortable in-flight request coordination (catalog search, filters).
 */
(function initEOBDebounce(global) {
    'use strict';

    const DEFAULT_QUERY_DEBOUNCE_MS = 280;
    const DEFAULT_FILTER_DEBOUNCE_MS = 280;

    /**
     * @param {Function} fn
     * @param {number} waitMs
     * @returns {Function & { cancel: () => void }}
     */
    function debounce(fn, waitMs) {
        let timer = null;
        const debounced = function debounced(...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                fn.apply(this, args);
            }, waitMs);
        };
        debounced.cancel = function cancel() {
            if (timer) clearTimeout(timer);
            timer = null;
        };
        return debounced;
    }

    /**
     * Debounced runner that aborts the previous in-flight signal when a new run starts.
     */
    function createAbortableDebouncer(defaultMs) {
        let timer = null;
        let activeController = null;
        let generation = 0;

        function abortInFlight() {
            if (activeController) {
                try {
                    activeController.abort();
                } catch (_) { /* ignore */ }
                activeController = null;
            }
        }

        return {
            schedule(run, delayMs) {
                const ms = Number.isFinite(delayMs) ? delayMs : defaultMs;
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    timer = null;
                    abortInFlight();
                    activeController = new AbortController();
                    const gen = generation + 1;
                    generation = gen;
                    const signal = activeController.signal;
                    Promise.resolve(run(signal)).finally(() => {
                        if (generation === gen && activeController && activeController.signal === signal) {
                            activeController = null;
                        }
                    });
                }, ms);
            },
            cancelScheduled() {
                if (timer) clearTimeout(timer);
                timer = null;
            },
            beginRequest() {
                abortInFlight();
                activeController = new AbortController();
                return activeController.signal;
            },
            abortInFlight,
            getActiveSignal() {
                return activeController ? activeController.signal : null;
            },
            wasAbortedError(err) {
                return err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
            }
        };
    }

    global.EOBDebounce = {
        DEFAULT_QUERY_DEBOUNCE_MS,
        DEFAULT_FILTER_DEBOUNCE_MS,
        debounce,
        createAbortableDebouncer
    };
})(typeof window !== 'undefined' ? window : globalThis);

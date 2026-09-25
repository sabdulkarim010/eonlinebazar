/**
 * POS shift register + offline order batch sync UI.
 */
import '../admin-core.js';

const OFFLINE_QUEUE_KEY = 'pos_offline_pending_v1';

let posActiveShift = null;

function formatPosMoney(value) {
    return `৳${Number(value || 0).toLocaleString('en-US')}`;
}

function readOfflineQueue() {
    try {
        const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeOfflineQueue(queue) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(Array.isArray(queue) ? queue : []));
    updatePosOfflineSyncUi();
}

function updatePosOfflineSyncUi() {
    const countEl = document.getElementById('posOfflinePendingCount');
    const syncBtn = document.getElementById('posOfflineSyncBtn');
    const count = readOfflineQueue().length;
    if (countEl) countEl.textContent = String(count);
    if (syncBtn) syncBtn.disabled = count === 0;
}

window.queuePosOfflineOrder = function queuePosOfflineOrder(orderPayload) {
    const queue = readOfflineQueue();
    const offlineOrderId = orderPayload.offlineOrderId
        || `OFFLINE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    queue.push({
        ...orderPayload,
        offlineOrderId,
        queuedAt: new Date().toISOString()
    });
    writeOfflineQueue(queue);
    return offlineOrderId;
};

window.getPosOfflinePendingCount = function getPosOfflinePendingCount() {
    return readOfflineQueue().length;
};

function renderPosShiftBar() {
    const bar = document.getElementById('posShiftStatusBar');
    if (!bar) return;

    if (!posActiveShift) {
        bar.innerHTML = `
            <div class="pos-shift-status pos-shift-status--closed">
                <span><i class="fa-solid fa-cash-register"></i> No active shift</span>
                <button type="button" class="btn-primary btn-sm" id="posOpenShiftBtn" onclick="openPosShiftModal()">
                    <i class="fa-solid fa-play"></i> Open Shift
                </button>
            </div>`;
        return;
    }

    const expectedCash = formatPosMoney(posActiveShift.expectedCash);
    const expectedDigital = formatPosMoney(posActiveShift.expectedDigital || posActiveShift.totalDigitalSales);
    const register = posActiveShift.registerName || 'Main Register';
    const opened = posActiveShift.openedAt
        ? new Date(posActiveShift.openedAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
        : '—';

    bar.innerHTML = `
        <div class="pos-shift-status pos-shift-status--open">
            <div class="pos-shift-status-main">
                <span class="pos-shift-pill pos-shift-pill--open"><i class="fa-solid fa-circle"></i> Shift Open</span>
                <span class="pos-shift-meta">${register} · since ${opened}</span>
                <span class="pos-shift-totals">Expected cash ${expectedCash} · Digital ${expectedDigital} · ${Number(posActiveShift.orderCount || 0)} orders</span>
            </div>
            <button type="button" class="btn-secondary btn-sm" id="posCloseShiftBtn" onclick="openPosCloseShiftModal()">
                <i class="fa-solid fa-stop"></i> Close Shift
            </button>
        </div>`;
}

async function loadPosShiftStatus() {
    try {
        const res = await fetch('/api/admin/pos/shifts/current', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 404) {
            posActiveShift = null;
        } else {
            const data = await res.json();
            posActiveShift = data.success ? data.data : null;
        }
    } catch (err) {
        console.error('POS shift load failed:', err);
        posActiveShift = null;
    }
    renderPosShiftBar();
    if (typeof window.updatePosShiftCheckoutUi === 'function') {
        window.updatePosShiftCheckoutUi();
    }
    return posActiveShift;
}

window.openPosShiftModal = function openPosShiftModal() {
    const modal = document.getElementById('posShiftOpenModal');
    if (!modal) return;
    const cashEl = document.getElementById('posShiftStartingCash');
    if (cashEl) cashEl.value = '0';
    modal.style.display = 'flex';
};

window.closePosShiftOpenModal = function closePosShiftOpenModal() {
    const modal = document.getElementById('posShiftOpenModal');
    if (modal) modal.style.display = 'none';
};

window.submitOpenPosShift = async function submitOpenPosShift(event) {
    event?.preventDefault();
    const startingCash = Number(document.getElementById('posShiftStartingCash')?.value) || 0;
    const registerName = document.getElementById('posShiftRegisterName')?.value?.trim() || 'Main Register';
    const notes = document.getElementById('posShiftOpenNotes')?.value?.trim() || '';
    const btn = document.getElementById('posShiftOpenSubmitBtn');
    const restore = setButtonLoading(btn, 'Opening…');

    try {
        const res = await fetch('/api/admin/pos/shifts/open', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ startingCash, registerName, notes })
        });
        const data = await res.json();
        if (!data.success) {
            return showToast(data.message || 'Could not open shift.', 'error');
        }
        posActiveShift = data.data;
        closePosShiftOpenModal();
        renderPosShiftBar();
        if (typeof window.updatePosShiftCheckoutUi === 'function') {
            window.updatePosShiftCheckoutUi();
        }
        showToast('POS shift opened.', 'success');
    } catch (err) {
        console.error('open shift error:', err);
        showToast('Could not open shift.', 'error');
    } finally {
        restore();
    }
};

window.openPosCloseShiftModal = function openPosCloseShiftModal() {
    if (!posActiveShift) return showToast('No active shift to close.', 'warning');
    const modal = document.getElementById('posShiftCloseModal');
    if (!modal) return;

    const expected = roundMoney(Number(posActiveShift.expectedCash) || 0);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('posCloseExpectedCash', formatPosMoney(expected));
    set('posCloseExpectedDigital', formatPosMoney(posActiveShift.expectedDigital || posActiveShift.totalDigitalSales));
    set('posCloseOrderCount', String(posActiveShift.orderCount || 0));

    const actualEl = document.getElementById('posCloseActualCash');
    if (actualEl) actualEl.value = String(expected);
    updatePosCloseDiscrepancy();

    modal.style.display = 'flex';
};

window.closePosCloseShiftModal = function closePosCloseShiftModal() {
    const modal = document.getElementById('posShiftCloseModal');
    if (modal) modal.style.display = 'none';
};

function roundMoney(n) {
    return Math.round(Number(n) * 100) / 100;
}

window.updatePosCloseDiscrepancy = function updatePosCloseDiscrepancy() {
    if (!posActiveShift) return;
    const expected = roundMoney(Number(posActiveShift.expectedCash) || 0);
    const actual = roundMoney(Number(document.getElementById('posCloseActualCash')?.value) || 0);
    const diff = roundMoney(actual - expected);
    const el = document.getElementById('posCloseDiscrepancy');
    if (!el) return;

    if (diff === 0) {
        el.textContent = 'Balanced — no discrepancy';
        el.dataset.level = 'success';
    } else if (diff > 0) {
        el.textContent = `Over by ${formatPosMoney(diff)}`;
        el.dataset.level = 'warning';
    } else {
        el.textContent = `Short by ${formatPosMoney(Math.abs(diff))}`;
        el.dataset.level = 'error';
    }
};

window.submitClosePosShift = async function submitClosePosShift(event) {
    event?.preventDefault();
    if (!posActiveShift?._id) return showToast('No active shift.', 'warning');

    const actualCash = Number(document.getElementById('posCloseActualCash')?.value);
    const notes = document.getElementById('posCloseNotes')?.value?.trim() || '';
    const btn = document.getElementById('posShiftCloseSubmitBtn');
    const restore = setButtonLoading(btn, 'Closing…');

    try {
        const res = await fetch('/api/admin/pos/shifts/close', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                shiftId: posActiveShift._id,
                actualCash,
                notes
            })
        });
        const data = await res.json();
        if (!data.success) {
            return showToast(data.message || 'Could not close shift.', 'error');
        }
        posActiveShift = null;
        closePosCloseShiftModal();
        renderPosShiftBar();
        if (typeof window.updatePosShiftCheckoutUi === 'function') {
            window.updatePosShiftCheckoutUi();
        }
        showAdminSuccess('Shift Closed', data.message || 'Shift closed successfully.');
    } catch (err) {
        console.error('close shift error:', err);
        showToast('Could not close shift.', 'error');
    } finally {
        restore();
    }
};

window.syncPosOfflineOrders = async function syncPosOfflineOrders() {
    const queue = readOfflineQueue();
    if (!queue.length) return showToast('No offline orders to sync.', 'info');

    const btn = document.getElementById('posOfflineSyncBtn');
    const restore = setButtonLoading(btn, 'Syncing…');

    try {
        const res = await fetch('/api/admin/pos/orders/batch-sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ orders: queue })
        });
        const data = await res.json();
        if (!data.success) {
            return showToast(data.message || 'Sync failed.', 'error');
        }

        const report = data.data || {};
        const synced = Number(report.syncedCount) || 0;
        const skipped = Number(report.skippedCount) || 0;
        const errors = Array.isArray(report.errors) ? report.errors : [];

        if (errors.length) {
            const failedIds = new Set(errors.map((e) => e.offlineOrderId).filter(Boolean));
            writeOfflineQueue(queue.filter((o) => failedIds.has(o.offlineOrderId)));
        } else {
            writeOfflineQueue([]);
        }

        showAdminSuccess(
            'Offline Sync Complete',
            `Synced ${synced}, skipped ${skipped}${errors.length ? `, ${errors.length} failed` : ''}.`
        );
        if (typeof fetchLiveOrders === 'function') fetchLiveOrders();
    } catch (err) {
        console.error('offline sync error:', err);
        showToast('Offline sync failed — check connection.', 'error');
    } finally {
        restore();
    }
};

window.initPosShiftUi = async function initPosShiftUi() {
    updatePosOfflineSyncUi();
    await loadPosShiftStatus();
};

window.getPosActiveShiftId = function getPosActiveShiftId() {
    return posActiveShift?._id || null;
};

window.isPosShiftOpen = function isPosShiftOpen() {
    return !!posActiveShift?._id;
};

window.getPosActiveShift = function getPosActiveShift() {
    return posActiveShift;
};

Object.assign(window, {
    loadPosShiftStatus,
    renderPosShiftBar,
    readOfflineQueue,
    updatePosOfflineSyncUi
});

/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/catalog-coupons.js
 * Description: Coupon and discount management.
 */
import '../admin-core.js';
/* ==========================================================================
   SECTION 9B2: COUPON & DISCOUNT MANAGEMENT ENGINE
   ========================================================================== */

/* shared state: globalCoupons lives on window (admin-core) */

/* shared state: couponStatusFilter lives on window (admin-core) */

/** Normalize coupon list payloads from GET /api/coupons and sync-data. */
function normalizeCouponListPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.coupons)) return payload.coupons;
    return [];
}

/** Fresh admin token + JSON headers for coupon API calls */
function getCouponAuthHeaders() {
    const adminToken = localStorage.getItem('adminToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken || ''}`
    };
}

function setupCouponForm() {
    const form = document.getElementById('couponForm');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCoupon();
    });
    setupCouponTimeValidation();
    setupCouponStatusTabs();
}

function setupCouponStatusTabs() {
    const tabs = document.querySelectorAll('#couponStatusTabs .coupon-status-tab');
    if (!tabs.length || document.getElementById('couponStatusTabs')?.dataset.bound === '1') return;
    document.getElementById('couponStatusTabs').dataset.bound = '1';

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            couponStatusFilter = tab.getAttribute('data-coupon-filter') || 'all';
            tabs.forEach((t) => {
                const isActive = t === tab;
                t.classList.toggle('active', isActive);
                t.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
            renderCouponTable();
        });
    });
}

const COUPON_TIME_DEFAULT = '11:59';
const COUPON_AMPM_DEFAULT = 'PM';

function getCouponAmPmValue() {
    const select = document.getElementById('couponExpiryAmPm');
    const value = (select?.value || COUPON_AMPM_DEFAULT).toUpperCase();
    return value === 'AM' ? 'AM' : 'PM';
}

/** Convert 12-hour hh:mm + AM/PM to 24-hour HH:MM for server timestamp building. */
function convert12hTimeTo24h(time12, ampm) {
    const cleaned = normalizeCouponTimeDigits(time12).trim();
    const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const period = String(ampm || COUPON_AMPM_DEFAULT).toUpperCase();

    if (!Number.isFinite(hour) || hour < 1 || hour > 12) return null;
    if (!Number.isFinite(minute) || minute > 59) return null;

    if (period === 'AM') {
        if (hour === 12) hour = 0;
    } else if (hour !== 12) {
        hour += 12;
    }

    return formatCouponTimeParts(hour, minute);
}

function setCouponTimeHint(message, { valid = false } = {}) {
    const hint = document.getElementById('couponExpiryTimeHint');
    const input = document.getElementById('couponExpiryTime');
    if (!hint) return;
    hint.textContent = message || '';
    hint.classList.toggle('is-valid', Boolean(valid && message));
    if (input) {
        input.classList.toggle('is-invalid', Boolean(message && !valid));
    }
}

function normalizeCouponTimeDigits(raw) {
    return String(raw || '').replace(/[^\d:]/g, '');
}

function formatCouponTimeParts(hour, minute) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function validateCouponExpiryTime(raw, { showErrors = true, inlineOnly = false } = {}) {
    const cleaned = normalizeCouponTimeDigits(raw).trim();
    const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        const msg = 'Use 12-hour format hh:mm with AM/PM (minutes 00–59).';
        if (showErrors && !inlineOnly) showToast(msg, 'warning');
        if (showErrors) setCouponTimeHint(msg);
        return { ok: false, value: null };
    }

    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);

    if (!Number.isFinite(hour) || hour < 1 || hour > 12) {
        const msg = 'Hour must be between 01 and 12.';
        if (showErrors && !inlineOnly) showToast(msg, 'warning');
        if (showErrors) setCouponTimeHint(msg);
        return { ok: false, value: null };
    }
    if (!Number.isFinite(minute) || minute > 59) {
        const msg = 'Minutes cannot exceed 59.';
        if (showErrors && !inlineOnly) showToast(msg, 'warning');
        if (showErrors) setCouponTimeHint(msg);
        return { ok: false, value: null };
    }

    if (showErrors) setCouponTimeHint('');
    return { ok: true, value: formatCouponTimeParts(hour, minute) };
}

function handleCouponExpiryTimeInput(event) {
    const input = event.target;
    let val = normalizeCouponTimeDigits(input.value);
    let blockedMessage = '';

    const digitsOnly = val.replace(':', '');
    if (!val.includes(':') && digitsOnly.length >= 3) {
        val = `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2)}`;
    }

    const colonIdx = val.indexOf(':');
    if (colonIdx !== -1) {
        let hourPart = val.slice(0, colonIdx);
        let minutePart = val.slice(colonIdx + 1);

        if (hourPart.length > 2) hourPart = hourPart.slice(0, 2);
        if (minutePart.length > 2) minutePart = minutePart.slice(0, 2);

        if (hourPart.length === 2) {
            const hourNum = parseInt(hourPart, 10);
            if (Number.isFinite(hourNum) && (hourNum < 1 || hourNum > 12)) {
                blockedMessage = 'Hour must be between 01 and 12.';
                hourPart = hourNum > 12 ? '12' : '01';
            }
        }

        if (minutePart.length >= 2) {
            const minuteNum = parseInt(minutePart.slice(0, 2), 10);
            if (Number.isFinite(minuteNum) && minuteNum > 59) {
                blockedMessage = 'Minutes cannot exceed 59.';
                minutePart = '59';
            }
        }

        val = minutePart.length ? `${hourPart}:${minutePart}` : `${hourPart}:`;
    } else if (val.length >= 2) {
        const hourNum = parseInt(val.slice(0, 2), 10);
        if (Number.isFinite(hourNum) && (hourNum < 1 || hourNum > 12)) {
            blockedMessage = 'Hour must be between 01 and 12.';
            val = hourNum > 12 ? '12' : '01';
        }
    }

    input.value = val;

    if (blockedMessage) {
        setCouponTimeHint(blockedMessage);
        input.classList.add('is-invalid');
        return;
    }

    if (/^\d{2}:\d{2}$/.test(val)) {
        validateCouponExpiryTime(val, { showErrors: true, inlineOnly: true });
    } else {
        setCouponTimeHint('');
        input.classList.remove('is-invalid');
    }
}

function finalizeCouponExpiryTimeInput(input) {
    if (!input) return COUPON_TIME_DEFAULT;
    const result = validateCouponExpiryTime(input.value, { showErrors: true, inlineOnly: true });
    if (result.ok) {
        input.value = result.value;
        input.dataset.lastValid = result.value;
        input.classList.remove('is-invalid');
        setCouponTimeHint('');
        return result.value;
    }
    const fallback = input.dataset.lastValid || COUPON_TIME_DEFAULT;
    input.value = fallback;
    input.classList.remove('is-invalid');
    setCouponTimeHint('');
    return fallback;
}

function setupCouponTimeValidation() {
    const input = document.getElementById('couponExpiryTime');
    if (!input || input.dataset.timeBound === '1') return;
    input.dataset.timeBound = '1';
    input.dataset.lastValid = input.value || COUPON_TIME_DEFAULT;

    input.addEventListener('input', handleCouponExpiryTimeInput);
    input.addEventListener('change', () => finalizeCouponExpiryTimeInput(input));
    input.addEventListener('blur', () => finalizeCouponExpiryTimeInput(input));
}

async function runAdminDataSync() {
    const response = await fetch('/api/admin/sync-data', {
        method: 'POST',
        headers: getCouponAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to synchronize coupon data.');
    }
    if (Array.isArray(data.data?.coupons)) {
        globalCoupons = data.data.coupons;
    } else {
        globalCoupons = normalizeCouponListPayload(data.data);
    }
    renderCouponTable();
    return data;
}

async function fetchCoupons() {
    try {
        const response = await fetch('/api/coupons', {
            headers: getCouponAuthHeaders()
        });
        const data = await response.json();
        if (data.success) {
            globalCoupons = normalizeCouponListPayload(data.data);
            renderCouponTable();
        } else {
            showToast(data.message || 'Failed to load coupons', 'error');
        }
    } catch (error) {
        console.error('Coupon load error:', error);
        showToast('Failed to load coupons', 'error');
    }
}

function formatCouponDateTime(dateVal) {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return '—';

    const tz = adminPlatformTimezone || 'Asia/Dhaka';
    const parts = new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: tz
    }).formatToParts(d);

    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }

    const day = map.day || '';
    const month = map.month || '';
    const year = map.year || '';
    const hour = map.hour || '';
    const minute = map.minute || '';
    const period = (map.dayPeriod || '').toUpperCase();

    return `${day} ${month} ${year}, ${hour}:${minute} ${period}`;
}

function isCouponExpired(dateVal) {
    if (!dateVal) return false;
    return Date.now() > new Date(dateVal).getTime();
}

function resolveCouponDisplayStatus(coupon) {
    if (coupon.displayStatus === 'ACTIVE' || coupon.displayStatus === 'EXPIRED' || coupon.displayStatus === 'EXHAUSTED') {
        return coupon.displayStatus;
    }

    const used = Number(coupon.usedCount) || 0;
    const limit = Number(coupon.usageLimit) || 0;
    if (limit > 0 && used >= limit) {
        return 'EXHAUSTED';
    }

    const status = String(coupon.status || '').toUpperCase();
    if (status === 'EXPIRED' || status === 'DISABLED' || isCouponExpired(coupon.expiryDate)) {
        return 'EXPIRED';
    }

    return 'ACTIVE';
}

function filterCouponsByStatus(coupons, filter = couponStatusFilter) {
    const list = Array.isArray(coupons) ? coupons : [];
    if (filter === 'active') {
        return list.filter((coupon) => resolveCouponDisplayStatus(coupon) === 'ACTIVE');
    }
    if (filter === 'expired') {
        return list.filter((coupon) => resolveCouponDisplayStatus(coupon) === 'EXPIRED');
    }
    return list;
}

function renderCouponStatusBadge(status) {
    if (status === 'ACTIVE') {
        return '<span class="coupon-status-pill coupon-status-pill--active">🟢 Active</span>';
    }
    if (status === 'EXHAUSTED') {
        return '<span class="coupon-status-pill coupon-status-pill--exhausted">⚪ Exhausted / Usage Limit Met</span>';
    }
    return '<span class="coupon-status-pill coupon-status-pill--expired">🔴 Expired</span>';
}

function getPlatformTimeZoneOffsetMs(timeZone, date) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = dtf.formatToParts(date);
    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }
    const asUtc = Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day),
        Number(map.hour),
        Number(map.minute),
        Number(map.second)
    );
    return asUtc - date.getTime();
}

/** Interpret date/time inputs in the admin platform timezone (same zone as the header clock). */
function platformLocalToUtc(dateStr, timeStr, timeZone) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const timeParts = String(timeStr || '00:00').split(':').map(Number);
    const hour = timeParts[0] ?? 0;
    const minute = timeParts[1] ?? 0;
    const second = timeParts[2] ?? 0;

    let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    let offsetMs = getPlatformTimeZoneOffsetMs(timeZone, new Date(utcMs));
    utcMs -= offsetMs;

    const offsetMs2 = getPlatformTimeZoneOffsetMs(timeZone, new Date(utcMs));
    if (offsetMs2 !== offsetMs) {
        utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs2;
    }

    return new Date(utcMs);
}

function buildCouponExpiryIso() {
    const dateVal = document.getElementById('couponExpiry')?.value?.trim();
    const timeInput = document.getElementById('couponExpiryTime');
    const timeVal = finalizeCouponExpiryTimeInput(timeInput);
    const timeCheck = validateCouponExpiryTime(timeVal, { showErrors: false });
    if (!dateVal || !timeCheck.ok) return null;

    const ampm = getCouponAmPmValue();
    const time24 = convert12hTimeTo24h(timeCheck.value, ampm);
    if (!time24) return null;

    const tz = adminPlatformTimezone || 'Asia/Dhaka';
    const combined = platformLocalToUtc(dateVal, time24, tz);
    if (Number.isNaN(combined.getTime())) return null;
    return combined.toISOString();
}

function renderCouponTable() {
    const tbody = document.getElementById('couponTableBody');
    if (!tbody) return;

    const visibleCoupons = filterCouponsByStatus(globalCoupons);

    if (!visibleCoupons.length) {
        const emptyMsg = globalCoupons.length
            ? 'No coupons match this filter.'
            : 'No coupons yet. Create one using the form above.';
        tbody.innerHTML = `<tr><td colspan="8" class="cell-empty">${emptyMsg}</td></tr>`;
        return;
    }

    const cur = typeof adminCurrencySymbol !== 'undefined' ? adminCurrencySymbol : '৳';

    tbody.innerHTML = visibleCoupons.map(coupon => {
        const used = Number(coupon.usedCount) || 0;
        const limit = Number(coupon.usageLimit) || 0;
        const displayStatus = resolveCouponDisplayStatus(coupon);
        const discountLabel = coupon.discountType === 'percentage'
            ? `${coupon.discountValue}%`
            : `${cur}${coupon.discountValue}`;
        const statusHtml = renderCouponStatusBadge(displayStatus);

        return `<tr>
            <td class="cell-name"><code class="coupon-code-chip">${escHtml(coupon.code)}</code></td>
            <td>${escHtml(discountLabel)}${coupon.discountType === 'percentage' && coupon.maxDiscountAmount ? ` <small class="coupon-cap">(max ${cur}${coupon.maxDiscountAmount})</small>` : ''}</td>
            <td>${cur}${Number(coupon.minOrderAmount) || 0}</td>
            <td><strong>${used}</strong> / ${limit} Used</td>
            <td class="cell-date">${formatCouponDateTime(coupon.createdAt)}</td>
            <td class="cell-date">${formatCouponDateTime(coupon.expiryDate)}</td>
            <td>${statusHtml}</td>
            <td>
                <div class="catalog-actions">
                    <button type="button" class="catalog-action-btn edit" title="Edit" onclick="editCoupon('${coupon._id}')"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="catalog-action-btn delete" title="Delete" onclick="deleteCoupon('${coupon._id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

window.resetCouponForm = function() {
    const form = document.getElementById('couponForm');
    if (form) form.reset();
    const editId = document.getElementById('couponEditId');
    if (editId) editId.value = '';
    const expiryTime = document.getElementById('couponExpiryTime');
    if (expiryTime) {
        expiryTime.value = COUPON_TIME_DEFAULT;
        expiryTime.dataset.lastValid = COUPON_TIME_DEFAULT;
    }
    const ampmSelect = document.getElementById('couponExpiryAmPm');
    if (ampmSelect) ampmSelect.value = COUPON_AMPM_DEFAULT;
    setCouponTimeHint('');
    const btnText = document.getElementById('couponSaveBtnText');
    if (btnText) btnText.textContent = 'Create Coupon';
    const cancelBtn = document.getElementById('couponCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    const perUser = document.getElementById('couponPerUserLimit');
    if (perUser && !perUser.value) perUser.value = '1';
};

function toDateInputValue(dateVal) {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return '';
    const tz = adminPlatformTimezone || 'Asia/Dhaka';
    return d.toLocaleDateString('en-CA', { timeZone: tz });
}

function to12HourTimeParts(dateVal) {
    if (!dateVal) {
        return { time: COUPON_TIME_DEFAULT, ampm: COUPON_AMPM_DEFAULT };
    }
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) {
        return { time: COUPON_TIME_DEFAULT, ampm: COUPON_AMPM_DEFAULT };
    }
    const tz = adminPlatformTimezone || 'Asia/Dhaka';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).formatToParts(d);
    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }
    return {
        time: `${map.hour}:${map.minute}`,
        ampm: (map.dayPeriod || COUPON_AMPM_DEFAULT).toUpperCase()
    };
}

function toTimeInputValue(dateVal) {
    return to12HourTimeParts(dateVal).time;
}

window.editCoupon = function(id) {
    const coupon = globalCoupons.find(c => String(c._id) === String(id));
    if (!coupon) return showToast('Coupon not found', 'error');

    document.getElementById('couponEditId').value = coupon._id;
    document.getElementById('couponCode').value = coupon.code || '';
    document.getElementById('couponDiscountType').value = coupon.discountType || 'percentage';
    document.getElementById('couponDiscountValue').value = coupon.discountValue ?? '';
    document.getElementById('couponMinOrder').value = coupon.minOrderAmount ?? 0;
    document.getElementById('couponMaxDiscount').value = coupon.maxDiscountAmount ?? '';
    document.getElementById('couponExpiry').value = toDateInputValue(coupon.expiryDate);
    const timeParts = to12HourTimeParts(coupon.expiryDate);
    const expiryTimeEl = document.getElementById('couponExpiryTime');
    if (expiryTimeEl) {
        expiryTimeEl.value = timeParts.time;
        expiryTimeEl.dataset.lastValid = expiryTimeEl.value || COUPON_TIME_DEFAULT;
    }
    const ampmEl = document.getElementById('couponExpiryAmPm');
    if (ampmEl) ampmEl.value = timeParts.ampm === 'AM' ? 'AM' : 'PM';
    document.getElementById('couponUsageLimit').value = coupon.usageLimit ?? '';
    document.getElementById('couponPerUserLimit').value = coupon.perUserLimit ?? 1;
    document.getElementById('couponSaveBtnText').textContent = 'Update Coupon';
    document.getElementById('couponCancelBtn').style.display = 'inline-flex';

    document.getElementById('manage-coupons')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

async function saveCoupon() {
    const editId = document.getElementById('couponEditId')?.value?.trim();
    const timeInput = document.getElementById('couponExpiryTime');
    const timeCheck = validateCouponExpiryTime(finalizeCouponExpiryTimeInput(timeInput));
    if (!timeCheck.ok) {
        showToast('Error: Please enter a valid expiry time (hh:mm with AM/PM, minutes 00–59).', 'warning');
        return;
    }
    const ampm = getCouponAmPmValue();
    if (!convert12hTimeTo24h(timeCheck.value, ampm)) {
        showToast('Error: Could not parse expiry time. Check hh:mm and AM/PM.', 'warning');
        return;
    }
    const expiryIso = buildCouponExpiryIso();
    const payload = {
        code: document.getElementById('couponCode')?.value?.trim(),
        discountType: document.getElementById('couponDiscountType')?.value,
        discountValue: Number(document.getElementById('couponDiscountValue')?.value),
        minOrderAmount: Number(document.getElementById('couponMinOrder')?.value) || 0,
        maxDiscountAmount: document.getElementById('couponMaxDiscount')?.value === ''
            ? null
            : Number(document.getElementById('couponMaxDiscount')?.value),
        expiryDate: expiryIso,
        usageLimit: Number(document.getElementById('couponUsageLimit')?.value),
        perUserLimit: Number(document.getElementById('couponPerUserLimit')?.value) || 1
    };

    if (!localStorage.getItem('adminToken')) {
        showToast('Error: Admin session expired. Please log in again.', 'error');
        window.location.replace('/admin-login');
        return;
    }

    if (!payload.code) {
        showToast('Error: Please enter a coupon code!', 'warning');
        return;
    }
    if (!expiryIso) {
        showToast('Error: Please select a valid expiry date and time!', 'warning');
        return;
    }
    if (!Number.isFinite(payload.discountValue) || payload.discountValue <= 0) {
        showToast('Error: Please enter a valid discount value!', 'warning');
        return;
    }
    if (!Number.isFinite(payload.usageLimit) || payload.usageLimit < 1) {
        showToast('Error: Global usage limit must be at least 1!', 'warning');
        return;
    }
    if (!Number.isFinite(payload.perUserLimit) || payload.perUserLimit < 1) {
        showToast('Error: Per-user limit must be at least 1!', 'warning');
        return;
    }

    const saveBtn = document.getElementById('couponSaveBtn');
    const restore = setButtonLoading(saveBtn, editId ? 'Updating...' : 'Creating...');

    try {
        const res = await fetch(editId ? `/api/coupons/${editId}` : '/api/coupons', {
            method: editId ? 'PUT' : 'POST',
            headers: getCouponAuthHeaders(),
            body: JSON.stringify(payload)
        });

        let result;
        try {
            result = await res.json();
        } catch (_) {
            throw new Error('Unexpected server response. Please try again.');
        }

            if (result.success) {
                const successMsg = editId
                    ? (result.message || 'Coupon updated successfully!')
                    : 'Coupon created successfully!';
                showToast(`Success: ${successMsg}`, 'success');
                window.resetCouponForm();
                await fetchCoupons();
            } else if (res.status === 429) {
                showToast('Too many requests — please wait and try again.', 'warning');
            } else {
                const errMsg = result.message || 'Failed to save coupon';
                showToast('Error: ' + errMsg, 'error');
                if (res.status === 401 && result.redirect) {
                    localStorage.removeItem('adminToken');
                    window.location.replace(result.redirect);
                }
            }
    } catch (error) {
        const errMsg = error.message || 'Server error while saving coupon!';
        showToast('Error: ' + errMsg, 'error');
        console.error('Coupon save error:', error);
    } finally {
        restore();
    }
}
window.saveCoupon = saveCoupon;

window.deleteCoupon = function(id) {
    showCustomConfirm('Delete Coupon', 'Are you sure you want to permanently delete this coupon?', async () => {
        try {
            const res = await fetch(`/api/coupons/${id}`, {
                method: 'DELETE',
                headers: getCouponAuthHeaders()
            });
            const result = await res.json();
            if (result.success) {
                globalCoupons = globalCoupons.filter(c => String(c._id) !== String(id));
                renderCouponTable();
                showAdminSuccess('Coupon Deleted', result.message || 'Coupon deleted successfully!');
            } else {
                showToast(result.message || 'Failed to delete coupon', 'error');
            }
        } catch (error) {
            showToast('Failed to delete coupon', 'error');
        }
    }, 'danger');
};

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    normalizeCouponListPayload,
    getCouponAuthHeaders,
    setupCouponForm,
    setupCouponStatusTabs,
    getCouponAmPmValue,
    convert12hTimeTo24h,
    setCouponTimeHint,
    normalizeCouponTimeDigits,
    formatCouponTimeParts,
    validateCouponExpiryTime,
    handleCouponExpiryTimeInput,
    finalizeCouponExpiryTimeInput,
    setupCouponTimeValidation,
    runAdminDataSync,
    fetchCoupons,
    formatCouponDateTime,
    isCouponExpired,
    resolveCouponDisplayStatus,
    filterCouponsByStatus,
    renderCouponStatusBadge,
    getPlatformTimeZoneOffsetMs,
    platformLocalToUtc,
    buildCouponExpiryIso,
    renderCouponTable,
    toDateInputValue,
    to12HourTimeParts,
    toTimeInputValue,
    saveCoupon
});

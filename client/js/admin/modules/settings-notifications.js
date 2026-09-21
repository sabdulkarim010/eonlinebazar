/**
 * Admin — Email (Resend/Brevo) + WhatsApp (Baileys) notification settings.
 */
import '../admin-core.js';

const API = {
    config: '/api/admin/settings/notification-config',
    testEmail: '/api/admin/settings/test-email',
    waStatus: '/api/admin/settings/whatsapp-status',
    waEnable: '/api/admin/settings/whatsapp-enable',
    waDisconnect: '/api/admin/settings/whatsapp-disconnect',
    testWa: '/api/admin/settings/test-whatsapp'
};

let waPollTimer = null;

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${window.token || localStorage.getItem('adminToken') || ''}`
    };
}

function setTestResult(el, success, message) {
    if (!el) return;
    el.hidden = false;
    el.classList.remove('is-success', 'is-error');
    el.classList.add(success ? 'is-success' : 'is-error');
    el.textContent = success ? `✅ ${message}` : `❌ Failed: ${message}`;
}

function readEmailProvider() {
    const checked = document.querySelector('input[name="notifEmailProvider"]:checked');
    return checked?.value || 'resend';
}

function renderWhatsAppStatus(data = {}) {
    const pill = document.getElementById('notifWaStatusPill');
    const qrWrap = document.getElementById('notifWaQrWrap');
    const connectedPanel = document.getElementById('notifWaConnectedPanel');
    const qrImg = document.getElementById('notifWaQrImg');
    const phoneEl = document.getElementById('notifWaPhoneHint');
    const toggle = document.getElementById('notifWaEnabledToggle');

    const status = data.status || 'disconnected';
    const enabled = data.enabled === true || document.getElementById('notifWaEnabledToggle')?.checked;

    if (pill) {
        pill.dataset.status = status;
        const labels = {
            connected: '● Connected',
            qr_pending: '○ Waiting for QR',
            disconnected: enabled ? '○ Disconnected' : '○ Off'
        };
        pill.textContent = labels[status] || labels.disconnected;
    }

    const showQr = enabled && (status === 'qr_pending' || status === 'disconnected') && data.qrDataURL;
    if (qrWrap) qrWrap.hidden = !showQr;
    if (qrImg && data.qrDataURL) qrImg.src = data.qrDataURL;

    const showConnected = enabled && status === 'connected';
    if (connectedPanel) connectedPanel.hidden = !showConnected;
    if (phoneEl) phoneEl.textContent = data.phoneHint ? `Phone: ${data.phoneHint}` : '';

    if (toggle && data.enabled !== undefined) toggle.checked = data.enabled === true;
}

async function fetchWhatsAppStatus() {
    try {
        const res = await fetch(API.waStatus, { headers: authHeaders() });
        const json = await res.json();
        if (json.success && json.data) {
            renderWhatsAppStatus({
                ...json.data,
                enabled: document.getElementById('notifWaEnabledToggle')?.checked
            });
            return json.data;
        }
    } catch (err) {
        console.warn('[Notifications] WhatsApp status poll failed:', err.message);
    }
    return null;
}

function startWhatsAppPolling() {
    if (waPollTimer) clearInterval(waPollTimer);
    waPollTimer = setInterval(async () => {
        const data = await fetchWhatsAppStatus();
        if (data?.status === 'connected' && waPollTimer) {
            clearInterval(waPollTimer);
            waPollTimer = null;
        }
    }, 30000);
}

async function loadNotificationSettings() {
    try {
        const res = await fetch(API.config, { headers: authHeaders() });
        const json = await res.json();
        if (!json.success || !json.data) return;

        const d = json.data;
        document.querySelectorAll('input[name="notifEmailProvider"]').forEach((input) => {
            input.checked = input.value === (d.emailProvider || 'resend');
        });

        const resendFrom = document.getElementById('notifResendFrom');
        const brevoFrom = document.getElementById('notifBrevoFrom');
        const resendKey = document.getElementById('notifResendKey');
        const brevoKey = document.getElementById('notifBrevoKey');
        const waToggle = document.getElementById('notifWaEnabledToggle');

        if (resendFrom) resendFrom.value = d.resendFrom || '';
        if (brevoFrom) brevoFrom.value = d.brevoFrom || '';
        if (resendKey && d.resendKeyMasked) resendKey.value = d.resendKeyMasked;
        if (brevoKey && d.brevoKeyMasked) brevoKey.value = d.brevoKeyMasked;
        if (waToggle) waToggle.checked = d.whatsapp?.enabled === true;

        renderWhatsAppStatus(d.whatsapp || {});
        if (d.whatsapp?.status === 'qr_pending') startWhatsAppPolling();
    } catch (err) {
        console.error('[Notifications] Load failed:', err.message);
    }
}

async function saveNotificationSettings() {
    const payload = {
        emailProvider: readEmailProvider(),
        resendFrom: document.getElementById('notifResendFrom')?.value?.trim() || '',
        brevoFrom: document.getElementById('notifBrevoFrom')?.value?.trim() || '',
        resendKey: document.getElementById('notifResendKey')?.value?.trim() || '',
        brevoKey: document.getElementById('notifBrevoKey')?.value?.trim() || '',
        waEnabled: document.getElementById('notifWaEnabledToggle')?.checked === true
    };

    const res = await fetch(API.config, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
    });
    return res.json();
}

function bindNotificationSettingsUi() {
    const emailForm = document.getElementById('notifEmailForm');
    const testEmailBtn = document.getElementById('notifTestEmailBtn');
    const testWaBtn = document.getElementById('notifTestWaBtn');
    const refreshQrBtn = document.getElementById('notifRefreshQrBtn');
    const disconnectBtn = document.getElementById('notifWaDisconnectBtn');
    const waToggle = document.getElementById('notifWaEnabledToggle');
    const emailResult = document.getElementById('notifEmailTestResult');
    const waResult = document.getElementById('notifWaTestResult');

    emailForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = emailForm.querySelector('.saas-settings-save-btn');
        const restore = window.setButtonLoading?.(btn, 'Saving...') || (() => {});
        try {
            const json = await saveNotificationSettings();
            if (json.success) {
                window.showToast?.('Email settings saved.', 'success');
                await loadNotificationSettings();
            } else {
                window.showToast?.(json.message || 'Save failed', 'error');
            }
        } finally {
            restore();
        }
    });

    testEmailBtn?.addEventListener('click', async () => {
        testEmailBtn.disabled = true;
        try {
            const json = await saveNotificationSettings();
            if (!json.success) {
                setTestResult(emailResult, false, json.message || 'Could not save settings first');
                return;
            }
            const res = await fetch(API.testEmail, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({})
            });
            const result = await res.json();
            setTestResult(
                emailResult,
                result.success,
                result.message || (result.success ? `Email sent via ${result.provider || 'provider'}` : 'Send failed')
            );
        } catch (err) {
            setTestResult(emailResult, false, err.message);
        } finally {
            testEmailBtn.disabled = false;
        }
    });

    waToggle?.addEventListener('change', async () => {
        const enabled = waToggle.checked;
        const endpoint = enabled ? API.waEnable : API.waDisconnect;
        try {
            const res = await fetch(endpoint, { method: 'POST', headers: authHeaders() });
            const json = await res.json();
            if (json.success) {
                window.showToast?.(json.message || (enabled ? 'WhatsApp enabled' : 'WhatsApp disabled'), 'success');
                renderWhatsAppStatus({ ...json.data, enabled });
                if (enabled) {
                    await fetchWhatsAppStatus();
                    startWhatsAppPolling();
                } else if (waPollTimer) {
                    clearInterval(waPollTimer);
                    waPollTimer = null;
                }
            } else {
                waToggle.checked = !enabled;
                window.showToast?.(json.message || 'WhatsApp toggle failed', 'error');
            }
        } catch (err) {
            waToggle.checked = !enabled;
            window.showToast?.(err.message, 'error');
        }
    });

    refreshQrBtn?.addEventListener('click', async () => {
        await fetchWhatsAppStatus();
        startWhatsAppPolling();
    });

    disconnectBtn?.addEventListener('click', async () => {
        const res = await fetch(API.waDisconnect, { method: 'POST', headers: authHeaders() });
        const json = await res.json();
        if (json.success) {
            if (waToggle) waToggle.checked = false;
            renderWhatsAppStatus({ status: 'disconnected', enabled: false });
            window.showToast?.('WhatsApp disconnected', 'success');
        }
    });

    testWaBtn?.addEventListener('click', async () => {
        testWaBtn.disabled = true;
        try {
            const res = await fetch(API.testWa, { method: 'POST', headers: authHeaders() });
            const result = await res.json();
            setTestResult(waResult, result.success, result.message || 'Send failed');
        } catch (err) {
            setTestResult(waResult, false, err.message);
        } finally {
            testWaBtn.disabled = false;
        }
    });

    document.querySelector('.admin-settings-tab[data-tab="notifications"]')?.addEventListener('click', () => {
        loadNotificationSettings();
        fetchWhatsAppStatus();
    });
}

window.initNotificationSettings = function initNotificationSettings() {
    bindNotificationSettingsUi();
    loadNotificationSettings();
};

bindNotificationSettingsUi();

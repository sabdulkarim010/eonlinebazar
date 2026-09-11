/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-loyalty.js
 * Description: Loyalty tier settings — load, preview, and save.
 */
import '../admin-core.js';

function formatTierMoney(value) {
    const n = Number(value) || 0;
    return `৳${n.toLocaleString('en-US')}`;
}

function updateTierPreview() {
    const body = document.getElementById('tierPreviewBody');
    if (!body) return;

    const rows = [
        {
            label: 'Silver',
            cls: 'tier-badge--silver',
            threshold: document.getElementById('silverThreshold')?.value,
            cashback: document.getElementById('silverCashback')?.value
        },
        {
            label: 'Gold',
            cls: 'tier-badge--gold',
            threshold: document.getElementById('goldThreshold')?.value,
            cashback: document.getElementById('goldCashback')?.value
        },
        {
            label: 'Platinum',
            cls: 'tier-badge--platinum',
            threshold: document.getElementById('platinumThreshold')?.value,
            cashback: document.getElementById('platinumCashback')?.value
        }
    ];

    body.innerHTML = rows.map((row) => `
        <tr>
            <td><span class="tier-badge ${row.cls}">${escapeHtml(row.label)}</span></td>
            <td>${formatTierMoney(row.threshold)}</td>
            <td>${Number(row.cashback || 0).toFixed(1)}%</td>
        </tr>
    `).join('');
}

function applyTierSettingsToUI(settings = {}) {
    const toggle = document.getElementById('enableTieredLoyalty');
    if (toggle) toggle.checked = settings.enableTieredLoyalty === true;

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
    };

    setVal('silverThreshold', settings.silverThreshold);
    setVal('goldThreshold', settings.goldThreshold);
    setVal('platinumThreshold', settings.platinumThreshold);
    setVal('silverCashback', settings.silverCashback);
    setVal('goldCashback', settings.goldCashback);
    setVal('platinumCashback', settings.platinumCashback);
    updateTierPreview();
}

async function loadTierSettings() {
    if (typeof fetchMasterSettings === 'function') {
        await fetchMasterSettings();
        return;
    }

    try {
        const res = await fetch('/api/admin/master-settings', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.data) {
            applyTierSettingsToUI(data.data);
        }
    } catch (err) {
        console.error('loadTierSettings error:', err);
    }
}

async function saveTierSettings(payload) {
    const res = await fetch('/api/admin/master-settings/update', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    return res.json();
}

function setupTierSettingsForm() {
    const form = document.getElementById('form-system-tiers');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';

    ['silverThreshold', 'goldThreshold', 'platinumThreshold', 'silverCashback', 'goldCashback', 'platinumCashback']
        .forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateTierPreview);
        });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('.system-settings-save-btn');
        const restore = setButtonLoading(submitBtn, 'Saving...');

        try {
            const payload = {
                enableTieredLoyalty: document.getElementById('enableTieredLoyalty')?.checked === true,
                silverThreshold: document.getElementById('silverThreshold')?.value,
                goldThreshold: document.getElementById('goldThreshold')?.value,
                platinumThreshold: document.getElementById('platinumThreshold')?.value,
                silverCashback: document.getElementById('silverCashback')?.value,
                goldCashback: document.getElementById('goldCashback')?.value,
                platinumCashback: document.getElementById('platinumCashback')?.value
            };

            const result = await saveTierSettings(payload);
            if (result.success) {
                showToast('Tier settings updated successfully!', 'success');
                if (result.data) {
                    applyTierSettingsToUI(result.data);
                    if (typeof applyMasterSettingsToUI === 'function') {
                        applyMasterSettingsToUI(result.data);
                    }
                }
            } else {
                showToast(`Error: ${result.message || 'Failed to save tier settings.'}`, 'error');
            }
        } catch (err) {
            console.error('saveTierSettings error:', err);
            showToast('Error: Could not reach the server. Please try again.', 'error');
        } finally {
            restore();
        }
    });
}

setupTierSettingsForm();

Object.assign(window, {
    loadTierSettings,
    saveTierSettings,
    applyTierSettingsToUI,
    updateTierPreview
});

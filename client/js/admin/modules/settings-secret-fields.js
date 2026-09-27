/**
 * Mask/unmask toggles for integration secret fields in System Settings.
 */
import '../admin-core.js';

const SECRET_INPUT_SELECTORS = [
    '#smsApiKey',
    '#courierApiKey',
    '#courierSecretKey',
    '#whatsAppAlertApiKey',
    '#notifResendKey',
    '#notifBrevoKey',
    '#pmApiKey'
];

const USER_AUTH_FIELD_IDS = new Set([
    'platformCurrentPassword',
    'settingsCurrentPassword',
    'settingsNewPassword',
    'real-reset-key'
]);

function isMaskedSecretPlaceholder(value) {
    const v = String(value || '').trim();
    if (!v) return false;
    if (v.includes('••••') || v.includes('****')) return true;
    if (/^enc:/i.test(v)) return true;
    return false;
}

function ensureMaskHint(wrap) {
    let hint = wrap.querySelector('.settings-secret-mask-hint');
    if (hint) return hint;
    hint = document.createElement('p');
    hint.className = 'settings-secret-mask-hint';
    hint.setAttribute('role', 'status');
    hint.hidden = true;
    hint.textContent = 'This value is a masked placeholder from the server. Encrypted secrets cannot be shown — enter a new key to replace it.';
    wrap.appendChild(hint);
    return hint;
}

function wrapSecretInput(input) {
    if (!input || input.closest('.settings-secret-field-wrap')) return;
    if (USER_AUTH_FIELD_IDS.has(input.id)) return;
    if (input.dataset.settingsSecret === 'skip') return;

    const wrap = document.createElement('div');
    wrap.className = 'settings-secret-field-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    input.classList.add('settings-secret-input');
    if (input.type === 'text') {
        input.type = 'password';
        input.dataset.settingsSecretWasText = 'true';
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-secret-toggle';
    btn.setAttribute('aria-label', 'Show secret value');
    btn.setAttribute('title', 'Show / hide');
    btn.innerHTML = '<i class="fa-solid fa-eye" aria-hidden="true"></i>';

    let revealed = false;

    btn.addEventListener('click', () => {
        const masked = isMaskedSecretPlaceholder(input.value);
        const hint = ensureMaskHint(wrap);

        if (masked) {
            hint.hidden = false;
            input.type = 'password';
            revealed = false;
            btn.innerHTML = '<i class="fa-solid fa-eye" aria-hidden="true"></i>';
            btn.setAttribute('aria-label', 'Show secret value');
            if (typeof window.showToast === 'function') {
                window.showToast('Masked key — type a new value to replace the stored secret.', 'info');
            }
            return;
        }

        revealed = !revealed;
        input.type = revealed ? 'text' : 'password';
        hint.hidden = true;
        btn.innerHTML = revealed
            ? '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i>'
            : '<i class="fa-solid fa-eye" aria-hidden="true"></i>';
        btn.setAttribute('aria-label', revealed ? 'Hide secret value' : 'Show secret value');
    });

    wrap.appendChild(btn);
    ensureMaskHint(wrap);
}

function installSettingsSecretFieldToggles(root = document) {
    SECRET_INPUT_SELECTORS.forEach((selector) => {
        root.querySelectorAll(selector).forEach(wrapSecretInput);
    });

    root.querySelectorAll('input[data-settings-secret="true"]').forEach(wrapSecretInput);
}

function observeSettingsSecretFields() {
    const shell = document.querySelector('.admin-settings-shell');
    if (!shell || shell.dataset.secretFieldsObserved) return;
    shell.dataset.secretFieldsObserved = '1';

    installSettingsSecretFieldToggles(shell);

    const observer = new MutationObserver(() => {
        installSettingsSecretFieldToggles(shell);
    });
    observer.observe(shell, { childList: true, subtree: true });
}

document.addEventListener('DOMContentLoaded', () => {
    installSettingsSecretFieldToggles(document);
    observeSettingsSecretFields();
});

Object.assign(window, {
    installSettingsSecretFieldToggles,
    isMaskedSecretPlaceholder
});

export { installSettingsSecretFieldToggles, isMaskedSecretPlaceholder };

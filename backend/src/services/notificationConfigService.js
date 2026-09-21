/********************************************************************
 * Project: EonlineBazar
 * File: notificationConfigService.js
 * Description: Admin notification settings (email + WhatsApp) — read, save, test.
 ********************************************************************/

const Settings = require('../models/Settings');
const { fetchSettingsDocumentSafe } = require('./settingsReadService');
const { dualWrite } = require('./dualWriteService');
const { encryptSecret, decryptSecret } = require('../utils/cryptoVault');
const {
    sendEmail,
    setRuntimeEmailConfig,
    resolveEmailConfig,
    VALID_PROVIDERS
} = require('./emailService');
const {
    getWhatsAppStatus,
    sendWhatsAppMessage,
    initWhatsApp,
    disconnectWhatsApp,
    isWhatsAppEnabled,
    setWhatsAppEnabledFlag
} = require('./whatsappService');

function getSettingsRepository() {
    return require('../repositories/settingsRepository');
}

function maskSecret(value) {
    const str = String(value || '').trim();
    if (!str) return '';
    if (str.length <= 8) return '••••••••';
    return `${str.slice(0, 4)}${'•'.repeat(Math.min(12, str.length - 6))}${str.slice(-2)}`;
}

function isMaskedPlaceholder(value) {
    return String(value || '').includes('•');
}

function decryptStoredSecret(stored) {
    const raw = String(stored || '').trim();
    if (!raw) return '';
    try {
        if (raw.startsWith('enc:')) {
            return decryptSecret(raw.slice(4)) || '';
        }
        return decryptSecret(raw) || raw;
    } catch {
        return raw.startsWith('enc:') ? '' : raw;
    }
}

function encryptForStorage(plain) {
    const value = String(plain || '').trim();
    if (!value) return '';
    return `enc:${encryptSecret(value)}`;
}

async function dualWriteSettingsUpsert(settings) {
    await dualWrite(
        () => settings.save(),
        async (saved) => {
            const plain = saved.toObject ? saved.toObject() : saved;
            await getSettingsRepository().upsertFromMongo(plain);
        },
        {
            model: 'Settings',
            operation: 'update',
            mongoId: (saved) => String(saved._id)
        }
    );
}

function buildEffectiveSecrets(doc) {
    const ns = doc?.notificationSettings || {};
    return {
        emailProvider: ns.emailProvider || process.env.EMAIL_PROVIDER || 'resend',
        resendApiKey: decryptStoredSecret(ns.resendApiKeyEnc) || process.env.RESEND_API_KEY || '',
        resendFromEmail: ns.resendFromEmail || process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || '',
        brevoApiKey: decryptStoredSecret(ns.brevoApiKeyEnc) || process.env.BREVO_API_KEY || '',
        brevoFromEmail: ns.brevoFromEmail || process.env.BREVO_FROM_EMAIL || '',
        waEnabled: ns.waEnabled === true || process.env.WA_ENABLED === 'true'
    };
}

function applyRuntimeEmailFromDoc(doc) {
    const effective = buildEffectiveSecrets(doc);
    setRuntimeEmailConfig({
        emailProvider: effective.emailProvider,
        resendApiKey: effective.resendApiKey,
        resendFromEmail: effective.resendFromEmail,
        brevoApiKey: effective.brevoApiKey,
        brevoFromEmail: effective.brevoFromEmail
    });
    return effective;
}

async function loadNotificationSettingsDoc() {
    const doc = await fetchSettingsDocumentSafe();
    return doc || {};
}

async function getNotificationConfig() {
    const doc = await loadNotificationSettingsDoc();
    const ns = doc.notificationSettings || {};
    const effective = applyRuntimeEmailFromDoc(doc);
    const wa = getWhatsAppStatus();

    return {
        emailProvider: effective.emailProvider,
        resendFrom: effective.resendFromEmail,
        brevoFrom: effective.brevoFromEmail,
        resendKeyMasked: maskSecret(effective.resendApiKey),
        brevoKeyMasked: maskSecret(effective.brevoApiKey),
        resendConfigured: Boolean(effective.resendApiKey && effective.resendFromEmail),
        brevoConfigured: Boolean(effective.brevoApiKey && effective.brevoFromEmail),
        whatsapp: {
            status: wa.status,
            hasQR: wa.hasQR,
            qrDataURL: wa.qrDataURL,
            enabled: isWhatsAppEnabled(),
            phoneHint: wa.phoneHint || null
        }
    };
}

async function saveNotificationConfig(payload = {}) {
    const settings = await Settings.getOrCreate();
    const current = settings.notificationSettings || {};
    const next = { ...current };

    if (payload.emailProvider !== undefined) {
        const provider = String(payload.emailProvider || '').trim().toLowerCase();
        if (!VALID_PROVIDERS.includes(provider)) {
            throw new Error('Invalid email provider.');
        }
        next.emailProvider = provider;
    }

    if (payload.resendFrom !== undefined) {
        next.resendFromEmail = String(payload.resendFrom || '').trim();
    }

    if (payload.brevoFrom !== undefined) {
        next.brevoFromEmail = String(payload.brevoFrom || '').trim();
    }

    if (payload.resendKey !== undefined) {
        const key = String(payload.resendKey || '').trim();
        if (key && !isMaskedPlaceholder(key)) {
            next.resendApiKeyEnc = encryptForStorage(key);
        }
    }

    if (payload.brevoKey !== undefined) {
        const key = String(payload.brevoKey || '').trim();
        if (key && !isMaskedPlaceholder(key)) {
            next.brevoApiKeyEnc = encryptForStorage(key);
        }
    }

    if (payload.waEnabled !== undefined) {
        next.waEnabled = payload.waEnabled === true
            || payload.waEnabled === 'true'
            || payload.waEnabled === 1
            || payload.waEnabled === '1';
        setWhatsAppEnabledFlag(next.waEnabled);
    }

    settings.notificationSettings = next;
    settings.markModified('notificationSettings');
    await dualWriteSettingsUpsert(settings);
    applyRuntimeEmailFromDoc(settings.toObject ? settings.toObject() : settings);

    const { clearGatewayStatusCache } = require('./gatewayStatusService');
    clearGatewayStatusCache();

    return getNotificationConfig();
}

async function sendTestEmail(adminEmail) {
    const recipient = String(adminEmail || '').trim();
    if (!recipient) {
        return { success: false, message: 'Admin email not configured' };
    }

    const doc = await loadNotificationSettingsDoc();
    applyRuntimeEmailFromDoc(doc);

    const result = await sendEmail({
        to: recipient,
        subject: 'EonlineBazar — Test Email',
        html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
              <h2>✅ Test Email</h2>
              <p>This is a test message from the EonlineBazar admin panel.</p>
              <p style="color:#64748b;font-size:13px;">Provider chain: Resend → Brevo → log</p>
            </div>`
    });

    return {
        success: result.success === true,
        provider: result.provider || 'none',
        message: result.success
            ? `Email sent via ${result.provider}`
            : (result.message || 'Failed to send test email')
    };
}

async function sendTestWhatsApp() {
    const adminPhone = String(process.env.ADMIN_WHATSAPP_NUMBER || '').trim();
    if (!adminPhone) {
        return { success: false, message: 'ADMIN_WHATSAPP_NUMBER is not set in .env' };
    }

    const result = await sendWhatsAppMessage(
        adminPhone,
        'Test message from EonlineBazar admin'
    );

    return {
        success: result.success === true,
        message: result.success ? 'WhatsApp test message sent' : (result.reason || result.error || 'Send failed')
    };
}

async function enableWhatsAppConnection() {
    setWhatsAppEnabledFlag(true);
    const settings = await Settings.getOrCreate();
    settings.notificationSettings = {
        ...(settings.notificationSettings || {}),
        waEnabled: true
    };
    settings.markModified('notificationSettings');
    await dualWriteSettingsUpsert(settings);
    await initWhatsApp();
    return getWhatsAppStatus();
}

async function disableWhatsAppConnection() {
    setWhatsAppEnabledFlag(false);
    await disconnectWhatsApp();
    const settings = await Settings.getOrCreate();
    settings.notificationSettings = {
        ...(settings.notificationSettings || {}),
        waEnabled: false
    };
    settings.markModified('notificationSettings');
    await dualWriteSettingsUpsert(settings);
    return getWhatsAppStatus();
}

/** Hydrate runtime email config once at server boot. */
async function hydrateNotificationConfigAtStartup() {
    try {
        const doc = await loadNotificationSettingsDoc();
        applyRuntimeEmailFromDoc(doc);
        if (doc?.notificationSettings?.waEnabled === true || process.env.WA_ENABLED === 'true') {
            setWhatsAppEnabledFlag(true);
        }
    } catch (err) {
        console.warn('[notificationConfig] Startup hydrate skipped:', err.message);
        setRuntimeEmailConfig(resolveEmailConfig());
    }
}

module.exports = {
    getNotificationConfig,
    saveNotificationConfig,
    sendTestEmail,
    sendTestWhatsApp,
    enableWhatsAppConnection,
    disableWhatsAppConnection,
    hydrateNotificationConfigAtStartup,
    maskSecret
};

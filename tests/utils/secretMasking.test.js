/********************************************************************
 * secretMasking + settingsIntegrationSecrets — Phase 1 settings security
 ********************************************************************/

const {
    maskSecretKey,
    isMaskedSecretPlaceholder
} = require('../../backend/src/utils/secretMasking');
const {
    applyIntegrationSecretUpdate,
    resolveIntegrationSecret,
    maskIntegrationSecretsInPayload
} = require('../../backend/src/utils/settingsIntegrationSecrets');

describe('maskSecretKey', () => {
    test('formats sk_live prefix with last four digits', () => {
        expect(maskSecretKey('sk_live_abcdef1234')).toBe('sk_live_••••1234');
    });

    test('isMaskedSecretPlaceholder detects bullet mask', () => {
        expect(isMaskedSecretPlaceholder('sk_live_••••1234')).toBe(true);
        expect(isMaskedSecretPlaceholder('sk_live_realkey')).toBe(false);
    });
});

describe('settingsIntegrationSecrets', () => {
    test('applyIntegrationSecretUpdate skips masked placeholder', () => {
        const settings = { smsApiKey: 'enc:existing' };
        const result = applyIntegrationSecretUpdate(settings, 'smsApiKey', 'sec_••••abcd');
        expect(result.updated).toBe(false);
    });

    test('encrypt round-trip and mask for API responses', () => {
        const settings = {};
        applyIntegrationSecretUpdate(settings, 'smsApiKey', 'my-super-secret-key-9999');
        const masked = maskIntegrationSecretsInPayload(settings);
        expect(masked.smsApiKey).toMatch(/••••9999$/);
        expect(masked.smsApiKey).not.toBe('my-super-secret-key-9999');
        expect(resolveIntegrationSecret(settings.smsApiKey)).toBe('my-super-secret-key-9999');
    });
});

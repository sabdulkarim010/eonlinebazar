/********************************************************************
 * settingsService + settingsReadService — Phase 2 resilience tests
 ********************************************************************/

jest.mock('../../backend/src/models/Settings', () => ({
    getOrCreate: jest.fn()
}));

jest.mock('../../backend/src/services/readRouter', () => ({
    routedRead: jest.fn()
}));

jest.mock('../../backend/src/repositories/settingsRepository', () => ({
    upsertPrimary: jest.fn(),
    getRevisionId: jest.fn(),
    RevisionMismatchError: class RevisionMismatchError extends Error {
        constructor(currentRevision) {
            super('REVISION_MISMATCH');
            this.code = 'REVISION_MISMATCH';
            this.currentRevision = currentRevision;
        }
    }
}));

const Settings = require('../../backend/src/models/Settings');
const settingsRepository = require('../../backend/src/repositories/settingsRepository');
const { saveSettings } = require('../../backend/src/services/settingsService');
const { fetchSettingsDocumentSafe } = require('../../backend/src/services/settingsReadService');
const { getDefaultSettingsDocument } = require('../../backend/src/config/settingsDefaults');

describe('saveSettings', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns REVISION_MISMATCH conflict when expected revision differs', async () => {
        settingsRepository.getRevisionId.mockResolvedValue(3);
        Settings.getOrCreate.mockResolvedValue({
            revisionId: 3,
            toObject: () => ({ revisionId: 3, shopHomeCity: 'Dhaka' }),
            save: jest.fn().mockResolvedValue(undefined)
        });

        const result = await saveSettings({
            expectedRevision: 2,
            mutate: async () => {}
        });

        expect(result.ok).toBe(false);
        expect(result.conflict).toBe(true);
        expect(result.currentRevision).toBe(3);
        expect(settingsRepository.upsertPrimary).not.toHaveBeenCalled();
    });

    test('PG write succeeds and Mongo mirror failure still returns ok', async () => {
        const mockDoc = {
            revisionId: 0,
            shopHomeCity: 'Dhaka',
            toObject: function toObject() {
                return { revisionId: this.revisionId, shopHomeCity: this.shopHomeCity };
            },
            save: jest.fn().mockRejectedValue(new Error('mongo down'))
        };
        Settings.getOrCreate.mockResolvedValue(mockDoc);
        settingsRepository.upsertPrimary.mockResolvedValue({ revisionId: 1 });

        const result = await saveSettings({
            mutate: async (settings) => {
                settings.shopHomeCity = 'Chittagong';
            }
        });

        expect(result.ok).toBe(true);
        expect(result.revisionId).toBe(1);
        expect(result.mongoMirrorFailed).toBe(true);
    });

    test('PG failure falls back to Mongo with pendingPgSync', async () => {
        const mockDoc = {
            revisionId: 4,
            pendingPgSync: false,
            toObject: function toObject() {
                return { revisionId: this.revisionId, pendingPgSync: this.pendingPgSync };
            },
            save: jest.fn().mockImplementation(async function save() {
                return this;
            })
        };
        Settings.getOrCreate.mockResolvedValue(mockDoc);
        settingsRepository.upsertPrimary.mockRejectedValue(new Error('pg unavailable'));

        const result = await saveSettings({
            mutate: async () => {}
        });

        expect(result.ok).toBe(true);
        expect(result.pgFallback).toBe(true);
        expect(result.revisionId).toBe(5);
        expect(mockDoc.pendingPgSync).toBe(true);
    });
});

describe('fetchSettingsDocumentSafe zero-safe fallback', () => {
    test('returns hardcoded defaults when Mongo and PG reads fail', async () => {
        const { routedRead } = require('../../backend/src/services/readRouter');
        routedRead.mockRejectedValue(new Error('pg offline'));
        Settings.getOrCreate.mockRejectedValue(new Error('mongo offline'));

        const doc = await fetchSettingsDocumentSafe();

        expect(doc._fallbackDefaults).toBe(true);
        expect(doc.shopHomeCity).toBe(getDefaultSettingsDocument().shopHomeCity);
    });
});

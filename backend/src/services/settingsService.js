/********************************************************************
 * Project: EonlineBazar — Settings write orchestration (Phase 2)
 * File: settingsService.js
 * Description: PG-primary writes, Mongo mirror, revision locking, PG outage fallback.
 ********************************************************************/

'use strict';

const Settings = require('../models/Settings');
const { getDefaultSettingsDocument } = require('../config/settingsDefaults');

function getSettingsRepository() {
    return require('../repositories/settingsRepository');
}

function normalizeExpectedRevision(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function resolveAuthoritativeRevision(settingsDoc) {
    try {
        const repo = getSettingsRepository();
        const pgRev = await repo.getRevisionId();
        if (pgRev > 0 || settingsDoc?.revisionId == null) {
            return pgRev;
        }
    } catch (err) {
        console.warn('[settingsService] PG revision read failed:', err.message);
    }
    return Number(settingsDoc?.revisionId) || 0;
}

/**
 * Persist settings: PostgreSQL first, Mongo mirror second.
 * @param {{ expectedRevision?: number|string|null, mutate: (settings: import('mongoose').Document) => Promise<object|void>|object|void }} params
 * @returns {Promise<{ ok: true, revisionId: number, settings: object, mongoMirrorFailed?: boolean, pgFallback?: boolean, meta?: object }|{ ok: false, conflict: true, currentRevision: number }>}
 */
async function saveSettings({ expectedRevision = null, mutate }) {
    const settings = await Settings.getOrCreate();
    const expected = normalizeExpectedRevision(expectedRevision);

    if (expected != null) {
        const current = await resolveAuthoritativeRevision(settings);
        if (expected !== current) {
            return { ok: false, conflict: true, currentRevision: current };
        }
    }

    const meta = (await mutate(settings)) || {};

    const plain = settings.toObject ? settings.toObject() : { ...settings };

    let revisionId = Number(settings.revisionId) || 0;
    let pgWritten = false;

    try {
        const { revisionId: nextRev } = await getSettingsRepository().upsertPrimary(plain, {
            expectedRevision: expected,
            skipRevisionCheck: expected == null,
            incrementRevision: true
        });
        revisionId = nextRev;
        settings.revisionId = nextRev;
        settings.pendingPgSync = false;
        pgWritten = true;
    } catch (err) {
        if (err.code === 'REVISION_MISMATCH') {
            return { ok: false, conflict: true, currentRevision: err.currentRevision };
        }

        console.warn('[settingsService] PG primary write failed — Mongo fallback:', err.message);
        revisionId = (Number(settings.revisionId) || 0) + 1;
        settings.revisionId = revisionId;
        settings.pendingPgSync = true;
        plain.revisionId = revisionId;
        plain.pendingPgSync = true;
    }

    try {
        await settings.save();
    } catch (mongoErr) {
        if (pgWritten) {
            console.warn('MONGO_SETTINGS_MIRROR_FAILED', mongoErr.message);
            return {
                ok: true,
                revisionId,
                settings,
                mongoMirrorFailed: true,
                meta
            };
        }
        throw mongoErr;
    }

    return {
        ok: true,
        revisionId,
        settings,
        pgFallback: !pgWritten,
        meta
    };
}

function attachRevisionToPayload(payload, doc) {
    const revisionId = Number(doc?.revisionId) || 0;
    return { ...payload, revisionId, pendingPgSync: doc?.pendingPgSync === true };
}

module.exports = {
    saveSettings,
    normalizeExpectedRevision,
    attachRevisionToPayload,
    getDefaultSettingsDocument
};

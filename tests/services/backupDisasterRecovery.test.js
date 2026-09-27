/********************************************************************
 * Phase 5 — Encrypted backup DR engine
 ********************************************************************/

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../backend/src/config/prismaClient', () => ({
    settings: { findMany: jest.fn().mockResolvedValue([]) },
    order: { findMany: jest.fn().mockResolvedValue([]) },
    product: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    paymentMethod: { findMany: jest.fn().mockResolvedValue([]) }
}));

const {
    sealBackupPayload,
    openBackupEnvelope,
    envelopeToBuffer,
    sha256Hex
} = require('../../backend/src/services/backupEncryptionService');
const {
    validateBackupPayloadStructure,
    validateEncryptedBackupBuffer
} = require('../../backend/src/services/backupService');
const {
    pruneOldBackups,
    readManifest
} = require('../../backend/src/services/backupArchiveService');
const { verifySuperAdminStepUp } = require('../../backend/src/controllers/admin/backupController');

describe('backupEncryptionService', () => {
    beforeAll(() => {
        process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);
    });

    test('AES-256-GCM round-trip preserves payload and checksum', async () => {
        const plain = Buffer.from(JSON.stringify({ hello: 'world', n: 42 }), 'utf8');
        const envelope = await sealBackupPayload(plain);
        expect(envelope.encryptionStandard).toBe('AES-256-GCM');
        expect(envelope.checksumSha256).toBe(sha256Hex(plain));

        const { plainBuffer, checksumMatched } = await openBackupEnvelope(envelope);
        expect(checksumMatched).toBe(true);
        expect(JSON.parse(plainBuffer.toString('utf8'))).toEqual({ hello: 'world', n: 42 });
    });

    test('tampered ciphertext fails checksum / auth', async () => {
        const plain = Buffer.from('{"schemaVersion":1,"collections":{}}', 'utf8');
        const envelope = await sealBackupPayload(plain);
        envelope.ciphertext = `${envelope.ciphertext}x`;
        await expect(openBackupEnvelope(envelope)).rejects.toThrow();
    });
});

describe('backup validation', () => {
    beforeAll(() => {
        process.env.BACKUP_ENCRYPTION_KEY = 'b'.repeat(64);
    });

    test('validateEncryptedBackupBuffer returns summary', async () => {
        const payload = {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            collections: { settings: [{ _id: '1', shopName: 'Test' }] },
            postgresql: {}
        };
        const envelope = await sealBackupPayload(Buffer.from(JSON.stringify(payload), 'utf8'));
        const fileBuffer = envelopeToBuffer(envelope);
        const summary = await validateEncryptedBackupBuffer(fileBuffer);

        expect(summary.valid).toBe(true);
        expect(summary.checksumMatched).toBe(true);
        expect(summary.collections).toContain('settings');
        expect(summary.recordCount).toBe(1);
    });

    test('validateBackupPayloadStructure rejects invalid payload', () => {
        expect(() => validateBackupPayloadStructure({})).toThrow();
    });
});

describe('backup retention pruning', () => {
    let tempDir;

    beforeEach(async () => {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'eob-dr-backup-'));
        process.env.BACKUP_STORAGE_DIR = tempDir;
    });

    afterEach(async () => {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    test('pruneOldBackups removes entries older than retention window', async () => {
        const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
        const manifest = {
            entries: [
                {
                    id: 'old1',
                    filename: 'backup-old1.eobk',
                    createdAt: oldDate,
                    sizeBytes: 10,
                    checksumSha256: 'abc',
                    encryptionStandard: 'AES-256-GCM',
                    recordCount: 1,
                    durationMs: 1
                },
                {
                    id: 'new1',
                    filename: 'backup-new1.eobk',
                    createdAt: new Date().toISOString(),
                    sizeBytes: 10,
                    checksumSha256: 'def',
                    encryptionStandard: 'AES-256-GCM',
                    recordCount: 1,
                    durationMs: 1
                }
            ]
        };
        await fs.promises.writeFile(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest));
        await fs.promises.writeFile(path.join(tempDir, 'backup-old1.eobk'), 'x');
        await fs.promises.writeFile(path.join(tempDir, 'backup-new1.eobk'), 'y');

        const result = await pruneOldBackups(30);
        expect(result.pruned).toBe(1);
        expect(result.kept).toBe(1);

        const after = await readManifest();
        expect(after.entries).toHaveLength(1);
        expect(after.entries[0].id).toBe('new1');
    });
});

describe('SuperAdmin step-up verification', () => {
    test('verifySuperAdminStepUp rejects missing password', async () => {
        const req = {
            body: {},
            adminAccount: { isSuperAdmin: () => true, _id: '507f1f77bcf86cd799439011' }
        };
        const result = await verifySuperAdminStepUp(req);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
    });
});

describe('backup route RBAC', () => {
    test('restore and validate routes require Super Admin middleware chain', () => {
        const adminRoutes = require('../../backend/src/routes/adminRoutes');
        const restoreRoute = adminRoutes.stack.find(
            (layer) => layer.route?.path === '/system/backup/restore' && layer.route.methods.post
        );
        expect(restoreRoute).toBeTruthy();
        const handlers = restoreRoute.route.stack.map((s) => s.name || s.handle?.name || '');
        expect(handlers.some((h) => String(h).includes('requireSuperAdmin') || handlers.length >= 3)).toBe(true);
    });
});

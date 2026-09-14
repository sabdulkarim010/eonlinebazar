/********************************************************************
 * Project: EonlineBazar
 * File: adminDualWriteHelpers.js
 * Location: backend/src/utils/adminDualWriteHelpers.js
 * Description: Dual-write mirrors for Admin (Stage 2 Step 3, Part 9).
 *   Failure logs never include secret field values (otp, totpSecret, etc.).
 ********************************************************************/

'use strict';

function getAdminRepository() {
  return require('../repositories/adminRepository');
}

function getSecretFields() {
  return getAdminRepository().SECRET_FIELDS;
}

function sanitizeAdminFailureLog() {
  return 'Postgres admin mirror failed';
}

function logAdminDualWriteFailure(context, err) {
  console.error('[DUAL-WRITE-FAILURE]', {
    timestamp: new Date().toISOString(),
    model: 'Admin',
    operation: context.operation || 'unknown',
    mongoId: context.mongoId != null ? String(context.mongoId) : null,
    error: sanitizeAdminFailureLog(),
    internalCode: err && err.code ? String(err.code) : undefined
  });
}

async function runAdminMirror(mirrorFn, context) {
  try {
    await mirrorFn();
  } catch (err) {
    logAdminDualWriteFailure(context, err);
  }
}

async function mirrorAdminCreate(mongoDoc, options = {}) {
  await runAdminMirror(
    () => getAdminRepository().upsertFromMongo(mongoDoc, {
      plainPassword: options.plainPassword,
      includeSecrets: true
    }),
    { operation: options.operation || 'create', mongoId: mongoDoc._id }
  );
}

async function mirrorAdminUpdate(mongoDoc, options = {}) {
  await runAdminMirror(
    () => getAdminRepository().upsertFromMongo(mongoDoc, {
      plainPassword: options.plainPassword,
      includeSecrets: options.includeSecrets !== false,
      fields: options.fields
    }),
    { operation: options.operation || 'update', mongoId: mongoDoc._id }
  );
}

async function mirrorAdminFields(legacyId, fields, operation = 'patch') {
  await runAdminMirror(
    async () => {
      const repo = getAdminRepository();
      const existing = await repo.findByLegacyId(String(legacyId));
      if (existing) {
        await repo.update(existing.id, fields);
        return;
      }
      const err = new Error('Admin not found.');
      err.code = 'NOT_FOUND';
      throw err;
    },
    { operation, mongoId: legacyId }
  );
}

async function mirrorAdminRemove(legacyId) {
  await runAdminMirror(
    () => getAdminRepository().removeByLegacyId(String(legacyId)),
    { operation: 'remove', mongoId: legacyId }
  );
}

async function adminDualWrite(mongoWriteFn, postgresWriteFn, context = {}) {
  const { dualWrite } = require('../services/dualWriteService');
  return dualWrite(
    mongoWriteFn,
    async (mongoResult) => {
      await runAdminMirror(
        () => postgresWriteFn(mongoResult),
        {
          operation: context.operation || 'unknown',
          mongoId: typeof context.mongoId === 'function'
            ? context.mongoId(mongoResult)
            : context.mongoId
        }
      );
    },
    {
      model: 'Admin',
      operation: context.operation,
      mongoId: context.mongoId
    }
  );
}

module.exports = {
  get SECRET_FIELDS() {
    return getSecretFields();
  },
  sanitizeAdminFailureLog,
  logAdminDualWriteFailure,
  mirrorAdminCreate,
  mirrorAdminUpdate,
  mirrorAdminFields,
  mirrorAdminRemove,
  adminDualWrite
};

/**
 * Load env the same way as backend/src/server.js (repo-root .env), with optional
 * backend/.env and ecommerce-chat/.env for chat-only vars. JWT_SECRET always
 * comes from the shared root/backend env — never from ecommerce-chat/.env.
 */
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..', '..');
const ROOT_ENV = path.join(REPO_ROOT, '.env');
const BACKEND_ENV = path.join(REPO_ROOT, 'backend', '.env');
const LOCAL_ENV = path.join(__dirname, '..', '.env');

/** Dev fallback when no .env exists — keep in sync with backend dev expectations. */
const DEV_JWT_SECRET_FALLBACK =
  'eOnlineBazarDevJwtSecretKey2024-min32chars!!';

let loaded = false;

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return;
  require('dotenv').config({ path: filePath, override });
}

function loadSharedEnv() {
  if (loaded) return;
  loaded = true;

  // Same primary source as backend/src/server.js
  loadEnvFile(ROOT_ENV);
  // Optional split layout: backend/.env fills vars not in repo root
  loadEnvFile(BACKEND_ENV);

  const sharedJwtSecret = process.env.JWT_SECRET;

  // Chat-local overrides (PORT, MONGO_URI, etc.) — never clobber shared JWT_SECRET
  if (fs.existsSync(LOCAL_ENV)) {
    loadEnvFile(LOCAL_ENV, { override: true });
    if (sharedJwtSecret && String(sharedJwtSecret).trim()) {
      process.env.JWT_SECRET = sharedJwtSecret;
    }
  } else if (!fs.existsSync(ROOT_ENV) && !fs.existsSync(BACKEND_ENV)) {
    require('dotenv').config();
  }

  if (!process.env.JWT_SECRET || !String(process.env.JWT_SECRET).trim()) {
    process.env.JWT_SECRET = DEV_JWT_SECRET_FALLBACK;
    console.warn(
      '[loadEnv] JWT_SECRET not found in repo-root .env or backend/.env — using dev fallback. ' +
        'Set JWT_SECRET in the repo-root .env to match the main backend.'
    );
  }

  const storePort = process.env.STORE_PORT || '5000';
  if (!process.env.MAIN_STORE_API_URL || !String(process.env.MAIN_STORE_API_URL).trim()) {
    process.env.MAIN_STORE_API_URL = `http://localhost:${storePort}`;
    console.log(
      `[loadEnv] MAIN_STORE_API_URL not set — defaulting to ${process.env.MAIN_STORE_API_URL}`
    );
  }
}

loadSharedEnv();

module.exports = { loadSharedEnv, DEV_JWT_SECRET_FALLBACK };

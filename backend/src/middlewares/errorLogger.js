/********************************************************************
 * Error logging middleware — file logs + admin notification on 500s.
 ********************************************************************/

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const RETAIN_DAYS = 7;

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

function logFilePath(date = new Date()) {
    const key = date.toISOString().slice(0, 10);
    return path.join(LOG_DIR, `error-${key}.log`);
}

function pruneOldLogs() {
    try {
        ensureLogDir();
        const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
        fs.readdirSync(LOG_DIR).forEach((file) => {
            if (!/^error-\d{4}-\d{2}-\d{2}\.log$/.test(file)) return;
            const full = path.join(LOG_DIR, file);
            const stat = fs.statSync(full);
            if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
        });
    } catch (err) {
        console.warn('[errorLogger] prune failed:', err.message);
    }
}

function appendErrorLog({ route, method, status, message }) {
    try {
        ensureLogDir();
        const line = `[${new Date().toISOString()}] [${route}] [${method}] [${status}] ${message}\n`;
        fs.appendFileSync(logFilePath(), line, 'utf8');
    } catch (err) {
        console.warn('[errorLogger] write failed:', err.message);
    }
}

async function notifySevereError(req, err) {
    try {
        const { notifyAdminsWithPermission } = require('../services/notificationService');
        await notifyAdminsWithPermission(
            'manage_security',
            'system',
            'Server error logged',
            `${req.method} ${req.originalUrl}: ${err.message || 'Unknown error'}`,
            '/admin#view-audit'
        );
    } catch (notifyErr) {
        console.warn('[errorLogger] admin notify failed:', notifyErr.message);
    }
}

function errorLogger(err, req, res, next) {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal server error';

    appendErrorLog({
        route: req.originalUrl || req.path,
        method: req.method || 'UNKNOWN',
        status,
        message
    });

    if (status >= 500) {
        notifySevereError(req, err).catch(() => {});
    }

    pruneOldLogs();
    next(err);
}

module.exports = errorLogger;

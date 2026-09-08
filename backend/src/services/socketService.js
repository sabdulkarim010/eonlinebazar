/********************************************************************
 * Project: EonlineBazar
 * File: socketService.js
 * Location: services/socketService.js
 * Description: WebSocket server for real-time admin panel notifications.
 ********************************************************************/

const jwt = require('jsonwebtoken');

let io = null;
let adminNamespace = null;

const CHAT_AGENT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'AGENT']);

function isChatAgentToken(decoded) {
    if (!decoded || typeof decoded !== 'object') return false;
    const role = String(decoded.role || '').toUpperCase();
    return Boolean((decoded.id || decoded._id) && CHAT_AGENT_ROLES.has(role));
}

function looksLikeAdminToken(decoded) {
    if (!decoded || typeof decoded !== 'object') return false;
    // Chat-admin JWTs belong on ecommerce-chat :5001 — never the store /admin socket
    if (isChatAgentToken(decoded)) return false;

    const role = String(decoded.role || '').toLowerCase();
    const accountRole = String(decoded.accountRole || '').toLowerCase();

    return (
        role === 'admin' ||
        role === 'superadmin' ||
        role === 'super_admin' ||
        accountRole === 'superadmin' ||
        accountRole === 'super_admin' ||
        (decoded.username && !decoded.id && !decoded._id && !decoded.userId)
    );
}

/**
 * Creates a Socket.IO server attached to the existing HTTP server.
 * Admin clients connect to the /admin namespace with a valid JWT.
 */
function initSocketServer(httpServer) {
    const { Server } = require('socket.io');

    io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || '*',
            methods: ['GET', 'POST']
        }
    });

    adminNamespace = io.of('/admin');

    adminNamespace.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Authentication token required'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (isChatAgentToken(decoded)) {
                return next(new Error('Use chat socket path /chat-socket/socket.io'));
            }
            if (!looksLikeAdminToken(decoded)) {
                return next(new Error('Admin privileges required'));
            }
            socket.admin = decoded;
            return next();
        } catch (err) {
            return next(new Error('Invalid or expired token'));
        }
    });

    adminNamespace.on('connection', (socket) => {
        const label = socket.admin?.username || socket.admin?.id || 'admin';
        socket.join('admins');
        console.log(`[Socket] Admin connected: ${label} (${socket.id})`);

        socket.on('disconnect', (reason) => {
            console.log(`[Socket] Admin disconnected: ${label} (${socket.id}) — ${reason}`);
        });
    });

    console.log('[Socket] Admin namespace /admin initialized');
    return adminNamespace;
}

/**
 * Emits an event to all connected admin sockets in room 'admins'.
 */
function emitToAdmins(event, data) {
    if (!adminNamespace) {
        console.warn(`[Socket] emitToAdmins skipped — namespace not initialized (${event})`);
        return false;
    }

    adminNamespace.to('admins').emit(event, data);
    return true;
}

function getSocketServer() {
    return io;
}

module.exports = {
    initSocketServer,
    emitToAdmins,
    getSocketServer
};

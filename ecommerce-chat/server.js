require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin.routes');
const knowledgeRoutes = require('./routes/knowledge.routes');
const uploadRoutes = require('./routes/upload.routes');
const { initChatSocket } = require('./socket/chat.socket');
const {
  chatStartLimiter,
  messageLimiter,
  adminLoginLimiter,
} = require('./middleware/rateLimit.middleware');

const PORT = process.env.PORT || 5001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce_chat';

/** Local demo origins + env (CLIENT_URL, ADMIN_DASHBOARD_URL, CORS_ORIGINS). */
const ALLOWED_ORIGINS = [
  ...new Set(
    [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5000',
      'http://127.0.0.1:5000',
      'http://localhost:5001',
      'http://127.0.0.1:5001',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      CLIENT_URL,
      process.env.ADMIN_DASHBOARD_URL,
      ...(process.env.CORS_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ].filter(Boolean)
  ),
];

const corsOptions = {
  origin(origin, callback) {
    // Non-browser clients / same-origin requests may omit Origin
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    console.warn(`[CORS] blocked origin: ${origin}`);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  },
});

// Make io available to routes (e.g. upload → emit new_message)
app.set('io', io);

// ─── Middleware ───────────────────────────────────────────────────
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Chat widget static assets (public/css, public/js)
app.use(express.static(path.join(__dirname, 'public')));

// ─── Health ───────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'ecommerce-chat',
    status: 'ok',
    mongo:
      mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// ─── Rate limiters ────────────────────────────────────────────────
app.use('/api/chat/start', chatStartLimiter);
app.use('/api/chat', messageLimiter);
app.use('/api/admin/login', adminLoginLimiter);

// ─── Routes ───────────────────────────────────────────────────────
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/upload', uploadRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, _req, res, _next) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// ─── Socket.io ────────────────────────────────────────────────────
initChatSocket(io);

// ─── Graceful shutdown ────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down...');
  server.close(() => {
    mongoose.connection.close(false).then(() => {
      console.log('Server shut down gracefully');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received — shutting down...');
  server.close(() => {
    mongoose.connection.close(false).then(() => {
      console.log('Server shut down gracefully');
      process.exit(0);
    });
  });
});

// ─── Start ────────────────────────────────────────────────────────
async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    server.listen(PORT, () => {
      console.log(`🚀 Chat server running on http://localhost:${PORT}`);
      console.log(`📡 Socket namespaces: /customer , /admin`);
      console.log(`🌐 CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();

module.exports = { app, server, io };

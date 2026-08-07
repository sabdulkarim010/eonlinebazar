/**
 * PM2 ecosystem config
 *
 * Start:  pm2 start ecosystem.config.js --env production
 * Reload: pm2 reload ecommerce-chat --update-env
 *
 * ─── Socket.io + cluster mode (sticky sessions) ───────────────────
 * Cluster mode requires sticky sessions so a client always hits the
 * same worker. Add @socket.io/sticky + @socket.io/cluster-adapter:
 *
 *   npm i @socket.io/sticky @socket.io/cluster-adapter
 *
 * Then in server.js (before listen), wrap like this:
 *
 *   const { createAdapter } = require('@socket.io/cluster-adapter');
 *   const { setupPrimary, setupWorker } = require('@socket.io/sticky');
 *   const cluster = require('cluster');
 *   const os = require('os');
 *
 *   if (cluster.isPrimary) {
 *     const httpServer = require('http').createServer();
 *     setupPrimary(httpServer);
 *     httpServer.listen(PORT);
 *     for (let i = 0; i < os.cpus().length; i++) cluster.fork();
 *   } else {
 *     // existing express + socket.io setup...
 *     io.adapter(createAdapter());
 *     setupWorker(server);
 *   }
 *
 * For a single-instance VPS you can set instances: 1 instead.
 */
module.exports = {
  apps: [
    {
      name: 'ecommerce-chat',
      script: 'server.js',
      instances: 'max', // cluster mode, use all CPU cores
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};

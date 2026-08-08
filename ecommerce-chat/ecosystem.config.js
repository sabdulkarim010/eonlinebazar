module.exports = {
  apps: [
    {
      name: 'chat-server',
      script: 'server.js',
      cwd: '/var/www/ecommerce-chat',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 5001
      },
      error_file: '/var/log/chat-server-error.log',
      out_file: '/var/log/chat-server-out.log',
    }
  ]
};

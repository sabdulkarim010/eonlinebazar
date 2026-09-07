import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/chat-admin/',
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api/chat-admin': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/chat-admin/, '/api'),
      },
      '/api/admin/me/avatar': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/api/admin/customers': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/chat-api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/chat-api/, '/api'),
      },
    },
  },
});

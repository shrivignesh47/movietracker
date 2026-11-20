import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://nnctxsaqjrmpxswhxxbn.supabase.co/functions/v1',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
    commonjsOptions: {
      ignoreTryCatchStatement: true,
      include: [/node_modules/],
    },
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          lucide: ['lucide-react'],
          supabase: ['@supabase/supabase-js'],
          vendors: ['axios', 'framer-motion', 'react-hot-toast'],
        },
      },
    },
  },
});

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'pdf': ['pdfjs-dist'],
            'xlsx': ['xlsx'],
            'vendor-react': ['react', 'react-dom'],
          }
        }
      }
    },
    server: {
      // Autorise l'hôte du proxy de prévisualisation (sandbox) et les accès locaux.
      allowedHosts: true as const,
      host: true,
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        // Proxy local API to avoid CORS during dev when using vite only
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        }
      }
    },
    preview: {
      port: 4173,
      host: true,
    },
    // Expose env for Cloudflare compatibility
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    }
  };
});

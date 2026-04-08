import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    // VitePWA eliminado - usamos manifest.json y sw.js manuales en public/
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  base: process.env.VITE_BASE_URL || '/mantenimiento-planta/',
  server: {
    proxy: {
      '/mantenimiento-planta/baader200-manual': {
        target: 'https://orelcain.github.io',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router-dom')) {
            return 'vendor';
          }
          if (id.includes('node_modules/firebase/')) {
            return 'firebase';
          }
          if (id.includes('node_modules/@radix-ui/')) {
            return 'ui';
          }
          if (id.includes('node_modules/echarts')) {
            return 'echarts';
          }
          // Three.js se carga dinámicamente via lazy import de Visor3D (~1MB)
        }
      }
    }
  }
})

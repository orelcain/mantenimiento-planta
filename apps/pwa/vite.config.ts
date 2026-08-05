import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

/**
 * SHA corto del commit del que sale este build.
 *
 * En GitHub Actions viene de `GITHUB_SHA` (el checkout es detached, así que
 * `git rev-parse HEAD` también sirve, pero la variable es más barata y no
 * depende de que el runner tenga el .git completo).
 * En local se pregunta a git. Si no hay git (tarball, contenedor pelado),
 * queda `'dev'` — es una etiqueta, no debe romper el build.
 */
function resolveBuildSha(): string {
  const fromCI = process.env.GITHUB_SHA
  if (fromCI) return fromCI.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}

const BUILD_SHA = resolveBuildSha()
const BUILD_TIME = new Date().toISOString()

export default defineConfig({
  define: {
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
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
  server: {},
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log', 'console.debug'],
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

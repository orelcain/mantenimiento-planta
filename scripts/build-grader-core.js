/**
 * Bundlea la lógica PURA de segmentación del Grader para usarla desde scripts
 * Node (firebase-admin).
 *
 * Por qué bundlear y no reimplementar: el corte día/turno tiene reglas finas
 * (wall-clock-as-UTC, ventanas de Shoplogix, tolerancia de cierre, dedupe).
 * Una copia en JS se desincroniza del día a la mañana y los scripts terminan
 * escribiendo datos que la app no habría producido. Acá se importa el MISMO
 * código que corre en producción.
 *
 * Uso:  node scripts/build-grader-core.js
 * Salida: scripts/_grader-core.cjs  (artefacto, no se commitea)
 */
const path = require('path')
const esbuild = require('esbuild')

esbuild
  .build({
    entryPoints: [path.join(__dirname, '_bundle-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: path.join(__dirname, '_grader-core.cjs'),
    alias: { '@': path.join(__dirname, '..', 'apps', 'pwa', 'src') },
    logLevel: 'warning',
  })
  .then(() => console.log('scripts/_grader-core.cjs generado'))
  .catch((e) => {
    console.error(e.message)
    process.exit(1)
  })

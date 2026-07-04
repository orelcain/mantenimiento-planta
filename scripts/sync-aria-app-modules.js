/**
 * sync-aria-app-modules.js — Sincroniza el catálogo de módulos de la PWA
 * hacia Firestore (`ariaKnowledge/appModules`) para que ARIA (Telegram)
 * conozca la app: qué módulos existen, qué hace cada uno, y cuáles están
 * EN DESARROLLO (ocultos para usuarios no-admin).
 *
 * Fuente de verdad: ALL_NAV_ITEMS en apps/pwa/src/components/layout/MainLayout.tsx
 * (flag `inDevelopment`). Correr de nuevo cada vez que cambien los módulos:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=serviceAccountKey.json node scripts/sync-aria-app-modules.js
 */
const fs = require('fs')
const path = require('path')
const admin = require('../functions/node_modules/firebase-admin')

admin.initializeApp()

// Descripciones curadas por módulo (lo que ARIA le cuenta al usuario)
const DESCRIPCIONES = {
  '/': 'Pantalla de inicio con accesos rápidos y estado general',
  '/dashboard': 'Panel de indicadores generales de mantención',
  '/incidents': 'Registro y seguimiento de incidencias/averías: prioridades, fotos, estados y resolución',
  '/inspections': 'Inspecciones con puntos marcados sobre planos de la planta',
  '/photo-evidence': 'Evidencias fotográficas antes/después de los trabajos de mantención',
  '/preventive': 'Tareas preventivas con checklist, frecuencia y próximas ejecuciones',
  '/predictive': 'Mantenimiento predictivo (análisis de tendencias para anticipar fallas)',
  '/gantt': 'Planificador Gantt: tareas con fechas, responsables, dependencias y avance',
  '/calendario-mantencion': 'Calendario de mantención con turnos y técnicos',
  '/repuestos': 'Maestro SAP de repuestos e insumos por área, con stock de bodega y manuales',
  '/equipment': 'Expediente de cada equipo (Centro Técnico Documental): placa, criticidad NFPA 70B, condición, historial y tableros',
  '/sensors': 'Sensores IoT de la planta en tiempo real',
  '/sensors/monitor': 'Panel de monitoreo continuo de sensores con semáforos',
  '/map': 'Visor de planta: mapa con capas, zonas y marcadores',
  '/visor-3d': 'Modelos 3D interactivos (pontón, tobogán, sopladoras Baader)',
  '/analisis-grader': 'Análisis de Turno del Grader: piezas, compuertas, P0, microdetenciones y Lente de Mantención',
  '/clima-puerto': 'Estado del puerto/bahía con pronóstico y alertas automáticas',
  '/planos-aguas': 'Planos de aguas de la planta',
  '/hmi-knuro': 'HMI del sistema Knuro con presets e histórico',
  '/baader-200': 'Guía técnica interactiva de la Baader 200 por secciones',
  '/aprendizaje': 'Centro de Aprendizaje: cursos de electricidad (NFPA 70E, Rescate/SVB, NFPA 70B) con lecciones y exámenes',
  '/centro-tecnico-documental': 'Portada del Centro Técnico Documental: KPIs documentales de equipos y export a Excel',
  '/admin': 'Panel de administración (solo administradores)',
}

function parseNavItems(src) {
  const modulos = []
  let grupoActual = null
  for (const line of src.split('\n')) {
    const g = line.match(/label:\s*'([^']+)'/)
    if (g && !line.includes('name:')) grupoActual = g[1]
    const it = line.match(/name:\s*'([^']+)',\s*href:\s*'([^']+)'/)
    if (it) {
      modulos.push({
        nombre: it[1],
        ruta: it[2],
        grupo: grupoActual || 'General',
        estado: /inDevelopment:\s*true/.test(line) ? 'desarrollo' : 'produccion',
        descripcion: DESCRIPCIONES[it[2]] || '',
      })
    }
  }
  return modulos
}

;(async () => {
  const layoutPath = path.join(__dirname, '..', 'apps/pwa/src/components/layout/MainLayout.tsx')
  const src = fs.readFileSync(layoutPath, 'utf8')
  // Solo el bloque navGroups (antes de ALL_NAV_ITEMS) para no capturar el bottom-nav
  const bloque = src.split('ALL_NAV_ITEMS')[0]
  const modulos = parseNavItems(bloque)
  if (modulos.length < 10) throw new Error(`parse sospechoso: solo ${modulos.length} módulos`)

  const sinDesc = modulos.filter((m) => !m.descripcion)
  if (sinDesc.length) console.warn('⚠️ módulos sin descripción:', sinDesc.map((m) => m.ruta).join(', '))

  await admin.firestore().collection('ariaKnowledge').doc('appModules').set({
    modulos,
    fuente: 'MainLayout.tsx ALL_NAV_ITEMS',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  const prod = modulos.filter((m) => m.estado === 'produccion').length
  console.log(`✅ ${modulos.length} módulos sincronizados (${prod} producción, ${modulos.length - prod} en desarrollo)`)
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })

/**
 * ARIA — Conocimiento de la app (mapa de módulos).
 *
 * Da a la ARIA de la PWA lo que la de Telegram ya tiene vía
 * `ariaKnowledge/appModules`: saber QUÉ módulos existen, QUÉ hace cada uno,
 * cuáles están EN DESARROLLO (ocultos para no-admin) y QUÉ puede responder por
 * chat. Sin esto ARIA no "conoce la app" — solo los datos que una tool devuelve.
 *
 * Fuente de verdad de rutas/estados: ALL_NAV_ITEMS en
 * `components/layout/MainLayout.tsx` (grupos + flag inDevelopment). Las
 * descripciones son las MISMAS curadas en `scripts/sync-aria-app-modules.js`
 * (catálogo de Telegram) → una sola voz en ambas superficies. Al cambiar los
 * módulos del sidebar, actualizar AMBOS (este archivo + el script) — ver
 * [[feedback_aria_ambas_superficies]].
 */

export interface AppModule {
  ruta: string
  nombre: string
  grupo: string
  /** producción = usable ya; desarrollo = admin lo ve marcado, técnicos "pronto". */
  estado: 'produccion' | 'desarrollo'
  descripcion: string
  /** Solo admins. */
  adminOnly?: boolean
  /** Ejemplos de lo que ARIA PUEDE responder por chat sobre este módulo. */
  puedesPreguntar?: string
}

export const APP_MODULES: readonly AppModule[] = [
  // ── Principal ──
  { ruta: '/dashboard', nombre: 'Dashboard', grupo: 'Principal', estado: 'desarrollo', descripcion: 'Panel de indicadores generales de mantención' },
  { ruta: '/incidents', nombre: 'Incidencias', grupo: 'Principal', estado: 'desarrollo', descripcion: 'Registro y seguimiento de incidencias/averías: prioridades, fotos, estados y resolución', puedesPreguntar: 'incidencias abiertas, críticas, por equipo o por estado' },
  { ruta: '/photo-evidence', nombre: 'Evidencias', grupo: 'Principal', estado: 'desarrollo', descripcion: 'Evidencias fotográficas antes/después de los trabajos de mantención' },
  // ── Planificación ──
  { ruta: '/preventive', nombre: 'Preventivo', grupo: 'Planificación', estado: 'desarrollo', descripcion: 'Tareas preventivas con checklist, frecuencia y próximas ejecuciones', puedesPreguntar: 'preventivos vencidos o próximos' },
  { ruta: '/predictive', nombre: 'Predictivo', grupo: 'Planificación', estado: 'desarrollo', descripcion: 'Mantenimiento predictivo (análisis de tendencias para anticipar fallas)' },
  { ruta: '/gantt', nombre: 'Planificador Gantt', grupo: 'Planificación', estado: 'desarrollo', descripcion: 'Planificador Gantt: tareas con fechas, responsables, dependencias y avance', puedesPreguntar: 'tareas atrasadas o próximas del Gantt' },
  { ruta: '/calendario-mantencion', nombre: 'Calendario Mantención', grupo: 'Planificación', estado: 'produccion', descripcion: 'Calendario de mantención con turnos y técnicos', puedesPreguntar: 'turnos, técnicos, quién trabaja, horas semanales/mensuales' },
  // ── Equipamiento ──
  { ruta: '/equipment', nombre: 'Equipos', grupo: 'Equipamiento', estado: 'desarrollo', descripcion: 'Expediente de cada equipo (Centro Técnico Documental): placa, criticidad NFPA 70B, condición, historial y tableros', puedesPreguntar: 'estado, criticidad, condición e historial de un equipo por TAG' },
  { ruta: '/repuestos', nombre: 'Repuestos', grupo: 'Equipamiento', estado: 'produccion', descripcion: 'Maestro SAP de repuestos e insumos por área, con stock de bodega y manuales', puedesPreguntar: 'repuestos por SAP/nombre, stock, ubicación, valor, repuestos de una máquina' },
  { ruta: '/sensors', nombre: 'Sensores', grupo: 'Equipamiento', estado: 'desarrollo', descripcion: 'Sensores IoT de la planta en tiempo real' },
  { ruta: '/sensors/monitor', nombre: 'Panel Sensores', grupo: 'Equipamiento', estado: 'desarrollo', descripcion: 'Panel de monitoreo continuo de sensores con semáforos' },
  // ── Herramientas ──
  { ruta: '/map', nombre: 'Visor Planta 3D', grupo: 'Herramientas', estado: 'produccion', descripcion: 'Visor de planta: mapa con capas, zonas y marcadores' },
  { ruta: '/visor-3d', nombre: 'Visor 3D', grupo: 'Herramientas', estado: 'produccion', descripcion: 'Modelos 3D interactivos (pontón, tobogán, sopladoras Baader)' },
  { ruta: '/analisis-grader', nombre: 'Análisis de Turno', grupo: 'Herramientas', estado: 'produccion', descripcion: 'Análisis de Turno del Grader: piezas, compuertas, P0, microdetenciones y Lente de Mantención', puedesPreguntar: 'producción del turno/día, piezas por Baader, P0%, MTTR/MTBF, disponibilidad, por qué está detenida, causas de paro, en vivo' },
  { ruta: '/clima-puerto', nombre: 'Clima Puerto', grupo: 'Herramientas', estado: 'produccion', descripcion: 'Estado del puerto/bahía con pronóstico y alertas automáticas', puedesPreguntar: 'estado del puerto, pronóstico, alertas de bahía' },
  { ruta: '/planos-aguas', nombre: 'Planos de Aguas', grupo: 'Herramientas', estado: 'desarrollo', descripcion: 'Planos de aguas de la planta' },
  { ruta: '/hmi-knuro', nombre: 'HMI Knuro', grupo: 'Herramientas', estado: 'produccion', descripcion: 'HMI del sistema Knuro con presets e histórico' },
  { ruta: '/baader-200', nombre: 'Baader 200', grupo: 'Herramientas', estado: 'produccion', descripcion: 'Guía técnica interactiva de la Baader 200 por secciones' },
  // ── Aprendizaje ──
  { ruta: '/aprendizaje', nombre: 'Centro de Aprendizaje', grupo: 'Aprendizaje', estado: 'produccion', descripcion: 'Centro de Aprendizaje: cursos de electricidad (NFPA 70E, Rescate/SVB, NFPA 70B) con lecciones y exámenes' },
  { ruta: '/centro-tecnico-documental', nombre: 'Centro Técnico Documental', grupo: 'Aprendizaje', estado: 'produccion', descripcion: 'Portada del Centro Técnico Documental: KPIs documentales de equipos y export a Excel' },
  // ── Administración ──
  { ruta: '/admin', nombre: 'Panel Admin', grupo: 'Administración', estado: 'produccion', descripcion: 'Panel de administración (solo administradores)', adminOnly: true },
] as const

/** ¿El rol es admin? (admin/administrador/supervisor ven módulos en desarrollo). */
function isAdminRole(role?: string): boolean {
  const r = (role || '').toLowerCase()
  return r === 'admin' || r === 'administrador' || r === 'supervisor'
}

/**
 * Bloque markdown con el mapa de la app para inyectar como system message.
 * Filtra por rol: los técnicos NO ven los módulos en desarrollo listados
 * (para no ofrecer links a cosas que no pueden abrir); sí se les dice que ese
 * dato se puede pedir por chat. Los admin los ven marcados "(en desarrollo)".
 */
export function buildAppKnowledgeBlock(role?: string): string {
  const admin = isAdminRole(role)
  const visibles = APP_MODULES.filter(m => {
    if (m.adminOnly && !admin) return false
    if (m.estado === 'desarrollo' && !admin) return false
    return true
  })

  const porGrupo = new Map<string, AppModule[]>()
  for (const m of visibles) {
    const arr = porGrupo.get(m.grupo) || []
    arr.push(m)
    porGrupo.set(m.grupo, arr)
  }

  const lines: string[] = [
    '🗺️ MAPA DE LA APP (qué módulos existen y qué hace cada uno — sos la MAESTRA de esta app, conocela al derecho y al revés):',
    '',
  ]
  for (const [grupo, mods] of porGrupo) {
    lines.push(`**${grupo}**`)
    for (const m of mods) {
      const dev = m.estado === 'desarrollo' ? ' _(en desarrollo)_' : ''
      lines.push(`- **${m.nombre}** (\`${m.ruta}\`)${dev}: ${m.descripcion}`)
    }
    lines.push('')
  }

  // Qué puede responder por chat (data-rich) — SIEMPRE, incluso módulos en dev.
  const consultables = APP_MODULES.filter(m => m.puedesPreguntar)
  if (consultables.length > 0) {
    lines.push('DATOS QUE PODÉS RESPONDER POR CHAT (aunque el módulo esté en desarrollo, los datos SÍ están disponibles vía tus tools):')
    for (const m of consultables) {
      lines.push(`- ${m.nombre}: ${m.puedesPreguntar}`)
    }
    lines.push('')
  }

  lines.push(
    'INSTRUCCIONES: cuando el usuario pregunte "¿qué puede hacer la app?", "¿dónde veo X?", "llévame a…", orientá con el módulo correcto y su ruta. ' +
    (admin
      ? 'Los módulos "en desarrollo" existen: podés mencionarlos y linkearlos (el admin los ve).'
      : 'NO listes ni linkees módulos "en desarrollo" a técnicos; si preguntan por uno, decí que está "en desarrollo, pronto" y ofrecé el dato por chat si lo tenés.') +
    ' Nunca inventes módulos ni rutas que no estén en este mapa.',
  )

  return lines.join('\n')
}

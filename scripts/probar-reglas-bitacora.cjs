// Prueba las reglas de Firestore PUBLICADAS de la Bitácora con la API projects:test.
// NO escribe datos: simula create/update/delete/get con usuarios de mentira (functionMocks).
// Uso (desde la raíz del repo, con serviceAccountKey.json):
//   node scripts/probar-reglas-bitacora.cjs           → prueba las reglas PUBLICADAS
//   node scripts/probar-reglas-bitacora.cjs --local   → prueba firestore.rules del repo ANTES de publicar
// Sale con código 2 si algún caso no dio lo esperado.
const fs = require('fs')
const path = require('path')
const LOCAL = process.argv.includes('--local')
const admin = require('firebase-admin')
const P = 'mantenimiento-planta-771a3'

const usuario = (activo, rol) => [
  { function: 'exists', args: [{ anyValue: {} }], result: { value: true } },
  { function: 'get', args: [{ anyValue: {} }], result: { value: { data: { activo, rol } } } },
]
// `claims` = claims de un custom token (p. ej. el pase de bitácora, que entra con 'custom').
const auth = (uid, claims) => ({
  uid,
  token: { firebase: { sign_in_provider: claims ? 'custom' : 'google.com' }, ...(claims ?? {}) },
})
const ruta = (col, id) => `/databases/(default)/documents/${col}/${id}`

const evento = (extra = {}) => ({
  plantId: 'chonchi',
  turnoId: '2026-09-15_tarde',
  fechaTurno: '2026-09-15',
  banda: 'tarde',
  tipo: 'falla',
  equipo: 'BAADER 142',
  descripcion: 'Detención por E777.',
  horaInicio: '16:20',
  horaTermino: '16:55',
  impacto: 'con-parada',
  minutosParada: 35,
  ventana: null,
  pendiente: false,
  fotos: [{ url: 'https://x/a.jpg', path: 'bitacora/x/y/a.jpg', etiqueta: 'antes', ancho: 1600, alto: 1200 }],
  creadoPor: 'tecnico1',
  autorNombre: 'Danilo Cortes',
  ...extra,
})

const casos = [
  ['Técnico activo CREA un evento válido', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento() }, usuario(true, 'tecnico')],
  ['Evento abierto (término null, sin parada, ventana)', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ horaTermino: null, impacto: 'en-ventana', minutosParada: null, ventana: 'Colación HG', equipo: '' }) }, usuario(true, 'tecnico')],
  ['Crear firmando como OTRO usuario', 'DENY', { method: 'create', uid: 'tecnico2', col: 'bitacoraEventos', data: evento() }, usuario(true, 'tecnico')],
  ['Crear con descripción vacía', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ descripcion: '   ' }) }, usuario(true, 'tecnico')],
  ['Crear con turnoId mal formado', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ turnoId: '2026-09-15_madrugada' }) }, usuario(true, 'tecnico')],
  ['Crear con 9 fotos', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ fotos: Array(9).fill(evento().fotos[0]) }) }, usuario(true, 'tecnico')],
  ['Usuario INACTIVO crea', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento() }, usuario(false, 'tecnico')],
  ['Otro técnico EDITA (bitácora compartida)', 'ALLOW', { method: 'update', uid: 'tecnico2', col: 'bitacoraEventos', data: evento({ descripcion: 'Corregido', actualizadoPorNombre: 'Otro' }), previo: evento() }, usuario(true, 'tecnico')],
  ['Editar cambiando el autor', 'DENY', { method: 'update', uid: 'tecnico2', col: 'bitacoraEventos', data: evento({ creadoPor: 'tecnico2' }), previo: evento() }, usuario(true, 'tecnico')],
  ['Editar moviendo el evento a otro turno', 'DENY', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ turnoId: '2026-09-15_noche' }), previo: evento() }, usuario(true, 'tecnico')],
  ['El AUTOR borra', 'ALLOW', { method: 'delete', uid: 'tecnico1', col: 'bitacoraEventos', previo: evento() }, usuario(true, 'tecnico')],
  ['Otro técnico borra', 'DENY', { method: 'delete', uid: 'tecnico2', col: 'bitacoraEventos', previo: evento() }, usuario(true, 'tecnico')],
  ['Admin borra', 'ALLOW', { method: 'delete', uid: 'jefe', col: 'bitacoraEventos', previo: evento() }, usuario(true, 'admin')],
  ['Técnico activo LEE', 'ALLOW', { method: 'get', uid: 'tecnico1', col: 'bitacoraEventos', previo: evento() }, usuario(true, 'tecnico')],
  ['Observación del turno válida', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraTurnos', id: 'chonchi_2026-09-15_tarde', data: { plantId: 'chonchi', turnoId: '2026-09-15_tarde', observacion: 'Sin novedad', actualizadoPor: 'tecnico1', actualizadoPorNombre: 'Danilo' } }, usuario(true, 'tecnico')],
  ['Observación con id que no calza con el turno', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraTurnos', id: 'chonchi_2026-09-14_tarde', data: { plantId: 'chonchi', turnoId: '2026-09-15_tarde', observacion: 'x', actualizadoPor: 'tecnico1' } }, usuario(true, 'tecnico')],
]

// Casos de lo agregado después de #1024 (técnicos presentes, lista maestra, participantes).
// Solo aplican al ruleset que ya los trae: con --local, o cuando estén publicados.
const CASOS_TECNICOS = [
  ['Evento con participantes y equipo de la jerarquía', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ participantes: ['Lucas Adrade', 'Matias Serpa'], equipoId: '09DK1IcV8BaDCp9vU4Tf' }) }, usuario(true, 'tecnico')],
  ['Evento con 13 participantes', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ participantes: Array(13).fill('X') }) }, usuario(true, 'tecnico')],
  ['Turno con solo técnicos presentes (sin observación)', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraTurnos', id: 'chonchi_2026-09-15_tarde', data: { plantId: 'chonchi', turnoId: '2026-09-15_tarde', presentes: ['Danilo Cortes', 'Lucas Adrade'], actualizadoPor: 'tecnico1' } }, usuario(true, 'tecnico')],
  ['Presentes que no son lista', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraTurnos', id: 'chonchi_2026-09-15_tarde', data: { plantId: 'chonchi', turnoId: '2026-09-15_tarde', presentes: 'Danilo', actualizadoPor: 'tecnico1' } }, usuario(true, 'tecnico')],
  ['Técnico activo ajusta la lista maestra', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraConfig', id: 'chonchi', data: { agregados: ['Juan Pérez'], ocultos: [], renombres: { 'Lucas Adrade': 'Lucas Andrade' }, actualizadoPor: 'tecnico1' } }, usuario(true, 'tecnico')],
  ['Lista maestra firmada por otro', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraConfig', id: 'chonchi', data: { agregados: [], ocultos: [], renombres: {}, actualizadoPor: 'tecnico2' } }, usuario(true, 'tecnico')],
  ['Usuario inactivo ajusta la lista maestra', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraConfig', id: 'chonchi', data: { agregados: [], ocultos: [], renombres: {}, actualizadoPor: 'tecnico1' } }, usuario(false, 'tecnico')],
]

// Entrega de turno (pendientes que pasan al turno siguiente).
const CASOS_ENTREGA = [
  ['Otro técnico CIERRA un pendiente de un turno anterior', 'ALLOW', { method: 'update', uid: 'tecnico2', col: 'bitacoraEventos', data: evento({ pendiente: false, cierre: { tipo: 'resuelto', turnoId: '2026-09-16_noche', porNombre: 'Diego Cardenas', eventoId: 'r1', motivo: null } }), previo: evento({ pendiente: true }) }, usuario(true, 'tecnico')],
  ['Reabrir un pendiente (cierre null)', 'ALLOW', { method: 'update', uid: 'tecnico2', col: 'bitacoraEventos', data: evento({ pendiente: true, cierre: null }), previo: evento({ pendiente: false, cierre: { tipo: 'resuelto' } }) }, usuario(true, 'tecnico')],
  ['Crear el evento que resuelve un pendiente', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ turnoId: '2026-09-16_noche', resuelvePendiente: { id: 'p1', turnoId: '2026-09-15_tarde', equipo: 'Enzunchadora', descripcion: 'x', registradoPor: 'Matias Serpa' } }) }, usuario(true, 'tecnico')],
  ['Cierre que no es un mapa', 'DENY', { method: 'update', uid: 'tecnico2', col: 'bitacoraEventos', data: evento({ pendiente: false, cierre: 'resuelto' }), previo: evento() }, usuario(true, 'tecnico')],
]

// Evento con título, «Sin hora» y tipos nuevos (16-09, mockup WhatsApp + evento).
const CASOS_EVENTO_FLEXIBLE = [
  ['Evento SIN HORA (inicio vacío, sin término)', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ horaInicio: '', horaTermino: null, impacto: 'con-parada', minutosParada: 20 }) }, usuario(true, 'tecnico')],
  ['Sin hora pero CON término', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ horaInicio: '', horaTermino: '16:55' }) }, usuario(true, 'tecnico')],
  ['Hora de inicio mal escrita', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ horaInicio: '4:20pm' }) }, usuario(true, 'tecnico')],
  ['Tipo nuevo Correctivo con título', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ tipo: 'correctivo', titulo: 'Cambio de tubos fluorescentes' }) }, usuario(true, 'tecnico')],
  ['Tipo nuevo Planificado', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ tipo: 'planificado', titulo: null }) }, usuario(true, 'tecnico')],
  ['Tipo «Otro» escrito a mano', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ tipo: 'otro', tipoOtro: 'Mejora' }) }, usuario(true, 'tecnico')],
  ['Tipo que no existe', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ tipo: 'mejora' }) }, usuario(true, 'tecnico')],
  ['Tipo propio de 41 caracteres', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ tipo: 'otro', tipoOtro: 'x'.repeat(41) }) }, usuario(true, 'tecnico')],
  ['Título de 121 caracteres', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ titulo: 'x'.repeat(121) }) }, usuario(true, 'tecnico')],
  ['Título que no es texto', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ titulo: 42 }) }, usuario(true, 'tecnico')],
  ['Editar un evento para dejarlo sin hora', 'ALLOW', { method: 'update', uid: 'tecnico2', col: 'bitacoraEventos', data: evento({ horaInicio: '', horaTermino: null, actualizadoPorNombre: 'Otro' }), previo: evento() }, usuario(true, 'tecnico')],
]

// Repuestos usados y número del equipo (16-09).
const REPUESTO = { codigoSAP: '3300011612', nombre: 'SOPORTE SECCION 519437', cantidad: 1 }
const CASOS_REPUESTOS = [
  ['Evento con repuestos y número de equipo', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ equipoId: 'kRbjM6jI0bD60l5ABNPD', equipoCodigo: '720004447', repuestos: [REPUESTO, { ...REPUESTO, codigoSAP: '3300011654', cantidad: 2 }] }) }, usuario(true, 'tecnico')],
  ['Evento con 21 repuestos', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ repuestos: Array(21).fill(REPUESTO) }) }, usuario(true, 'tecnico')],
  ['Repuestos que no son lista', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ repuestos: '3300011612' }) }, usuario(true, 'tecnico')],
  ['Número de equipo de 41 caracteres', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ equipoCodigo: 'x'.repeat(41) }) }, usuario(true, 'tecnico')],
  // Ubicación a mano de un evento sin hora + índice del maestro (17-09).
  ['Evento SIN hora ubicado a mano (posicionMin)', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ horaInicio: '', horaTermino: null, posicionMin: 126.5 }) }, usuario(true, 'tecnico')],
  ['Evento CON hora y posicionMin', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ posicionMin: 10 }) }, usuario(true, 'tecnico')],
  ['posicionMin fuera de rango', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ horaInicio: '', horaTermino: null, posicionMin: 99999 }) }, usuario(true, 'tecnico')],
  ['Técnico lee el índice de repuestos', 'ALLOW', { method: 'get', uid: 'tecnico1', col: 'repuestosIndice', id: 'sap', previo: { m: {} } }, usuario(true, 'tecnico')],
  ['Técnico escribe el índice de repuestos', 'DENY', { method: 'update', uid: 'tecnico1', col: 'repuestosIndice', id: 'sap', data: { m: {} }, previo: { m: {} } }, usuario(true, 'tecnico')],
]

// Mover un evento de turno (17-09). Fechas relativas a HOY: el caso no envejece.
const fechaHace = (dias) => {
  const d = new Date(Date.now() - dias * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const enTurno = (fecha, banda, extra = {}) => evento({ turnoId: `${fecha}_${banda}`, fechaTurno: fecha, banda, ...extra })
const CASOS_MOVER_TURNO = [
  ['Mover un evento a un turno de ayer (id, fecha y banda juntos)', 'ALLOW', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: enTurno(fechaHace(1), 'noche', { actualizadoPorNombre: 'Danilo Cortes' }), previo: enTurno(fechaHace(0), 'dia') }, usuario(true, 'tecnico')],
  ['Mover cambiando solo el id (fecha y banda viejas)', 'DENY', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ turnoId: `${fechaHace(1)}_noche`, fechaTurno: fechaHace(0), banda: 'dia' }), previo: enTurno(fechaHace(0), 'dia') }, usuario(true, 'tecnico')],
  ['Mover a un turno de hace 20 días', 'DENY', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: enTurno(fechaHace(20), 'tarde'), previo: enTurno(fechaHace(0), 'dia') }, usuario(true, 'tecnico')],
  ['Mover a un turno de pasado mañana', 'DENY', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: enTurno(fechaHace(-2), 'dia'), previo: enTurno(fechaHace(0), 'dia') }, usuario(true, 'tecnico')],
  ['Mover de turno y de planta a la vez', 'DENY', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: enTurno(fechaHace(1), 'noche', { plantId: 'yal' }), previo: enTurno(fechaHace(0), 'dia') }, usuario(true, 'tecnico')],
]

// Pase de bitácora (16-09): teléfono con QR + PIN, sin documento en `users`.
// El único `get()` que llega a evaluarse es el de su bitacoraDispositivos
// (isAuthenticated() lo deja fuera antes de leer `users`).
const PASE = { pase_bitacora: true, plantId: 'chonchi', nombre: 'Leandro Igor' }
const dispositivo = (activo) => [
  { function: 'get', args: [{ anyValue: {} }], result: { value: { data: { activo, plantId: 'chonchi', nombre: 'Leandro Igor' } } } },
  { function: 'exists', args: [{ anyValue: {} }], result: { value: false } },
]
const delPase = (extra = {}) => evento({ creadoPor: 'pase_1', registradoPor: 'Leandro Igor', ...extra })
const conPase = (c) => ({ uid: 'pase_1', claims: PASE, ...c })
const PRES_PASE = 'chonchi_2026-09-16_tarde_disp-pase-0001'
const presenciaPase = (nombre) => ({ plantId: 'chonchi', turnoId: '2026-09-16_tarde', dispositivoId: 'disp-pase-0001', dispositivo: 'celular', nombre, editandoEventoId: null, vistoEn: '__AHORA__', uid: 'pase_1' })
const CASOS_PASE = [
  ['Pase CREA un evento firmado con su nombre', 'ALLOW', conPase({ method: 'create', col: 'bitacoraEventos', data: delPase() }), dispositivo(true)],
  ['Pase crea un evento a nombre de OTRO técnico', 'DENY', conPase({ method: 'create', col: 'bitacoraEventos', data: delPase({ registradoPor: 'Danilo Cortes' }) }), dispositivo(true)],
  ['Pase crea un evento de OTRA planta', 'DENY', conPase({ method: 'create', col: 'bitacoraEventos', data: delPase({ plantId: 'yal' }) }), dispositivo(true)],
  ['Pase QUITADO por el supervisor crea un evento', 'DENY', conPase({ method: 'create', col: 'bitacoraEventos', data: delPase() }), dispositivo(false)],
  ['Pase lee un evento', 'ALLOW', conPase({ method: 'get', col: 'bitacoraEventos', previo: evento() }), dispositivo(true)],
  ['Pase quitado lee un evento', 'DENY', conPase({ method: 'get', col: 'bitacoraEventos', previo: evento() }), dispositivo(false)],
  ['Pase edita un evento ajeno sin tocar el autor', 'ALLOW', conPase({ method: 'update', col: 'bitacoraEventos', data: evento({ descripcion: 'Corregido', actualizadoPorNombre: 'Leandro Igor' }), previo: evento() }), dispositivo(true)],
  ['Pase cambia el autor sin dejar su nombre como editor', 'DENY', conPase({ method: 'update', col: 'bitacoraEventos', data: evento({ estado: 'borrador', registradoPor: 'Leandro Igor' }), previo: evento({ estado: 'borrador', registradoPor: 'Danilo Cortes' }) }), dispositivo(true)],
  ['Pase corrige quién registró dejando su nombre como editor', 'ALLOW', conPase({ method: 'update', col: 'bitacoraEventos', data: evento({ registradoPor: 'Danilo Cortes', actualizadoPorNombre: 'Leandro Igor' }), previo: evento({ registradoPor: 'Mauricio Gallardo' }) }), dispositivo(true)],
  ['Pase corrige quién registró firmando como OTRO editor', 'DENY', conPase({ method: 'update', col: 'bitacoraEventos', data: evento({ registradoPor: 'Danilo Cortes', actualizadoPorNombre: 'Danilo Cortes' }), previo: evento({ registradoPor: 'Mauricio Gallardo' }) }), dispositivo(true)],
  ['Pase borra un evento PROPIO', 'ALLOW', conPase({ method: 'delete', col: 'bitacoraEventos', previo: delPase() }), dispositivo(true)],
  ['Pase borra un evento AJENO', 'DENY', conPase({ method: 'delete', col: 'bitacoraEventos', previo: evento() }), dispositivo(true)],
  ['Pase marca presencia con su nombre', 'ALLOW', conPase({ method: 'create', col: 'bitacoraPresencia', id: PRES_PASE, data: presenciaPase('Leandro Igor') }), dispositivo(true)],
  ['Pase marca presencia con OTRO nombre', 'DENY', conPase({ method: 'create', col: 'bitacoraPresencia', id: PRES_PASE, data: presenciaPase('Danilo Cortes') }), dispositivo(true)],
  ['Pase ajusta los técnicos del turno', 'ALLOW', conPase({ method: 'create', col: 'bitacoraTurnos', id: 'chonchi_2026-09-15_tarde', data: { plantId: 'chonchi', turnoId: '2026-09-15_tarde', presentes: ['Leandro Igor'], actualizadoPor: 'pase_1' } }), dispositivo(true)],
  ['Pase LEE la lista de técnicos', 'ALLOW', conPase({ method: 'get', col: 'bitacoraConfig', id: 'chonchi', previo: { agregados: [], ocultos: [], renombres: {} } }), dispositivo(true)],
  ['Pase CAMBIA la lista de técnicos', 'DENY', conPase({ method: 'create', col: 'bitacoraConfig', id: 'chonchi', data: { agregados: ['Intruso'], ocultos: [], renombres: {}, actualizadoPor: 'pase_1' } }), dispositivo(true)],
  ['Pase lee la jerarquía (buscador de equipos)', 'ALLOW', conPase({ method: 'get', col: 'hierarchy', id: 'n1', previo: { nombre: 'BAADER 142' } }), dispositivo(true)],
  ['Pase escribe en la jerarquía', 'DENY', conPase({ method: 'update', col: 'hierarchy', id: 'n1', data: { nombre: 'X' }, previo: { nombre: 'BAADER 142' } }), dispositivo(true)],
  ['Pase lee el calendario de turnos', 'ALLOW', conPase({ method: 'get', col: 'calendario_mantencion_state', id: 'current', previo: { x: 1 } }), dispositivo(true)],
  ['Pase lee INCIDENCIAS (fuera de la bitácora)', 'DENY', conPase({ method: 'get', col: 'incidents', id: 'i1', previo: { titulo: 'x' } }), dispositivo(true)],
  ['Pase lee USUARIOS', 'DENY', conPase({ method: 'get', col: 'users', id: 'orel', previo: { rol: 'admin' } }), dispositivo(true)],
  ['Pase se crea un perfil de técnico ACTIVO', 'DENY', conPase({ method: 'create', col: 'users', id: 'pase_1', data: { nombre: 'Leandro', apellido: 'Igor', email: 'x@y.cl', rol: 'tecnico', activo: true } }), dispositivo(true)],
  // Desde el 16-09 el pase busca repuestos para el evento (solo lectura del maestro).
  ['Pase lee el maestro de repuestos', 'ALLOW', conPase({ method: 'get', col: 'repuestos', id: '3300011612', previo: { codigoSAP: '3300011612' } }), dispositivo(true)],
  ['Pase quitado lee el maestro de repuestos', 'DENY', conPase({ method: 'get', col: 'repuestos', id: '3300011612', previo: { codigoSAP: '3300011612' } }), dispositivo(false)],
  ['Pase escribe en el maestro de repuestos', 'DENY', conPase({ method: 'update', col: 'repuestos', id: '3300011612', data: { codigoSAP: '3300011612', textoBreve: 'X' }, previo: { codigoSAP: '3300011612' } }), dispositivo(true)],
  ['Pase deja un registro de error (errorLogs)', 'DENY', conPase({ method: 'create', col: 'errorLogs', id: 'e1', data: { message: 'x' } }), dispositivo(true)],
  ['Pase lee el QR del pase', 'DENY', conPase({ method: 'get', col: 'bitacoraPases', id: 'chonchi', previo: { token: 'secreto' } }), dispositivo(true)],
  ['Pase lee los PIN', 'DENY', conPase({ method: 'get', col: 'bitacoraPines', id: 'chonchi__x', previo: { huella: 'x' } }), dispositivo(true)],
  ['Pase lee el índice de repuestos', 'ALLOW', conPase({ method: 'get', col: 'repuestosIndice', id: 'sap', previo: { m: {} } }), dispositivo(true)],
  ['Pase lee bodega (ubicación y stock)', 'ALLOW', conPase({ method: 'get', col: 'bodega', id: '3300135877', previo: { stockActual: 0 } }), dispositivo(true)],
  ['Pase escribe el nombre común en el maestro', 'DENY', conPase({ method: 'update', col: 'repuestos', id: '3300135877', data: { codigoSAP: '3300135877', nombresComunes: ['x'] }, previo: { codigoSAP: '3300135877' } }), dispositivo(true)],
  ['Pase lee SU dispositivo', 'ALLOW', conPase({ method: 'get', col: 'bitacoraDispositivos', id: 'pase_1', previo: { activo: true } }), dispositivo(true)],
  ['Pase lee el dispositivo de OTRO', 'DENY', conPase({ method: 'get', col: 'bitacoraDispositivos', id: 'pase_2', previo: { activo: true } }), dispositivo(true)],
  ['Pase se reactiva su dispositivo', 'DENY', conPase({ method: 'update', col: 'bitacoraDispositivos', id: 'pase_1', data: { activo: true }, previo: { activo: false } }), dispositivo(false)],
  ['Supervisor lee el QR del pase', 'ALLOW', { method: 'get', uid: 'jefe', col: 'bitacoraPases', id: 'chonchi', previo: { token: 'secreto' } }, usuario(true, 'supervisor')],
  ['Técnico (cuenta compartida) lee el QR del pase', 'DENY', { method: 'get', uid: 'tecnico1', col: 'bitacoraPases', id: 'chonchi', previo: { token: 'secreto' } }, usuario(true, 'tecnico')],
  ['Admin lee los PIN', 'DENY', { method: 'get', uid: 'jefe', col: 'bitacoraPines', id: 'chonchi__x', previo: { huella: 'x' } }, usuario(true, 'admin')],
  ['Admin escribe el pase desde la app', 'DENY', { method: 'update', uid: 'jefe', col: 'bitacoraPases', id: 'chonchi', data: { token: 'nuevo' }, previo: { token: 'x' } }, usuario(true, 'admin')],
  ['Supervisor lista los teléfonos', 'ALLOW', { method: 'get', uid: 'jefe', col: 'bitacoraDispositivos', id: 'pase_1', previo: { activo: true } }, usuario(true, 'supervisor')],
]

// Bitácora cooperativa (16-09): borradores que se guardan solos + presencia.
const PRES_ID = 'chonchi_2026-09-16_tarde_disp-celular-01'
const presencia = (extra = {}) => ({
  plantId: 'chonchi',
  turnoId: '2026-09-16_tarde',
  dispositivoId: 'disp-celular-01',
  dispositivo: 'celular',
  nombre: 'Danilo Cortes',
  editandoEventoId: null,
  vistoEn: '__AHORA__',
  uid: 'tecnico1',
  ...extra,
})
const CASOS_COOPERATIVA = [
  ['Borrador SIN descripción todavía', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ estado: 'borrador', descripcion: '', equipo: 'KNURO N1', dispositivo: 'celular' }) }, usuario(true, 'tecnico')],
  ['Publicado (listo) sin descripción', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ estado: 'listo', descripcion: '' }) }, usuario(true, 'tecnico')],
  ['Otro equipo PUBLICA el borrador de otro (lo continúa en el PC)', 'ALLOW', { method: 'update', uid: 'tecnico2', col: 'bitacoraEventos', data: evento({ estado: 'listo', descripcion: 'Se cambió el sensor B2.', dispositivo: 'pc' }), previo: evento({ estado: 'borrador', descripcion: '' }) }, usuario(true, 'tecnico')],
  ['Publicar un borrador dejando la descripción vacía', 'DENY', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ estado: 'listo', descripcion: '' }), previo: evento({ estado: 'borrador', descripcion: '' }) }, usuario(true, 'tecnico')],
  ['Estado inventado', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ estado: 'archivado' }) }, usuario(true, 'tecnico')],
  ['Dispositivo inventado', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ dispositivo: 'tablet' }) }, usuario(true, 'tecnico')],
  ['Otro técnico borra un BORRADOR ajeno', 'DENY', { method: 'delete', uid: 'tecnico2', col: 'bitacoraEventos', previo: evento({ estado: 'borrador' }) }, usuario(true, 'tecnico')],
  ['Un autoguardado atrasado DESPUBLICA un evento', 'DENY', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ estado: 'borrador' }), previo: evento({ estado: 'listo' }) }, usuario(true, 'tecnico')],
  ['Evento antiguo (sin estado) pasa a borrador', 'DENY', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ estado: 'borrador' }), previo: evento() }, usuario(true, 'tecnico')],
  ['Corregir quién registró un evento PUBLICADO (17-09)', 'ALLOW', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ registradoPor: 'Matias Serpa', actualizadoPorNombre: 'Danilo Cortes' }), previo: evento({ registradoPor: 'Danilo Cortes' }) }, usuario(true, 'tecnico')],
  ['Ajustar el autor de un BORRADOR propio', 'ALLOW', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ estado: 'borrador', registradoPor: 'Matias Serpa' }), previo: evento({ estado: 'borrador', registradoPor: 'mantencion.plantach' }) }, usuario(true, 'tecnico')],
  ['Editar un publicado sin tocar el autor', 'ALLOW', { method: 'update', uid: 'tecnico2', col: 'bitacoraEventos', data: evento({ estado: 'listo', registradoPor: 'Danilo Cortes', descripcion: 'x' }), previo: evento({ estado: 'listo', registradoPor: 'Danilo Cortes' }) }, usuario(true, 'tecnico')],
  ['Latido de presencia válido', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraPresencia', id: PRES_ID, data: presencia() }, usuario(true, 'tecnico')],
  ['Presencia editando un evento', 'ALLOW', { method: 'update', uid: 'tecnico1', col: 'bitacoraPresencia', id: PRES_ID, data: presencia({ editandoEventoId: 'evento1' }), previo: presencia() }, usuario(true, 'tecnico')],
  ['Presencia con la hora del TELÉFONO', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraPresencia', id: PRES_ID, data: presencia({ vistoEn: '2026-09-16T17:00:00Z' }) }, usuario(true, 'tecnico')],
  ['Presencia firmada por otro', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraPresencia', id: PRES_ID, data: presencia({ uid: 'tecnico2' }) }, usuario(true, 'tecnico')],
  ['Presencia con id que no calza', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraPresencia', id: 'chonchi_2026-09-16_tarde_otro-dispositivo', data: presencia() }, usuario(true, 'tecnico')],
  ['Presencia con campos de más', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraPresencia', id: PRES_ID, data: presencia({ ubicacion: 'sala de maquinas' }) }, usuario(true, 'tecnico')],
  ['Usuario inactivo marca presencia', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraPresencia', id: PRES_ID, data: presencia() }, usuario(false, 'tecnico')],
]

;(async () => {
  const cred = admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json')))
  const { access_token: token } = await cred.getAccessToken()
  const api = async (url, body) => {
    const r = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const j = await r.json()
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j.error ?? j).slice(0, 500)}`)
    return j
  }
  // Se prueba el ruleset PUBLICADO, no el archivo del repo: "está en el código" ≠ "está vivo".
  let source
  let origen
  if (LOCAL) {
    const archivo = path.join(__dirname, '..', 'firestore.rules')
    source = { files: [{ name: 'firestore.rules', content: fs.readFileSync(archivo, 'utf8') }] }
    origen = 'firestore.rules LOCAL (sin publicar)'
  } else {
    const { releases } = await api(`https://firebaserules.googleapis.com/v1/projects/${P}/releases`)
    const rel = releases.find((r) => r.name.endsWith('cloud.firestore'))
    const rs = await api(`https://firebaserules.googleapis.com/v1/${rel.rulesetName}`)
    source = rs.source
    origen = `PUBLICADO ${rel.rulesetName.split('/').pop()} · ${rel.updateTime}`
  }
  const contenido = source.files.map((f) => f.content).join('\n')
  if (contenido.includes('/bitacoraConfig/')) casos.push(...CASOS_TECNICOS)
  if (contenido.includes("'resuelvePendiente' in d")) casos.push(...CASOS_ENTREGA)
  if (contenido.includes('/bitacoraPresencia/')) casos.push(...CASOS_COOPERATIVA)
  if (contenido.includes("'tipoOtro' in d")) casos.push(...CASOS_EVENTO_FLEXIBLE)
  if (contenido.includes('function tienePaseBitacora')) casos.push(...CASOS_PASE)
  if (contenido.includes("'equipoCodigo' in d")) casos.push(...CASOS_REPUESTOS)
  if (contenido.includes('function turnoMovible')) casos.push(...CASOS_MOVER_TURNO)

  const testCases = casos.map(([, expectation, c, mocks]) => {
    const id = c.id ?? 'evento1'
    const ahora = new Date().toISOString()
    const req = { auth: auth(c.uid, c.claims), path: ruta(c.col, id), method: c.method, time: ahora }
    // `__AHORA__` = la hora de ESTA petición (lo que pone serverTimestamp()).
    const conHora = (d) => (d && d.vistoEn === '__AHORA__' ? { ...d, vistoEn: ahora } : d)
    if (c.data) req.resource = { __name__: ruta(c.col, id), id, data: conHora(c.data) }
    if (c.previo) c.previo = conHora(c.previo)
    return {
      expectation,
      request: req,
      ...(c.previo ? { resource: { __name__: ruta(c.col, id), id, data: c.previo } } : {}),
      functionMocks: mocks,
    }
  })
  const res = await api(`https://firebaserules.googleapis.com/v1/projects/${P}:test`, { source, testSuite: { testCases } })
  let fallas = 0
  res.testResults.forEach((t, i) => {
    const ok = t.state === 'SUCCESS'
    if (!ok) fallas++
    const detalle = ok ? '' : ` ← ${JSON.stringify(t.debugMessages ?? t.errorPosition ?? '').slice(0, 300)}`
    console.log(`${ok ? 'OK   ' : 'FALLA'} [${casos[i][1]}] ${casos[i][0]}${detalle}`)
  })
  console.log(`\n${casos.length - fallas}/${casos.length} casos como se esperaba · ${origen}`)
  // exitCode y no process.exit(): en Windows (Node 24) cortar con conexiones de
  // fetch abiertas revienta libuv al salir y el código de salida queda basura.
  process.exitCode = fallas ? 2 : 0
})().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})

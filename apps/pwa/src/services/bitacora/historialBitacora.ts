import type { EventoBitacora, TurnoMantencion } from './bitacora.types'
import { autorVisible } from './bitacora.types'
import { minutosParadaDe, resumirBitacora, type ResumenBitacora } from './resumenBitacora'
import { fechaLocal, turnoDesdeId } from './turnoMantencion'
import { soloListos } from './borradores'
import { equipoConCodigo, nombreConComun, nombreRepuesto, normalizarRepuestos } from './presentacionEvento'

/**
 * Historial: lo que suman los turnos ya registrados (mockup aprobado 15-09-2026).
 *
 * No hay datos nuevos que llenar: todo sale de los eventos de la bitácora. Por
 * eso cada número se calcula con las MISMAS funciones del turno
 * (`resumirBitacora`), y no con una cuenta paralela que se desincronice.
 */

export interface FilaTurno {
  turnoId: string
  turno: TurnoMantencion
  resumen: ResumenBitacora
  /** Pendientes que este turno dejó abiertos y siguen sin cerrar. */
  pendientesAbiertos: number
  /**
   * El turno que está corriendo ahora: sus números son PARCIALES. Sin esta
   * marca, un turno con media hora de vida se leía igual que uno cerrado, en la
   * pantalla y en el correo (revisión 15-09).
   */
  enCurso: boolean
}

export interface EquipoDelPeriodo {
  equipo: string
  minutos: number
  paradas: number
  /** Parte del total de minutos parados del período (0-1). */
  parte: number
}

/** Un repuesto (código SAP) sumado en el período (mockup aprobado 17-09-2026). */
export interface RepuestoDelPeriodo {
  codigoSAP: string
  nombre: string
  nombreComun: string
  /** Unidades usadas en total. */
  unidades: number
  /** En cuántos eventos salió. */
  eventos: number
  /** Equipos en los que se usó (con su número, si lo tiene). */
  equipos: string[]
  /** Turno del último uso ('' si no se pudo leer). */
  ultimoTurnoId: string
}

export interface ResumenPeriodo {
  desde: string
  hasta: string
  turnos: number
  eventos: number
  /**
   * Intervenciones que TOCARON la línea: las que la detuvieron más las que se
   * hicieron sin detenerla. Es el universo comparable de la tesis; contar
   * también los registros «No aplica» (rondas, novedades) daba a entender que
   * el resto había detenido la máquina (revisión 15-09).
   */
  conImpacto: number
  /** Registros sin impacto en producción («No aplica»). */
  sinImpacto: number
  sinDetener: number
  /** Parte de las intervenciones sobre la línea hechas sin detenerla (0-1). */
  parteSinDetener: number
  minutosParada: number
  conParada: number
  mttrMin: number | null
  pendientesCerrados: number
  pendientesAbiertos: number
  turnosSinParada: number
  equipos: EquipoDelPeriodo[]
  porTecnico: Array<{ nombre: string; eventos: number }>
  /** Todos los repuestos del período, de más a menos unidades. */
  repuestos: RepuestoDelPeriodo[]
  unidadesRepuestos: number
}

const normalizarEquipo = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')

/** `YYYY-MM-DD` de hace `dias` días (incluye hoy). */
export function fechaDesde(dias: number, hoy: Date = new Date()): string {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1))
  return fechaLocal(d)
}

/** Un renglón por turno CON eventos, del más reciente al más antiguo. */
export function filasPorTurno(eventos: readonly EventoBitacora[], ahora: Date = new Date()): FilaTurno[] {
  const porTurno = new Map<string, EventoBitacora[]>()
  for (const e of soloListos(eventos)) {
    if (!e.turnoId) continue
    porTurno.set(e.turnoId, [...(porTurno.get(e.turnoId) ?? []), e])
  }
  return [...porTurno.entries()]
    .map(([turnoId, lista]) => ({ turnoId, turno: turnoDesdeId(turnoId), lista }))
    .filter((x): x is { turnoId: string; turno: TurnoMantencion; lista: EventoBitacora[] } => Boolean(x.turno))
    .sort((a, b) => b.turno.inicio.getTime() - a.turno.inicio.getTime())
    .map(({ turnoId, turno, lista }) => ({
      turnoId,
      turno,
      resumen: resumirBitacora(lista),
      pendientesAbiertos: lista.filter((e) => e.pendiente && !e.cierre).length,
      enCurso: turno.inicio <= ahora && ahora < turno.fin,
    }))
}

export function resumirPeriodo(eventos: readonly EventoBitacora[], desde: string, hasta: string): ResumenPeriodo {
  const filas = filasPorTurno(eventos)
  // Los mismos eventos que las filas: uno con `turnoId` corrupto no puede sumar
  // al total y no aparecer en ningún turno de la lista (revisión 15-09).
  const validos = soloListos(eventos).filter((e) => e.turnoId && turnoDesdeId(e.turnoId))
  const total = resumirBitacora(validos)

  const porEquipo = new Map<string, { equipo: string; minutos: number; paradas: number }>()
  for (const e of validos) {
    const parada = minutosParadaDe(e)
    if (parada == null || !e.equipo?.trim()) continue
    const k = normalizarEquipo(e.equipo)
    const actual = porEquipo.get(k) ?? { equipo: e.equipo.trim(), minutos: 0, paradas: 0 }
    actual.minutos += parada
    actual.paradas += 1
    porEquipo.set(k, actual)
  }
  const equipos = [...porEquipo.values()]
    .sort((a, b) => b.minutos - a.minutos || b.paradas - a.paradas)
    .map((x) => ({ ...x, parte: total.minutosParada > 0 ? x.minutos / total.minutosParada : 0 }))

  const porTecnico = new Map<string, number>()
  for (const e of validos) {
    const n = autorVisible(e).trim()
    if (n) porTecnico.set(n, (porTecnico.get(n) ?? 0) + 1)
  }

  // Repuestos: lo que Mantención sacó de bodega para la línea, por código SAP.
  const porRepuesto = new Map<string, RepuestoDelPeriodo & { ultimoMs: number }>()
  for (const e of validos) {
    const ms = turnoDesdeId(e.turnoId)?.inicio.getTime() ?? 0
    for (const r of normalizarRepuestos(e.repuestos)) {
      const actual = porRepuesto.get(r.codigoSAP) ?? {
        codigoSAP: r.codigoSAP,
        nombre: '',
        nombreComun: '',
        unidades: 0,
        eventos: 0,
        equipos: [],
        ultimoTurnoId: '',
        ultimoMs: -1,
      }
      actual.unidades += r.cantidad
      actual.eventos += 1
      if (r.nombre && !actual.nombre) actual.nombre = r.nombre
      if (r.nombreComun && !actual.nombreComun) actual.nombreComun = r.nombreComun
      const equipo = equipoConCodigo(e)
      if (equipo && !actual.equipos.includes(equipo)) actual.equipos.push(equipo)
      if (ms > actual.ultimoMs) {
        actual.ultimoMs = ms
        actual.ultimoTurnoId = e.turnoId
      }
      porRepuesto.set(r.codigoSAP, actual)
    }
  }
  const repuestos = [...porRepuesto.values()]
    .sort((a, b) => b.unidades - a.unidades || b.eventos - a.eventos || tituloRepuesto(a).localeCompare(tituloRepuesto(b), 'es'))
    .map(({ ultimoMs: _ms, ...r }) => r)

  return {
    desde,
    hasta,
    turnos: filas.length,
    eventos: total.eventos,
    conImpacto: total.conParada + total.enVentana,
    sinImpacto: total.eventos - total.conParada - total.enVentana,
    sinDetener: total.enVentana,
    parteSinDetener: total.conParada + total.enVentana > 0 ? total.enVentana / (total.conParada + total.enVentana) : 0,
    minutosParada: total.minutosParada,
    conParada: total.conParada,
    mttrMin: total.mttrMin,
    pendientesCerrados: total.pendientesCerrados,
    // Lo que sigue abierto HOY de lo registrado en el período.
    pendientesAbiertos: validos.filter((e) => e.pendiente && !e.cierre).length,
    turnosSinParada: filas.filter((f) => f.resumen.conParada === 0).length,
    equipos: equipos.slice(0, 5),
    porTecnico: [...porTecnico.entries()]
      .map(([nombre, n]) => ({ nombre, eventos: n }))
      .sort((a, b) => b.eventos - a.eventos)
      .slice(0, 6),
    repuestos,
    unidadesRepuestos: repuestos.reduce((s, r) => s + r.unidades, 0),
  }
}

/** "Filtro FRL" (nombre común), si no el del maestro, si no el código. */
export function tituloRepuesto(r: Pick<RepuestoDelPeriodo, 'codigoSAP' | 'nombre' | 'nombreComun'>): string {
  return r.nombreComun || nombreRepuesto(r) || r.codigoSAP
}

/** "3300135877 · Filtro 1/2 purga…" bajo el título (solo el código si el título ya es el nombre del maestro). */
export function detalleRepuesto(r: Pick<RepuestoDelPeriodo, 'codigoSAP' | 'nombre' | 'nombreComun'>): string {
  const sap = nombreRepuesto(r)
  return r.nombreComun && sap ? `${r.codigoSAP} · ${sap}` : r.codigoSAP
}

/** Un renglón para el correo, el texto plano y el PDF: "3300135877 · Filtro FRL (Filtro 1/2…) · ×1 · 1 evento · EMPACADORA E-PACK (720004590)". */
export function lineaRepuestoDelPeriodo(r: RepuestoDelPeriodo): string {
  return [r.codigoSAP, nombreConComun(r), `×${r.unidades}`, `${r.eventos} ${r.eventos === 1 ? 'evento' : 'eventos'}`, r.equipos.join(', ')]
    .filter(Boolean)
    .join(' · ')
}

/**
 * "De 61 intervenciones sobre la línea, 43 se hicieron sin detenerla."
 *
 * El denominador son las intervenciones CON impacto declarado (detuvieron la
 * máquina o se hicieron en ventana). Antes era el total de eventos, así que un
 * período con dos rondas y un ajuste en colación decía "de 3 intervenciones, 1
 * sin detener la línea" y daba a entender dos paradas que nunca existieron.
 * Esta frase la lee gerencia: no puede sugerir algo que los datos no dicen.
 */
export function tesisDelPeriodo(r: ResumenPeriodo): string {
  if (!r.eventos) return 'Todavía no hay eventos registrados en este período.'
  if (!r.conImpacto) {
    return `${r.eventos} ${r.eventos === 1 ? 'registro' : 'registros'} en el período, ${
      r.eventos === 1 ? 'sin impacto' : 'ninguno con impacto'
    } en producción.`
  }
  const base = `${r.conImpacto} ${r.conImpacto === 1 ? 'intervención' : 'intervenciones'} sobre la línea`
  if (!r.sinDetener) return `${base.charAt(0).toUpperCase()}${base.slice(1)}, todas con la máquina detenida.`
  return `De ${base}, ${r.sinDetener} ${r.sinDetener === 1 ? 'se hizo' : 'se hicieron'} sin detenerla.`
}

export function porcentaje(parte: number): string {
  return `${Math.round(parte * 100)}%`
}

/**
 * Textos de ayuda del Duelo para PC: lo que sale en el globo al pasar el mouse, enfocar con el teclado o tocar un
 * rótulo, una barra, una detención, una celda o una fila. Son funciones puras para poder probarlas: ninguna inventa un
 * dato, solo ordenan lo que el Duelo ya calculó (nombre, hora, minutos, unidad) y explican la regla que ya existe en
 * `duelo.ts` (cómo se cuenta cada cosa y quién gana el punto).
 */
import type { FraseEmpate } from './duelo'
import { EMPATE_HORA, UMBRAL_SOSTENIDA, type FilaRiel, type FilaJornada } from './dueloDatosPC'

export const int = (n: number) => Math.round(n).toLocaleString('es-CL')
export const dec = (n: number, d = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })

/** «1.ª hora» a partir del minuto de producción. */
export const horaDeMinuto = (min: number) => Math.floor(min / 60) + 1
export const ordinalHora = (n: number) => `${n}.ª hora`
const plural = (n: number, uno: string, varios: string) => `${int(n)} ${Math.round(n) === 1 ? uno : varios}`

const PCT90 = `${Math.round(UMBRAL_SOSTENIDA * 100)} %`

// ── Rótulos de carril: qué mide, cómo se calcula y en qué unidad ─────────────

export interface NombresPar { a: string; b: string }

export function tipsCarriles(n: NombresPar, esperado: number | null): Record<'ritmo' | 'gano' | 'sost' | 'paradas' | 'micro', string> {
  const esp = esperado != null ? ` El ritmo esperado de la línea es ${dec(esperado)} pz/min.` : ''
  return {
    ritmo: `Ritmo por hora. Unidad: piezas por minuto (pz/min). Es el promedio de cada hora de producción, contada desde la primera pieza del turno. En cada hora, la barra de la izquierda es ${n.a} y la de la derecha ${n.b}. Las rayas punteadas marcan el ritmo esperado y su ${PCT90}.${esp}`,
    gano: `Quién ganó cada hora. Compara el ritmo de la misma hora de los dos equipos: gana el que sacó más piezas por minuto, y la cifra es la diferencia en pz/min. Una diferencia menor a ${dec(EMPATE_HORA, 2)} pz/min es empate. A la derecha, las horas ganadas por cada equipo; la hora que aún corre no se cuenta.`,
    sost: `Minutos a buen ritmo. Unidad: minutos de producción. Cuenta los minutos en que la línea rindió al menos ${PCT90} de lo esperado. La barra de color es cada minuto a buen ritmo; el tramo claro es lo que duró el turno. No da punto: es un dato para analizar.`,
    paradas: 'Detenciones de 5 minutos o más. Cada bloque es una detención y su largo es su duración; al lado va la causa. El dueño de la detención se ve por el relleno: con trama, Mantención; color liso, Externo; gris, Sin imputar; contorno punteado, Programada (colación, reunión).',
    micro: 'Micro detenciones. Unidad: minutos perdidos en cada hora de producción. Son las detenciones cortas que la máquina registra como «Micro Detención»; se suman los minutos de las máquinas de la línea. Más oscuro es más minutos; menos es mejor.',
  }
}

export const TIPS_LEYENDA = {
  mantencion: 'Mantención: la detención tiene una causa técnica de equipos. No resta puntos al equipo; sus piezas se suman a su carrera.',
  externo: 'Externo: la causa viene de fuera de la línea (materia prima, rechazo, servicios).',
  sinImputar: 'Sin imputar: nadie anotó la causa de la detención.',
  programada: 'Programada: detención prevista, como la colación y la reunión de inicio. No cuenta como pérdida.',
} as const

// ── Barras, detenciones y celdas ─────────────────────────────────────────────

export interface LadoHora { nombre: string; v: number | null; parcial: boolean }

/** Una hora del eje: el ritmo de los dos equipos y quién la ganó. Se usa en la barra y en la celda de «quién ganó». */
export function tipHora(hora: number, a: LadoHora | null, b: LadoHora | null): string {
  const par = (x: LadoHora) => `${x.nombre} ${x.v == null ? 'sin dato' : `${dec(x.v)} pz/min`}${x.parcial ? ' (hora en curso)' : ''}`
  const lados = [a, b].filter((x): x is LadoHora => x != null)
  const base = `${ordinalHora(hora)} · ${lados.map(par).join(' · ')}`
  if (!a || !b || a.v == null || b.v == null) return base
  const dif = Math.abs(a.v - b.v)
  return dif < EMPATE_HORA ? `${base} · empate` : `${base} · gana ${(a.v > b.v ? a : b).nombre} por ${dec(dif)} pz/min`
}

export type DuenoParada = 'mantencion' | 'externo' | 'sin-imputar' | 'prog'
const DUENO_TXT: Record<DuenoParada, string> = { mantencion: 'Mantención', externo: 'externo', 'sin-imputar': 'sin imputar', prog: 'programada' }

export function tipParada(p: { nombre: string; desdeMin: number; causa: string; min: number; dueno: DuenoParada }): string {
  return `${p.nombre} · ${ordinalHora(horaDeMinuto(p.desdeMin))} · ${p.causa} · ${int(p.min)} min · dueño: ${DUENO_TXT[p.dueno]}`
}

export const tipParadasTotal = (nombre: string, n: number, min: number) =>
  `${nombre} · ${plural(n, 'detención', 'detenciones')} de 5 min o más, ${int(min)} min en total (sin contar las programadas)`

export const tipMicro = (nombre: string, hora: number, min: number, enCurso: boolean) =>
  `${nombre} · ${ordinalHora(hora)} · ${dec(min)} min perdidos en micro detenciones${enCurso ? ' (hora en curso)' : ''}`

export const tipMicroTotal = (nombre: string, min: number | null) =>
  min == null ? `${nombre} · sin dato de micro detenciones` : `${nombre} · ${dec(min)} min perdidos en micro detenciones en todo el turno`

export const tipSost = (nombre: string, min: number | null, esperado: number | null) =>
  min == null
    ? `${nombre} · sin dato de minutos a buen ritmo en este turno`
    : `${nombre} · ${int(min)} min a buen ritmo: minutos en que la línea rindió al menos ${PCT90} de lo esperado${esperado != null ? ` (${dec(esperado * UMBRAL_SOSTENIDA)} pz/min o más)` : ''}`

// ── Filas del indicador a indicador (riel) ───────────────────────────────────

/** Qué gana el punto y por qué, por fila. Las reglas son las de `duelo.ts` (comparar / combinar). */
export function tipFilaKpi(f: FilaRiel, o: { enCurso: boolean; unidad: 'carros' | 'silletas' | null; soloHoy: boolean; etiquetaPuesto?: string }): string {
  if (o.soloHoy) return `${f.rotulo}: ${f.sub}. Este turno corre solo, así que no suma ni quita puntos; el valor de la derecha es su promedio de referencia.`
  if (f.id === 'carrera') return `Carrera: piezas del turno${o.enCurso ? ' a la misma hora de producción' : ', con las piezas que Mantención les quitó sumadas'}. Punto: gana quien sacó más piezas.`
  if (f.id === 'ritmo') return 'Ritmo andando: piezas por minuto mientras la línea produce. Punto: gana el ritmo más alto.'
  if (f.id === 'micro') return 'Micro detención: minutos perdidos por hora en detenciones cortas de las máquinas. Punto: gana quien perdió menos minutos.'
  if (f.id === 'arranque') return `Arranque y cierre: minutos desde el inicio planificado hasta que el turno arranca (menos es mejor; Eviscerado, al ${PCT90} del ritmo esperado; Filete, con la primera pieza) y piezas de la última hora (más es mejor). Punto: gana quien gana las dos; se firma al terminar el turno.`
  if (f.id === 'alim') return 'Alimentación: puntos ganados entre los puestos de alimentación. Cada puesto da un punto; el detalle por puesto se ve con más ancho de pantalla.'
  if (f.id.startsWith('alim-')) {
    const u = o.unidad ?? 'puestos'
    return `Alimentación de ${o.etiquetaPuesto ?? 'este puesto'}: porcentaje de ${u} con pieza sobre el tiempo andando. Punto: gana el porcentaje más alto.`
  }
  return `${f.rotulo}: ${f.sub}`
}

export function tipFilaJornada(f: FilaJornada, n: { cardenas: string; rebolledo: string }): string {
  const fecha = `${f.jornada.slice(8, 10)}/${f.jornada.slice(5, 7)}`
  const pz = (x: FilaJornada['noche']) => (x ? `${n[x.eq]} ${int(x.pz)} pz` : 'por jugar')
  const base = `Jornada ${fecha} · noche: ${pz(f.noche)} · día: ${pz(f.dia)}`
  if (f.vivo) return `${base} · ${f.vivo}`
  if (!f.ganador) return base
  if (f.ganador === 'empate') return `${base} · empate`
  const pts = f.puntos ? ` · puntos ${Math.max(f.puntos.c, f.puntos.r)} a ${Math.min(f.puntos.c, f.puntos.r)}` : ''
  const dif = f.dif != null ? ` · ventaja en piezas del ganador: ${f.dif > 0 ? '+' : f.dif < 0 ? '−' : ''}${int(Math.abs(f.dif))} pz${f.dif < 0 ? ' (ganó por puntos con menos piezas)' : ''}` : ''
  return `${base} · ganó ${n[f.ganador]}${pts}${dif}`
}

// ── Carrera: adelante / atrás, y lo que le falta al que va atrás ─────────────

/** «1 h 19 min», «45 min», «2 h». */
export function duracion(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  return h === 0 ? `${r} min` : r === 0 ? `${h} h` : `${h} h ${r} min`
}

/** La ventaja a la misma hora, en el lenguaje del glosario: «Cárdenas 280 adelante» / «Cárdenas 280 atrás»; sin diferencia, «parejos». */
export function textoAdelanteAtras(nombre: string, hechasMenosRival: number): string {
  const n = Math.round(hechasMenosRival)
  return n === 0 ? 'parejos' : n > 0 ? `${nombre} ${int(n)} adelante` : `${nombre} ${int(-n)} atrás`
}

/**
 * La frase de empate de la carrera: lo que necesita el que va atrás contra lo que hace y lo que puede. Ej.: «Cárdenas
 * necesita 37,8 pz/min en 1 h 19 min para llegar a las 13.400 de Rebolledo; va a 37,2 y su techo es 42,2.»
 */
export function textoFraseEmpate(f: FraseEmpate, n: { equipo: string; rival: string }): string {
  const va = f.ritmoActual != null ? `; va a ${dec(f.ritmoActual)}` : ''
  const techo = f.techo != null ? `${f.ritmoActual != null ? ' y' : ';'} su techo es ${dec(f.techo)}` : ''
  const cierre = f.alcanzable === false ? ' Con el techo de la línea no alcanza.' : ''
  return `${n.equipo} necesita ${dec(f.necesitaPzMin)} pz/min en ${duracion(f.minutosQueQuedan)} para llegar a las ${int(f.metaPz)} de ${n.rival}${va}${techo}.${cierre}`
}

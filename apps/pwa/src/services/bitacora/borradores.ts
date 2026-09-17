import type { EventoBitacora, ImpactoEvento, TipoEvento, TurnoMantencion } from './bitacora.types'
import { turnoDesdeId } from './turnoMantencion'
import { normalizarRepuestos } from './presentacionEvento'

/**
 * Borradores y edición entre varios (mockup aprobado 16-09-2026).
 *
 * Un evento se guarda SOLO mientras se escribe, marcado `borrador`: lo ve todo
 * el turno y se puede terminar en otro equipo. No cuenta en ningún número ni
 * sale en el correo hasta que alguien toca «Listo».
 */

export function esBorrador(e: Pick<EventoBitacora, 'estado'>): boolean {
  return e.estado === 'borrador'
}

/** Los eventos publicados. TODO número, correo, PDF o entrega de turno parte de aquí. */
export function soloListos<T extends Pick<EventoBitacora, 'estado'>>(eventos: readonly T[]): T[] {
  return eventos.filter((e) => !esBorrador(e))
}

/**
 * Borradores que quedaron sin publicar en turnos ANTERIORES, del más reciente
 * al más antiguo. Un borrador no cuenta en nada hasta que alguien lo publica:
 * si el turno cerró con uno a medio escribir, el turno siguiente tiene que
 * verlo o se pierde para siempre (revisión 16-09).
 */
export function borradoresAnteriores(eventos: readonly EventoBitacora[], turno: Pick<TurnoMantencion, 'id' | 'inicio'>): EventoBitacora[] {
  return eventos
    .filter((e) => esBorrador(e) && e.turnoId !== turno.id)
    .map((e) => ({ e, t: turnoDesdeId(e.turnoId) }))
    .filter((x): x is { e: EventoBitacora; t: TurnoMantencion } => Boolean(x.t) && x.t!.inicio < turno.inicio)
    .sort((a, b) => b.t.inicio.getTime() - a.t.inicio.getTime() || (b.e.horaInicio ?? '').localeCompare(a.e.horaInicio ?? ''))
    .map((x) => x.e)
}

/**
 * ¿Hay algo que valga la pena guardar? Abrir la hoja y cerrarla sin escribir
 * no puede dejar un borrador vacío en la bitácora de todos.
 */
export function tieneContenido(d: { descripcion: string; equipo: string; titulo?: string | null; fotos: readonly unknown[] }): boolean {
  return d.descripcion.trim().length > 0 || d.equipo.trim().length > 0 || Boolean(d.titulo?.trim()) || d.fotos.length > 0
}

/**
 * Los campos del formulario en su forma de pantalla (todo texto), para poder
 * compararlos contra lo que llega del servidor sin falsos cambios (`null` vs `''`).
 */
export interface CamposFormulario {
  tipo: TipoEvento
  /** El tipo escrito a mano (solo cuenta con `tipo: 'otro'`). */
  tipoOtro: string
  equipo: string
  equipoId: string | null
  /** Número del equipo elegido ('' si es texto libre). Va con el equipo. */
  equipoCodigo: string
  titulo: string
  /** Repuestos usados, como JSON normalizado (para comparar sin falsos cambios). */
  repuestos: string
  descripcion: string
  /** `''` = «Sin hora» (y entonces `horaTermino` también es `''`). */
  horaInicio: string
  horaTermino: string
  /** Solo sin hora: minutos desde el inicio del turno donde se ubicó ('' = donde se registró). */
  posicion: string
  impacto: ImpactoEvento
  minutos: string
  ventana: string
  pendiente: boolean
}

export type CampoFormulario = keyof CamposFormulario

export const ETIQUETA_CAMPO: Record<CampoFormulario, string> = {
  tipo: 'el tipo',
  tipoOtro: 'el tipo',
  equipo: 'el equipo',
  equipoId: 'el equipo',
  equipoCodigo: 'el equipo',
  titulo: 'el título',
  repuestos: 'los repuestos',
  descripcion: '«Qué pasó»',
  horaInicio: 'la hora de inicio',
  horaTermino: 'la hora de término',
  posicion: 'la ubicación en el turno',
  impacto: 'el impacto',
  minutos: 'los minutos de parada',
  ventana: 'la ventana',
  pendiente: '«Queda pendiente»',
}

type EventoFormulario = Pick<
  EventoBitacora,
  | 'tipo'
  | 'tipoOtro'
  | 'equipo'
  | 'equipoId'
  | 'equipoCodigo'
  | 'repuestos'
  | 'titulo'
  | 'descripcion'
  | 'horaInicio'
  | 'horaTermino'
  | 'posicionMin'
  | 'impacto'
  | 'minutosParada'
  | 'ventana'
  | 'pendiente'
>

export function aFormulario(e: EventoFormulario): CamposFormulario {
  return {
    tipo: e.tipo,
    tipoOtro: e.tipoOtro ?? '',
    equipo: e.equipo ?? '',
    equipoId: e.equipoId ?? null,
    equipoCodigo: e.equipoId ? (e.equipoCodigo ?? '') : '',
    titulo: e.titulo ?? '',
    repuestos: JSON.stringify(normalizarRepuestos(e.repuestos)),
    descripcion: e.descripcion ?? '',
    horaInicio: e.horaInicio ?? '',
    // Sin hora no hay término: el formulario lo muestra vacío, igual que el servidor.
    horaTermino: e.horaInicio ? (e.horaTermino ?? '') : '',
    posicion: !e.horaInicio && typeof e.posicionMin === 'number' ? String(e.posicionMin) : '',
    impacto: e.impacto,
    minutos: e.minutosParada != null ? String(e.minutosParada) : '',
    ventana: e.ventana ?? '',
    pendiente: Boolean(e.pendiente),
  }
}

const CAMPOS: readonly CampoFormulario[] = [
  'tipo',
  'tipoOtro',
  'equipo',
  'equipoId',
  'equipoCodigo',
  'titulo',
  'repuestos',
  'descripcion',
  'horaInicio',
  'horaTermino',
  'posicion',
  'impacto',
  'minutos',
  'ventana',
  'pendiente',
]

export interface Fusion {
  /** Lo que debe quedar en pantalla. */
  valores: CamposFormulario
  /** Lo último que se sabe del servidor (la nueva referencia). */
  base: CamposFormulario
  /**
   * Campos que los DOS cambiaron distinto: queda lo local en pantalla y se
   * avisa, con el valor del otro a mano para adoptarlo.
   */
  conflictos: CampoFormulario[]
}

/**
 * Fusión campo por campo entre lo que hay en pantalla y lo que llegó de otro
 * equipo, respecto de la última versión conocida del servidor (`base`):
 *
 * - el otro cambió y yo no toqué ese campo → se adopta lo suyo, sin preguntar;
 * - yo cambié y el otro no → queda lo mío;
 * - los dos cambiamos lo mismo → sin conflicto;
 * - los dos cambiamos distinto → queda lo mío en pantalla y se AVISA.
 *
 * Así «empezar en el celular y seguir en el PC» funciona aunque la hoja siga
 * abierta en el celular, y nadie pisa en silencio lo que escribió otro.
 */
export function fusionarFormulario(base: CamposFormulario, local: CamposFormulario, remoto: CamposFormulario): Fusion {
  const valores: CamposFormulario = { ...local }
  const nuevaBase: CamposFormulario = { ...base }
  const conflictos: CampoFormulario[] = []
  const escribir = (destino: CamposFormulario, campo: CampoFormulario, valor: CamposFormulario[CampoFormulario]) => {
    ;(destino as unknown as Record<string, unknown>)[campo] = valor
  }
  for (const campo of CAMPOS) {
    const b = base[campo]
    const l = local[campo]
    const r = remoto[campo]
    if (r === b) continue
    // El servidor cambió: esa es la nueva referencia.
    escribir(nuevaBase, campo, r)
    if (l === b || l === r) escribir(valores, campo, r)
    else conflictos.push(campo)
  }
  // El vínculo con la jerarquía va con el texto del equipo: si se adoptó el
  // equipo del otro, también su `equipoId`.
  if (valores.equipo === remoto.equipo && local.equipo !== remoto.equipo) {
    valores.equipoId = remoto.equipoId
    valores.equipoCodigo = remoto.equipoCodigo
  }
  // «Sin hora» es un solo cambio que toca las dos horas: si se adoptó el paso
  // del otro a «Sin hora» (o de vuelta a con hora), también su término.
  if (
    valores.horaInicio === remoto.horaInicio &&
    local.horaInicio !== remoto.horaInicio &&
    (remoto.horaInicio === '' || local.horaInicio === '')
  ) {
    valores.horaTermino = remoto.horaTermino
  }
  return {
    valores,
    base: nuevaBase,
    // «equipo» y «equipoId» (y el tipo y su texto) son un solo aviso para quien lee.
    conflictos: conflictos.filter(
      (c) =>
        !((c === 'equipoId' || c === 'equipoCodigo') && conflictos.includes('equipo')) &&
        !(c === 'equipoCodigo' && conflictos.includes('equipoId')) &&
        !(c === 'tipoOtro' && conflictos.includes('tipo')),
    ),
  }
}

/** Nombres de los campos del DOCUMENTO que corresponden a cada campo del formulario. */
const CAMPOS_DOC: Record<CampoFormulario, readonly string[]> = {
  // El tipo y su texto van juntos: `tipoOtro` solo vale con `tipo: 'otro'`.
  tipo: ['tipo', 'tipoOtro'],
  tipoOtro: ['tipo', 'tipoOtro'],
  equipo: ['equipo', 'equipoId', 'equipoCodigo'],
  equipoId: ['equipo', 'equipoId', 'equipoCodigo'],
  equipoCodigo: ['equipo', 'equipoId', 'equipoCodigo'],
  titulo: ['titulo'],
  repuestos: ['repuestos'],
  descripcion: ['descripcion'],
  // Cada hora por separado: «Sin hora» cambia las dos y así se escriben las dos,
  // pero cambiar solo el término no debe reescribir un inicio que otro cambió.
  horaInicio: ['horaInicio'],
  horaTermino: ['horaTermino'],
  posicion: ['posicionMin'],
  // Van juntos: los minutos y la ventana se guardan según el impacto.
  impacto: ['impacto', 'minutosParada', 'ventana'],
  minutos: ['impacto', 'minutosParada', 'ventana'],
  ventana: ['impacto', 'minutosParada', 'ventana'],
  pendiente: ['pendiente'],
}

/**
 * Los campos del documento que HAY que escribir: solo los que cambiaron
 * respecto de lo último que se sabe del servidor.
 *
 * Escribir el documento entero en cada guardado hacía que un guardado atrasado
 * (señal mala: queda en la cola del teléfono) devolviera a su valor viejo lo
 * que otro equipo cambió en el intertanto, sin aviso (revisión 16-09).
 */
export function camposACambiar(
  base: CamposFormulario,
  local: CamposFormulario,
  participantesBase: readonly string[],
  participantes: readonly string[],
): string[] {
  const salida = new Set<string>()
  for (const campo of CAMPOS) {
    if (base[campo] !== local[campo]) for (const d of CAMPOS_DOC[campo]) salida.add(d)
  }
  if (!mismaLista(participantesBase, participantes)) salida.add('participantes')
  return [...salida]
}

export function mismaLista(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

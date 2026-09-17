import { autorVisible, type EventoBitacora, type FotoEvento, type TurnoMantencion } from './bitacora.types'
import { soloListos } from './borradores'
import { fuePendiente, ordenarEventos, resumirBitacora } from './resumenBitacora'
import { etiquetaTurno, fechaTurnoLarga, horarioTurno } from './turnoMantencion'
import {
  capitalizarPrimera,
  lineaImpacto,
  lineaPendienteAnterior,
  lineaResumen,
  lineaTecnicos,
  type DatosCorreoBitacora,
} from './bitacoraCorreo'
import { codigoEquipoDe, encabezadoEvento, etiquetaTipo, lineaRepuestos } from './presentacionEvento'

/**
 * La bitácora para WhatsApp (decisión de Orel 16-09-2026): un MENSAJE con todo
 * el texto y una LÁMINA por evento con fotos (una imagen con las fotos, la hora,
 * el equipo y lo que se hizo).
 *
 * Por qué en piezas y no como el correo: un mensaje de WhatsApp es texto o una
 * imagen, nunca las dos intercaladas, y WhatsApp Web recibe UNA imagen por cada
 * Ctrl+V. Con la lámina, cada foto llega al chat con su contexto y se entiende
 * sola aunque se reenvíe.
 */

/** Hasta 4 fotos por lámina: con más, el evento sale en dos láminas. */
export const FOTOS_POR_LAMINA = 4

export interface LaminaWhatsapp {
  /** Cambia si cambia cualquier cosa que se dibuja: sirve para no redibujar de más. */
  clave: string
  evento: EventoBitacora
  fotos: FotoEvento[]
  /** Posición en el envío (desde 1) y total de láminas. */
  numero: number
  total: number
  /** Con más de 4 fotos el evento va en varias láminas: parte 1 de 2… */
  parte: number
  partes: number
  /** Va en el bloque «Pendiente para el turno siguiente». */
  pendiente: boolean
  /** "Turno tarde 16-09" y la planta, para la cabecera y el pie. */
  turnoCorto: string
  planta: string
}

const ORDEN_FOTO = { antes: 0, despues: 1, foto: 2 } as const

/** Antes y después juntos y en ese orden, como en el correo. */
export function fotosOrdenadas(fotos: readonly FotoEvento[]): FotoEvento[] {
  return [...fotos].sort((a, b) => ORDEN_FOTO[a.etiqueta] - ORDEN_FOTO[b.etiqueta])
}

/** Los eventos publicados en el orden del mensaje: lo hecho y después lo pendiente. */
function eventosDelMensaje(turno: TurnoMantencion, eventos: readonly EventoBitacora[]): EventoBitacora[] {
  const ordenados = ordenarEventos(turno, soloListos(eventos))
  return [...ordenados.filter((e) => !fuePendiente(e)), ...ordenados.filter(fuePendiente)]
}

export function turnoCorto(turno: TurnoMantencion): string {
  return `${etiquetaTurno(turno)} ${turno.fecha.split('-').reverse().slice(0, 2).join('-')}`
}

/** Las láminas del envío: una por evento con fotos (dos o más si tiene más de 4). */
export function planLaminas({ turno, eventos, planta }: Pick<DatosCorreoBitacora, 'turno' | 'eventos' | 'planta'>): LaminaWhatsapp[] {
  const piezas: Array<Omit<LaminaWhatsapp, 'clave' | 'numero' | 'total'>> = []
  const corto = turnoCorto(turno)
  for (const evento of eventosDelMensaje(turno, eventos)) {
    const fotos = fotosOrdenadas(evento.fotos ?? [])
    const partes = Math.ceil(fotos.length / FOTOS_POR_LAMINA)
    for (let i = 0; i < partes; i++) {
      piezas.push({
        evento,
        fotos: fotos.slice(i * FOTOS_POR_LAMINA, (i + 1) * FOTOS_POR_LAMINA),
        parte: i + 1,
        partes,
        pendiente: fuePendiente(evento),
        turnoCorto: corto,
        planta,
      })
    }
  }
  return piezas.map((p, i) => ({
    ...p,
    numero: i + 1,
    total: piezas.length,
    clave: JSON.stringify([
      i + 1,
      piezas.length,
      p.turnoCorto,
      p.planta,
      p.evento.id,
      p.parte,
      p.partes,
      p.pendiente,
      encabezadoEvento(p.evento),
      lineaImpacto(p.evento),
      p.evento.descripcion ?? '',
      lineaTecnicos(p.evento),
      autorVisible(p.evento),
      codigoEquipoDe(p.evento),
      lineaRepuestos(p.evento),
      p.fotos.map((f) => [f.path, f.etiqueta]),
    ]),
  }))
}

/** "lámina 1" / "láminas 2 y 3". */
export function referenciaLaminas(numeros: readonly number[]): string {
  if (numeros.length <= 1) return `lámina ${numeros[0] ?? ''}`.trim()
  return `láminas ${numeros.slice(0, -1).join(', ')} y ${numeros[numeros.length - 1]}`
}

/**
 * Negrita o cursiva de WhatsApp. Un `*` o `_` dentro del texto cortaría el
 * formato a la mitad: se cambia por un carácter que se ve igual.
 */
function marcar(texto: string, marca: '*' | '_'): string {
  const limpio = texto.trim().replace(/\*/g, '∗').replace(/_/g, '‗')
  return limpio ? `${marca}${limpio}${marca}` : ''
}

/** El nombre de archivo de una lámina al compartirla desde el celular. */
export function nombreArchivoLamina(turno: TurnoMantencion, lamina: Pick<LaminaWhatsapp, 'numero'>, extension = 'jpg'): string {
  return `bitacora-${turno.fecha}-${turno.banda}-${String(lamina.numero).padStart(2, '0')}.${extension}`
}

/**
 * El mensaje de WhatsApp: lo mismo que el correo, en texto con el formato de
 * WhatsApp (`*negrita*`, `_cursiva_`, listas con guion). Cada evento con fotos
 * dice en qué lámina están.
 */
export function bitacoraATextoWhatsapp(datos: DatosCorreoBitacora, laminas: readonly LaminaWhatsapp[] = planLaminas(datos)): string {
  const { turno, eventos: todos, tecnicos, planta, observacion, pendientesAnteriores = [] } = datos
  const eventos = soloListos(todos)
  const r = resumirBitacora(eventos)
  const autores = [...new Set(eventos.map(autorVisible).filter(Boolean))]
  const ordenados = eventosDelMensaje(turno, eventos)
  const hechos = ordenados.filter((e) => !fuePendiente(e))
  const pendientes = ordenados.filter(fuePendiente)

  const numeros = new Map<string, number[]>()
  for (const l of laminas) numeros.set(l.evento.id, [...(numeros.get(l.evento.id) ?? []), l.numero])

  const bloque = (e: EventoBitacora) =>
    [
      marcar(encabezadoEvento(e) || etiquetaTipo(e), '*'),
      marcar(lineaImpacto(e), '_'),
      e.descripcion?.trim() ?? '',
      lineaTecnicos(e),
      lineaRepuestos(e),
      e.fotos?.length
        ? `Fotos: ${e.fotos.length}${numeros.has(e.id) ? ` (${referenciaLaminas(numeros.get(e.id) ?? [])})` : ''}`
        : '',
    ]
      .filter(Boolean)
      .join('\n')

  const cabecera = [
    marcar(`Bitácora de Mantención · ${etiquetaTurno(turno)}`, '*'),
    `${capitalizarPrimera(fechaTurnoLarga(turno))} · ${horarioTurno(turno).replace('–', 'a')} · ${planta}`,
    tecnicos.length ? `Técnicos de turno: ${tecnicos.join(', ')}` : '',
    autores.length ? `Registrado por: ${autores.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return [
    cabecera,
    eventos.length ? `${marcar('Resumen:', '*')} ${lineaResumen(r)}` : 'Sin eventos registrados en el turno.',
    ...(observacion?.trim() ? [`${marcar('Observaciones del turno:', '_')} ${observacion.trim()}`] : []),
    ...hechos.map(bloque),
    ...(pendientes.length ? [marcar('Pendiente para el turno siguiente', '*'), ...pendientes.map(bloque)] : []),
    ...(pendientesAnteriores.length
      ? [
          [marcar('Sigue pendiente de turnos anteriores', '*'), ...pendientesAnteriores.map((e) => `- ${lineaPendienteAnterior(e)}`)].join('\n'),
        ]
      : []),
  ].join('\n\n')
}

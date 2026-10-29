/**
 * El Duelo «calmo» al cuadro del reloj único (spec SPEC_MONITOR_EN_VIVO_COLA §2, Duelo en PC y celular).
 *
 * `construirDuelo` arma la carrera con el contador vivo de Shoplogix, que va 2-4 min adelante del reloj de la cola de
 * reproducción (el de «El turno» y el Modo TV). Aquí se vuelve a poner la carrera EN EL INSTANTE DEL CUADRO, para que el marcador,
 * la curva y las filas «Por qué» digan lo mismo que la cifra grande de la página:
 *
 *  · la cifra de hechas de hoy (`hoyPz`, `hoy.piezas`) y la del rival a la misma hora (`fantasmaPz`) salen de `CarreraViva`;
 *  · la cabeza de la curva de hoy es el punto del cuadro (lo posterior no se ha reproducido todavía);
 *  · la ventaja a la misma hora, el marcador (fila «Carrera»), el puntaje y la proyección al cierre se recalculan con las
 *    mismas funciones de `duelo.ts` que usa `construirDuelo`, no con una fórmula nueva.
 *
 * Función pura. Sin cuadro (turno cerrado, sin reproducción activa, sin curva) devuelve `d` tal cual.
 */
import {
  compararTurnos, filasKpiAKpi, fraseDeEmpate, horaTranscurrida, proyeccionAlCierre, puntajeJornada, serieVentaja,
  type DatosDuelo, type ProyeccionEquipo,
} from './duelo'
import type { CarreraViva } from './useCarreraViva'

export function datosAlReloj(d: DatosDuelo, viva: CarreraViva | null): DatosDuelo {
  const c = d.carrera
  if (!c || !viva || d.hoy.cerrado || viva.hechas == null || viva.min == null || !(viva.min > 0)) return d

  const hechas = viva.hechas
  const minuto = viva.min
  /* La cabeza reemplaza el tramo final: lo posterior al cuadro no se ha reproducido. */
  const curva = [...c.hoy.filter((q) => q.minutes < minuto && q.pieces <= hechas), { minutes: minuto, pieces: hechas }]
  if (curva.length < 2) return d

  const fantasmaPz = c.fantasmaPz != null ? viva.rival ?? c.fantasmaPz : null
  const ventaja = c.fantasma ? serieVentaja({ equipo: d.hoy.equipo, curva }, { equipo: c.rivalEquipo, curva: c.fantasma }, minuto) : c.ventaja

  /* La proyección de hoy con los mismos datos: lo que queda de turno es lo que quedaba al armar `d` contado desde el minuto del
     cuadro. Sin plan de cierre (o ya pasado) se deja la que traía. */
  const py = c.proyeccion[d.hoy.equipo]
  const finPrevistoMin = py && !py.cerrado && py.minutosQueQuedan != null && py.minutosQueQuedan > 0 ? c.minuto + py.minutosQueQuedan : null
  const proyHoy: ProyeccionEquipo | undefined = py && finPrevistoMin != null
    ? proyeccionAlCierre({ equipo: d.hoy.equipo, curva, hechas, minuto, finPrevistoMin, cerrado: false, techo: py.techo })
    : py
  const proyRival = c.proyeccion[c.rivalEquipo]
  const proyeccion = { ...c.proyeccion, ...(proyHoy ? { [d.hoy.equipo]: proyHoy } : {}) }
  const fraseEmpate = proyHoy && proyRival && proyHoy !== py ? fraseDeEmpate(proyHoy, proyRival) : c.fraseEmpate

  /* El marcador cuenta la fila «Carrera» con las piezas a igual tiempo SOLO si el fantasma es el rival del marcador. */
  const mismoRival = d.rival != null && c.fantasmaInfo != null && c.fantasmaInfo.shiftDocId === d.rival.shiftDocId
  const marcador = d.rival && d.marcador && fantasmaPz != null && mismoRival
    ? compararTurnos(d.hoy, d.rival, { carreraEnVivo: { a: hechas, b: fantasmaPz } })
    : d.marcador

  return {
    ...d,
    hoy: { ...d.hoy, piezas: hechas },
    marcador,
    puntaje: marcador === d.marcador ? d.puntaje : puntajeJornada(marcador),
    kpiAKpi: marcador === d.marcador ? d.kpiAKpi : filasKpiAKpi(marcador),
    carrera: {
      ...c,
      hoy: curva,
      ventaja,
      proyeccion,
      fraseEmpate,
      minuto,
      hora: horaTranscurrida(minuto),
      hoyPz: hechas,
      fantasmaPz,
      diferencia: fantasmaPz != null ? hechas - fantasmaPz : null,
    },
  }
}

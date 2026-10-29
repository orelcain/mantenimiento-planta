/**
 * Núcleo PURO del marcador del Duelo que también corre en el backend.
 *
 * `scripts/build-duelo-nucleo.mjs` lo empaqueta a `functions/lib/dueloNucleo.cjs` para el cierre congelado del Duelo
 * (plan: ARIA_MANTENIMIENTO_PLANTA/docs/PLAN_CIERRE_DUELO.md). Así el cierre de una semana usa EXACTAMENTE la regla que
 * muestra la pantalla, sin una copia en JS que se desincronice. `dueloNucleo.test.ts` falla si el `.cjs` quedó atrás.
 *
 * Solo re-exporta: la lógica vive en `duelo.ts` y sus vecinos, que no tocan Firebase, React ni el DOM.
 */
export {
  EQUIPOS,
  ANCLA_LUNES,
  FRACCION_SIN_DUELO,
  otroEquipo,
  jornadaDe,
  equipoDelTurno,
  cicloDe,
  semanaIso,
  modoArranqueDe,
  resumenDeStat,
  resumenesDeStats,
  compararTurnos,
  puntajeJornada,
  rivalDirecto,
  duelosDeTurnos,
  marcadorDeCiclo,
  marcadorDePeriodo,
  rachasPorEquipo,
  recordsDe,
  costoDeMantencionPeriodo,
} from './duelo'
export { unidadDeMaquinas } from './ritmoVivo'

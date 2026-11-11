/**
 * Foto del marcador del Duelo sobre un fixture, calculada SOLO con funciones del núcleo.
 *
 * La usan los dos lados del test «misma regla»: la PWA (vitest, con `dueloNucleo.ts`) y las Functions (node:test, con
 * `functions/lib/dueloNucleo.cjs`). Si las dos fotos dan igual que `duelo-semanas-43-44.esperado.json`, el backend
 * cuenta exactamente como la pantalla. Regenerar el esperado SOLO a propósito (cambio de regla aprobado):
 *   node functions/__tests__/fixtures/instantaneaDuelo.cjs --escribir
 */
const HOY = '2026-10-29'
const SEMANAS = ['2026-10-19', '2026-10-26']

function instantanea(n, fixture) {
  const out = {}
  for (const [linea, f] of Object.entries(fixture.lineas)) {
    const modo = n.modoArranqueDe(n.unidadDeMaquinas(f.maquinas))
    const resumenes = n.resumenesDeStats(f.stats, f.overrides, modo, null)
    const duelos = n.duelosDeTurnos(resumenes)
    out[linea] = {
      modo,
      turnos: resumenes.map(r => ({ id: r.shiftDocId, jornada: r.jornada, noche: r.esNoche, equipo: r.equipo, piezas: r.piezas, piezasMant: r.piezasMant })),
      /* La jornada se decide en el turno de día, que corre contra la noche de su misma fecha. */
      jornadas: duelos.filter(d => !d.resumen.esNoche).map(d => ({
        jornada: d.resumen.jornada,
        dia: d.resumen.equipo,
        noche: d.rival ? d.rival.equipo : null,
        ganador: d.marcador ? d.marcador.ganador : null,
        puntaje: n.puntajeJornada(d.marcador),
        kpis: d.marcador ? d.marcador.kpis.map(k => [k.id, k.ganador]) : [],
      })),
      semanas: SEMANAS.map(l => n.marcadorDePeriodo(duelos, 'semana', l, HOY)),
      mes: n.marcadorDePeriodo(duelos, 'mes', HOY.slice(0, 7), HOY),
      costoCiclo: n.costoDeMantencionPeriodo(resumenes, { jornada: '2026-10-28' }, 'ciclo'),
      rachas: n.rachasPorEquipo(duelos),
      records: n.recordsDe(duelos),
    }
  }
  return out
}

module.exports = { instantanea, HOY }

if (require.main === module && process.argv.includes('--escribir')) {
  const fs = require('fs')
  const path = require('path')
  const fixture = require('./duelo-semanas-43-44.json')
  const foto = instantanea(require('../../lib/dueloNucleo.cjs'), fixture)
  fs.writeFileSync(path.join(__dirname, 'duelo-semanas-43-44.esperado.json'), JSON.stringify(foto, null, 1) + '\n')
  console.log('esperado escrito')
}

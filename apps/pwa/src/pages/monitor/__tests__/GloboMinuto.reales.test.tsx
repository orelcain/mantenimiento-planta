/**
 * El globo del minuto por dentro con los casos REALES del 02-11-2026: lo que el usuario lee, línea por línea (PC y celular). Cada cifra sale del doc
 * (`lecturaDelMinuto`); aquí se prueba cómo se dice: lo calculado dice calculado, lo estimado dice estimado, nada de jerga.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { andandoSegundos, filasBaader, ritmoAndando, tramosDelMinuto } from '../ejeTurno'
import { GloboMinuto } from '../GloboMinuto'
import { clasificarMicros } from '../microCausa'
import { lecturaDelMinuto, type BaaderMinuto } from '../minutoPorDentro'
import { paradasDetalle } from '../ritmoVivo'
import { CHONCHI_0211_T2, FILETE_0211_DIA, entradaDeDoc, type DocMicro } from './microFixtures'

afterEach(() => cleanup())

function lecturaDeDoc(doc: DocMicro, hhmm: string) {
  const entrada = entradaDeDoc(doc)
  const paradas = paradasDetalle({ stopEvents: entrada.stopEvents, stopReasons: entrada.stopReasons, stopMachines: entrada.stopMachines, enCurso: [] })
  const desde = doc.pulse.serieMinuto.desde
  const [h, m] = hhmm.split(':').map(Number)
  const d0 = new Date(desde)
  const k = h! * 60 + m! - (d0.getUTCHours() * 60 + d0.getUTCMinutes())
  const n = doc.pulse.serieMinuto.maquinas[0]!.cycles.length
  const filas = filasBaader({ desde, maquinas: entrada.serie!.maquinas.map((q) => ({ ...q })) }, n, { stopEvents: entrada.stopEvents, stopReasons: entrada.stopReasons, stopMachines: entrada.stopMachines, enCurso: [] })
  const iniMs = Date.parse(desde) + k * 60_000
  const baaders: BaaderMinuto[] = entrada.serie!.maquinas.map((q, i) => {
    const tramos = tramosDelMinuto(paradas.get(q.id), iniMs)
    const andandoS = andandoSegundos(tramos)
    const piezas = q.cycles[k]!
    return { id: q.id, nombre: q.nombre.replace('Evisceradora', 'Ev').replace('Linea', 'Línea'), esperado: q.esperado, piezas, tono: filas[i]!.celdas[k]!.tono, tramos, andandoS, ritmo: ritmoAndando(piezas, andandoS, filas[i]!.llenados[k] ?? null) }
  })
  return lecturaDelMinuto({ iniMs, baaders, micros: clasificarMicros(entrada) })
}

const limpio = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
/** El texto del globo, una línea por cosa. */
function lineas(globo: Element): string[] {
  const out: string[] = []
  const cab = globo.querySelector('.rv-gm-cab')
  if (cab) out.push(limpio(Array.from(cab.children).map((c) => c.textContent).join(' ')))
  for (const sel of ['.rv-gm-lin', '.rv-gm-hechas']) globo.querySelectorAll(sel).forEach((e) => out.push(limpio(e.textContent)))
  const perd = globo.querySelector('.rv-gm-perd')
  if (perd) out.push(Array.from(perd.querySelectorAll('span:not(.sub)')).map((s) => limpio(s.textContent)).join(' · '), ...Array.from(perd.querySelectorAll('.sub')).map((s) => limpio(s.textContent)))
  globo.querySelectorAll('.rv-gm-tabla .rv-gm-fila').forEach((f) => out.push(Array.from(f.children).filter((c) => c.tagName !== 'svg').map((c) => limpio(c.textContent)).join(' | ')))
  globo.querySelectorAll('.rv-gm-sec').forEach((s) => {
    const h = s.querySelector('h4')
    if (h) out.push(limpio(h.textContent))
    s.querySelectorAll('.rv-gm-ev').forEach((e) => out.push(limpio(e.textContent)))
  })
  globo.querySelectorAll('.rv-gm-nota').forEach((n) => out.push(limpio(n.textContent)))
  return out
}
const pc = (doc: DocMicro, hhmm: string, props: Partial<Parameters<typeof GloboMinuto>[0]> = {}) => {
  const r = render(<GloboMinuto lectura={lecturaDeDoc(doc, hhmm)} tam="grande" {...props} />)
  return r.container.querySelector('.rv-gm')!
}

describe('GloboMinuto · casos reales', () => {
  it('Chonchi 15:13: la línea, lo que faltó repartido (con aviso de que es calculado), cada Baader y cada parada con su hora y su duración exacta', () => {
    expect(lineas(pc(CHONCHI_0211_T2, '15:13'))).toEqual([
      '15:13 minuto 15:13:00 → 15:14:00',
      'Línea 14 de 50 pz/min · faltaron 36',
      '16 por detención · 8,5 por micro · 11,5 por ritmo',
      'Reparto calculado con lo esperado por segundo detenido: Shoplogix cuenta piezas por minuto, no por segundo.',
      ' | :00:15:30:45:60 | pz | andando | ritmo andando',
      'Ev 1 | 7 | 45 s | 9,3 de 18 · 52 %',
      'Ev 2 | 7 | 45 s | 9,3 de 16 · 58 %',
      'Ev 3 | 0 | 0 s | detenida',
      'Detención · se imputa',
      'Ev 3 15:13:00 → 15:15:15 · 2 min 15 s · Sin imputar · falta dueño',
      'Micro · no se imputa: causa probable, se confirma en terreno',
      'Ev 1 15:13:00 → 15:13:15 · 15 s · Línea común',
      'Ev 2 15:13:00 → 15:13:15 · 15 s · Línea común',
      'Las 3 pararon en el mismo segundo: 15:13:00.',
      'Cada micro esconde unos 20 s más que Shoplogix no anota (estimado, de 17 a 23 s) y cuenta como andando: pudieron caer en este minuto o en uno anterior.',
    ])
  })
  it('Chonchi 15:10: las micro de Ev 1 (45 s) y Ev 2 (30 s) con su hora, y el ritmo solo donde anduvo 30 s o más', () => {
    const l = lineas(pc(CHONCHI_0211_T2, '15:10'))
    expect(l).toContain('Ev 1 | 5 | 15 s | — poco tiempo andando')
    expect(l).toContain('Ev 2 | 5 | 30 s | 10 de 16 · 63 %')
    expect(l).toContain('Ev 1 15:10:00 → 15:10:45 · 45 s · Línea común')
    expect(l).toContain('Ev 2 15:10:00 → 15:10:30 · 30 s · Línea común')
  })
  it('Filete 14:16: «esperado 10,3 en los 31 s sin colación» junto al «de 20», y la colación con su hora de fin; sin reparto en tres', () => {
    const l = lineas(pc(FILETE_0211_DIA, '14:16'))
    expect(l).toContain('Línea 8 de 20 pz/min · esperado 10,3 en los 31 s sin colación · faltaron 2,3')
    expect(l).toContain('Línea 1 | 8 | 31 s | 15,5 de 20 · 77 %')
    expect(l).toContain('Programada')
    expect(l).toContain('Línea 1 Colación hasta 14:16:29 · programada, no se recupera')
    expect(l).toContain('2,3 por ritmo')
    expect(l.join(' ')).not.toContain('por detención')
  })
  it('Filete 14:21: 5 por micro y 8 por ritmo', () => {
    expect(lineas(pc(FILETE_0211_DIA, '14:21'))).toContain('5 por micro · 8 por ritmo')
  })
  it('un «por ritmo» negativo no se escribe con menos: dice que el resto del minuto anduvo sobre lo esperado, con la cifra (Chonchi 10:03)', () => {
    const l = lineas(pc(CHONCHI_0211_T2, '10:03'))
    expect(l).toContain('10,9 por micro · el resto del minuto anduvo 2,9 sobre lo esperado')
    expect(l.join(' ')).not.toMatch(/-2,9|−2,9|por ritmo/)
  })
  it('sin jerga: nada de tic, bucket, mediana ni stopEvents en el texto', () => {
    const t = lineas(pc(CHONCHI_0211_T2, '15:13')).join(' ')
    expect(t).not.toMatch(/\btic\b|bucket|mediana|stopEvents|k−1|k-1/i)
  })
  it('el celular: una línea por parada, con las micro iguales agrupadas («Ev 1 y Ev 2 15:13:00 · 15 s micro · línea común»)', () => {
    const r = render(<GloboMinuto lectura={lecturaDeDoc(CHONCHI_0211_T2, '15:13')} tam="chico" compacto onCerrar={() => {}} />)
    const l = lineas(r.container.querySelector('.rv-gm')!)
    expect(l).toContain('Ev 1 y Ev 2 15:13:00 · 15 s micro · línea común')
    expect(l).toContain('Ev 3 15:13:00 · 2 min 15 s detención · falta dueño')
    expect(l).toContain('Ev 3 | detenida')
    expect(r.getByRole('button', { name: 'Cerrar la lectura del minuto' })).toBeTruthy()
  })
})

describe('GloboMinuto · abrir la micro', () => {
  it('con el mouse encima de una fila de micro abre su globo y al salir lo cierra; con un toque o Enter alterna', () => {
    const hover = vi.fn()
    const click = vi.fn()
    const g = pc(CHONCHI_0211_T2, '15:13', { onMicroHover: hover, onMicroClick: click })
    const filas = Array.from(g.querySelectorAll('button.rv-gm-ev'))
    expect(filas).toHaveLength(2)
    fireEvent.pointerEnter(filas[0]!, { pointerType: 'mouse' })
    expect(hover).toHaveBeenCalledWith(expect.stringContaining('@'))
    fireEvent.pointerLeave(filas[0]!, { pointerType: 'mouse' })
    expect(hover).toHaveBeenLastCalledWith(null)
    fireEvent.click(filas[1]!)
    expect(click).toHaveBeenCalledTimes(1)
    /* Con el mouse el clic no cierra lo que ya abrió el hover. */
    click.mockClear()
    const clicMouse = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(clicMouse, 'pointerType', { value: 'mouse' })
    fireEvent(filas[1]!, clicMouse)
    expect(click).not.toHaveBeenCalled()
  })
})

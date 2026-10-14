/**
 * Paleta Pizarra · oleada 2 (línea de tiempo, puertas y calibres, producción, punto cero).
 *
 * Regla de oro: SIN `data-paleta="pizarra"` cada helper devuelve EXACTAMENTE el literal que el
 * gráfico traía antes. CON Pizarra devuelve el token (serie 1-5, «Otros», neutros, aviso/falla).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { limpiarCacheColores } from '@/lib/coloresGrafico'
import {
  CAUSE_HEX,
  RIEL_COLOR,
  buildCadenceMarkLines,
  buildMarkLines,
  causaColor,
  causaColorAlfa,
  causaColorCss,
  rielColor,
  verdictBandColor,
} from '../shiftTimelineHelpers'
import {
  colorBarraProduccion,
  colorTipoError,
  gateColor,
  getCalibreColor,
  getErrorColor,
  tokenTipoError,
} from '../graderTimelineColors'
import { gateColor as gateEvolColor, inkOn } from '../gateEvolutionColors'
import { colorCausaPureza } from '../purezaColors'
import { heatBorder, heatColor } from '@/services/grader/graderHeatColor'
import { p0StatusGrafico, p0StatusHex } from '@/services/grader/graderP0Thresholds'
import {
  qualityColorCanvas,
  qualityColorHex,
  qualityColorTextClass,
  qualityColorVar,
} from '@/services/grader/graderQualityColors'
import type { MatrixP0Cause } from '@/services/grader/types'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'

const root = () => document.documentElement

const TOKENS_DIA: Record<string, string> = {
  'serie-1': '42 107 166', 'serie-2': '113 145 70', 'serie-3': '165 120 190', 'serie-4': '19 143 130', 'serie-5': '108 106 179',
  'serie-otros': '135 134 130',
  'grafico-neutro-medio': '135 134 130', 'grafico-neutro-fuerte': '78 77 74', 'grafico-meta': '106 105 102',
  'grafico-falla': '177 39 45', 'grafico-aviso': '242 180 0',
  card: '255 255 255', foreground: '28 28 30', muted: '229 229 234', 'muted-foreground': '102 102 105',
  'ink-crit': '184 42 35', 'ink-warn': '152 88 0', 'ink-info': '40 101 158',
  'shift-ramp-1': '#94acc5', 'shift-ramp-2': '#698eb4', 'shift-ramp-3': '#2a6ba6', 'shift-ramp-4': '#254e75',
  'calidad-1': '#274a6c', 'calidad-2': '#305d87', 'calidad-3': '#3f6f9e', 'calidad-4': '#5b83aa', 'calidad-5': '#7696b6',
}

function fijarTokens(t: Record<string, string>) {
  for (const [k, v] of Object.entries(t)) root().style.setProperty(`--${k}`, v)
  limpiarCacheColores()
}
function limpiar() {
  root().removeAttribute('data-paleta')
  root().classList.remove('dark')
  root().removeAttribute('style')
  limpiarCacheColores()
}
beforeEach(limpiar)
afterEach(limpiar)

const CAUSAS = Object.keys(CAUSE_HEX) as MatrixP0Cause[]
const VENTANA = { startAt: '2026-10-08T08:00:00.000Z', endAt: '2026-10-08T16:00:00.000Z' } as unknown as ShiftTimeWindow
const TIPOS = ['accion', 'pausa', 'config', 'carga', 'lote'] as const

describe('SIN Pizarra = literales de hoy', () => {
  beforeEach(() => fijarTokens(TOKENS_DIA)) // los tokens existen, pero no se leen

  it('causas P0: causaColor, causaColorCss y causaColorAlfa', () => {
    for (const c of CAUSAS) {
      expect(causaColor(c)).toBe(CAUSE_HEX[c])
      expect(causaColorCss(c)).toBe(CAUSE_HEX[c])
      expect(causaColorAlfa(c, '60', 0.38)).toBe(CAUSE_HEX[c] + '60')
    }
    expect(causaColor('desconocida')).toBe('#ef4444')
    expect(causaColor('desconocida', '#94a3b8')).toBe('#94a3b8')
  })

  it('riel: rielColor = RIEL_COLOR', () => {
    for (const t of TIPOS) expect(rielColor(t)).toBe(RIEL_COLOR[t])
  })

  it('líneas del timeline: inicio/fin de turno, umbrales y cadencia', () => {
    const { shiftMarkLines, thresholdLines } = buildMarkLines(null, VENTANA, undefined, [], 2, 3.5)
    expect((shiftMarkLines[0] as { lineStyle: { color: string } }).lineStyle.color).toBe('#10b981')
    expect((shiftMarkLines[1] as { lineStyle: { color: string } }).lineStyle.color).toBe('#6b7280')
    expect((thresholdLines[0] as { lineStyle: { color: string } }).lineStyle.color).toBe('#f59e0b')
    expect((thresholdLines[1] as { lineStyle: { color: string } }).lineStyle.color).toBe('#ef4444')
    const cad = buildCadenceMarkLines({ typicalPzMin: 30, bestSustained10MinPzMin: 40 }) as Array<{ lineStyle: { color: string } }>
    expect(cad[0]!.lineStyle.color).toBe('#38bdf8')
    expect(cad[1]!.lineStyle.color).toBe('#facc15')
  })

  it('bandas por veredicto', () => {
    expect(verdictBandColor('improved')).toBe('rgba(16, 185, 129, 0.07)')
    expect(verdictBandColor('worsened')).toBe('rgba(244, 63, 94, 0.07)')
    expect(verdictBandColor('neutral')).toBe('rgba(148, 163, 184, 0.04)')
    expect(verdictBandColor('insufficient-data')).toBeNull()
  })

  it('p0StatusGrafico = p0StatusHex', () => {
    for (const s of ['ok', 'alert', 'critical'] as const) expect(p0StatusGrafico(s)).toBe(p0StatusHex(s))
  })

  it('calibre, error y gate del gráfico segundo a segundo', () => {
    expect(getCalibreColor('2-4 lb')).toBe('#3b82f6')
    expect(getCalibreColor('3-4')).toBe('#10b981')
    expect(getCalibreColor('12+ lb')).toBe('#f97316')
    expect(getCalibreColor('raro')).toBe('#6b7280')
    expect(getErrorColor('Fuera de rango')).toBe('#ef4444')
    expect(getErrorColor('Fuera de límites')).toBe('#f59e0b')
    expect(getErrorColor('no leído por fotocélula')).toBe('#8b5cf6')
    expect(getErrorColor('Puerta no preparada')).toBe('#10b981')
    expect(getErrorColor('otra cosa')).toBe('#6b7280')
    expect(colorTipoError('Fuera de límites', 'rgba(1,2,3,0.5)', 0.9)).toBe('rgba(1,2,3,0.5)')
    expect(gateColor(1)).toBe('#3b82f6')
    expect(gateColor(12)).toBe('#e11d48')
    expect(gateColor(13)).toBe('#3b82f6') // vuelve a empezar
  })

  it('barras de producción por banda de cumplimiento', () => {
    expect(colorBarraProduccion('green')).toBe('rgba(16, 185, 129, 0.9)')
    expect(colorBarraProduccion('yellow')).toBe('rgba(245, 158, 11, 0.9)')
    expect(colorBarraProduccion('red')).toBe('rgba(244, 63, 94, 0.9)')
    expect(colorBarraProduccion('gray')).toBe('rgba(51, 65, 85, 0.6)')
  })

  it('evolución de gates: color y tinta del chip', () => {
    expect(gateEvolColor(1)).toBe('#3b82f6')
    expect(gateEvolColor(12)).toBe('#a855f7')
    expect(inkOn('#3b82f6')).toBe('#ffffff')
    expect(inkOn('#84cc16')).toBe('#0d1722')
  })

  it('causales de pureza por puerta', () => {
    expect(colorCausaPureza('ok', '#2e75b6')).toBe('#2e75b6')
    expect(colorCausaPureza('calibre_lejano', '#b51b1b')).toBe('#b51b1b')
    expect(colorCausaPureza('otros', '#aeaeb2')).toBe('#aeaeb2')
  })

  it('mapa de calor: el degradado azul → verde → rojo de siempre', () => {
    expect(heatColor(0, 0, 10)).toBe('rgba(59,130,246,0.78)')
    expect(heatColor(5, 0, 10)).toBe('rgba(16,185,129,0.78)')
    expect(heatColor(10, 0, 10)).toBe('rgba(239,68,68,0.78)')
    expect(heatBorder(10, 0, 10)).toBe('rgba(239,68,68,1)')
  })

  it('calidades en canvas: el literal que traía el gráfico; qualityColorHex intacto', () => {
    expect(qualityColorCanvas('premium', 'rgba(16, 185, 129, 0.75)')).toBe('rgba(16, 185, 129, 0.75)')
    expect(qualityColorCanvas('', '#abc', 0.9)).toBe('#abc')
    expect(qualityColorHex('premium')).toBe('#6366f1')
  })

  it('qualityColorTextClass: sin las variantes pizarra: es la clase de siempre', () => {
    const ANTES: Record<string, string> = {
      premium: 'text-indigo-400', superior: 'text-emerald-400', primera: 'text-blue-400', segunda: 'text-amber-400',
      tercera: 'text-orange-400', industrial: 'text-slate-400', descarte: 'text-red-400', grado: 'text-cyan-400', d: 'text-zinc-400',
    }
    for (const [q, clase] of Object.entries(ANTES)) {
      const sinPizarra = qualityColorTextClass(q).split(' ').filter((c) => !c.startsWith('pizarra:')).join(' ')
      expect(sinPizarra).toBe(clase)
    }
    expect(qualityColorTextClass('xxx')).toBe('text-muted-foreground')
  })
})

describe('CON Pizarra', () => {
  beforeEach(() => {
    root().setAttribute('data-paleta', 'pizarra')
    fijarTokens(TOKENS_DIA)
  })

  it('causas P0: 5 series en orden fijo y el resto en «Otros»', () => {
    expect(causaColor('fuera_de_limites')).toBe('rgb(42, 107, 166)')
    expect(causaColor('no_leido_fotocelula')).toBe('rgb(113, 145, 70)')
    expect(causaColor('too_close_too_long')).toBe('rgb(165, 120, 190)')
    expect(causaColor('puerta_no_preparada')).toBe('rgb(19, 143, 130)')
    expect(causaColor('fuera_de_calibre')).toBe('rgb(108, 106, 179)')
    for (const c of ['fuera_de_calidad', 'fuera_de_conservacion', 'fuera_de_producto', 'otro'] as const) {
      expect(causaColor(c)).toBe('rgb(135, 134, 130)')
    }
    expect(causaColorCss('fuera_de_limites')).toBe('rgb(var(--serie-1))')
    expect(causaColorCss('otro')).toBe('rgb(var(--serie-otros))')
    expect(causaColorAlfa('fuera_de_limites', '60', 0.38)).toBe('rgba(42, 107, 166, 0.38)')
  })

  it('riel: acción = foco; pausa = contexto', () => {
    expect(rielColor('accion')).toBe('rgb(42, 107, 166)')
    expect(rielColor('carga')).toBe('rgb(113, 145, 70)')
    expect(rielColor('config')).toBe('rgb(165, 120, 190)')
    expect(rielColor('lote')).toBe('rgb(19, 143, 130)')
    expect(rielColor('pausa')).toBe('rgb(135, 134, 130)')
  })

  it('umbrales: alerta = aviso, crítico = falla', () => {
    const { thresholdLines } = buildMarkLines(null, VENTANA, undefined, [], 2, 3.5)
    expect((thresholdLines[0] as { lineStyle: { color: string } }).lineStyle.color).toBe('rgb(242, 180, 0)')
    expect((thresholdLines[1] as { lineStyle: { color: string } }).lineStyle.color).toBe('rgb(177, 39, 45)')
  })

  it('veredicto: mejoró = serie 1, empeoró = falla (misma opacidad)', () => {
    expect(verdictBandColor('improved')).toBe('rgba(42, 107, 166, 0.07)')
    expect(verdictBandColor('worsened')).toBe('rgba(177, 39, 45, 0.07)')
    expect(verdictBandColor('neutral')).toBe('rgba(135, 134, 130, 0.04)')
  })

  it('P0%: dentro de banda = serie 1; solo alerta y crítico llevan aviso y falla', () => {
    expect(p0StatusGrafico('ok')).toBe('rgb(42, 107, 166)')
    expect(p0StatusGrafico('alert')).toBe('rgb(242, 180, 0)')
    expect(p0StatusGrafico('critical')).toBe('rgb(177, 39, 45)')
  })

  it('calibres = rampa ordinal; errores = series por tipo; gates 1-5 = series, resto «Otros»', () => {
    expect(getCalibreColor('2-4 lb')).toBe('#94acc5')
    expect(getCalibreColor('4-6 lb')).toBe('#698eb4')
    expect(getCalibreColor('6-8 lb')).toBe('#2a6ba6')
    expect(getCalibreColor('10-12 lb')).toBe('#254e75')
    expect(getCalibreColor('raro')).toBe('rgb(135, 134, 130)')
    expect(getErrorColor('Fuera de límites')).toBe('rgb(42, 107, 166)')
    expect(getErrorColor('No leído por fotocélula')).toBe('rgb(113, 145, 70)')
    expect(getErrorColor('Too close or too long')).toBe('rgb(165, 120, 190)')
    expect(getErrorColor('Puerta no preparada')).toBe('rgb(19, 143, 130)')
    expect(getErrorColor('Fuera de rango')).toBe('rgb(108, 106, 179)')
    expect(getErrorColor('Desconocido')).toBe('rgb(135, 134, 130)')
    expect(gateColor(1)).toBe('rgb(42, 107, 166)')
    expect(gateColor(5)).toBe('rgb(108, 106, 179)')
    expect(gateColor(6)).toBe('rgb(135, 134, 130)')
    expect(gateEvolColor(2)).toBe('rgb(113, 145, 70)')
    expect(gateEvolColor(12)).toBe('rgb(135, 134, 130)')
  })

  it('los ids de causa y las etiquetas de error dan el mismo token', () => {
    expect(tokenTipoError('fuera_de_limites')).toBe('serie-1')
    expect(tokenTipoError('Fuera de límites')).toBe('serie-1')
    expect(tokenTipoError('no_leido_fotocelula')).toBe('serie-2')
    expect(tokenTipoError('No leído por fotocélula')).toBe('serie-2')
    expect(tokenTipoError('too_close_too_long')).toBe('serie-3')
    expect(tokenTipoError('puerta_no_preparada')).toBe('serie-4')
    expect(tokenTipoError('fuera_de_rango')).toBe('serie-5')
    expect(tokenTipoError('otro')).toBe('serie-otros')
    expect(tokenTipoError('Otro / Desconocido')).toBe('serie-otros')
    expect(colorTipoError('Fuera de límites', '#000', 0.8)).toBe('rgba(42, 107, 166, 0.8)')
  })

  it('producción: dentro de banda = serie 1, banda baja = aviso, crítica = falla', () => {
    expect(colorBarraProduccion('green')).toBe('rgba(42, 107, 166, 0.9)')
    expect(colorBarraProduccion('yellow')).toBe('rgba(242, 180, 0, 0.9)')
    expect(colorBarraProduccion('red')).toBe('rgba(177, 39, 45, 0.9)')
    expect(colorBarraProduccion('gray')).toBe('rgba(135, 134, 130, 0.6)')
  })

  it('causales de pureza: «Coincide» atenuado, 5 causales en series y el resto en «Otros»', () => {
    expect(colorCausaPureza('ok', '#2e75b6')).toBe('rgba(135, 134, 130, 0.4)')
    expect(colorCausaPureza('calibre_lejano', '#b51b1b')).toBe('rgb(42, 107, 166)')
    expect(colorCausaPureza('calidad', '#8944ab')).toBe('rgb(113, 145, 70)')
    expect(colorCausaPureza('conservacion', '#0c7e78')).toBe('rgb(165, 120, 190)')
    expect(colorCausaPureza('seteo_distinto', '#1c4cd4')).toBe('rgb(19, 143, 130)')
    expect(colorCausaPureza('calibre_vecino', '#974608')).toBe('rgb(108, 106, 179)')
    for (const c of ['calibre_no_reconocido', 'sin_dato', 'otros'] as const) {
      expect(colorCausaPureza(c, '#000')).toBe('rgb(135, 134, 130)')
    }
  })

  it('mapa de calor: rampa secuencial de un solo tono (sin rojo ni verde)', () => {
    expect(heatColor(0, 0, 10)).toBe('rgba(148,172,197,0.78)')
    expect(heatColor(10, 0, 10)).toBe('rgba(37,78,117,0.78)')
    expect(heatBorder(10, 0, 10)).toBe('rgba(37,78,117,1)')
  })

  it('calidades en canvas: el token de la calidad; la clase de texto trae variantes pizarra:', () => {
    expect(qualityColorCanvas('premium', '#6366f1', 0.9)).toBe('rgba(39, 74, 108, 0.9)')
    expect(qualityColorCanvas('Primera', '#3b82f6')).toBe('#3f6f9e')
    expect(qualityColorCanvas('industrial', '#94a3b8')).toBe('rgb(78, 77, 74)')
    expect(qualityColorCanvas('descarte', '#ef4444')).toBe('rgb(165, 120, 190)')
    expect(qualityColorCanvas('xxx', '#6366f1')).toBe('rgb(135, 134, 130)')
    // La clase de texto lleva el mismo orden que qualityColorVar
    expect(qualityColorVar('premium')).toBe('var(--calidad-1)')
    for (const q of ['premium', 'superior', 'primera', 'segunda', 'tercera', 'industrial', 'descarte', 'grado', 'd']) {
      expect(qualityColorTextClass(q)).toContain('pizarra:text-')
    }
  })

  it('tinta del chip sobre un color rgb() = la de mayor contraste', () => {
    expect(inkOn('rgb(42, 107, 166)')).toBe('#ffffff')
    expect(inkOn('rgb(255, 255, 255)')).toBe('#0d1722')
    expect(inkOn('rgb(135, 134, 130)')).toBe('#0d1722')
  })

  it('en Penumbra los tokens cambian y la lectura se actualiza', () => {
    fijarTokens({ 'serie-1': '86 152 218', 'grafico-falla': '255 154 144' })
    root().classList.add('dark')
    expect(causaColor('fuera_de_limites')).toBe('rgb(86, 152, 218)')
    expect(p0StatusGrafico('critical')).toBe('rgb(255, 154, 144)')
  })
})

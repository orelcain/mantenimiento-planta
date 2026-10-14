/**
 * Colores de gráficos con Pizarra. La regla de oro: SIN `data-paleta="pizarra"` los
 * gráficos pintan EXACTAMENTE los literales de siempre; con Pizarra leen los tokens.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  colorDeToken,
  elegirColor,
  hayPizarra,
  limpiarCacheColores,
  porPaleta,
} from '../coloresGrafico'
import { useColoresGrafico } from '@/hooks/useColoresGrafico'
import { slxStateColor, slxStateTrama, slxSuavizarAcento } from '@/services/shoplogix/shoplogixColors'
import { softenAccentHex } from '../softenColor'
import { qualityColorDisplay, qualityColorHex, qualityColorVar } from '@/services/grader/graderQualityColors'

const root = () => document.documentElement

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

describe('colorDeToken', () => {
  it('canales «R G B» → rgb() o rgba() según la opacidad', () => {
    expect(colorDeToken('42 107 166')).toBe('rgb(42, 107, 166)')
    expect(colorDeToken('42 107 166', 0.5)).toBe('rgba(42, 107, 166, 0.5)')
  })
  it('hex → hex sólido o rgba con opacidad', () => {
    expect(colorDeToken('#2A6BA6')).toBe('#2A6BA6')
    expect(colorDeToken('#2A6BA6', 0.7)).toBe('rgba(42, 107, 166, 0.7)')
  })
  it('rgba() se devuelve tal cual; basura → null', () => {
    expect(colorDeToken('rgba(1, 2, 3, 0.06)')).toBe('rgba(1, 2, 3, 0.06)')
    expect(colorDeToken('no-es-un-color')).toBeNull()
  })
})

describe('SIN Pizarra = literales actuales', () => {
  it('elegirColor devuelve el literal tal cual, aunque los tokens existan', () => {
    fijarTokens({ 'serie-1': '42 107 166', 'grafico-meta': '106 105 102' })
    expect(hayPizarra()).toBe(false)
    // Literales reales de GraderPeriodView / ProductionRateLineEC
    expect(elegirColor('rgba(251, 191, 36, 1)', 'serie-1')).toBe('rgba(251, 191, 36, 1)')
    expect(elegirColor('rgba(251, 191, 36, 0.12)', 'serie-1', 0.12)).toBe('rgba(251, 191, 36, 0.12)')
    expect(elegirColor('rgba(139,92,246,0.75)', 'grafico-meta', 0.75)).toBe('rgba(139,92,246,0.75)')
    expect(elegirColor('#ef4444', 'grafico-falla')).toBe('#ef4444')
  })

  it('porPaleta devuelve el valor de hoy', () => {
    expect(porPaleta('hoy', 'pizarra')).toBe('hoy')
  })

  it('el hook devuelve los literales y no cambia de versión', () => {
    fijarTokens({ 'serie-1': '42 107 166' })
    const { result } = renderHook(() => useColoresGrafico())
    expect(result.current.pizarra).toBe(false)
    expect(result.current.version).toBe(0)
    expect(result.current.elegir('rgba(59, 130, 246, 0.7)', 'serie-1', 0.7)).toBe('rgba(59, 130, 246, 0.7)')
    // Cambiar la clase `dark` sin Pizarra no provoca nada: el hook ni observa el DOM.
    act(() => { root().classList.add('dark') })
    expect(result.current.version).toBe(0)
  })

  it('slxStateColor = −50% croma del color de siempre (con el defecto conocido: micro y sin causa = rojo)', () => {
    const esperado = (hex: string) => softenAccentHex(hex)
    expect(slxStateColor('uptime', '')).toBe(esperado('#22c55e'))
    expect(slxStateColor('downtime', 'FALTA MMPP')).toBe(esperado('#f97316'))
    expect(slxStateColor('downtime', 'AJUSTE MANTENCION')).toBe(esperado('#1e3a5f'))
    expect(slxStateColor('break', 'COLACION')).toBe(esperado('#313f4b'))
    expect(slxStateColor('downtime', 'LIMPIEZA')).toBe(esperado('#7c3aed'))
    expect(slxStateColor('setup', '')).toBe(esperado('#f59e0b'))
    expect(slxStateColor('downtime', '', '#ff0000')).toBe(esperado('#ef4444'))
    // El nombre nuevo (4º argumento) no cambia nada sin Pizarra:
    expect(slxStateColor('downtime', '', '#ff0000', 'Micro Detencion')).toBe(esperado('#ef4444'))
    expect(slxStateTrama('break', 'COLACION')).toBe(false)
    expect(slxSuavizarAcento('#ff0000')).toBe(softenAccentHex('#ff0000'))
  })

  it('qualityColorDisplay = qualityColorHex y los hex no se tocan', () => {
    for (const q of ['premium', 'superior', 'primera', 'segunda', 'tercera', 'industrial', 'descarte', 'grado', 'd', 'xyz']) {
      expect(qualityColorDisplay(q)).toBe(qualityColorHex(q))
    }
    expect(qualityColorHex('premium')).toBe('#6366f1')
  })
})

describe('CON Pizarra', () => {
  const dia = {
    'serie-1': '42 107 166', 'serie-2': '113 145 70', 'serie-3': '165 120 190', 'serie-4': '19 143 130', 'serie-5': '108 106 179',
    'grafico-neutro-medio': '135 134 130', 'grafico-neutro-fuerte': '78 77 74', 'grafico-meta': '106 105 102',
    'grafico-falla': '177 39 45', 'grafico-aviso': '242 180 0', card: '255 255 255',
  }
  const noche = { ...dia, 'serie-1': '86 152 218', 'grafico-falla': '255 154 144' }

  beforeEach(() => { root().setAttribute('data-paleta', 'pizarra') })

  it('lee el token (con opacidad opcional)', () => {
    fijarTokens(dia)
    expect(hayPizarra()).toBe(true)
    expect(elegirColor('#000', 'serie-1')).toBe('rgb(42, 107, 166)')
    expect(elegirColor('#000', 'serie-1', 0.7)).toBe('rgba(42, 107, 166, 0.7)')
    expect(porPaleta('hoy', 'pizarra')).toBe('pizarra')
  })

  it('token ausente → cae al literal (nunca un color vacío)', () => {
    fijarTokens({})
    expect(elegirColor('#abcdef', 'serie-1')).toBe('#abcdef')
  })

  it('el hook relee al cambiar la clase dark (Día ↔ Penumbra)', async () => {
    fijarTokens(dia)
    const { result } = renderHook(() => useColoresGrafico())
    expect(result.current.pizarra).toBe(true)
    expect(result.current.elegir('#000', 'serie-1')).toBe('rgb(42, 107, 166)')
    const v0 = result.current.version
    await act(async () => {
      fijarTokens(noche)
      root().classList.add('dark')
      await new Promise((r) => setTimeout(r, 0)) // MutationObserver
    })
    expect(result.current.version).toBeGreaterThan(v0)
    expect(result.current.elegir('#000', 'serie-1')).toBe('rgb(86, 152, 218)')
  })

  it('montado SIN Pizarra: al activar data-paleta repinta con Pizarra y al quitarla vuelve a los literales', async () => {
    root().removeAttribute('data-paleta')
    fijarTokens(dia)
    const { result } = renderHook(() => useColoresGrafico())
    expect(result.current.pizarra).toBe(false)
    expect(result.current.elegir('rgba(59, 130, 246, 0.7)', 'serie-1', 0.7)).toBe('rgba(59, 130, 246, 0.7)')
    await act(async () => {
      root().setAttribute('data-paleta', 'pizarra')
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.pizarra).toBe(true)
    expect(result.current.elegir('rgba(59, 130, 246, 0.7)', 'serie-1', 0.7)).toBe('rgba(42, 107, 166, 0.7)')
    await act(async () => {
      root().removeAttribute('data-paleta')
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.pizarra).toBe(false)
    expect(result.current.elegir('rgba(59, 130, 246, 0.7)', 'serie-1', 0.7)).toBe('rgba(59, 130, 246, 0.7)')
  })

  it('slxStateColor: micro detención y parada sin causa YA NO comparten color', () => {
    fijarTokens(dia)
    const micro = slxStateColor('downtime', '', '#ff0000', 'Micro Detencion')
    const sinCausa = slxStateColor('downtime', '', '#ff0000', 'Downtime')
    expect(micro).toBe('rgb(19, 143, 130)') // serie 4
    expect(sinCausa).toBe('rgb(177, 39, 45)') // falla
    expect(micro).not.toBe(sinCausa)
  })

  it('slxStateColor: mapa de la paleta y sin recorte de croma', () => {
    fijarTokens(dia)
    expect(slxStateColor('downtime', 'AJUSTE MANTENCION')).toBe('rgb(42, 107, 166)') // serie 1
    expect(slxStateColor('downtime', 'FALTA MMPP')).toBe('rgb(113, 145, 70)') // serie 2
    expect(slxStateColor('setup', '')).toBe('rgb(165, 120, 190)') // serie 3
    expect(slxStateColor('downtime', 'LIMPIEZA')).toBe('rgb(108, 106, 179)') // serie 5
    expect(slxStateColor('uptime', '')).toBe('rgb(135, 134, 130)') // neutro medio
    expect(slxStateColor('break', 'COLACION')).toBe('rgb(135, 134, 130)')
    expect(slxStateColor('downtime', 'ATASCAMIENTO')).toBe('rgb(78, 77, 74)') // otra causa: neutro fuerte
    expect(slxStateTrama('break', 'COLACION')).toBe(true)
    expect(slxStateTrama('downtime', 'Planned Downtime')).toBe(true)
    expect(slxStateTrama('uptime', '')).toBe(false)
    expect(slxSuavizarAcento('#ff0000')).toBe('#ff0000') // no se vuelve a suavizar
  })

  it('en Penumbra la falla sube a #FF9A90 (3:1 sobre la tarjeta oscura)', () => {
    fijarTokens(noche)
    root().classList.add('dark')
    expect(slxStateColor('downtime', '', '#ff0000', 'Downtime')).toBe('rgb(255, 154, 144)')
  })

  it('calidades: rampa ordinal por token; qualityColorHex intacto', () => {
    expect(qualityColorVar('premium')).toBe('var(--calidad-1)')
    expect(qualityColorVar('Segunda')).toBe('var(--calidad-4)')
    expect(qualityColorVar('tercera')).toBe('var(--calidad-5)')
    expect(qualityColorVar('industrial')).toBe('rgb(var(--grafico-neutro-fuerte))')
    expect(qualityColorVar('descarte')).toBe('rgb(var(--serie-3))')
    expect(qualityColorDisplay('premium')).toBe('var(--calidad-1)')
    expect(qualityColorHex('premium')).toBe('#6366f1')
  })
})

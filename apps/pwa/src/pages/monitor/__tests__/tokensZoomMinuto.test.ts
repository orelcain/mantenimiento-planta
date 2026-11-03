/**
 * Los tokens del minuto por dentro (`--rv-*` de monitorGlass.css) son los que `scripts/check-contrast-pizarra.mjs` da por hechos al medir su
 * contraste: este test los ata. Si alguien cambia uno aquí sin cambiar la medición (o al revés), falla.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, '../monitorGlass.css'), 'utf8').replace(/\r\n/g, '\n')
const script = readFileSync(resolve(__dirname, '../../../../../../scripts/check-contrast-pizarra.mjs'), 'utf8')

describe('tokens del minuto por dentro', () => {
  it('cada token deriva del texto 1 o del gris de las marcas, con las mismas mezclas que mide el script de contraste', () => {
    expect(css).toContain('--rv-detenida: rgb(var(--foreground));')
    expect(css).toContain('--rv-velo: rgb(var(--foreground) / 0.07);')
    expect(css).toContain('--rv-micro: color-mix(in srgb, rgb(142 142 147) 88%, rgb(var(--foreground)));')
    expect(css).toContain('--rv-escalon: rgb(var(--foreground) / 0.85);')
    expect(css).toContain('--rv-guia: rgb(142 142 147 / 0.30);')
    expect(css).toContain('--rv-minuto: rgb(142 142 147 / 0.16);')
    expect(css).toContain('--rv-foco: rgb(var(--foreground) / 0.05);')
    /* En Penumbra la muesca es el gris tal cual. */
    expect(css).toMatch(/\.dark \.rv-grafico \{ --rv-micro: rgb\(142 142 147\); \}/)
  })
  it('el script de contraste mide la muesca como 88 % gris + 12 % texto 1 (Día), el velo al 7 % y el escalón al 85 %', () => {
    expect(script).toContain('componer(GRIS_MARCA, t.foreground, 0.12)')
    expect(script).toContain('componer(fila, t.foreground, 0.07)')
    expect(script).toContain('componer(fila, t.foreground, 0.85)')
    expect(script).toContain("const GRIS_MARCA = '#8e8e93'")
  })
})

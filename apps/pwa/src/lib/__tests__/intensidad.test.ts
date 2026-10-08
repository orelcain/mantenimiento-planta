import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  oscuroDe,
  resolverIntensidad,
  resolverPiel,
  type EntradaIntensidad,
} from '../intensidad'

/**
 * Paleta Pizarra: la intensidad (Día · Penumbra · Automático) se resuelve ANTES
 * del primer pintado, en el script inline de index.html. Estos tests fijan la regla
 * en la función pura Y ejecutan el script real para comprobar que no se desvíen.
 */
const base: EntradaIntensidad = { guardada: null, tema: null, esCelular: false, sistemaOscuro: false }

describe('resolverIntensidad', () => {
  it('app-intensidad guardada manda sobre todo lo demás', () => {
    expect(resolverIntensidad({ ...base, guardada: 'dia', tema: 'dark', sistemaOscuro: true })).toEqual({ intensidad: 'dia', oscuro: false })
    expect(resolverIntensidad({ ...base, guardada: 'penumbra', tema: 'light', esCelular: true })).toEqual({ intensidad: 'penumbra', oscuro: true })
  })

  it('con un app-theme guardado y sin intensidad se respeta: dark → Penumbra, light → Día', () => {
    expect(resolverIntensidad({ ...base, tema: 'dark', esCelular: true })).toEqual({ intensidad: 'penumbra', oscuro: true })
    expect(resolverIntensidad({ ...base, tema: 'light', sistemaOscuro: true })).toEqual({ intensidad: 'dia', oscuro: false })
  })

  it('sin nada guardado: celular → Día; PC → Automático (sigue al sistema)', () => {
    expect(resolverIntensidad({ ...base, esCelular: true, sistemaOscuro: true })).toEqual({ intensidad: 'dia', oscuro: false })
    expect(resolverIntensidad({ ...base, sistemaOscuro: false })).toEqual({ intensidad: 'auto', oscuro: false })
    expect(resolverIntensidad({ ...base, sistemaOscuro: true })).toEqual({ intensidad: 'auto', oscuro: true })
  })

  it('Automático guardado sigue al sistema aunque haya app-theme', () => {
    expect(resolverIntensidad({ ...base, guardada: 'auto', tema: 'light', sistemaOscuro: true })).toEqual({ intensidad: 'auto', oscuro: true })
  })

  it('un valor inválido en app-intensidad se ignora', () => {
    expect(resolverIntensidad({ ...base, guardada: 'noche', tema: 'dark' })).toEqual({ intensidad: 'penumbra', oscuro: true })
    expect(resolverIntensidad({ ...base, guardada: '' , esCelular: true })).toEqual({ intensidad: 'dia', oscuro: false })
  })

  it('oscuroDe: solo Automático depende del sistema', () => {
    expect(oscuroDe('dia', true)).toBe(false)
    expect(oscuroDe('penumbra', false)).toBe(true)
    expect(oscuroDe('auto', true)).toBe(true)
    expect(oscuroDe('auto', false)).toBe(false)
  })
})

describe('resolverPiel', () => {
  it('?skin=pizarra = piel Apple + paleta Pizarra, y se recuerda', () => {
    expect(resolverPiel('pizarra', null)).toEqual({ dataSkin: 'apple', paleta: 'pizarra', recordar: 'pizarra' })
    expect(resolverPiel(null, 'pizarra')).toEqual({ dataSkin: 'apple', paleta: 'pizarra', recordar: null })
  })

  it('?skin=apple vuelve a la paleta normal aunque antes hubiera Pizarra', () => {
    expect(resolverPiel('apple', 'pizarra')).toEqual({ dataSkin: 'apple', paleta: null, recordar: 'apple' })
  })

  it('sin nada guardado sigue siendo Apple sin paleta; default = sin atributo', () => {
    expect(resolverPiel(null, null)).toEqual({ dataSkin: 'apple', paleta: null, recordar: null })
    expect(resolverPiel('default', null)).toEqual({ dataSkin: null, paleta: null, recordar: 'default' })
  })
})

// ── El script REAL de index.html, ejecutado con un entorno simulado ──────────
interface Entorno {
  search?: string
  store?: Record<string, string>
  celular?: boolean
  sistemaOscuro?: boolean
  /** Simula almacenamiento roto: lecturas, escrituras o ambas lanzan. */
  falla?: 'set' | 'get' | 'ambos'
}

function correrScriptInicial({ search = '', store = {}, celular = false, sistemaOscuro = false, falla }: Entorno) {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8') // vitest corre con cwd = apps/pwa
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1] ?? '')
  const src = scripts.find(s => s.includes('app-skin'))
  if (!src) throw new Error('No se encontró el script de tema en index.html')

  const attrs: Record<string, string> = {}
  const clases = new Set<string>()
  let themeColor = ''
  const doc = {
    documentElement: {
      classList: { add: (c: string) => { clases.add(c) } },
      setAttribute: (k: string, v: string) => { attrs[k] = v },
    },
    querySelector: () => ({ setAttribute: (_k: string, v: string) => { themeColor = v } }),
  }
  const ls = {
    getItem: (k: string) => {
      if (falla === 'get' || falla === 'ambos') throw new Error('SecurityError')
      return k in store ? (store[k] as string) : null
    },
    setItem: (k: string, v: string) => {
      if (falla === 'set' || falla === 'ambos') throw new DOMException('cuota llena', 'QuotaExceededError')
      store[k] = v
    },
  }
  const win = {
    matchMedia: (q: string) => ({
      matches: q.includes('prefers-color-scheme') ? sistemaOscuro : celular,
    }),
  }
  new Function('document', 'localStorage', 'location', 'window', src)(doc, ls, { search }, win)
  return { oscuro: clases.has('dark'), dataSkin: attrs['data-skin'] ?? null, paleta: attrs['data-paleta'] ?? null, themeColor, store }
}

describe('script inline de index.html (anti-parpadeo)', () => {
  it('SIN Pizarra queda exactamente como antes: oscuro por defecto, Apple, sin paleta', () => {
    expect(correrScriptInicial({})).toMatchObject({ oscuro: true, dataSkin: 'apple', paleta: null, themeColor: '#1c1c1e' })
    expect(correrScriptInicial({ store: { 'app-theme': 'light' } })).toMatchObject({ oscuro: false, dataSkin: 'apple', paleta: null, themeColor: '#f2f2f7' })
    expect(correrScriptInicial({ store: { 'app-skin': 'default' } })).toMatchObject({ oscuro: true, dataSkin: null, paleta: null, themeColor: '#0d1722' })
  })

  it('SIN Pizarra ignora app-intensidad (el interruptor manda)', () => {
    const r = correrScriptInicial({ store: { 'app-intensidad': 'dia' } })
    expect(r).toMatchObject({ oscuro: true, paleta: null })
  })

  it('?skin=pizarra se recuerda y activa data-paleta con data-skin="apple"', () => {
    const r = correrScriptInicial({ search: '?skin=pizarra', celular: true })
    expect(r).toMatchObject({ dataSkin: 'apple', paleta: 'pizarra', oscuro: false, themeColor: '#F2F1EC' })
    expect(r.store['app-skin']).toBe('pizarra')
  })

  it('si falla setItem(app-skin) (cuota llena) el tema inicial igual se aplica', () => {
    // Antes la escritura iba primero y el script moría antes de poner .dark.
    expect(correrScriptInicial({ search: '?skin=apple', falla: 'set' })).toMatchObject({ oscuro: true, dataSkin: 'apple', themeColor: '#1c1c1e' })
    expect(correrScriptInicial({ search: '?skin=apple', store: { 'app-theme': 'light' }, falla: 'set' })).toMatchObject({ oscuro: false, dataSkin: 'apple' })
    const piz = correrScriptInicial({ search: '?skin=pizarra', store: { 'app-theme': 'dark' }, falla: 'set' })
    expect(piz).toMatchObject({ oscuro: true, paleta: 'pizarra', dataSkin: 'apple', themeColor: '#171614' })
  })

  it('si fallan las lecturas de localStorage también se aplica un tema (oscuro por defecto)', () => {
    expect(correrScriptInicial({ falla: 'ambos' })).toMatchObject({ oscuro: true, dataSkin: 'apple', paleta: null })
    // ?skin=pizarra viene en la URL: no depende del almacenamiento. PC sin datos → Automático.
    expect(correrScriptInicial({ search: '?skin=pizarra', falla: 'ambos', sistemaOscuro: false })).toMatchObject({ oscuro: false, paleta: 'pizarra', dataSkin: 'apple' })
  })

  it('?skin=apple desactiva la paleta aunque estuviera recordada', () => {
    const r = correrScriptInicial({ search: '?skin=apple', store: { 'app-skin': 'pizarra' } })
    expect(r).toMatchObject({ dataSkin: 'apple', paleta: null })
  })

  it('el script y la función pura dan lo mismo en toda la matriz', () => {
    const guardadas = [null, 'dia', 'penumbra', 'auto', 'basura']
    const temas = [null, 'dark', 'light']
    for (const guardada of guardadas) for (const tema of temas) for (const celular of [false, true]) for (const sistemaOscuro of [false, true]) {
      const store: Record<string, string> = { 'app-skin': 'pizarra' }
      if (guardada) store['app-intensidad'] = guardada
      if (tema) store['app-theme'] = tema
      const esperado = resolverIntensidad({ guardada, tema, esCelular: celular, sistemaOscuro })
      const real = correrScriptInicial({ store, celular, sistemaOscuro })
      expect({ guardada, tema, celular, sistemaOscuro, oscuro: real.oscuro }).toEqual({ guardada, tema, celular, sistemaOscuro, oscuro: esperado.oscuro })
      expect(real.themeColor).toBe(esperado.oscuro ? '#171614' : '#F2F1EC')
    }
  })
})

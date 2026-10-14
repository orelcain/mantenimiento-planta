import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  oscuroDe,
  pielEfectiva,
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

  it('PC: con app-theme guardado y sin intensidad se respeta: dark → Penumbra, light → Día', () => {
    expect(resolverIntensidad({ ...base, tema: 'dark' })).toEqual({ intensidad: 'penumbra', oscuro: true })
    expect(resolverIntensidad({ ...base, tema: 'light', sistemaOscuro: true })).toEqual({ intensidad: 'dia', oscuro: false })
  })

  it('celular + app-theme=dark sin app-intensidad → Día (ese dark lo escribió useTheme, no la persona)', () => {
    expect(resolverIntensidad({ ...base, tema: 'dark', esCelular: true })).toEqual({ intensidad: 'dia', oscuro: false })
    expect(resolverIntensidad({ ...base, tema: 'dark', esCelular: true, sistemaOscuro: true })).toEqual({ intensidad: 'dia', oscuro: false })
  })

  it('celular + app-intensidad elegida se respeta', () => {
    expect(resolverIntensidad({ ...base, guardada: 'penumbra', tema: 'dark', esCelular: true })).toEqual({ intensidad: 'penumbra', oscuro: true })
    expect(resolverIntensidad({ ...base, guardada: 'auto', esCelular: true, sistemaOscuro: true })).toEqual({ intensidad: 'auto', oscuro: true })
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

describe('resolverPiel (Pizarra predeterminada)', () => {
  const PIZARRA = { dataSkin: 'apple', paleta: 'pizarra' }

  it('sin ?skin= ni nada guardado → Pizarra, sin escribir nada', () => {
    expect(resolverPiel(null, null)).toEqual({ ...PIZARRA, recordar: null })
    expect(resolverPiel(null, null, false)).toEqual({ ...PIZARRA, recordar: null })
  })

  it('app-skin=apple ELEGIDO (con marca de versión) → paleta anterior', () => {
    expect(resolverPiel(null, 'apple', true)).toEqual({ dataSkin: 'apple', paleta: null, recordar: null })
  })

  it('?skin=apple → paleta anterior aunque haya Pizarra guardada, y se recuerda', () => {
    expect(resolverPiel('apple', 'pizarra')).toEqual({ dataSkin: 'apple', paleta: null, recordar: 'apple' })
    expect(resolverPiel('apple', null, false)).toEqual({ dataSkin: 'apple', paleta: null, recordar: 'apple' })
  })

  it('?skin=pizarra → Pizarra aunque hubiera apple elegido, y se recuerda', () => {
    expect(resolverPiel('pizarra', 'apple', true)).toEqual({ ...PIZARRA, recordar: 'pizarra' })
    expect(resolverPiel(null, 'pizarra')).toEqual({ ...PIZARRA, recordar: null })
  })

  it('?skin=default → piel antigua (sin atributo); guardada también se respeta', () => {
    expect(resolverPiel('default', null)).toEqual({ dataSkin: null, paleta: null, recordar: 'default' })
    expect(resolverPiel(null, 'default', false)).toEqual({ dataSkin: null, paleta: null, recordar: null })
  })

  it('MIGRACIÓN: un apple guardado SIN marca de versión es «sin elegir» → Pizarra', () => {
    expect(resolverPiel(null, 'apple', false)).toEqual({ ...PIZARRA, recordar: null })
    expect(pielEfectiva(null, 'apple', false)).toBe('pizarra')
    expect(pielEfectiva(null, 'apple', true)).toBe('apple')
    // default y pizarra solo se guardaban a propósito: la migración no los toca
    expect(pielEfectiva(null, 'default', false)).toBe('default')
    expect(pielEfectiva(null, 'pizarra', false)).toBe('pizarra')
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
    removeItem: (k: string) => {
      if (falla === 'set' || falla === 'ambos') throw new DOMException('cuota llena', 'QuotaExceededError')
      delete store[k]
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

// Elección explícita de la paleta anterior: app-skin=apple CON la marca de versión.
const APPLE = { 'app-skin': 'apple', 'app-skin-v': '2' }

describe('predeterminado y vía de escape (script real)', () => {
  it('sin app-skin → Pizarra (data-skin="apple" + data-paleta="pizarra"); marca la versión', () => {
    const r = correrScriptInicial({ celular: true })
    expect(r).toMatchObject({ dataSkin: 'apple', paleta: 'pizarra', oscuro: false, themeColor: '#F2F1EC' })
    expect(r.store['app-skin']).toBeUndefined()
    expect(r.store['app-skin-v']).toBe('2')
    expect(r.store['app-intensidad']).toBeUndefined()
  })

  it('app-skin=apple EXPLÍCITO (con marca) → paleta anterior, y se conserva', () => {
    const r = correrScriptInicial({ store: { ...APPLE } })
    expect(r).toMatchObject({ dataSkin: 'apple', paleta: null })
    expect(r.store['app-skin']).toBe('apple')
  })

  it('?skin=apple → paleta anterior y queda guardado como elección explícita', () => {
    const r = correrScriptInicial({ search: '?skin=apple' })
    expect(r).toMatchObject({ dataSkin: 'apple', paleta: null })
    expect(r.store).toMatchObject({ 'app-skin': 'apple', 'app-skin-v': '2' })
    // y la próxima carga, sin ?skin=, lo respeta (no lo borra la migración)
    expect(correrScriptInicial({ store: r.store })).toMatchObject({ dataSkin: 'apple', paleta: null })
  })

  it('?skin=pizarra → Pizarra y queda guardado, aunque hubiera apple explícito', () => {
    const r = correrScriptInicial({ search: '?skin=pizarra', store: { ...APPLE } })
    expect(r).toMatchObject({ dataSkin: 'apple', paleta: 'pizarra' })
    expect(r.store).toMatchObject({ 'app-skin': 'pizarra', 'app-skin-v': '2' })
  })

  it('?skin=default → piel antigua, guardada', () => {
    const r = correrScriptInicial({ search: '?skin=default' })
    expect(r).toMatchObject({ dataSkin: null, paleta: null, themeColor: '#0d1722' })
    expect(r.store).toMatchObject({ 'app-skin': 'default', 'app-skin-v': '2' })
  })

  it('MIGRACIÓN: app-skin=apple sin marca (heredado) → Pizarra, se borra una vez y se marca', () => {
    const r = correrScriptInicial({ store: { 'app-skin': 'apple' }, celular: true })
    expect(r).toMatchObject({ dataSkin: 'apple', paleta: 'pizarra', oscuro: false })
    expect(r.store['app-skin']).toBeUndefined()
    expect(r.store['app-skin-v']).toBe('2')
  })

  it('MIGRACIÓN: default y pizarra guardados sin marca se respetan; la marca se agrega', () => {
    const d = correrScriptInicial({ store: { 'app-skin': 'default' } })
    expect(d).toMatchObject({ dataSkin: null, paleta: null })
    expect(d.store).toMatchObject({ 'app-skin': 'default', 'app-skin-v': '2' })
    const p = correrScriptInicial({ store: { 'app-skin': 'pizarra' } })
    expect(p).toMatchObject({ paleta: 'pizarra' })
    expect(p.store).toMatchObject({ 'app-skin': 'pizarra', 'app-skin-v': '2' })
  })

  it('la migración corre UNA vez: tras ella, un apple nuevo (?skin=apple) ya no se borra', () => {
    const a = correrScriptInicial({ store: { 'app-skin': 'apple' } })
    expect(a.paleta).toBe('pizarra')
    const b = correrScriptInicial({ search: '?skin=apple', store: a.store })
    expect(b.paleta).toBeNull()
    expect(correrScriptInicial({ store: b.store }).paleta).toBeNull()
  })

  it('el script y resolverPiel coinciden para toda combinación de ?skin, app-skin y marca', () => {
    for (const qs of [null, 'apple', 'pizarra', 'default'])
      for (const guardada of [null, 'apple', 'pizarra', 'default'])
        for (const marca of [false, true]) {
          const store: Record<string, string> = {}
          if (guardada) store['app-skin'] = guardada
          if (marca) store['app-skin-v'] = '2'
          const real = correrScriptInicial({ search: qs ? '?skin=' + qs : '', store })
          const esp = resolverPiel(qs, guardada, marca)
          expect({ qs, guardada, marca, dataSkin: real.dataSkin, paleta: real.paleta })
            .toEqual({ qs, guardada, marca, dataSkin: esp.dataSkin, paleta: esp.paleta })
        }
  })

  it('theme-color inicial coherente con Pizarra: Día #F2F1EC / Penumbra #171614', () => {
    expect(correrScriptInicial({ celular: true }).themeColor).toBe('#F2F1EC')
    expect(correrScriptInicial({ store: { 'app-intensidad': 'penumbra' } }).themeColor).toBe('#171614')
  })

  it('la meta theme-color del HTML (antes del script) ya es la de Pizarra Día', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    expect(html).toMatch(/<meta name="theme-color" content="#F2F1EC"/)
  })
})

describe('script inline de index.html (anti-parpadeo)', () => {
  it('con la paleta anterior (apple elegido) queda como antes: oscuro por defecto, sin paleta', () => {
    expect(correrScriptInicial({ store: { ...APPLE } })).toMatchObject({ oscuro: true, dataSkin: 'apple', paleta: null, themeColor: '#1c1c1e' })
    expect(correrScriptInicial({ store: { ...APPLE, 'app-theme': 'light' } })).toMatchObject({ oscuro: false, dataSkin: 'apple', paleta: null, themeColor: '#f2f2f7' })
    expect(correrScriptInicial({ store: { 'app-skin': 'default' } })).toMatchObject({ oscuro: true, dataSkin: null, paleta: null, themeColor: '#0d1722' })
  })

  it('con la paleta anterior ignora app-intensidad (la paleta manda)', () => {
    const r = correrScriptInicial({ store: { ...APPLE, 'app-intensidad': 'dia' } })
    expect(r).toMatchObject({ oscuro: true, paleta: null })
  })

  it('casos puntuales del script con Pizarra: celular/PC y app-theme, sin escribir app-intensidad', () => {
    const piz = { 'app-skin': 'pizarra' }
    const a = correrScriptInicial({ store: { ...piz, 'app-theme': 'dark' }, celular: true })
    expect(a).toMatchObject({ oscuro: false, themeColor: '#F2F1EC' })
    expect(a.store['app-intensidad']).toBeUndefined()
    const b = correrScriptInicial({ store: { ...piz, 'app-intensidad': 'penumbra' }, celular: true })
    expect(b).toMatchObject({ oscuro: true, themeColor: '#171614' })
    expect(correrScriptInicial({ store: { ...piz, 'app-theme': 'dark' } })).toMatchObject({ oscuro: true, themeColor: '#171614' })
    expect(correrScriptInicial({ store: { ...piz }, sistemaOscuro: true })).toMatchObject({ oscuro: true })
    expect(correrScriptInicial({ store: { ...piz }, sistemaOscuro: false })).toMatchObject({ oscuro: false })
  })

  it('con la paleta anterior el celular con app-theme=dark sigue oscuro y no se escribe nada nuevo', () => {
    const r = correrScriptInicial({ store: { ...APPLE, 'app-theme': 'dark' }, celular: true })
    expect(r).toMatchObject({ oscuro: true, paleta: null, dataSkin: 'apple', themeColor: '#1c1c1e' })
    expect(Object.keys(r.store).sort()).toEqual(['app-skin', 'app-skin-v', 'app-theme'])
  })

  it('Pizarra PREDETERMINADA (sin app-skin): celular parte en Día aunque app-theme=dark; PC sigue app-theme/sistema', () => {
    expect(correrScriptInicial({ store: { 'app-theme': 'dark' }, celular: true })).toMatchObject({ paleta: 'pizarra', oscuro: false })
    expect(correrScriptInicial({ store: { 'app-theme': 'dark' }, celular: true, sistemaOscuro: true })).toMatchObject({ oscuro: false })
    expect(correrScriptInicial({ store: { 'app-theme': 'dark' } })).toMatchObject({ paleta: 'pizarra', oscuro: true })
    expect(correrScriptInicial({ sistemaOscuro: true })).toMatchObject({ paleta: 'pizarra', oscuro: true })
    expect(correrScriptInicial({ sistemaOscuro: false })).toMatchObject({ paleta: 'pizarra', oscuro: false })
    expect(correrScriptInicial({ store: { 'app-intensidad': 'penumbra' }, celular: true })).toMatchObject({ oscuro: true })
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
    expect(correrScriptInicial({ falla: 'set' })).toMatchObject({ paleta: 'pizarra', dataSkin: 'apple' })
    const piz = correrScriptInicial({ search: '?skin=pizarra', store: { 'app-theme': 'dark' }, falla: 'set' })
    expect(piz).toMatchObject({ oscuro: true, paleta: 'pizarra', dataSkin: 'apple', themeColor: '#171614' })
  })

  it('si fallan las lecturas de localStorage también se aplica un tema (oscuro por defecto)', () => {
    // Sin lecturas no hay app-skin → Pizarra; PC sin datos → Automático (claro si el sistema es claro).
    expect(correrScriptInicial({ falla: 'ambos' })).toMatchObject({ oscuro: false, dataSkin: 'apple', paleta: 'pizarra' })
    // ?skin=apple viene en la URL: no depende del almacenamiento.
    expect(correrScriptInicial({ search: '?skin=apple', falla: 'ambos' })).toMatchObject({ oscuro: true, dataSkin: 'apple', paleta: null })
    // ?skin=pizarra viene en la URL: no depende del almacenamiento. PC sin datos → Automático.
    expect(correrScriptInicial({ search: '?skin=pizarra', falla: 'ambos', sistemaOscuro: false })).toMatchObject({ oscuro: false, paleta: 'pizarra', dataSkin: 'apple' })
  })

  it('?skin=apple desactiva la paleta aunque estuviera recordada', () => {
    const r = correrScriptInicial({ search: '?skin=apple', store: { 'app-skin': 'pizarra' } })
    expect(r).toMatchObject({ dataSkin: 'apple', paleta: null })
    expect(r.store['app-skin']).toBe('apple')
  })

  it('el script y la función pura dan lo mismo en toda la matriz', () => {
    const guardadas = [null, 'dia', 'penumbra', 'auto', 'basura']
    const temas = [null, 'dark', 'light']
    for (const guardada of guardadas) for (const tema of temas) for (const celular of [false, true]) for (const sistemaOscuro of [false, true]) {
      const store: Record<string, string> = {} // sin app-skin: Pizarra es la predeterminada
      if (guardada) store['app-intensidad'] = guardada
      if (tema) store['app-theme'] = tema
      const esperado = resolverIntensidad({ guardada, tema, esCelular: celular, sistemaOscuro })
      const real = correrScriptInicial({ store, celular, sistemaOscuro })
      expect({ guardada, tema, celular, sistemaOscuro, oscuro: real.oscuro }).toEqual({ guardada, tema, celular, sistemaOscuro, oscuro: esperado.oscuro })
      expect(real.themeColor).toBe(esperado.oscuro ? '#171614' : '#F2F1EC')
    }
  })
})

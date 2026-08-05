import { describe, it, expect } from 'vitest'
import { shouldNotifyUpdate } from '../useAppVersion'

/**
 * El caso que motivó todo esto: entre el 23/07 y el 04/08/2026 el semver quedó
 * congelado en 3.99.6 con 39 mejoras ya desplegadas. El aviso de "hay versión
 * nueva" solo miraba semver, así que nunca salió.
 */
describe('shouldNotifyUpdate', () => {
  const dev = { version: '4.0.0', buildSha: 'dev' }

  it('avisa cuando el servidor tiene un semver mayor', () => {
    expect(shouldNotifyUpdate({ version: '4.1.0' }, { version: '4.0.0', buildSha: 'aaaaaaa' }))
      .toEqual({ update: true, reason: 'semver' })
  })

  it('NO avisa cuando el servidor tiene un semver menor', () => {
    expect(shouldNotifyUpdate({ version: '3.99.6' }, { version: '4.0.0', buildSha: 'aaaaaaa' }))
      .toEqual({ update: false, reason: null })
  })

  it('avisa por buildSha distinto aunque el semver sea idéntico — el bug de las 39 mejoras invisibles', () => {
    expect(shouldNotifyUpdate(
      { version: '3.99.6', buildSha: 'bbbbbbb' },
      { version: '3.99.6', buildSha: 'aaaaaaa' },
    )).toEqual({ update: true, reason: 'buildSha' })
  })

  it('NO avisa cuando el build es exactamente el mismo', () => {
    expect(shouldNotifyUpdate(
      { version: '4.0.0', buildSha: 'aaaaaaa' },
      { version: '4.0.0', buildSha: 'aaaaaaa' },
    )).toEqual({ update: false, reason: null })
  })

  it('NO avisa en build local sin git (sha "dev"): si no, avisaría en cada pnpm dev', () => {
    expect(shouldNotifyUpdate({ version: '4.0.0', buildSha: 'bbbbbbb' }, dev))
      .toEqual({ update: false, reason: null })
  })

  it('el semver mayor gana aunque el sha sea "dev": un release marcado sí se avisa', () => {
    expect(shouldNotifyUpdate({ version: '4.1.0', buildSha: 'bbbbbbb' }, dev))
      .toEqual({ update: true, reason: 'semver' })
  })

  it('tolera un version.json antiguo, sin buildSha (deploy previo a este cambio)', () => {
    expect(shouldNotifyUpdate(
      { version: '4.0.0' },
      { version: '4.0.0', buildSha: 'aaaaaaa' },
    )).toEqual({ update: false, reason: null })
  })

  it('compara semver por número, no por texto: 4.10.0 es mayor que 4.9.0', () => {
    expect(shouldNotifyUpdate({ version: '4.10.0' }, { version: '4.9.0', buildSha: 'aaaaaaa' }))
      .toEqual({ update: true, reason: 'semver' })
  })
})

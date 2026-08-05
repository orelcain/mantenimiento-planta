/**
 * Identidad del build que se está ejecutando.
 *
 * Por qué existe: `APP_VERSION` solo cambia cuando alguien se acuerda de subirla
 * a mano, y entre el 23/07 y el 04/08/2026 se quedó 13 días atrás con 39 mejoras
 * desplegadas. Mirar la versión no decía si la app estaba al día — y peor: el
 * aviso de "hay una versión nueva" (`useAppVersion`) compara semver, así que con
 * la versión congelada NUNCA se disparaba y la gente seguía con el bundle viejo.
 *
 * `BUILD_SHA` cambia en cada deploy sin que nadie tenga que acordarse de nada,
 * así que responde con exactitud "¿qué está desplegado?" y "¿tengo lo último?".
 *
 * Los valores los inyecta Vite con `define` (ver vite.config.ts):
 * - En CI vienen de `GITHUB_SHA` y de la hora del build.
 * - En local salen de `git rev-parse`, con `'dev'` como último recurso.
 */

/** SHA corto del commit del que salió este bundle. `'dev'` si se compiló sin git. */
export const BUILD_SHA: string = __BUILD_SHA__

/** Momento del build, ISO 8601. */
export const BUILD_TIME: string = __BUILD_TIME__

/**
 * Etiqueta corta para mostrar junto a la versión: `1ce5bbe · 04-08 20:15`.
 * En hora local del navegador, que es la que le sirve a quien está mirando.
 */
export function formatBuildLabel(): string {
  const d = new Date(BUILD_TIME)
  if (Number.isNaN(d.getTime())) return BUILD_SHA
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${BUILD_SHA} · ${dd}-${mm} ${hh}:${mi}`
}

/** `05-08` — fecha del build, para donde no cabe más (sidebar colapsado). */
export function formatBuildDateShort(): string {
  const d = new Date(BUILD_TIME)
  if (Number.isNaN(d.getTime())) return BUILD_SHA
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Lo que el sello dice de cara al usuario: **cuándo** se actualizó la app.
 *
 * Es la pregunta que se hace quien mira ahí — "¿tengo lo último?" — y la única
 * que el dato puede responder con verdad. El semver no puede: se sube a mano,
 * y entre el 23/07 y el 04/08/2026 se quedó 13 días atrás con 39 mejoras
 * desplegadas, así que un `v4.0.0` a la vista afirmaba algo falso. La versión y
 * el SHA siguen disponibles en el tooltip, que es donde sirven: soporte y
 * diagnóstico.
 *
 *   "Actualizada hoy 14:25" · "Actualizada ayer 09:12" · "Actualizada el 28-07"
 */
export function formatUpdatedLabel(now: Date = new Date()): string {
  const d = new Date(BUILD_TIME)
  if (Number.isNaN(d.getTime())) return 'Versión de desarrollo'

  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const atDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dias = Math.round((atDay(now) - atDay(d)) / 86_400_000)

  if (dias <= 0) return `Actualizada hoy ${hh}:${mi}`
  if (dias === 1) return `Actualizada ayer ${hh}:${mi}`
  return `Actualizada el ${formatBuildDateShort()}`
}

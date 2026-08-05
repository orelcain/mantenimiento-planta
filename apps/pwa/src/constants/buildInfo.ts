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

/* Bootstrap pre-React: corre antes de que main.tsx cargue.
 * Antes vivía como dos <script> inline en index.html, pero eso obligaba a
 * dejar `'unsafe-inline'` en el script-src del CSP. Moverlo a un archivo
 * estático con hash predecible permite endurecer el CSP en una iteración
 * futura (compute sha256 + `'sha256-...'` en script-src).
 */
(function () {
  // 1. SPA redirect — restaurar la URL original guardada por 404.html (GitHub Pages).
  try {
    var redirect = sessionStorage.getItem('spa-redirect')
    if (redirect) {
      sessionStorage.removeItem('spa-redirect')
      window.history.replaceState(null, null, redirect)
    }
  } catch (_) { /* sessionStorage puede no estar disponible */ }

  // 2. Aplicar tema antes de que React monte (evita flash de tema claro).
  try {
    var theme = localStorage.getItem('app-theme') || 'dark'
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    }
  } catch (_) { /* localStorage puede no estar disponible */ }
})()

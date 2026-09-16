#!/usr/bin/env node
/**
 * Guardián de idioma: la app escribe en español neutro, nunca en voseo.
 *
 * El 15-09-2026 se barrieron 487 apariciones de voseo rioplatense —«Tocá un
 * turno», «podés recargar», «Mandá la foto», «Sos ARIA»— repartidas por la
 * interfaz, el bot de Telegram, los prompts de ARIA y las páginas embebidas.
 * Este script existe para que no vuelvan de a poco.
 *
 * Qué NO marca, a propósito:
 *  - Los pretéritos de primera persona («Cambié gate», «Ajusté RPM», «Registré
 *    este cambio»): son correctos y además son etiquetas de acciones guardadas.
 *  - Lo que el bot LEE del usuario: la detección de intención tiene voseo a
 *    propósito («dale», «hacelo», «creala»). Por eso la lista es de formas de
 *    SALIDA y los archivos de detección declaran su excepción con el comentario
 *    `voseo-ok` en la línea.
 *  - `vendor/` y `node_modules/`: código de terceros.
 *
 * Uso:  node scripts/audit-voseo.mjs [--verbose]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const CARPETAS = ['apps/pwa/src', 'apps/pwa/public', 'functions', 'scripts']
const EXTENSIONES = ['.ts', '.tsx', '.js', '.mjs', '.html']
const EXCLUIR = ['node_modules', `${sep}vendor${sep}`, `${sep}dist${sep}`, '.min.js', '.min.mjs',
  // Este mismo archivo: su lista de formas prohibidas no es texto de la app.
  `${sep}audit-voseo.mjs`]

/** Formas de voseo que NO deben aparecer en texto que la app escribe. */
const FORMAS = [
  // imperativos
  'cargá', 'registrá', 'tocá', 'anotá', 'revisá', 'deslizá', 'mirá', 'sacá', 'poné', 'hacé',
  'tené', 'elegí', 'escribí', 'subí', 'abrí', 'probá', 'usá', 'marcá', 'buscá', 'agregá',
  'guardá', 'editá', 'cambiá', 'seleccioná', 'completá', 'confirmá', 'enviá', 'descargá',
  'compartí', 'pedí', 'definí', 'configurá', 'activá', 'apagá', 'empezá', 'seguí', 'volvé',
  'dejá', 'contá', 'mandá', 'ingresá', 'ajustá', 'verificá', 'arrastrá', 'estirá', 'dictá',
  'dibujá', 'exportá', 'importá', 'andá', 'aprendé', 'comentá', 'respondé', 'ofrecé', 'decí',
  'intentá', 'pegá', 'copiá', 'creá', 'indicá', 'iniciá', 'pasá', 'pellizcá', 'recordá',
  'apuntá', 'analizá', 'alineá', 'ampliá', 'avisá', 'calibrá', 'clasificá', 'contactá',
  'continuá', 'detectá', 'grabá', 'mostrá', 'ocultá', 'recargá', 'recorré', 'corré',
  'redactá', 'respetá', 'sumá', 'adjuntá', 'afiná', 'arrancá', 'borrá', 'cerrá', 'comprobá',
  'consultá', 'cuidá', 'dispará', 'esperá', 'explicá', 'girá', 'ignorá', 'mové', 'orientá',
  'quitá', 'refrescá', 'reintentá', 'repasá', 'resolvé', 'sospechá', 'generá', 'reemplazá',
  'incluí', 'sugerí', 'decidí', 'detené', 'chequeá', 'preguntá', 'fijate', 'acordate',
  'quedate', 'decime', 'decímelo', 'contame', 'mandame', 'ponele', 'buscalo',
  // presente
  'podés', 'querés', 'tenés', 'sabés', 'necesitás', 'debés', 'hacés', 'decís', 'sos',
  'llevás', 'observás', 'tocás', 'hablás', 'ajustás', 'cambiás', 'confirmás', 'dejás',
  'dibujás', 'dominás', 'esperás', 'mandás', 'medís', 'quedás', 'recordás', 'registrás',
  'sentís', 'terminás', 'trabajás', 'volvés', 'anotás', 'buscás', 'traés', 'abrís',
  'pasás', 'dudás', 'preferís', 'seguís', 'venís', 'salís', 'reparás', 'puenteás',
  'contactás', 'tipeás', 'manejás', 'conocés', 'mantené',
]

// ⚠ `\b` en JavaScript es ASCII: con él «decía» da positivo, porque la «í» no
// cuenta como carácter de palabra y el límite cae en medio. Tiene que ser Unicode.
const RX = new RegExp(`(?<![\\p{L}\\p{N}_])(${FORMAS.join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
/**
 * La línea declara su excepción: o es voseo que el bot LEE del usuario, o es la
 * regla misma citando las formas prohibidas («dime», no «decime»).
 */
const EXCEPCION = /voseo-ok/

function* archivos(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (EXCLUIR.some((x) => ruta.includes(x))) continue
    const st = statSync(ruta)
    if (st.isDirectory()) yield* archivos(ruta)
    else if (EXTENSIONES.some((e) => nombre.endsWith(e))) yield ruta
  }
}

const verbose = process.argv.includes('--verbose')
const hallazgos = []
for (const carpeta of CARPETAS) {
  let dir
  try {
    dir = join(RAIZ, carpeta)
    statSync(dir)
  } catch {
    continue
  }
  for (const ruta of archivos(dir)) {
    const lineas = readFileSync(ruta, 'utf8').split('\n')
    lineas.forEach((linea, i) => {
      if (EXCEPCION.test(linea)) return
      const m = linea.match(RX)
      if (m) hallazgos.push({ ruta: relative(RAIZ, ruta).split(sep).join('/'), n: i + 1, palabras: [...new Set(m)], linea: linea.trim().slice(0, 120) })
    })
  }
}

if (hallazgos.length === 0) {
  console.log('audit-voseo: sin voseo. La app habla en español neutro.')
  process.exit(0)
}

console.error(`audit-voseo: ${hallazgos.length} línea(s) con voseo.\n`)
for (const h of hallazgos.slice(0, verbose ? hallazgos.length : 25)) {
  console.error(`  ${h.ruta}:${h.n}  [${h.palabras.join(', ')}]`)
  console.error(`      ${h.linea}`)
}
if (!verbose && hallazgos.length > 25) console.error(`  …y ${hallazgos.length - 25} más (--verbose para verlas).`)
console.error('\nLa app escribe en español neutro con tuteo: «dime», no «decime».')
console.error('Si esa línea es voseo que el bot LEE del usuario, o la regla citando las formas prohibidas,')
console.error('agrega el comentario `voseo-ok` en la misma línea.')
process.exit(1)

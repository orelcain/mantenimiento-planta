/**
 * speechNormalize — normaliza texto en español para TTS de ARIA (ariaVoice).
 *
 * La VOZ recibe el texto crudo del chat, que trae dígitos, símbolos y acrónimos
 * que las voces (Web Speech / Piper / Google / Chatterbox) pronuncian mal: "552",
 * "1 incidencia", "MTTR", "%". Esto los convierte a su forma hablada en español,
 * con género/apócope correctos ("una incidencia", "un equipo", "veintiún equipos").
 *
 * Solo afecta lo que se HABLA — el texto que se MUESTRA en el chat no cambia.
 */

const UNITS = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
  'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés',
  'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
]
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const HUND = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

function below100(n: number): string {
  if (n < 30) return UNITS[n]!
  const t = Math.floor(n / 10)
  const u = n % 10
  return u === 0 ? TENS[t]! : `${TENS[t]} y ${UNITS[u]}`
}
function below1000(n: number): string {
  if (n < 100) return below100(n)
  if (n === 100) return 'cien'
  const h = Math.floor(n / 100)
  const r = n % 100
  return r === 0 ? HUND[h]! : `${HUND[h]} ${below100(r)}`
}
/** Entero no-negativo → palabras en español (rango usado: conteos y minutos). */
export function numToWordsEs(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (n < 0) return 'menos ' + numToWordsEs(-n)
  if (n < 30) return UNITS[n] ?? String(n)
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  let out = ''
  if (millones > 0) out += (millones === 1 ? 'un millón' : `${below1000(millones)} millones`) + ' '
  if (miles > 0) out += (miles === 1 ? 'mil' : `${below1000(miles).replace(/uno$/, 'ún')} mil`) + ' '
  if (resto > 0) out += below1000(resto)
  return out.trim()
}

// Acrónimos frecuentes de ARIA → forma hablada (deletreo o expansión).
const ACRON: Record<string, string> = {
  MTTR: 'eme te te erre', MTBF: 'eme te be efe', OEE: 'o e e',
  RCM: 'erre ce eme', NFPA: 'ene efe pe a', CTD: 'ce te de',
  KPI: 'ka pe i', OTs: 'órdenes de trabajo', OT: 'orden de trabajo',
}
// Palabras que NO son sustantivo tras un número → no apocopar "uno".
const NOAPOC = new Set(['en', 'y', 'o', 'de', 'del', 'con', 'sin', 'por', 'para', 'a',
  'al', 'que', 'como', 'más', 'mas', 'pero', 'su', 'sus'])

function isFem(w: string): boolean {
  const wl = w.toLowerCase().replace(/[.,;:)]+$/, '')
  if (['orden', 'ordenes', 'órdenes', 'incidencia', 'incidencias'].includes(wl)) return true
  if (/(ción|sión|dad|tad|ez|umbre)$/.test(wl)) return true
  return /(a|as)$/.test(wl)
}
function numWord(tok: string): string {
  // es-CL: el PUNTO es separador de MILES y la COMA es decimal. "10.280" son diez
  // mil doscientos ochenta (no "diez coma..."). Detectamos miles como uno o más
  // grupos de EXACTAMENTE 3 dígitos tras punto ("10.280", "1.234.567"), con
  // decimal opcional por coma ("10.280,5"). Así no se confunde con "87.3" (que
  // es decimal estilo US: 1 dígito tras el punto).
  const miles = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/.exec(tok)
  if (miles) {
    let w = numToWordsEs(parseInt(miles[1]!.replace(/\./g, ''), 10))
    if (miles[2] != null) w += ' coma ' + miles[2].split('').map((d) => numToWordsEs(+d)).join(' ')
    return w
  }
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(tok)
  if (!m) return tok
  const ent = m[1]!
  const dec = m[2]
  if (dec == null && ent.length > 6) {
    return ent.split('').map((d) => numToWordsEs(+d)).join(' ') // tags/IDs largos: dígito a dígito
  }
  let w = numToWordsEs(parseInt(ent, 10))
  if (dec != null) w += ' coma ' + dec.split('').map((d) => numToWordsEs(+d)).join(' ')
  return w
}

/**
 * Limpia el texto para que sea LEÍBLE en voz: quita lo que suena absurdo o rompe
 * algunos motores (Chatterbox falla con emojis y con selectores de variación huérfanos).
 * Saca tablas markdown (filas con `|`), separadores, viñetas, encabezados, markdown
 * inline, links internos `[[..]]`, el bloque [SUGERENCIAS] y los emojis. Deja la prosa.
 */
export function plainForSpeech(text: string): string {
  let s = text
  s = s.replace(/\n?\[SUGERENCIAS\][\s\S]*$/i, '')        // bloque de sugerencias al final
  s = s.replace(/^\s*\|.*\|\s*$/gm, ' ')                  // filas de tabla markdown (multilínea)
  s = s.replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, ' ')        // separadores ---|---
  s = s.replace(/\|/g, ' ')                               // pipes sueltos (tabla en 1 línea)
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1') // negrita/itálica
  s = s.replace(/`([^`]+)`/g, '$1')                       // código inline
  s = s.replace(/\[\[[^\]]*\]\]/g, ' ')                   // links internos [[..]]
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '')                // encabezados
  s = s.replace(/^\s*[-*•]\s+/gm, '')                     // viñetas
  // Emojis/pictogramas + selector de variación (U+FE0F) y ZWJ (U+200D) huérfanos: el glifo
  // rompe Chatterbox y suena mal en cualquier motor; los format-chars sueltos también lo rompen.
  // Clase para los rangos pictográficos + alternación para los format-chars (evita la regla
  // no-misleading-character-class, que solo aplica a clases).
  s = s.replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}/gu,
    '',
  )
  return s.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '. ').replace(/\.\s*\.+/g, '.').trim()
}

/**
 * Trocea texto YA normalizado en frases para reproducir el TTS EN CADENA. Esto baja
 * mucho la latencia percibida: se sintetiza y suena la 1ª frase (~1-2 s) mientras se
 * precargan las siguientes, en vez de esperar a sintetizar toda la respuesta (con
 * Chirp-HD-F una respuesta larga tardaba 10-15 s en empezar a sonar).
 *
 * - Une fragmentos muy cortos (<18 chars) al anterior para no cortar la prosodia.
 * - Parte frases muy largas (> maxLen) por comas para acotar la 1ª espera.
 * Devuelve siempre al menos un trozo (el texto entero si no hay puntuación).
 */
export function splitForTTS(text: string, maxLen = 200): string[] {
  const pieces = (text.match(/[^.!?…\n]+[.!?…]*/g) || [text])
    .map((s) => s.trim())
    .filter(Boolean)
  // 1) une fragmentos minúsculos al trozo previo (p.ej. "Sí." + "Revisa la bomba.")
  const merged: string[] = []
  for (const p of pieces) {
    const prev = merged[merged.length - 1]
    if (prev && (p.length < 18 || prev.length < 18)) merged[merged.length - 1] = `${prev} ${p}`
    else merged.push(p)
  }
  // 2) parte frases largas por comas para que el 1er trozo sea corto = sintetiza rápido
  const out: string[] = []
  for (const s of merged) {
    if (s.length <= maxLen) { out.push(s); continue }
    let buf = ''
    for (const seg of s.split(/,\s*/)) {
      const cand = buf ? `${buf}, ${seg}` : seg
      if (cand.length > maxLen && buf) { out.push(buf); buf = seg }
      else buf = cand
    }
    if (buf) out.push(buf)
  }
  return out.length ? out : [text.trim() || text]
}

/** Convierte dígitos/símbolos/acrónimos a su forma hablada en español. */
export function normalizeForSpeech(text: string): string {
  let s = text
  for (const a of ['OTs', 'MTTR', 'MTBF', 'OEE', 'RCM', 'NFPA', 'CTD', 'KPI', 'OT']) {
    s = s.replace(new RegExp(`\\b${a}\\b`, 'g'), ACRON[a]!)
  }
  s = s.replace(/%/g, ' por ciento').replace(/°C/g, ' grados').replace(/º/g, ' grados')
  s = s.replace(/\bmin\b/g, 'minutos').replace(/\bhrs?\b/g, 'horas')
  // número + (opcional) palabra siguiente → decide género/apócope de "uno".
  // El 1er grupo captura miles es-CL ("10.280", "1.234.567", "10.280,5") o un
  // entero/decimal simple ("45", "87.3", "86,0").
  s = s.replace(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]+)?/g, (_m, num: string, nxt?: string) => {
    let w = numWord(num)
    const tail = nxt ?? ''
    if (w.endsWith('uno') && tail.trim()) {
      const nw = tail.trim()
      if (!NOAPOC.has(nw.toLowerCase())) {
        const stem = w.slice(0, -3) // quita "uno"
        // masc: "veintiuno"→"veintiún" (tilde), "treinta y uno"→"treinta y un", "uno"→"un"
        w = isFem(nw) ? stem + 'una' : stem + (stem.endsWith('veinti') ? 'ún' : 'un')
      }
    }
    return w + tail
  })
  return s.replace(/\s+/g, ' ').trim()
}

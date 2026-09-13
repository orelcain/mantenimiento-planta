/**
 * Texto que jsPDF puede imprimir con las fuentes estándar — una sola definición.
 *
 * POR QUÉ EXISTE
 * --------------
 * Las fuentes base de jsPDF (helvetica y compañía) usan **WinAnsiEncoding (cp1252)**. Un
 * carácter fuera de ese juego no sale como caja ni como interrogante: **jsPDF rompe la cadena
 * entera** y el renglón aparece vacío o cortado. Ya pasó en el PDF del análisis de turno.
 *
 * Lo traicionero es que el texto se ve bien en el editor y en la pantalla: el fallo solo
 * aparece en el papel. Y los caracteres que uno escribe sin pensar en un documento técnico
 * —«≤», «✓», «≈», «→», «·» tipográfico, un guion largo copiado de algún lado— son justo los
 * que se caen.
 *
 * cp1252 SÍ tiene: ° § · — « » ‹ › ± ¼ ½ ¾ ¿ ¡ y todas las vocales acentuadas del español.
 * NO tiene: ≤ ≥ ✓ ✗ ☐ ≈ → ← ↑ ↓ ─ │ ▪ ni ningún dingbat.
 */

/** Lo que se reemplaza por un equivalente que sí existe, en vez de perderse. */
const EQUIVALENTES: Record<string, string> = {
  '≤': '<=', // ≤
  '≥': '>=', // ≥
  '≈': '~', //  ≈
  '≠': '!=', // ≠
  '✓': 'X', //  ✓
  '✔': 'X', //  ✔
  '✗': '-', //  ✗
  '☐': '[ ]', // ☐
  '☑': '[X]', // ☑
  '→': '->', // →
  '←': '<-', // ←
  '⇒': '=>', // ⇒
  '•': '-', //  • (el bullet redondo no está en cp1252; el · sí)
  '▪': '-', //  ▪
  '─': '-', //  ─
  '│': '|', //  │
  '└': '-', //  └
  ' ': ' ', //  espacio duro
  ' ': ' ', //  espacio fino
  ' ': ' ', //  espacio fino sin salto
  '‑': '-', //  guion sin salto
  '−': '-', //  menos matemático
  '…': '...', // … (sí está en cp1252, pero se ve mejor expandido en tablas)
}

/** Lo que cp1252 sí admite además de ASCII: se deja tal cual. */
const CP1252_EXTRA = new Set(
  ('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ' +
    ' ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿' +
    'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞß' +
    'àáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ').split(''),
)

/**
 * ¿Este carácter lo puede imprimir una fuente base de jsPDF?
 *
 * Ojo con el criterio: el em dash «—» tiene code point U+2014 (8212) pero cp1252 SÍ lo tiene,
 * en el byte 0x97. Comprobar `codePoint <= 0xff` deja fuera media docena de signos que sí
 * funcionan — el juego imprimible no es un rango contiguo de Unicode.
 */
export function esImprimibleEnPdf(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (code >= 0x20 && code <= 0x7e) || ch === '\n' || CP1252_EXTRA.has(ch)
}

/**
 * Devuelve el texto listo para `doc.text()` / `autoTable`.
 *
 * Es la ÚNICA puerta por la que debe pasar texto hacia un PDF: cualquier cadena que venga de
 * Firestore (un nombre de repuesto, una nota del técnico, un hallazgo pegado de un correo)
 * puede traer un carácter que rompa la línea entera.
 */
export function textoSeguroPdf(valor: unknown): string {
  if (valor == null) return ''
  const texto = String(valor)
  let salida = ''
  for (const ch of texto) {
    const equivalente = EQUIVALENTES[ch]
    if (equivalente !== undefined) {
      salida += equivalente
      continue
    }
    if (esImprimibleEnPdf(ch)) {
      salida += ch
      continue
    }
    // Último recurso: quitar los acentos y quedarse con la letra base, y si ni eso,
    // descartar el carácter. Perder una tilde es aceptable; perder el renglón no.
    const plegado = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    salida += [...plegado].filter((c) => (c.codePointAt(0) ?? 0) <= 0x7e).join('')
  }
  return salida
}

/** Aplica `textoSeguroPdf` a cada celda de una fila de `autoTable`. */
export function filaSegura(celdas: readonly unknown[]): string[] {
  return celdas.map(textoSeguroPdf)
}

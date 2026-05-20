/**
 * Escapa los 5 caracteres que el browser interpreta dentro de un contexto HTML.
 *
 * Usar SIEMPRE que se construya HTML por concatenación de strings (template
 * literals para `document.write`, `innerHTML`, ventanas de impresión, exports
 * a PDF, etc.) con datos provenientes de Firestore, formularios, o cualquier
 * input que un usuario pudo haber controlado. Si no, un usuario con permisos
 * de escritura puede inyectar `<script>` y ejecutar JS en el contexto del
 * receptor (XSS persistente).
 *
 * No usar para atributos sin comillas (`<div class=${x}>`) — para eso hace
 * falta un escape más estricto. Para atributos siempre usar `"..."` y este
 * helper alcanza.
 *
 * Para sanitizar HTML que el usuario ESPERA que tenga formato (markdown del
 * chatbot, descripciones ricas), usar DOMPurify en su lugar.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

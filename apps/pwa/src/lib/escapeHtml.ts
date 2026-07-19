/**
 * Escape mínimo para interpolar texto en HTML generado como string
 * (ventanas de impresión vía document.write). NO usar para atributos
 * sin comillas ni para contexto <script> — solo texto y atributos
 * entre comillas dobles.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

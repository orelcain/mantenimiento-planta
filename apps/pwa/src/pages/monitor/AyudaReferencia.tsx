/** La ayuda de Referencia (Yal): cómo leer sus cifras, cerrada por defecto. */
export function AyudaReferencia() {
  return (
    <details className="relative inline-block align-middle">
      <summary aria-label="Qué es referencia" className="inline-flex size-4 cursor-pointer list-none items-center justify-center rounded-full border border-current text-caption1 font-semibold leading-none">i</summary>
      <p className="absolute left-0 top-full z-20 mt-1 w-64 rounded-card border border-border bg-card p-3 text-footnote font-normal text-foreground shadow-lg">
        Yal la mantiene otro equipo de Mantención. Se muestra para comparar.
      </p>
    </details>
  )
}

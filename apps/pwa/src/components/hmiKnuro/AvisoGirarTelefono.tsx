import { X } from 'lucide-react'

/** Celular vertical: aviso para girar, una sola fila de 44 px del marco «Consola» (va dentro de un `.knc`). */
export function AvisoGirarTelefono({ onPantallaCompleta, onCerrar }: { onPantallaCompleta: () => void; onCerrar: () => void }) {
  return (
    <div role="note" className="knc-aviso">
      <svg className="rot" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <rect x="3" y="10" width="15" height="10" rx="2" />
        <path d="M14 4a6 6 0 0 1 6 6M20 10l-2-2M20 10l2-2" />
      </svg>
      <span>Gira el teléfono para agrandar el panel</span>
      <button type="button" className="knc-ib" onClick={() => { onCerrar(); onPantallaCompleta() }}>
        Pantalla completa
      </button>
      <button type="button" className="knc-ib m sq bare" onClick={onCerrar} aria-label="No volver a mostrar este aviso">
        <X aria-hidden="true" />
      </button>
    </div>
  )
}

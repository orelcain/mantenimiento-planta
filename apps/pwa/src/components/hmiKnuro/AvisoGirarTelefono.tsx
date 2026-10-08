import { X } from 'lucide-react'

/** Celular vertical: aviso para girar (estilo ventana del panel, como la ayuda). */
export function AvisoGirarTelefono({ onPantallaCompleta, onCerrar }: { onPantallaCompleta: () => void; onCerrar: () => void }) {
  return (
    <div
      role="note"
      className="flex-shrink-0 flex items-center gap-2.5"
      style={{
        margin: '8px 10px', padding: '6px 4px 6px 10px', background: '#f4f4f4', color: '#222',
        border: '1px solid #9090a0', borderBottom: '2px solid #707080', borderRadius: 3,
        font: '14px/1.3 Arial, Helvetica, sans-serif',
      }}
    >
      <svg viewBox="0 0 30 30" width="26" height="26" fill="none" stroke="#1e3f7a" strokeWidth="2" aria-hidden="true" style={{ flex: 'none' }}>
        <rect x="4" y="9" width="20" height="12" rx="2" />
        <path d="M26 6a8 8 0 0 0-8-4l2 2m-2-2 2-2" />
      </svg>
      <span className="flex-1 min-w-0">Gira el teléfono para ver el panel más grande</span>
      <button
        type="button"
        onClick={() => { onCerrar(); onPantallaCompleta() }}
        style={{
          flex: 'none', minHeight: 44, padding: '0 10px', background: '#dcdce8', color: '#111',
          border: '1px solid #9090a0', borderBottom: '2px solid #707080', borderRadius: 2,
          font: 'bold 13px Arial, Helvetica, sans-serif',
        }}
      >
        Pantalla completa
      </button>
      <button
        type="button"
        onClick={onCerrar}
        aria-label="No volver a mostrar este aviso"
        className="flex items-center justify-center"
        style={{ flex: 'none', width: 44, height: 44, color: '#555', background: 'transparent', border: 0 }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

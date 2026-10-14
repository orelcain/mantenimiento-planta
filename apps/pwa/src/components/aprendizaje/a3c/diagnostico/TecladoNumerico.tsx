/**
 * Teclado numérico del diagnóstico: teclas de 60 px (se usa con guantes) y un visor con lo que
 * se lleva escrito. Lo usan la pestaña «Código» (el número del display) y la pestaña «LED».
 */
import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tecla } from '@/utils/aprendizaje/a3cDiagnostico'

const TECLAS: Tecla[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0']

export function VisorCodigo({ prefijo, valor, vacio, nota, etiqueta }: { prefijo: string; valor: string; vacio: string; nota: string; etiqueta: string }) {
  return (
    <div className="flex h-[68px] items-center justify-between gap-3 rounded-card bg-card px-5" role="status" aria-label={`${etiqueta}: ${valor ? `${prefijo} ${valor}` : 'vacío'}`}>
      <span className="font-mono text-display font-bold tabular-nums" aria-hidden data-testid="visor-codigo">
        {prefijo} {valor ? valor : <span className="text-muted-foreground/60">{vacio}</span>}
      </span>
      <span className="text-footnote text-muted-foreground">{nota}</span>
    </div>
  )
}

export function TecladoNumerico({ onTecla, onVer, etiquetaVer, nombre }: { onTecla: (t: Tecla) => void; onVer: () => void; etiquetaVer: string; nombre: string }) {
  const clase = 'flex h-[60px] items-center justify-center rounded-card bg-card text-title2 font-semibold tabular-nums active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-safe:transition-colors'
  return (
    <div role="group" aria-label={nombre} className="grid grid-cols-3 gap-2">
      {TECLAS.map(t =>
        t === 'borrar' ? (
          <button key={t} type="button" className={cn(clase, 'text-subhead font-medium')} onClick={() => onTecla(t)} aria-label="Borrar">
            <Delete aria-hidden className="mr-1.5 size-5" />
            Borrar
          </button>
        ) : (
          <button key={t} type="button" className={clase} onClick={() => onTecla(t)}>
            {t}
          </button>
        ),
      )}
      <button type="button" className={cn(clase, 'text-subhead font-semibold text-brand-ink')} onClick={onVer}>
        {etiquetaVer}
      </button>
    </div>
  )
}

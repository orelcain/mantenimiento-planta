/**
 * «¿Dónde cae en el Jack-Knife?» dentro de la tarjeta del ACR. Muestra los candidatos del turno
 * (la sugerida primero), «Otra causa» (causas de mantención del curso) y «No aparece». No es
 * obligatoria para cerrar el análisis.
 */
import { useMemo, useState, type ButtonHTMLAttributes } from 'react'
import { ListGroup } from '@/components/piel'
import { IMPUTACION_LEAVES } from '@/services/shoplogix/imputacionTaxonomy'
import type { SugerenciaJK } from '@/services/acr/acrHistorial'
import { cn } from '@/lib/utils'
import { dec1 } from '@/utils/formatoNumeros'

export interface FilaJackKnifeRapidoProps {
  /** `undefined` = sin asignar; `null` = no aparece en el gráfico; texto = causa. */
  causaActual: string | null | undefined
  sugerencia: SugerenciaJK | null
  cargando: boolean
  onElegir: (causa: string | null) => void
}

/** Causas de mantención del árbol del curso (sin las de filete Baader 200). */
function causasOtraCausa(): string[] {
  const nombres = IMPUTACION_LEAVES.filter((l) => l.bucket === 'mantencion' && l.extension !== 'filete-baader200').map(
    (l) => l.label,
  )
  return [...new Set(nombres)]
}

const minutosTexto = (m: number): string => (Number.isInteger(m) ? String(m) : dec1(m))

function Chip({ seleccionado, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { seleccionado: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={seleccionado}
      className={cn(
        'inline-flex min-h-11 items-center rounded-full px-4 text-subhead focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        seleccionado ? 'bg-primary/[0.15] font-semibold text-brand-ink' : 'bg-muted-foreground/[0.10] text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function FilaJackKnifeRapido({ causaActual, sugerencia, cargando, onElegir }: FilaJackKnifeRapidoProps) {
  const [otraAbierta, setOtraAbierta] = useState(false)
  const otras = useMemo(causasOtraCausa, [])
  const candidatos = sugerencia?.candidatos ?? []

  return (
    <ListGroup
      title="¿Dónde cae en el Jack-Knife?"
      footer="Sugerida por el turno y por la palabra del evento. Se cambia con un toque."
    >
      <div className="flex flex-col gap-3 px-4 py-3">
        {cargando && <p className="text-footnote text-muted-foreground">Leyendo el turno…</p>}
        {candidatos.length > 0 && (
          <>
            <p className="text-footnote text-muted-foreground">En ese turno, Shoplogix registró:</p>
            <div className="flex flex-wrap gap-2">
              {candidatos.map((c) => (
                <Chip
                  key={c.causa}
                  seleccionado={causaActual === c.causa}
                  onClick={() => onElegir(c.causa)}
                >
                  {c.eventos === 0 ? c.causa : c.eventos > 1 ? `${c.causa}, ${c.eventos} detenciones` : `${c.causa}, ${minutosTexto(c.minutos)} min`}
                </Chip>
              ))}
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Chip seleccionado={otraAbierta} onClick={() => setOtraAbierta((v) => !v)}>
            Otra causa
          </Chip>
          <Chip seleccionado={causaActual === null} onClick={() => onElegir(null)}>
            No aparece
          </Chip>
        </div>
        {otraAbierta && (
          <div className="flex flex-wrap gap-2">
            {otras.map((causa) => (
              <Chip
                key={causa}
                seleccionado={causaActual === causa}
                onClick={() => {
                  onElegir(causa)
                  setOtraAbierta(false)
                }}
              >
                {causa}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </ListGroup>
  )
}

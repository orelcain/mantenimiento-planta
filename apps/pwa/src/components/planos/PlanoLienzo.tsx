import { useCallback, useEffect, useRef, useState } from 'react'
import type { Caja, PlanoHoja, PlanoHojaMeta, PlanoRotulo } from '@/hooks/usePlano'

export type Foco =
  | { tipo: 'caja'; b: Caja }
  | { tipo: 'columna'; c: number }
  | null

type Props = {
  hoja: PlanoHoja
  meta: PlanoHojaMeta
  mostrarEs: boolean
  /** Cuántas notas tiene colgadas un aparato, para marcarlo en el dibujo. */
  notasDe: (tag: string) => number
  foco: Foco
  onSalto: (hoja: number, col: number) => void
  onAparato: (tag: string) => void
  onRotulo: (r: PlanoRotulo) => void
  onFondo: () => void
}

/** La letra del plano es de ~6 pt sobre un A3 de 1131: por debajo de 2 no se lee. */
const ESCALA_APARATO = 2.8
const ESCALA_COLUMNA = 1.7

/**
 * El dibujo vectorial de una hoja con sus capas encima.
 *
 * El SVG viene de nuestro propio extractor (asset estático del bundle, no
 * contenido de usuario) y se inyecta tal cual; encima va una capa de zonas
 * clicables construida con las cajas de cada palabra, y una tercera capa
 * opcional con la traducción al castellano.
 */
export function PlanoLienzo({
  hoja, meta, mostrarEs, notasDe, foco, onSalto, onAparato, onRotulo, onFondo,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const vista = useRef({ s: 1, x: 0, y: 0 })
  const arrastre = useRef<{ x: number; y: number; movido: number } | null>(null)
  const [pulso, setPulso] = useState<number | null>(null)
  const [W, H] = meta.vb

  const aplicar = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const { s, x, y } = vista.current
    c.style.transform = `translate(${x}px,${y}px) scale(${s})`
  }, [])

  const ajustar = useCallback(() => {
    const r = stageRef.current?.getBoundingClientRect()
    if (!r) return
    const s = Math.min(r.width / W, r.height / H) * 0.94
    vista.current = { s, x: (r.width - W * s) / 2, y: (r.height - H * s) / 2 }
    aplicar()
  }, [W, H, aplicar])

  const acercarA = useCallback(
    (cx: number, cy: number, escala: number) => {
      const r = stageRef.current?.getBoundingClientRect()
      if (!r) return
      const chico = Math.min(r.width, r.height) < 520 // en teléfono hace falta más aumento
      const s = Math.max(escala * (chico ? 1.35 : 1), 1.5)
      vista.current = { s, x: r.width / 2 - cx * s, y: r.height / 2 - cy * s }
      aplicar()
    },
    [aplicar],
  )

  const zoom = useCallback(
    (f: number, px: number, py: number) => {
      const v = vista.current
      const s2 = Math.max(0.15, Math.min(14, v.s * f))
      vista.current = { s: s2, x: px - (px - v.x) * (s2 / v.s), y: py - (py - v.y) * (s2 / v.s) }
      aplicar()
    },
    [aplicar],
  )

  // Encuadre inicial al cambiar de hoja, salvo que venga un foco explícito.
  useEffect(() => {
    if (!foco) ajustar()
  }, [hoja, ajustar]) // eslint-disable-line react-hooks/exhaustive-deps

  // Seguir el foco: un aparato concreto, o la columna donde aterrizó un salto.
  useEffect(() => {
    if (!foco) return
    if (foco.tipo === 'caja') {
      const [x, y, w, h] = foco.b
      acercarA(x + w / 2, y + h / 2, ESCALA_APARATO)
    } else {
      const x = meta.cols[String(foco.c)]
      if (x == null) return
      setPulso(foco.c)
      acercarA(Number(x) + 12, H * 0.42, ESCALA_COLUMNA)
      const t = setTimeout(() => setPulso(null), 1600)
      return () => clearTimeout(t)
    }
  }, [foco, meta, H, acercarA])

  useEffect(() => {
    const onResize = () => ajustar()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [ajustar])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const r = stageRef.current!.getBoundingClientRect()
    zoom(e.deltaY < 0 ? 1.14 : 1 / 1.14, e.clientX - r.left, e.clientY - r.top)
  }

  const pulsoX = pulso != null ? Number(meta.cols[String(pulso)] ?? 0) - 46 : 0

  return (
    <div
      ref={stageRef}
      className="relative h-full w-full touch-none overflow-hidden"
      style={{ background: 'var(--lc-bg-panel)', cursor: arrastre.current ? 'grabbing' : 'grab' }}
      onWheel={onWheel}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-controles]')) return
        arrastre.current = { x: e.clientX - vista.current.x, y: e.clientY - vista.current.y, movido: 0 }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const a = arrastre.current
        if (!a) return
        a.movido++
        if (a.movido < 2) return
        vista.current = { ...vista.current, x: e.clientX - a.x, y: e.clientY - a.y }
        aplicar()
      }}
      onPointerUp={() => { arrastre.current = null }}
      onClick={(e) => { if (e.target === e.currentTarget) onFondo() }}
    >
      <div
        ref={canvasRef}
        className="absolute left-0 top-0 origin-top-left shadow-2xl"
        style={{ width: W, height: H, background: '#FCFBF8' }}
        onClick={(e) => { if (e.target === e.currentTarget) onFondo() }}
      >
        <div className="absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
             dangerouslySetInnerHTML={{ __html: hoja.svg }} />

        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${W} ${H}`}>
          {pulso != null && (
            <rect x={pulsoX} y={0} width={110} height={H} fill="var(--lc-nuevo)" opacity={0.4}
                  className="motion-safe:animate-pulse" />
          )}

          {hoja.terms.map((t, i) =>
            t.dup ? null : (
              <rect key={`d${i}`} x={t.b[0] - 0.8} y={t.b[1] - 0.8} width={t.b[2] + 1.6} height={t.b[3] + 1.6}
                    rx={1.5} fill="var(--lc-prep)" opacity={0.18} className="cursor-pointer hover:opacity-45"
                    onClick={(e) => { e.stopPropagation(); onRotulo(t) }} />
            ),
          )}

          {hoja.tags.map((t, i) => {
            const n = notasDe(t.t)
            return (
              <g key={`t${i}`} className="cursor-pointer"
                 onClick={(e) => { e.stopPropagation(); onAparato(t.t) }}>
                <rect x={t.b[0] - 0.8} y={t.b[1] - 0.8} width={t.b[2] + 1.6} height={t.b[3] + 1.6} rx={1.5}
                      fill="var(--lc-aqua)" opacity={n ? 0.3 : 0.15} stroke="var(--lc-aqua)"
                      strokeWidth={0.6} strokeOpacity={0.5} className="hover:opacity-50" />
                {n > 0 && (
                  <circle cx={t.b[0] + t.b[2] + 1.4} cy={t.b[1] - 0.6} r={1.9} fill="var(--lc-prep)" />
                )}
              </g>
            )
          })}

          {hoja.xrefs.map((t, i) => (
            <rect key={`x${i}`} x={t.b[0] - 0.8} y={t.b[1] - 0.8} width={t.b[2] + 1.6} height={t.b[3] + 1.6}
                  rx={1.5} fill="var(--lc-nuevo)" opacity={0.18} stroke="var(--lc-nuevo)"
                  strokeWidth={0.6} strokeOpacity={0.55} className="cursor-pointer hover:opacity-45"
                  onClick={(e) => { e.stopPropagation(); onSalto(t.h, t.c) }} />
          ))}

          {mostrarEs && <CapaCastellano terms={hoja.terms} />}

          {foco?.tipo === 'caja' && (
            <rect x={foco.b[0] - 2.5} y={foco.b[1] - 2.5} width={foco.b[2] + 5} height={foco.b[3] + 5}
                  rx={2} fill="none" stroke="var(--lc-aqua-bright)" strokeWidth={1.6} />
          )}
        </svg>
      </div>

      <div data-controles className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border shadow-lg"
           style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)' }}>
        {[
          ['+', 'Acercar', () => { const r = stageRef.current!.getBoundingClientRect(); zoom(1.4, r.width / 2, r.height / 2) }],
          ['−', 'Alejar', () => { const r = stageRef.current!.getBoundingClientRect(); zoom(1 / 1.4, r.width / 2, r.height / 2) }],
          ['fit', 'Ajustar hoja', ajustar],
        ].map(([txt, titulo, fn]) => (
          <button key={txt as string} type="button" title={titulo as string} onClick={fn as () => void}
                  className="border-b px-3 py-2 font-mono text-sm last:border-b-0 hover:opacity-80"
                  style={{ color: 'var(--lc-ink-mid)', borderColor: 'var(--lc-border)' }}>
            {txt as string}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * El plano en castellano, dibujado sobre el original.
 *
 * Se traduce por LÍNEA y se respeta el giro: los rótulos de función del
 * encabezado están a 90°, y estamparlos horizontales los cruzaba sobre el
 * esquema. Los marcados `dup` son la repetición en inglés o francés de la línea
 * de arriba: se tapan sin texto para que la tabla quede en un solo idioma.
 */
function CapaCastellano({ terms }: { terms: PlanoRotulo[] }) {
  return (
    <g>
      {terms.map((t, i) => {
        const [x, y, w, h] = t.b
        const gira = t.r === 90
        const grueso = gira ? w : h
        const largo = gira ? h : w

        if (t.dup) {
          const tapa = <rect x={-0.6} y={-0.6} width={largo + 1.2} height={grueso + 1.2} fill="#FCFBF8" />
          return gira
            ? <g key={i} transform={`translate(${x},${y + h}) rotate(-90)`}>{tapa}</g>
            : <rect key={i} x={x - 0.6} y={y - 0.6} width={w + 1.2} height={h + 1.2} fill="#FCFBF8" />
        }

        // El castellano es más largo: se encoge la letra hasta caber en su caja
        // en vez de desbordar sobre el rótulo vecino.
        let fs = Math.min(grueso * 0.95, 6.6)
        fs = Math.max(Math.min(fs, (largo * 1.15) / (t.es.length * 0.52)), 2.9)
        const L = Math.max(largo, t.es.length * fs * 0.52)

        const contenido = (
          <>
            <rect x={-0.6} y={-0.6} width={L + 1.2} height={grueso + 1.2} fill="#FCFBF8" />
            <text x={0} y={grueso * 0.82} fontSize={fs} fill="#7A5400" fontWeight={600}>{t.es}</text>
            <line x1={0} y1={grueso + 0.7} x2={L} y2={grueso + 0.7} stroke="#D6A312" strokeWidth={0.5} />
          </>
        )
        return gira
          ? <g key={i} transform={`translate(${x},${y + h}) rotate(-90)`}>{contenido}</g>
          : <g key={i} transform={`translate(${x},${y})`}>{contenido}</g>
      })}
    </g>
  )
}

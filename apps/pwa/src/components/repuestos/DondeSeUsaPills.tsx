/**
 * «Dónde se usa» de una fila de Repuestos: familia + una pill por planta con sus unidades.
 *
 *   Evisceradora Baader 142  [ Chonchi  N1 N2 N3 ]  [ Yal  N1 ]  Knuro  [ Chonchi  N1 ]
 *
 * Reemplaza el texto «EVISCERADORA BAADER 142 N1 +5», que nombraba un equipo cualquiera y
 * escondía los otros cinco. Datos de `agruparDondeSeUsa`: planta + nombre es la identidad.
 *
 *  - La unidad de la máquina en foco va en cápsula de acento.
 *  - La planta que la faceta de equipo dejó fuera NO se oculta: queda al 55 %.
 *  - Más de dos familias: se muestran dos y «+N familias».
 *  - Compacto (15-10-2026): sin la planta oculta (Yal); Baader 142 como «antigua»/«nueva»;
 *    «todas» si va en todas las unidades; el nombre de planta solo si hay más de una.
 */
import { agruparDondeSeUsa, detalleUnidades, equiposVisiblesEnRepuestos, plantaCorta, type EquipoDelRepuesto, type GrupoDondeSeUsa } from '@/hooks/repuestos/dondeSeUsa'
import { grupoEnFaceta, tituloFamilia, type Faceta } from '@/utils/repuestos/facetasEquipo'
import { cn } from '@/lib/utils'

export interface DondeSeUsaPillsProps {
  equipos: readonly EquipoDelRepuesto[]
  plantaDe: (nodeId: string) => string | undefined
  /** nodeId de la máquina elegida en el árbol: su unidad se resalta. */
  enFocoId?: string | null
  /** Faceta de equipo activa: lo que quede fuera se atenúa. */
  faceta?: Faceta | null
  maxFamilias?: number
  /** Unidades que tiene la familia en esa planta (para decir «todas»). */
  totalUnidades?: (familia: string, planta: string | undefined) => number | undefined
  className?: string
}

interface Familia { clave: string; titulo: string; grupos: GrupoDondeSeUsa[]; enFoco: boolean }

export function DondeSeUsaPills({ equipos, plantaDe, enFocoId, faceta, maxFamilias = 2, totalUnidades, className }: DondeSeUsaPillsProps) {
  const todos = agruparDondeSeUsa(equipos, plantaDe)
  if (todos.length === 0) {
    return <span className={cn('text-footnote text-muted-foreground', className)}>Transversal</span>
  }
  const grupos = agruparDondeSeUsa(equiposVisiblesEnRepuestos(equipos, plantaDe), plantaDe)
  if (grupos.length === 0) {
    // Solo se usa en plantas ocultas: se nombra la familia, sin unidades.
    const familias = [...new Set(todos.map((g) => tituloFamilia(g.familia)))]
    return <span className={cn('text-footnote text-muted-foreground', className)}>{familias.slice(0, maxFamilias).join(' · ')} · otra planta</span>
  }
  const variasPlantas = new Set(grupos.map((g) => g.planta ?? '')).size > 1
  const porFamilia = new Map<string, Familia>()
  for (const g of grupos) {
    const clave = g.familia.trim().toUpperCase()
    const f = porFamilia.get(clave) ?? { clave, titulo: tituloFamilia(g.familia), grupos: [], enFoco: false }
    f.grupos.push(g)
    if (enFocoId && g.unidades.some((u) => u.nodeId === enFocoId)) f.enFoco = true
    porFamilia.set(clave, f)
  }
  // La familia de la máquina en foco primero (sort estable: el resto conserva su orden).
  const familias = [...porFamilia.values()].sort((a, b) => Number(b.enFoco) - Number(a.enFoco))
  const visibles = familias.slice(0, maxFamilias)
  const ocultas = familias.length - visibles.length

  return (
    <div className={cn('flex flex-col gap-1', className)} data-testid="donde-se-usa">
      {visibles.map((f) => (
        <div key={f.clave} className="flex flex-wrap items-center gap-1.5 text-footnote">
          <span className="font-semibold text-foreground">{f.titulo}</span>
          {f.grupos.map((g) => {
            const fuera = !!faceta && !grupoEnFaceta(g, faceta)
            const planta = variasPlantas ? plantaCorta(g.planta) : ''
            const det = detalleUnidades(g, totalUnidades?.(g.familia, g.planta))
            if (det.tipo === 'ninguno' && !planta) return null
            const focoEnTexto = det.tipo === 'texto' && !!enFocoId && det.nodeIds.includes(enFocoId)
            return (
              <span
                key={`${g.planta ?? ''}|${g.familia}`}
                data-fuera={fuera ? 'true' : undefined}
                className={cn('inline-flex items-center gap-0.5 rounded-full bg-muted py-0.5 pl-2 pr-1', fuera && 'opacity-55')}
              >
                {planta && <span className="mr-1 font-semibold text-muted-foreground">{planta}</span>}
                {det.tipo === 'texto' && (
                  <span
                    data-en-foco={focoEnTexto ? 'true' : undefined}
                    className={cn('inline-flex h-5 items-center rounded-full px-1.5 text-footnote font-semibold', focoEnTexto ? 'bg-primary text-primary-foreground' : 'text-foreground')}
                  >
                    {det.texto}
                  </span>
                )}
                {det.tipo === 'unidades' && det.unidades.map((u) => {
                  const enFoco = !!enFocoId && u.nodeId === enFocoId
                  return (
                    <span
                      key={u.nodeId}
                      title={u.nombre}
                      data-en-foco={enFoco ? 'true' : undefined}
                      className={cn(
                        'inline-flex h-5 min-w-6 items-center justify-center rounded-full px-1 text-footnote font-semibold tabular-nums',
                        enFoco ? 'bg-primary text-primary-foreground' : 'text-foreground',
                      )}
                    >
                      {u.unidad || '·'}
                    </span>
                  )
                })}
              </span>
            )
          })}
        </div>
      ))}
      {ocultas > 0 && (
        <span className="text-footnote text-muted-foreground">+{ocultas} {ocultas === 1 ? 'familia' : 'familias'}</span>
      )}
    </div>
  )
}

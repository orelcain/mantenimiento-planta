/**
 * Indicador de cobertura bajo la línea de fuente de la tarjeta:
 * «Repuestos identificados N/M · X resueltos en ambas», con barra (identificados en acento,
 * resueltos en ambas encima en verde) y una línea con lo de cada máquina (N2 a · N3 b). Un elemento
 * suma en «ambas» solo si tiene respuesta en TODAS las máquinas del plano (ver `coberturaRepuestos`).
 * Es un enlace a «Por confirmar en terreno». Cuenta solo piezas físicas (ver `esPiezaFisica`).
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { usePartesPlano } from '@/hooks/usePartesPlano'
import { usePlanoVinculos } from '@/hooks/usePlanoVinculos'
import { useAuthStore } from '@/store/authStore'
import { maquinasDePlano } from '@/data/planos'
import { coberturaRepuestos, SLUG_PLANO_A3C } from '@/utils/aprendizaje/repuestosA3c'
import { etiquetaMaquina } from '@/utils/aprendizaje/vinculoTerreno'

const MAQUINAS = maquinasDePlano(SLUG_PLANO_A3C)

export function IndicadorRepuestosA3c({ codigos }: { codigos: readonly string[] }) {
  const partes = usePartesPlano(SLUG_PLANO_A3C)
  const { porAparato } = usePlanoVinculos(SLUG_PLANO_A3C)
  const sesion = useAuthStore(s => s.isAuthenticated)
  const c = useMemo(() => coberturaRepuestos(codigos, partes?.aparatos, porAparato, MAQUINAS), [codigos, partes, porAparato])
  // Sin el catálogo cargado no hay cifra que mostrar: mejor nada que «0/121».
  if (!partes || c.total === 0) return null
  const pct = (n: number) => `${(n / c.total) * 100}%`
  return (
    <Link
      to="/aprendizaje/baader-142/tarjeta-a3c/por-confirmar"
      data-testid="indicador-repuestos"
      className="mt-2 inline-flex min-h-[48px] items-center gap-2 rounded-ctl text-footnote text-muted-foreground tabular-nums hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="relative h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: pct(c.identificados) }} />
        {sesion && <span className="absolute inset-y-0 left-0 rounded-full bg-success" style={{ width: pct(c.confirmados) }} />}
      </span>
      <span>
        Repuestos identificados <b className="font-semibold text-foreground">{c.identificados}/{c.total}</b>
        {sesion ? (
          <>
            {' · '}
            <b className="font-semibold text-foreground">{c.confirmados}</b> {c.confirmados === 1 ? 'resuelto' : 'resueltos'} en ambas
            <span className="block text-nota" data-testid="indicador-por-maquina">
              {MAQUINAS.map(m => `${etiquetaMaquina(m)} ${c.porMaquina[m] ?? 0}`).join(' · ')}
            </span>
          </>
        ) : (
          ' · inicia sesión para ver las confirmaciones'
        )}
      </span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/55" aria-hidden />
    </Link>
  )
}

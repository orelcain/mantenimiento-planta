/**
 * Indicador de cobertura bajo la línea de fuente de la tarjeta:
 * «Repuestos identificados N/M · X confirmados en terreno», con barra (identificados en acento,
 * confirmados encima en verde). Cuenta solo piezas físicas (ver `esPiezaFisica`).
 */
import { useMemo } from 'react'
import { usePartesPlano } from '@/hooks/usePartesPlano'
import { usePlanoVinculos } from '@/hooks/usePlanoVinculos'
import { useAuthStore } from '@/store/authStore'
import { coberturaRepuestos, SLUG_PLANO_A3C } from '@/utils/aprendizaje/repuestosA3c'

export function IndicadorRepuestosA3c({ codigos }: { codigos: readonly string[] }) {
  const partes = usePartesPlano(SLUG_PLANO_A3C)
  const { vinculos } = usePlanoVinculos(SLUG_PLANO_A3C)
  const sesion = useAuthStore(s => s.isAuthenticated)
  const c = useMemo(() => coberturaRepuestos(codigos, partes?.aparatos, vinculos), [codigos, partes, vinculos])
  // Sin el catálogo cargado no hay cifra que mostrar: mejor nada que «0/121».
  if (!partes || c.total === 0) return null
  const pct = (n: number) => `${(n / c.total) * 100}%`
  return (
    <div
      data-testid="indicador-repuestos"
      className="mt-2 inline-flex min-h-[32px] items-center gap-2 text-footnote text-muted-foreground tabular-nums"
    >
      <span className="relative h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: pct(c.identificados) }} />
        {sesion && <span className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: pct(c.confirmados) }} />}
      </span>
      <span>
        Repuestos identificados <b className="font-semibold text-foreground">{c.identificados}/{c.total}</b>
        {sesion ? (
          <>
            {' · '}
            <b className="font-semibold text-foreground">{c.confirmados}</b> {c.confirmados === 1 ? 'confirmado' : 'confirmados'} en terreno
          </>
        ) : (
          ' · inicia sesión para ver las confirmaciones'
        )}
      </span>
    </div>
  )
}

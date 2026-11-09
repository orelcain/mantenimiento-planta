/**
 * Causa raíz: todos los análisis de la planta (`/causa-raiz`). El indicador «Efecto de las
 * acciones» va arriba en PC y abajo en celular.
 */
import { EfectoAccionesCard } from '@/components/acr/EfectoAccionesCard'
import { HistorialAcr } from '@/components/acr/HistorialAcr'

export function CausaRaizPage() {
  return (
    <div className="flex flex-col gap-5 pb-10">
      <h1 className="text-display font-bold text-foreground">Causa raíz</h1>
      <div className="flex flex-col gap-8">
        <EfectoAccionesCard className="order-last lg:order-first" />
        <HistorialAcr />
      </div>
    </div>
  )
}

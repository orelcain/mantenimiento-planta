/**
 * Centro de Aprendizaje · Tarjeta A3C · BAADER 142 (ruta pública
 * `/aprendizaje/baader-142/tarjeta-a3c`). Carga el paquete de assets (datos + 2 SVG del
 * plano) y monta la herramienta. La lógica y el dibujo viven en `components/aprendizaje/a3c`.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/piel'
import { cargarA3c, type PaqueteA3c } from '@/data/baader142A3c'
import { TarjetaA3c } from '@/components/aprendizaje/a3c/TarjetaA3c'

const FICHA = '/aprendizaje/maquina/baader-142'

export function Baader142A3cPage() {
  const navigate = useNavigate()
  const [paquete, setPaquete] = useState<PaqueteA3c | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    setError(null)
    cargarA3c().then(setPaquete, (e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar la tarjeta.'))
  }, [])
  useEffect(cargar, [cargar])

  if (paquete) return <TarjetaA3c paquete={paquete} onVolver={() => navigate(FICHA)} etiquetaVolver="Baader 142" />

  return (
    <div className="min-h-full w-full bg-background px-4 pt-[52px] text-foreground">
      <div className="mx-auto max-w-[640px]">
        <h1 className="text-title1 font-bold">Tarjeta A3C</h1>
        {error ? (
          <div className="mt-4 rounded-card bg-card p-4" role="alert">
            <p className="text-subhead">No se pudo cargar el plano de la tarjeta. Revisa la conexión e inténtalo de nuevo.</p>
            <p className="mt-1 font-mono text-caption text-muted-foreground">{error}</p>
            <Button className="mt-3" onClick={cargar}>Reintentar</Button>
          </div>
        ) : (
          // Esqueleto del lienzo: mismo alto que tendrá, sin spinner centrado (piel §9).
          <div className="mt-4 h-[clamp(280px,calc(100dvh-440px),460px)] animate-pulse rounded-card bg-card motion-reduce:animate-none" aria-label="Cargando el plano" role="status" />
        )}
      </div>
    </div>
  )
}

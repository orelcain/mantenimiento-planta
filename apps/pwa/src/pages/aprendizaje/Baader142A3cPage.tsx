/**
 * Centro de Aprendizaje · Tarjeta A3C · BAADER 142 (ruta pública
 * `/aprendizaje/baader-142/tarjeta-a3c`). Carga el paquete de assets (datos + 2 SVG del
 * plano) y monta la herramienta. La lógica y el dibujo viven en `components/aprendizaje/a3c`.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, EncabezadoHerramienta } from '@/components/piel'
import { useAuthStore } from '@/store'
import { cargarA3c, type PaqueteA3c } from '@/data/baader142A3c'
import { TarjetaA3c } from '@/components/aprendizaje/a3c/TarjetaA3c'

const FICHA = '/aprendizaje/maquina/baader-142'

export function Baader142A3cPage() {
  const autenticado = useAuthStore((s) => s.isAuthenticated)
  // Herramienta de pantalla completa: el layout da el alto (modo «lienzo»); sin sesión no hay layout.
  const alto = autenticado ? 'h-full' : 'h-[100dvh]'
  const [paquete, setPaquete] = useState<PaqueteA3c | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    setError(null)
    cargarA3c().then(setPaquete, (e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar la tarjeta.'))
  }, [])
  useEffect(cargar, [cargar])

  if (paquete) return <div className={alto}><TarjetaA3c paquete={paquete} volverA={FICHA} etiquetaVolver="Baader 142" /></div>

  return (
    <div className={`flex w-full flex-col bg-background text-foreground ${alto}`}>
      <EncabezadoHerramienta etiquetaVolver="Baader 142" volverA={FICHA} titulo="Tarjeta A3C" subtitulo="BAADER 142" />
      <div className="mx-auto min-h-0 w-full max-w-[640px] flex-1 overflow-y-auto px-4 pt-3">
        {error ? (
          <div className="mt-4 rounded-card bg-card p-4" role="alert">
            <p className="text-subhead">No se pudo cargar el plano de la tarjeta. Revisa la conexión e inténtalo de nuevo.</p>
            <p className="mt-1 text-nota text-muted-foreground">{error}</p>
            <Button className="mt-3" onClick={cargar}>Reintentar</Button>
          </div>
        ) : (
          // Esqueleto del lienzo: mismo alto que tendrá, sin spinner centrado (piel §9).
          <div className="mt-4 h-[clamp(280px,calc(100dvh-380px),460px)] animate-pulse rounded-card bg-card motion-reduce:animate-none" aria-label="Cargando el plano" role="status" />
        )}
      </div>
    </div>
  )
}

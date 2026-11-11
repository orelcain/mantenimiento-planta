/**
 * Acciones sobre los pedidos de repuestos (aprobar, entregar, altas de código), compartidas
 * por Áreas y Bodega. Antes vivían solo en RepuestosAreaHub: Bodega no podía atender un pedido.
 *
 * Entregar descuenta el stock real de bodega (si el SAP está configurado ahí). Si no hay bodega
 * para el SAP, no se inventa un registro: avanza el estado y LO DICE. Si el descuento falla, el
 * pedido no pasa a «entregada».
 */
import { useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/useToast'
import { buscarRepuestoPorSap } from '@/services/repuestos/asignarSapMaestro'
import { invalidateGlobalRepuestosCache } from './useGlobalSearch'
import type { useBodega } from './useBodega'
import { nombreVisiblePorSap, type FuenteNombre } from '@/utils/repuestos/nombrePorSap'
import {
  esAlta,
  type AltaCodigo,
  type OrigenSap,
  type SolicitudEstado,
  type SolicitudItem,
  type useSolicitudes,
} from './useSolicitudes'

type Solicitudes = ReturnType<typeof useSolicitudes>

export interface FuentesAccionesSolicitudes {
  solicitudes: readonly SolicitudItem[]
  avanzarEstado: Solicitudes['avanzarEstado']
  registrarAltaCreada: Solicitudes['registrarAltaCreada']
  rechazarAlta: Solicitudes['rechazarAlta']
  registrarSalidaDeSolicitud: ReturnType<typeof useBodega>['registrarSalidaDeSolicitud']
  indiceNombresPorSap: ReadonlyMap<string, FuenteNombre>
}

export function useAccionesSolicitudes({
  solicitudes, avanzarEstado, registrarAltaCreada, rechazarAlta, registrarSalidaDeSolicitud, indiceNombresPorSap,
}: FuentesAccionesSolicitudes) {
  const user = useAuthStore((s) => s.user)
  const { toast } = useToast()

  // Se decide sobre la bodega (entera en memoria), no sobre las filas del catálogo cargado:
  // el catálogo va por área y una solicitud de otra área se entregaba sin descontar nada.
  const avanzar = useCallback(
    async (id: string, next: SolicitudEstado) => {
      // Las altas de código tienen su propio ciclo (registrar SAP / rechazar): nunca avanzan ni descuentan stock.
      const pedida = solicitudes.find((s) => s.id === id)
      if (pedida && esAlta(pedida)) return
      if (next === 'entregada' && user && pedida) {
        try {
          const plan = await registrarSalidaDeSolicitud(
            pedida.codigoSAP,
            pedida.cantidad,
            `Entrega solicitud · ${pedida.solicitadoPorNombre || 'usuario'}`,
            user.id,
            user.nombre,
          )
          const nombre = nombreVisiblePorSap(indiceNombresPorSap, pedida.codigoSAP, pedida.textoBreve).titulo
          if (plan.accion === 'sin-bodega') {
            toast({ title: 'Entregada sin descontar stock', description: `${nombre} no tiene registro en bodega.` })
          } else if (plan.faltante > 0) {
            toast({
              title: 'Stock descontado, pero no alcanzaba',
              description: `Bodega registraba ${plan.stockAntes} y se entregaron ${pedida.cantidad}: quedó en 0. Conviene contar ${nombre}.`,
              variant: 'destructive',
            })
          } else {
            toast({ title: 'Stock descontado', description: `-${pedida.cantidad} ${nombre} · quedan ${plan.stockDespues}`, variant: 'success' })
          }
        } catch {
          toast({ title: 'No se pudo descontar el stock', description: 'La solicitud sigue pendiente de entrega — reintenta.', variant: 'destructive' })
          return // no avanzar a "entregada" si el descuento de stock falló
        }
      }
      await avanzarEstado(id, next, user?.id ?? '', user?.nombre ?? '')
    },
    [solicitudes, user, registrarSalidaDeSolicitud, avanzarEstado, toast, indiceNombresPorSap],
  )

  // Alta de código (ficha A3C): bodega registra el SAP que creó, o rechaza con motivo. El panel pinta los
  // bloques y valida; acá se escribe en el maestro (asigna / completa / crea `repuestos/{SAP}`) y en la solicitud.
  const registrarSap = useCallback(
    async (alta: AltaCodigo, sap: string, origen: OrigenSap) => {
      if (!user) throw new Error('Hay que iniciar sesión.')
      try {
        await registrarAltaCreada(alta, sap, origen, user.id, user.nombre)
      } catch (e) {
        toast({
          variant: 'destructive',
          title: 'No se pudo registrar el SAP',
          // Los errores de negocio (SAP de otro repuesto, alta ya cerrada por otro operador) traen su texto.
          description: e instanceof Error && e.name === 'ErrorAltaSap' ? e.message : 'La alta sigue pendiente: reintenta.',
        })
        throw e
      }
      invalidateGlobalRepuestosCache()
      toast({ title: 'Alta registrada', description: `${alta.codigoFabricante} ahora es SAP ${sap}.`, variant: 'success' })
    },
    [user, registrarAltaCreada, toast],
  )

  const rechazar = useCallback(
    async (alta: AltaCodigo, motivo: string) => {
      if (!user) throw new Error('Hay que iniciar sesión.')
      try {
        await rechazarAlta(alta.id, motivo, user.id, user.nombre)
      } catch (e) {
        toast({ variant: 'destructive', title: 'No se pudo rechazar', description: 'Reintenta en un momento.' })
        throw e
      }
      toast({ title: 'Alta rechazada', description: `${alta.codigoFabricante}: quien la pidió verá el motivo.` })
    },
    [user, rechazarAlta, toast],
  )

  const buscarSap = useCallback(async (sap: string) => {
    const r = await buscarRepuestoPorSap(sap)
    return r ? { nombre: r.textoBreve || r.codigoFabricante || 'Repuesto', codigoFabricante: r.codigoFabricante || '' } : null
  }, [])

  // Registrar o rechazar un alta es de bodega: técnico, supervisor o admin (igual que firestore.rules).
  const puedeResolverAltas = user?.rol === 'tecnico' || user?.rol === 'supervisor' || user?.rol === 'admin'

  return { avanzar, registrarSap, rechazar, buscarSap, puedeResolverAltas }
}

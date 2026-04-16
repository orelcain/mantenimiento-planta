/**
 * useWipOverrides — Hook que lee los overrides WIP desde Firestore
 * y expone helpers para que el admin libere o revierta módulos.
 */
import { useEffect, useState, useCallback } from 'react'
import { useIsAdmin } from '@/store'
import { subscribeWipReleased, releaseModule, unReleaseModule } from '@/services/wipOverrides'

export function useWipOverrides() {
  const isAdmin = useIsAdmin()
  const [released, setReleased] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = subscribeWipReleased((ids) => {
      setReleased(ids)
      setLoading(false)
    })
    return unsub
  }, [])

  /** ¿Está activa la banda WIP para este tile? (static wip && no liberado) */
  const isWip = useCallback(
    (tileId: string, staticWip?: boolean) => !!staticWip && !released.has(tileId),
    [released],
  )

  /** Admin: toggle release/unreleased */
  const toggleRelease = useCallback(
    async (tileId: string) => {
      if (!isAdmin) return
      if (released.has(tileId)) {
        await unReleaseModule(tileId)
      } else {
        await releaseModule(tileId)
      }
    },
    [isAdmin, released],
  )

  return { isWip, toggleRelease, isAdmin, loading }
}

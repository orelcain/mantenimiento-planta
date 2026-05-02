/**
 * Panel de toggles para preferencias de "inicio de proceso productivo" por planta.
 * Reutilizable: sin userId → edita el usuario actual. Con userId → modo admin.
 */

import { useState, useEffect } from 'react'
import { Factory, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Switch, Label } from '@/components/ui'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store'
import { logger } from '@/lib/logger'

interface Plant {
  key: 'chonchi' | 'yal'
  label: string
  description: string
}

const PLANTS: Plant[] = [
  { key: 'chonchi', label: 'Planta Chonchi', description: 'Avisa cuando arranca el turno día o noche' },
  { key: 'yal',     label: 'Planta Yal',     description: 'Avisa cuando arranca cualquiera de los 3 turnos' },
]

type PlantPrefs = Record<'chonchi' | 'yal', boolean>

const DEFAULT_PREFS: PlantPrefs = { chonchi: true, yal: true }

interface Props {
  /** Si se omite, usa el usuario autenticado */
  userId?: string
}

export function ProcessNotificationsPanel({ userId }: Props) {
  const { user: currentUser } = useAuthStore()
  const targetId = userId ?? currentUser?.id

  const [prefs, setPrefs]     = useState<PlantPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<'chonchi' | 'yal' | null>(null)

  useEffect(() => {
    if (!targetId) return
    setLoading(true)
    getDoc(doc(db, 'users', targetId))
      .then((snap) => {
        if (!snap.exists()) return
        const raw = snap.data().notificationPrefs?.processStarted
        if (raw) {
          setPrefs({
            chonchi: raw.chonchi !== false,
            yal:     raw.yal     !== false,
          })
        }
      })
      .catch((e) => logger.error('ProcessNotificationsPanel load error', e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false))
  }, [targetId])

  const handleToggle = async (plant: 'chonchi' | 'yal', value: boolean) => {
    if (!targetId) return
    const next: PlantPrefs = { ...prefs, [plant]: value }
    setPrefs(next)
    setSaving(plant)
    try {
      await updateDoc(doc(db, 'users', targetId), {
        [`notificationPrefs.processStarted.${plant}`]: value,
      })
    } catch (e) {
      logger.error('ProcessNotificationsPanel save error', e instanceof Error ? e : new Error(String(e)))
      setPrefs(prefs) // revert on error
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando preferencias...
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Factory className="h-4 w-4" />
          Inicio de proceso productivo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Recibe una notificación push cuando Shoplogix detecta el inicio de turno en cada planta.
        </p>
        {PLANTS.map((plant) => (
          <div key={plant.key} className="flex items-center justify-between gap-4 py-1">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">{plant.label}</Label>
              <p className="text-xs text-muted-foreground">{plant.description}</p>
            </div>
            <div className="flex items-center gap-2">
              {saving === plant.key && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              <Switch
                checked={prefs[plant.key]}
                onCheckedChange={(v) => handleToggle(plant.key, v)}
                disabled={saving !== null}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

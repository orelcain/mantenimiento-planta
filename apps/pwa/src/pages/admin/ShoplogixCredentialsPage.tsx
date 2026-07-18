/**
 * ShoplogixCredentialsPage — UI admin para gestionar las credenciales Shoplogix.
 *
 * Permite ver el usuario configurado y cuándo se actualizó por última vez,
 * actualizarlas (form), o borrarlas (volver al modo cookie legado).
 *
 * Reemplaza el flujo CLI anterior `node scripts/set-shoplogix-creds.mjs` que
 * requería terminal + serviceAccountKey.json. Ahora cualquier admin puede
 * rotar la pass de Shoplogix desde la app sin intervención técnica.
 *
 * Acceso: ruta protegida por `<AdminRoute>` + regla Firestore admin-only
 * sobre `system/shoplogixCredentials`.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Spinner,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui'
import { Key, RefreshCw, Trash2, Save, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  getShoplogixCredentialsInfo,
  saveShoplogixCredentials,
  deleteShoplogixCredentials,
  type ShoplogixCredentialsInfo,
} from '@/services/shoplogix/shoplogixCredentials.service'
import { fmtRelativeTime } from '@/services/grader/graderTimeFormat'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/lib/logger'

export function ShoplogixCredentialsPage() {
  const { toast } = useToast()

  // Estado de lectura
  const [info, setInfo] = useState<ShoplogixCredentialsInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estado del form
  const [editing, setEditing] = useState(false)
  const [formUser, setFormUser] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Confirmación de eliminación
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadInfo = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getShoplogixCredentialsInfo()
      setInfo(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setError(msg)
      logger.error('[ShoplogixCredentialsPage] Error cargando info:', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInfo()
  }, [loadInfo])

  const startEdit = () => {
    setFormUser(info?.user ?? '')
    setFormPassword('')
    setShowPassword(false)
    setFormError(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setFormUser('')
    setFormPassword('')
    setFormError(null)
  }

  const handleSave = async () => {
    setFormError(null)
    if (!formUser.trim() || !formUser.includes('@')) {
      setFormError('Usuario debe ser un email válido')
      return
    }
    if (!formPassword || formPassword.length < 4) {
      setFormError('Contraseña debe tener al menos 4 caracteres')
      return
    }
    setSaving(true)
    try {
      await saveShoplogixCredentials({ user: formUser.trim(), password: formPassword })
      toast({ title: 'Credenciales actualizadas', description: 'El próximo sync usará las nuevas credenciales.' })
      setEditing(false)
      setFormUser('')
      setFormPassword('')
      await loadInfo()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar'
      setFormError(msg)
      logger.error('[ShoplogixCredentialsPage] Error guardando:', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteShoplogixCredentials()
      toast({
        title: 'Credenciales eliminadas',
        description: 'Volviendo al modo cookie legado. El próximo sync puede fallar si no hay token vigente.',
      })
      setDeleteOpen(false)
      await loadInfo()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
      logger.error('[ShoplogixCredentialsPage] Error eliminando:', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Key className="w-5 h-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold">Credenciales Shoplogix</h1>
          <p className="text-xs text-muted-foreground">
            Auto-login ROPC para Cloud Functions de sync de Evisceradoras Baader 142
          </p>
        </div>
      </div>

      {error && (
        <Card className="border-rose-500/40 bg-rose-500/5">
          <CardContent className="flex items-start gap-2 py-3 text-sm text-rose-800 dark:text-rose-200">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Error al cargar credenciales</div>
              <div className="text-rose-700/90 dark:text-rose-200/80 text-xs mt-0.5">{error}</div>
              <div className="text-rose-700/70 dark:text-rose-200/60 text-[11px] mt-1">
                Verifica que la regla Firestore <code>system/shoplogixCredentials</code> permita acceso a admins.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Card: estado actual ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Estado actual
            {info?.hasPassword && (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Activas
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {info?.hasPassword ? (
            <>
              <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                <span className="text-muted-foreground">Usuario</span>
                <span className="font-medium tabular-nums">{info.user ?? '—'}</span>
                <span className="text-muted-foreground">Contraseña</span>
                <span className="text-muted-foreground/60 tabular-nums">••••••••</span>
                <span className="text-muted-foreground">Actualizado</span>
                <span
                  className="text-foreground tabular-nums"
                  title={info.setAt ?? 'sin fecha registrada'}
                >
                  {info.setAt
                    ? fmtRelativeTime(Date.parse(info.setAt))
                    : '—'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground/80">
                Las Cloud Functions usan estas credenciales para hacer auto-login ROPC cada vez que el token
                Bearer expira (cada ~1 hora). Si la pass de Javier rota en AquaChile, actualízala aquí y
                no es necesario tocar el script.
              </p>
            </>
          ) : (
            <div className="text-sm text-muted-foreground space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-amber-800 dark:text-amber-200">Sin credenciales configuradas</div>
                  <div className="text-muted-foreground/80 text-xs mt-1">
                    El sync está en modo <em>cookie legado</em> — solo funciona mientras el token Bearer
                    siga vigente. Configura credenciales para auto-login automático.
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Card: form de actualización ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {info?.hasPassword ? 'Actualizar credenciales' : 'Configurar credenciales'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!editing ? (
            <Button onClick={startEdit} variant="default" className="w-full sm:w-auto">
              <RefreshCw className="w-4 h-4 mr-2" />
              {info?.hasPassword ? 'Cambiar credenciales' : 'Configurar ahora'}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="shop-user">Usuario (email Shoplogix)</Label>
                <Input
                  id="shop-user"
                  type="email"
                  autoComplete="username"
                  value={formUser}
                  onChange={(e) => setFormUser(e.target.value)}
                  placeholder="ej: javier.toro@aquachile.com"
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shop-pass">Contraseña</Label>
                <div className="flex gap-1.5">
                  <Input
                    id="shop-pass"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="•••••••••"
                    disabled={saving}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={saving}
                  >
                    {showPassword ? 'Ocultar' : 'Ver'}
                  </Button>
                </div>
              </div>
              {formError && (
                <p className="text-xs text-rose-400">{formError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Spinner /> : <><Save className="w-4 h-4 mr-2" /> Guardar</>}
                </Button>
                <Button onClick={cancelEdit} variant="outline" disabled={saving}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Card: zona peligrosa ─────────────────────────────────────────── */}
      {info?.hasPassword && (
        <Card className="border-rose-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-rose-800 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Zona peligrosa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="text-rose-800 dark:text-rose-300 border-rose-500/40 hover:bg-rose-500/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar credenciales (volver al modo cookie)
            </Button>
            <p className="text-xs text-muted-foreground/80 mt-2">
              Borra el doc de Firestore. El sync usará el token Bearer almacenado mientras siga vigente.
              Cuando expire, el sync va a fallar con AUTH_EXPIRED hasta que se vuelvan a configurar credenciales.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Diálogo confirmación eliminar ────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar credenciales Shoplogix?</DialogTitle>
            <DialogDescription>
              Esta acción borra el documento <code>system/shoplogixCredentials</code>. El sync volverá al
              modo cookie legado y va a fallar cuando el token Bearer actual expire (típicamente en 1 hora).
              Es reversible — puedes volver a configurarlas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleting ? <Spinner /> : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

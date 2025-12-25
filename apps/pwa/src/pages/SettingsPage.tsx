import { useState, useEffect } from 'react'
import { logger } from '@/lib/logger'
import {
  Settings,
  Users,
  Bell,
  Shield,
  Save,
  Plus,
  Copy,
  Trash2,
  CheckCircle,
  Key,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Switch,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { useAuthStore } from '@/store'
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { User, InviteCode } from '@/types'
import { cn } from '@/lib/utils'

type TabType = 'general' | 'users' | 'invites' | 'notifications'

export function SettingsPage() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<TabType>('general')
  
  // Verificar si es admin
  if (user?.rol !== 'admin') {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="p-8 text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-bold">Acceso Denegado</h2>
          <p className="text-muted-foreground mt-2">
            Solo los administradores pueden acceder a esta página.
          </p>
        </Card>
      </div>
    )
  }

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Settings },
    { id: 'users' as const, label: 'Usuarios', icon: Users },
    { id: 'invites' as const, label: 'Invitaciones', icon: Key },
    { id: 'notifications' as const, label: 'Notificaciones', icon: Bell },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">
          Administra la configuración del sistema
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'ghost'}
            onClick={() => setActiveTab(tab.id)}
            className="gap-2"
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'general' && <GeneralSettings />}
      {activeTab === 'users' && <UsersSettings />}
      {activeTab === 'invites' && <InvitesSettings />}
      {activeTab === 'notifications' && <NotificationsSettings />}
    </div>
  )
}

// Configuración General
function GeneralSettings() {
  const [requireValidation, setRequireValidation] = useState(true)
  const [autoAssign, setAutoAssign] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'general'), {
        requireValidation,
        autoAssign,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      logger.info('General settings saved', { requireValidation, autoAssign })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      logger.error('Error guardando configuración general', error instanceof Error ? error : new Error(String(error)))
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Flujo de Incidencias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Validación de Incidencias</Label>
              <p className="text-sm text-muted-foreground">
                Requiere que un supervisor valide las incidencias reportadas
              </p>
            </div>
            <Switch
              checked={requireValidation}
              onCheckedChange={setRequireValidation}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-asignación</Label>
              <p className="text-sm text-muted-foreground">
                Asigna automáticamente incidencias a técnicos disponibles
              </p>
            </div>
            <Switch
              checked={autoAssign}
              onCheckedChange={setAutoAssign}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prioridades</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tiempo respuesta crítica (min)</Label>
              <Input type="number" defaultValue={15} className="mt-1" />
            </div>
            <div>
              <Label>Tiempo respuesta alta (min)</Label>
              <Input type="number" defaultValue={30} className="mt-1" />
            </div>
            <div>
              <Label>Tiempo respuesta media (min)</Label>
              <Input type="number" defaultValue={60} className="mt-1" />
            </div>
            <div>
              <Label>Tiempo respuesta baja (min)</Label>
              <Input type="number" defaultValue={120} className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            'Guardando...'
          ) : saved ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Guardado
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// Gestión de Usuarios
function UsersSettings() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'))
      const usersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as User[]
      setUsers(usersData)
      logger.info('Users loaded', { count: usersData.length })
    } catch (error) {
      logger.error('Error cargando usuarios', error instanceof Error ? error : new Error(String(error)))
    }
    setLoading(false)
  }

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        activo: !currentStatus,
        updatedAt: serverTimestamp(),
      })
      logger.info('User status updated', { userId, newStatus: !currentStatus })
      loadUsers()
    } catch (error) {
      logger.error('Error actualizando estado de usuario', error instanceof Error ? error : new Error(String(error)), { userId })
    }
  }

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        rol: newRole,
        updatedAt: serverTimestamp(),
      })
      logger.info('User role updated', { userId, newRole })
      loadUsers()
    } catch (error) {
      logger.error('Error actualizando rol', error instanceof Error ? error : new Error(String(error)), { userId, newRole })
    }
  }

  const getRoleBadge = (rol: string) => {
    const config = {
      admin: { label: 'Admin', className: 'bg-destructive' },
      supervisor: { label: 'Supervisor', className: 'bg-warning' },
      tecnico: { label: 'Técnico', className: 'bg-primary' },
    }
    const { label, className } = config[rol as keyof typeof config] || config.tecnico
    return <Badge className={className}>{label}</Badge>
  }

  if (loading) {
    return <div className="text-center py-8">Cargando usuarios...</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuarios del Sistema ({users.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {users.map((u) => (
            <div
              key={u.id}
              className="py-4 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {u.nombre} {u.apellido}
                  </span>
                  {getRoleBadge(u.rol)}
                  {!u.activo && (
                    <Badge variant="outline" className="text-destructive">
                      Inactivo
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {u.email}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={u.rol}
                  onValueChange={(value) => handleChangeRole(u.id, value)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="tecnico">Técnico</SelectItem>
                  </SelectContent>
                </Select>

                <Switch
                  checked={u.activo}
                  onCheckedChange={() => handleToggleActive(u.id, u.activo)}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Códigos de Invitación
function InvitesSettings() {
  const { user } = useAuthStore()
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newInviteRole, setNewInviteRole] = useState<string>('tecnico')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadInvites()
  }, [])

  const loadInvites = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'inviteCodes'))
      const invitesData = snapshot.docs.map((doc) => ({
        ...doc.data(),
        code: doc.id,
      })) as InviteCode[]
      setInvites(invitesData)
      logger.info('Invite codes loaded', { count: invitesData.length })
    } catch (error) {
      logger.error('Error cargando invitaciones', error instanceof Error ? error : new Error(String(error)))
    }
    setLoading(false)
  }

  const generateCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  const handleCreateInvite = async () => {
    if (!user) return
    setCreating(true)

    try {
      const code = generateCode()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // Expira en 7 días

      await setDoc(doc(db, 'inviteCodes', code), {
        rol: newInviteRole,
        createdBy: user.id,
        createdAt: serverTimestamp(),
        expiresAt,
        used: false,
        usedBy: null,
        usedAt: null,
      })

      logger.info('Invite code created', { code, role: newInviteRole })
      setShowCreateDialog(false)
      loadInvites()
    } catch (error) {
      logger.error('Error creando invitación', error instanceof Error ? error : new Error(String(error)), { role: newInviteRole })
    }
    setCreating(false)
  }

  const handleDeleteInvite = async (code: string) => {
    if (!confirm('¿Eliminar este código de invitación?')) return
    try {
      await deleteDoc(doc(db, 'inviteCodes', code))
      logger.info('Invite code deleted', { code })
      loadInvites()
    } catch (error) {
      logger.error('Error eliminando invitación', error instanceof Error ? error : new Error(String(error)), { code })
    }
  }

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code)
  }

  if (loading) {
    return <div className="text-center py-8">Cargando invitaciones...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Códigos de Invitación</h3>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Código
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {invites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay códigos de invitación activos
            </div>
          ) : (
            <div className="divide-y divide-border">
              {invites.map((invite) => {
                const isUsed = invite.usosActuales >= invite.usosMaximos
                return (
                  <div
                    key={invite.code}
                    className={cn(
                      'p-4 flex items-center justify-between',
                      isUsed && 'opacity-50'
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <code className="bg-muted px-3 py-1 rounded text-lg font-mono">
                        {invite.code}
                      </code>
                      <div>
                        <Badge variant="outline">
                          {invite.rol === 'admin'
                            ? 'Admin'
                            : invite.rol === 'supervisor'
                              ? 'Supervisor'
                              : 'Técnico'}
                        </Badge>
                        {isUsed && (
                          <Badge className="ml-2 bg-muted text-muted-foreground">
                            Usado
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isUsed && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(invite.code)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDeleteInvite(invite.code)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog crear invitación */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Código de Invitación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rol del nuevo usuario</Label>
              <Select value={newInviteRole} onValueChange={setNewInviteRole}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tecnico">Técnico</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              El código expirará en 7 días
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateInvite} disabled={creating}>
              {creating ? 'Creando...' : 'Crear Código'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Configuración de Notificaciones
function NotificationsSettings() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(false)
  const [criticalAlerts, setCriticalAlerts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'notifications'), {
        emailNotifications,
        pushNotifications,
        criticalAlerts,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      logger.info('Notification settings saved', { emailNotifications, pushNotifications, criticalAlerts })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      logger.error('Error guardando notificaciones', error instanceof Error ? error : new Error(String(error)))
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notificaciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Notificaciones por Email</Label>
              <p className="text-sm text-muted-foreground">
                Recibir resumen diario de incidencias
              </p>
            </div>
            <Switch
              checked={emailNotifications}
              onCheckedChange={setEmailNotifications}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Notificaciones Push</Label>
              <p className="text-sm text-muted-foreground">
                Recibir alertas en tiempo real (requiere PWA instalada)
              </p>
            </div>
            <Switch
              checked={pushNotifications}
              onCheckedChange={setPushNotifications}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Alertas Críticas</Label>
              <p className="text-sm text-muted-foreground">
                Notificar inmediatamente incidencias críticas
              </p>
            </div>
            <Switch
              checked={criticalAlerts}
              onCheckedChange={setCriticalAlerts}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            'Guardando...'
          ) : saved ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Guardado
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

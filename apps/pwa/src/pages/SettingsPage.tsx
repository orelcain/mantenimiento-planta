import { useState, useEffect, type ChangeEvent } from 'react'
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
  Database,
  RefreshCw,
  Wrench,
  Moon,
  Sun,
  Eye,
  EyeOff,
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
  Spinner,
} from '@/components/ui'
import { useAuthStore } from '@/store'
import { useTheme } from '@/hooks/useTheme'
import { createInviteCode } from '@/services/auth'
import { fixPCBOtoPCHO } from '@/scripts/fixPCBOtoPCHO'
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  setDoc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { User, InviteCode, UserRole } from '@/types'
import { cn } from '@/lib/utils'
import { initializeHierarchySystem, isHierarchyInitialized } from '../services/hierarchyInit'
import { getHmiTooltipPwd, saveHmiTooltipPwd } from '@/services/hmiKnuro'
import { NotificationsSettings as NotificationsPushSettings } from '@/components/settings/NotificationsSettings'
import { CategoryManager } from '@/components/repuestos/CategoryManager'
import { PermissionsPage } from '@/pages/admin/PermissionsPage'
import { AriaMonitorPanel } from '@/components/admin/AriaMonitorPanel'
import { MissionControlPanel } from '@/components/admin/MissionControlPanel'
import { Brain, Satellite } from 'lucide-react'

type TabType = 'general' | 'users' | 'invites' | 'notifications' | 'categories' | 'permissions' | 'aria' | 'mission' | 'system'

export function SettingsPage() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<TabType>('general')

  const isAdmin = user?.rol === 'admin'
  
  // Si no es admin, forzar tab de notificaciones
  useEffect(() => {
    if (!isAdmin && activeTab !== 'notifications') {
      setActiveTab('notifications')
    }
  }, [isAdmin, activeTab])

  // Tabs según el rol
  const tabs = isAdmin ? [
    { id: 'general' as const, label: 'General', icon: Settings },
    { id: 'users' as const, label: 'Usuarios', icon: Users },
    { id: 'permissions' as const, label: 'Permisos', icon: Shield },
    { id: 'invites' as const, label: 'Invitaciones', icon: Key },
    { id: 'notifications' as const, label: 'Notificaciones', icon: Bell },
    { id: 'categories' as const, label: 'Categorías', icon: Database },
    { id: 'aria' as const, label: 'ARIA', icon: Brain },
    { id: 'mission' as const, label: 'Mission Control', icon: Satellite },
    { id: 'system' as const, label: 'Sistema', icon: Wrench },
  ] : [
    { id: 'notifications' as const, label: 'Notificaciones', icon: Bell },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">
          {isAdmin ? 'Administra la configuración del sistema' : 'Gestiona tus notificaciones'}
        </p>
      </div>

      {/* Tabs (solo mostrar si es admin) */}
      {isAdmin && (
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
      )}

      {/* Content */}
      {isAdmin && activeTab === 'general' && <GeneralSettings />}
      {isAdmin && activeTab === 'users' && <UsersSettings />}
      {isAdmin && activeTab === 'permissions' && <PermissionsPage isEmbedded={true} />}
      {isAdmin && activeTab === 'invites' && <InvitesSettings />}
      {activeTab === 'notifications' && <NotificationsPushSettings />}
      {isAdmin && activeTab === 'categories' && <CategoryManager />}
      {isAdmin && activeTab === 'aria' && <AriaMonitorPanel />}
      {isAdmin && activeTab === 'mission' && <MissionControlPanel />}
      {isAdmin && activeTab === 'system' && <SystemSettings />}
    </div>
  )
}

// Configuración General
function GeneralSettings() {
  const { toggleTheme, isDark } = useTheme()
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
          <CardTitle>Apariencia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Modo Oscuro</Label>
              <p className="text-sm text-muted-foreground">
                Cambiar entre tema claro y oscuro
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              className="gap-2"
            >
              {isDark ? (
                <>
                  <Moon className="h-4 w-4" />
                  Oscuro
                </>
              ) : (
                <>
                  <Sun className="h-4 w-4" />
                  Claro
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

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

  const [createUid, setCreateUid] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createNombre, setCreateNombre] = useState('')
  const [createApellido, setCreateApellido] = useState('')
  const [createRol, setCreateRol] = useState<UserRole>('usuario')
  const [creatingUserDoc, setCreatingUserDoc] = useState(false)

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
      usuario: { label: 'Usuario', className: 'bg-muted' },
    }
    const { label, className } = config[rol as keyof typeof config] || config.usuario
    return <Badge className={className}>{label}</Badge>
  }

  const handleCreateUserDoc = async () => {
    const uid = createUid.trim()
    const email = createEmail.trim()
    const nombre = createNombre.trim()
    const apellido = createApellido.trim()

    if (!uid || !email || !nombre || !apellido) {
      alert('Completa UID, email, nombre y apellido')
      return
    }

    setCreatingUserDoc(true)
    try {
      await setDoc(doc(db, 'users', uid), {
        email,
        nombre,
        apellido,
        rol: createRol,
        activo: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: false })

      logger.info('User doc created/seeded', { uid, rol: createRol })
      setCreateUid('')
      setCreateEmail('')
      setCreateNombre('')
      setCreateApellido('')
      setCreateRol('usuario')
      await loadUsers()
    } catch (error) {
      logger.error('Error creando perfil de usuario', error instanceof Error ? error : new Error(String(error)))
      alert('Error creando perfil. Revisa permisos/reglas y vuelve a intentar.')
    } finally {
      setCreatingUserDoc(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Cargando usuarios...</div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Crear perfil (UID existente)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>UID *</Label>
              <Input value={createUid} onChange={(e: ChangeEvent<HTMLInputElement>) => setCreateUid(e.target.value)} placeholder="UID de Firebase Auth" className="mt-1" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input value={createEmail} onChange={(e: ChangeEvent<HTMLInputElement>) => setCreateEmail(e.target.value)} placeholder="correo@dominio.com" className="mt-1" />
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={createNombre} onChange={(e: ChangeEvent<HTMLInputElement>) => setCreateNombre(e.target.value)} placeholder="Nombre" className="mt-1" />
            </div>
            <div>
              <Label>Apellido *</Label>
              <Input value={createApellido} onChange={(e: ChangeEvent<HTMLInputElement>) => setCreateApellido(e.target.value)} placeholder="Apellido" className="mt-1" />
            </div>
            <div>
              <Label>Rol</Label>
              <Select value={createRol} onValueChange={(v: string) => setCreateRol(v as UserRole)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usuario">Usuario</SelectItem>
                  <SelectItem value="tecnico">Técnico</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreateUserDoc} disabled={creatingUserDoc} className="w-full">
                {creatingUserDoc ? (
                  <>
                    <Spinner size="sm" />
                    <span className="ml-2">Creando...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Crear perfil
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  onValueChange={(value: string) => handleChangeRole(u.id, value)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="tecnico">Técnico</SelectItem>
                    <SelectItem value="usuario">Usuario</SelectItem>
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
    </div>
  )
}

// Códigos de Invitación
function InvitesSettings() {
  const { user } = useAuthStore()
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newInviteRole, setNewInviteRole] = useState<UserRole>('tecnico')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadInvites()
  }, [])

  const loadInvites = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'inviteCodes'))
      const invitesData = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          code: data.code,
          rol: data.rol,
          usosMaximos: data.usosMaximos || 1,
          usosActuales: data.usosActuales || 0,
          activo: data.activo ?? true,
          createdBy: data.createdBy,
          createdAt: data.createdAt?.toDate() || new Date(),
          expiresAt: data.expiresAt?.toDate(),
        } as InviteCode
      })
      setInvites(invitesData)
      logger.info('Invite codes loaded', { count: invitesData.length })
    } catch (error) {
      logger.error('Error cargando invitaciones', error instanceof Error ? error : new Error(String(error)))
    }
    setLoading(false)
  }

  const handleCreateInvite = async () => {
    if (!user) return
    setCreating(true)

    try {
      await createInviteCode(
          newInviteRole,
        1, // Un uso por código
        user.id,
        7 // Expira en 7 días
      )

      logger.info('Invite code created', { role: newInviteRole })
      setShowCreateDialog(false)
      loadInvites()
    } catch (error) {
      logger.error('Error creando invitación', error instanceof Error ? error : new Error(String(error)), { role: newInviteRole })
    }
    setCreating(false)
  }

  const handleDeleteInvite = async (inviteId: string) => {
    if (!confirm('¿Eliminar este código de invitación?')) return
    try {
      await deleteDoc(doc(db, 'inviteCodes', inviteId))
      logger.info('Invite code deleted', { inviteId })
      loadInvites()
    } catch (error) {
      logger.error('Error eliminando invitación', error instanceof Error ? error : new Error(String(error)), { inviteId })
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
                        onClick={() => handleDeleteInvite(invite.id)}
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
              <Select value={newInviteRole} onValueChange={(value: string) => setNewInviteRole(value as UserRole)}>
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

// Configuración del Sistema
function SystemSettings() {
  const { user } = useAuthStore()
  const [isInitialized, setIsInitialized] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [isInitializing, setIsInitializing] = useState(false)
  const [initSuccess, setInitSuccess] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [hierarchyCount, setHierarchyCount] = useState(0)

  useEffect(() => {
    checkInitialization()
  }, [])

  const checkInitialization = async () => {
    setIsChecking(true)
    try {
      const initialized = await isHierarchyInitialized()
      setIsInitialized(initialized)
      
      // Contar nodos de jerarquía
      const q = query(collection(db, 'hierarchy'), where('activo', '==', true))
      const snapshot = await getDocs(q)
      setHierarchyCount(snapshot.size)
      
      logger.info('Hierarchy system check', { initialized, count: snapshot.size })
    } catch (error) {
      logger.error('Error checking hierarchy initialization', error instanceof Error ? error : new Error(String(error)))
    }
    setIsChecking(false)
  }

  const handleInitialize = async () => {
    if (!user?.id) return
    
    setIsInitializing(true)
    setInitError(null)
    setInitSuccess(false)
    
    try {
      logger.info('Initializing hierarchy system', { userId: user.id })
      await initializeHierarchySystem(user.id)
      
      setInitSuccess(true)
      setIsInitialized(true)
      
      // Recargar count
      await checkInitialization()
      
      logger.info('Hierarchy system initialized successfully')
      setTimeout(() => setInitSuccess(false), 3000)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
      logger.error('Error initializing hierarchy system', error instanceof Error ? error : new Error(String(error)))
      setInitError(errorMessage)
    }
    
    setIsInitializing(false)
  }

  const handleReinitialize = async () => {
    if (!confirm('¿Estás seguro de reinicializar el sistema de jerarquías? Esto NO eliminará los datos existentes, solo agregará nodos faltantes.')) {
      return
    }
    await handleInitialize()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Sistema de Jerarquías
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isChecking ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
              <span className="ml-3 text-muted-foreground">Verificando sistema...</span>
            </div>
          ) : (
            <>
              {/* Estado del sistema */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div className="space-y-1">
                  <p className="font-medium">Estado del Sistema</p>
                  <p className="text-sm text-muted-foreground">
                    {isInitialized 
                      ? `Sistema inicializado - ${hierarchyCount} nodos activos` 
                      : 'Sistema no inicializado'}
                  </p>
                </div>
                <Badge variant={isInitialized ? 'default' : 'destructive'}>
                  {isInitialized ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Activo
                    </>
                  ) : (
                    'Pendiente'
                  )}
                </Badge>
              </div>

              {/* Información del sistema */}
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  El sistema de jerarquías organiza las ubicaciones en 8 niveles:
                </p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>🏢 Empresa</li>
                  <li>📍 Área</li>
                  <li>🗂️ Sub-área</li>
                  <li>⚙️ Sistema</li>
                  <li>🔧 Sub-sistema</li>
                  <li>📂 Sección</li>
                  <li>📋 Sub-sección</li>
                  <li>🔍 Elemento</li>
                </ol>
              </div>

              {/* Mensajes de estado */}
              {initSuccess && (
                <div className="p-3 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">Sistema inicializado correctamente</span>
                </div>
              )}

              {initError && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm">{initError}</span>
                </div>
              )}

              {/* Acciones */}
              <div className="flex gap-3 pt-4 border-t">
                {!isInitialized ? (
                  <Button 
                    onClick={handleInitialize} 
                    disabled={isInitializing}
                    className="flex-1"
                  >
                    {isInitializing ? (
                      <>
                        <Spinner size="sm" />
                        <span className="ml-2">Inicializando...</span>
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4 mr-2" />
                        Inicializar Sistema
                      </>
                    )}
                  </Button>
                ) : (
                  <>
                    <Button 
                      onClick={handleReinitialize} 
                      disabled={isInitializing}
                      variant="outline"
                    >
                      {isInitializing ? (
                        <>
                          <Spinner size="sm" />
                          <span className="ml-2">Procesando...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Reinicializar
                        </>
                      )}
                    </Button>
                    <Button 
                      onClick={checkInitialization} 
                      variant="ghost"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Verificar
                    </Button>
                  </>
                )}
              </div>

              {/* Advertencia */}
              {!isInitialized && (
                <div className="p-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
                  <strong>Nota:</strong> La inicialización creará la estructura base de Aquachile Antarfood Chonchi 
                  con 4 áreas principales y ejemplos de sub-estructuras.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Card de corrección PCBO → PCHO */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Corrección de Datos: PCBO → PCHO
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Si la jerarquía contiene códigos con "PCBO" (error de tipeo), usa este botón para corregirlos automáticamente a "PCHO" (Planta Chonchi).
          </p>

          <FixPCBOButton />
        </CardContent>
      </Card>

      {/* Card clave edición tooltips HMI Knuro */}
      <HmiTooltipPwdCard />
    </div>
  )
}

// Componente para clave de edición de tooltips HMI Knuro
function HmiTooltipPwdCard() {
  const [currentPwd, setCurrentPwd] = useState('')
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getHmiTooltipPwd().then(pwd => {
      setCurrentPwd(pwd)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!newPwd.trim()) { setError('La clave no puede estar vacía'); return }
    if (newPwd !== confirmPwd) { setError('Las claves no coinciden'); return }
    setSaving(true)
    setError(null)
    try {
      await saveHmiTooltipPwd(newPwd.trim())
      setCurrentPwd(newPwd.trim())
      setNewPwd('')
      setConfirmPwd('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Clave de Edición
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Clave de edición para acciones sensibles (eliminar equipos, editar tooltips HMI, etc.). Se guarda en Firestore y aplica en todos los dispositivos.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" /> Cargando...
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm">
              <span>Clave actual: <span className="font-mono font-semibold">{showCurrentPwd ? currentPwd : '•'.repeat(Math.max(currentPwd.length, 6))}</span></span>
              <button
                onClick={() => setShowCurrentPwd(v => !v)}
                className="ml-2 text-muted-foreground hover:text-foreground"
                title={showCurrentPwd ? 'Ocultar clave' : 'Mostrar clave'}
                type="button"
              >
                {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="hmi-new-pwd">Nueva clave</Label>
                <Input
                  id="hmi-new-pwd"
                  type="password"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="Nueva clave"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hmi-confirm-pwd">Confirmar clave</Label>
                <Input
                  id="hmi-confirm-pwd"
                  type="password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder="Repetir clave"
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
              )}
              {success && (
                <div className="p-3 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4" /> Clave guardada en Firestore
                </div>
              )}
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
                {saving ? 'Guardando...' : 'Guardar clave'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Componente para el botón de corrección PCBO
function FixPCBOButton() {
  const [isFixing, setIsFixing] = useState(false)
  const [result, setResult] = useState<{ success: boolean; updated: number; error?: string } | null>(null)

  const handleFix = async () => {
    if (!confirm('¿Deseas corregir todos los códigos PCBO a PCHO en Firestore?\n\nEsto actualizará los códigos y padres de todos los nodos afectados.')) {
      return
    }

    setIsFixing(true)
    setResult(null)

    try {
      const fixResult = await fixPCBOtoPCHO()
      setResult(fixResult)
      
      if (fixResult.success && fixResult.updated > 0) {
        // Recargar página después de 2 segundos
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      }
    } catch (error) {
      setResult({
        success: false,
        updated: 0,
        error: error instanceof Error ? error.message : 'Error desconocido'
      })
    } finally {
      setIsFixing(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button 
        onClick={handleFix} 
        disabled={isFixing}
        variant="default"
        className="gap-2"
      >
        {isFixing ? (
          <>
            <Spinner size="sm" />
            <span>Corrigiendo...</span>
          </>
        ) : (
          <>
            <Wrench className="h-4 w-4" />
            Corregir PCBO → PCHO
          </>
        )}
      </Button>

      {result && (
        <div className={`p-3 rounded-lg ${
          result.success 
            ? 'bg-green-500/10 text-green-700 dark:text-green-400' 
            : 'bg-red-500/10 text-red-700 dark:text-red-400'
        }`}>
          {result.success ? (
            <div>
              <CheckCircle className="h-4 w-4 inline mr-2" />
              <strong>Éxito:</strong> {result.updated} {result.updated === 1 ? 'nodo actualizado' : 'nodos actualizados'}
              {result.updated > 0 && ' (recargando página...)'}
            </div>
          ) : (
            <div>
              <strong>Error:</strong> {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

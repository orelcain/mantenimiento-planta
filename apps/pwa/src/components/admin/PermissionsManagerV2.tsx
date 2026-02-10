/**
 * PermissionsManager v2 - Sistema de permisos dinámicos
 * 
 * Permite configurar permisos:
 * - Por rol (aplicado a todos los usuarios del rol)
 * - Por usuario (override individual)
 * 
 * Los permisos se guardan en Firestore y se aplican en tiempo real.
 */

import { useState, useEffect, useCallback } from 'react'
import { 
  Shield, 
  Save, 
  AlertCircle, 
  Users, 
  UserCog, 
  Check,
  X,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Spinner,
  Badge,
  Input,
  Switch,
  Label,
} from '@/components/ui'
import { logger } from '@/lib/logger'
import { useAuthStore } from '@/store'
import type { User, UserRole } from '@/types'
import type {
  AppModule, 
  ModuleAction, 
  PermissionsMap,
} from '@/types/permissions'
import { 
  MODULES_CONFIG, 
  ACTION_LABELS, 
  DEFAULT_ROLE_PERMISSIONS,
} from '@/types/permissions'
import {
  getAllRolePermissions,
  saveRolePermissions,
  getUserPermissionsOverride,
  saveUserPermissionsOverride,
  clearUserPermissionsOverride,
  initializeDefaultRoles,
} from '@/services/permissions'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'

type TabType = 'roles' | 'users'

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function PermissionsManagerV2() {
  const { user: currentUser } = useAuthStore()
  const [activeTab, setActiveTab] = useState<TabType>('roles')
  const [isInitializing, setIsInitializing] = useState(false)

  const handleInitializeRoles = async () => {
    if (!currentUser) return
    setIsInitializing(true)
    try {
      await initializeDefaultRoles(currentUser.id)
      alert('✅ Roles inicializados correctamente')
    } catch (error) {
      logger.error('Error inicializando roles', error instanceof Error ? error : new Error(String(error)))
      alert('❌ Error inicializando roles')
    } finally {
      setIsInitializing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Gestión de Permisos</h2>
            <p className="text-sm text-muted-foreground">
              Configura accesos por rol o usuario individual
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          onClick={handleInitializeRoles}
          disabled={isInitializing}
        >
          {isInitializing ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Inicializar Roles
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('roles')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'roles'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="h-4 w-4" />
          Permisos por Rol
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <UserCog className="h-4 w-4" />
          Permisos por Usuario
        </button>
      </div>

      {/* Contenido */}
      {activeTab === 'roles' ? (
        <RolePermissionsTab />
      ) : (
        <UserPermissionsTab />
      )}
    </div>
  )
}

// ============================================================================
// TAB: PERMISOS POR ROL
// ============================================================================

function RolePermissionsTab() {
  const { user: currentUser } = useAuthStore()
  const [selectedRole, setSelectedRole] = useState<UserRole>('tecnico')
  const [permissions, setPermissions] = useState<PermissionsMap>({})
  const [originalPermissions, setOriginalPermissions] = useState<PermissionsMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  const loadRolePermissions = useCallback(async () => {
    setIsLoading(true)
    try {
      const roles = await getAllRolePermissions()
      const roleData = roles.find(r => r.id === selectedRole)
      
      if (roleData) {
        setPermissions(roleData.permisos)
        setOriginalPermissions(roleData.permisos)
      } else {
        // Usar defaults si no existe
        const defaults = DEFAULT_ROLE_PERMISSIONS[selectedRole] || {}
        setPermissions(defaults)
        setOriginalPermissions(defaults)
      }
    } catch (error) {
      logger.error('Error cargando permisos de rol', error instanceof Error ? error : new Error(String(error)))
    } finally {
      setIsLoading(false)
    }
  }, [selectedRole])

  // Cargar permisos del rol seleccionado
  useEffect(() => {
    loadRolePermissions()
  }, [loadRolePermissions])

  const hasChanges = JSON.stringify(permissions) !== JSON.stringify(originalPermissions)

  const handleToggleModuleVisibility = (moduleId: AppModule) => {
    setPermissions(prev => {
      const current = prev[moduleId] || { visible: false, actions: [] }
      return {
        ...prev,
        [moduleId]: {
          ...current,
          visible: !current.visible,
        }
      }
    })
  }

  const handleToggleAction = (moduleId: AppModule, action: ModuleAction) => {
    setPermissions(prev => {
      const current = prev[moduleId] || { visible: true, actions: [] }
      const hasAction = current.actions.includes(action)
      return {
        ...prev,
        [moduleId]: {
          ...current,
          actions: hasAction
            ? current.actions.filter(a => a !== action)
            : [...current.actions, action],
        }
      }
    })
  }

  const handleSave = async () => {
    if (!currentUser) return
    setIsSaving(true)
    try {
      await saveRolePermissions(selectedRole, permissions, currentUser.id)
      setOriginalPermissions(permissions)
      logger.info('Permisos de rol guardados', { rol: selectedRole })
      alert('✅ Permisos guardados correctamente')
    } catch (error) {
      logger.error('Error guardando permisos', error instanceof Error ? error : new Error(String(error)))
      alert('❌ Error al guardar permisos')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    if (confirm('¿Restaurar permisos por defecto para este rol?')) {
      const defaults = DEFAULT_ROLE_PERMISSIONS[selectedRole] || {}
      setPermissions(defaults)
    }
  }

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(moduleId)) {
        next.delete(moduleId)
      } else {
        next.add(moduleId)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Selector de rol */}
      <div className="flex flex-wrap gap-2">
        {(['admin', 'supervisor', 'tecnico', 'usuario'] as UserRole[]).map(role => {
          const roleLabels = {
            admin: '👑 Administrador',
            supervisor: '👔 Supervisor',
            tecnico: '🔧 Técnico',
            usuario: '👤 Usuario',
          }
          return (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedRole === role
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {roleLabels[role]}
            </button>
          )
        })}
      </div>

      {hasChanges && (
        <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning rounded-lg">
          <AlertCircle className="h-4 w-4 text-warning" />
          <span className="text-sm flex-1">Hay cambios sin guardar</span>
          <Button size="sm" variant="outline" onClick={handleReset}>
            Restaurar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="sm" /> : <Save className="h-4 w-4 mr-1" />}
            Guardar
          </Button>
        </div>
      )}

      {/* Lista de módulos */}
      <div className="space-y-2">
        {MODULES_CONFIG.map(module => {
          const modulePerms = permissions[module.id] || { visible: false, actions: [] }
          const isExpanded = expandedModules.has(module.id)
          const activeCount = modulePerms.actions.length
          const totalActions = module.accionesDisponibles.length

          return (
            <Card key={module.id} className={modulePerms.visible ? '' : 'opacity-60'}>
              <div 
                className="flex items-center p-4 cursor-pointer"
                onClick={() => toggleModule(module.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-2 text-muted-foreground" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{module.nombre}</span>
                    {modulePerms.visible && (
                      <Badge variant="secondary" className="text-xs">
                        {activeCount}/{totalActions} acciones
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{module.descripcion}</p>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <Label className="text-sm">Visible</Label>
                  <Switch
                    checked={modulePerms.visible}
                    onCheckedChange={() => handleToggleModuleVisibility(module.id)}
                  />
                </div>
              </div>

              {isExpanded && modulePerms.visible && (
                <CardContent className="pt-0 border-t">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 pt-4">
                    {module.accionesDisponibles.map(action => {
                      const isActive = modulePerms.actions.includes(action)
                      return (
                        <button
                          key={action}
                          onClick={() => handleToggleAction(module.id, action)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive
                              ? 'bg-primary/20 text-primary border border-primary'
                              : 'bg-muted hover:bg-muted/80 border border-transparent'
                          }`}
                        >
                          {isActive ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3 opacity-30" />
                          )}
                          {ACTION_LABELS[action]}
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// TAB: PERMISOS POR USUARIO
// ============================================================================

function UserPermissionsTab() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // Override de permisos para el usuario seleccionado
  const [overrideActive, setOverrideActive] = useState(false)
  const [overridePermissions, setOverridePermissions] = useState<PermissionsMap>({})
  const [originalOverride, setOriginalOverride] = useState<{active: boolean, perms: PermissionsMap}>({
    active: false,
    perms: {},
  })
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  // Cargar usuarios
  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const snapshot = await getDocs(collection(db, 'users'))
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as User[]
      setUsers(usersData.filter(u => u.activo))
    } catch (error) {
      logger.error('Error cargando usuarios', error instanceof Error ? error : new Error(String(error)))
    } finally {
      setIsLoading(false)
    }
  }

  // Cargar override cuando se selecciona usuario
  useEffect(() => {
    if (selectedUser) {
      loadUserOverride(selectedUser.id)
    }
  }, [selectedUser])

  const loadUserOverride = async (userId: string) => {
    try {
      const override = await getUserPermissionsOverride(userId)
      if (override) {
        setOverrideActive(override.activo)
        setOverridePermissions(override.permisos)
        setOriginalOverride({ active: override.activo, perms: override.permisos })
      } else {
        setOverrideActive(false)
        setOverridePermissions({})
        setOriginalOverride({ active: false, perms: {} })
      }
    } catch (error) {
      logger.error('Error cargando override', error instanceof Error ? error : new Error(String(error)))
    }
  }

  const hasChanges = 
    overrideActive !== originalOverride.active ||
    JSON.stringify(overridePermissions) !== JSON.stringify(originalOverride.perms)

  const filteredUsers = users.filter(u => 
    `${u.nombre} ${u.apellido} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleToggleModuleVisibility = (moduleId: AppModule) => {
    setOverridePermissions(prev => {
      const current = prev[moduleId] || { visible: false, actions: [] }
      return {
        ...prev,
        [moduleId]: {
          ...current,
          visible: !current.visible,
        }
      }
    })
  }

  const handleToggleAction = (moduleId: AppModule, action: ModuleAction) => {
    setOverridePermissions(prev => {
      const current = prev[moduleId] || { visible: true, actions: [] }
      const hasAction = current.actions.includes(action)
      return {
        ...prev,
        [moduleId]: {
          ...current,
          actions: hasAction
            ? current.actions.filter(a => a !== action)
            : [...current.actions, action],
        }
      }
    })
  }

  const handleSave = async () => {
    if (!currentUser || !selectedUser) return
    setIsSaving(true)
    try {
      if (overrideActive) {
        await saveUserPermissionsOverride(
          selectedUser.id,
          { activo: true, permisos: overridePermissions },
          currentUser.id
        )
      } else {
        await clearUserPermissionsOverride(selectedUser.id, currentUser.id)
      }
      setOriginalOverride({ active: overrideActive, perms: overridePermissions })
      logger.info('Override guardado', { userId: selectedUser.id })
      alert('✅ Permisos personalizados guardados')
    } catch (error) {
      logger.error('Error guardando override', error instanceof Error ? error : new Error(String(error)))
      alert('❌ Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(moduleId)) {
        next.delete(moduleId)
      } else {
        next.add(moduleId)
      }
      return next
    })
  }

  const getRoleBadge = (rol: string) => {
    const config: Record<string, { label: string; className: string }> = {
      admin: { label: 'Admin', className: 'bg-destructive' },
      supervisor: { label: 'Supervisor', className: 'bg-warning text-warning-foreground' },
      tecnico: { label: 'Técnico', className: 'bg-primary' },
      usuario: { label: 'Usuario', className: 'bg-muted' },
    }
    const roleConfig = config[rol] ?? config['usuario']!
    return <Badge className={roleConfig.className}>{roleConfig.label}</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Lista de usuarios */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-lg">Seleccionar Usuario</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuario..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="max-h-[500px] overflow-y-auto">
          <div className="space-y-2">
            {filteredUsers.map(user => (
              <button
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedUser?.id === user.id
                    ? 'bg-primary/10 border border-primary'
                    : 'bg-muted/50 hover:bg-muted border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{user.nombre} {user.apellido}</span>
                  {getRoleBadge(user.rol)}
                </div>
                <span className="text-sm text-muted-foreground">{user.email}</span>
                {user.permissionsOverride?.activo && (
                  <Badge variant="outline" className="mt-1 text-xs">
                    🔧 Override activo
                  </Badge>
                )}
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No se encontraron usuarios
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configuración de permisos del usuario */}
      <Card className="lg:col-span-2">
        {selectedUser ? (
          <>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{selectedUser.nombre} {selectedUser.apellido}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Rol base: {selectedUser.rol} • {selectedUser.email}
                  </p>
                </div>
                {hasChanges && (
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Spinner size="sm" /> : <Save className="h-4 w-4 mr-1" />}
                    Guardar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Toggle de override */}
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <Label className="font-medium">Permisos Personalizados</Label>
                  <p className="text-sm text-muted-foreground">
                    Activar para sobrescribir los permisos del rol
                  </p>
                </div>
                <Switch
                  checked={overrideActive}
                  onCheckedChange={setOverrideActive}
                />
              </div>

              {overrideActive && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Configura qué módulos y acciones puede usar este usuario (sobrescribe el rol).
                  </p>

                  {MODULES_CONFIG.map(module => {
                    const modulePerms = overridePermissions[module.id] || { visible: false, actions: [] }
                    const isExpanded = expandedModules.has(module.id)

                    return (
                      <Card key={module.id} className={modulePerms.visible ? '' : 'opacity-60'}>
                        <div 
                          className="flex items-center p-3 cursor-pointer"
                          onClick={() => toggleModule(module.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 mr-2 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 mr-2 text-muted-foreground" />
                          )}
                          <span className="flex-1 font-medium text-sm">{module.nombre}</span>
                          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <Switch
                              checked={modulePerms.visible}
                              onCheckedChange={() => handleToggleModuleVisibility(module.id)}
                            />
                          </div>
                        </div>

                        {isExpanded && modulePerms.visible && (
                          <CardContent className="pt-0 border-t">
                            <div className="flex flex-wrap gap-2 pt-3">
                              {module.accionesDisponibles.map(action => {
                                const isActive = modulePerms.actions.includes(action)
                                return (
                                  <button
                                    key={action}
                                    onClick={() => handleToggleAction(module.id, action)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                                      isActive
                                        ? 'bg-primary/20 text-primary border border-primary'
                                        : 'bg-muted hover:bg-muted/80 border border-transparent'
                                    }`}
                                  >
                                    {isActive ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-30" />}
                                    {ACTION_LABELS[action]}
                                  </button>
                                )
                              })}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    )
                  })}
                </div>
              )}

              {!overrideActive && (
                <p className="text-center text-muted-foreground py-8">
                  Este usuario usa los permisos de su rol ({selectedUser.rol}).
                  <br />
                  Activa "Permisos Personalizados" para sobrescribirlos.
                </p>
              )}
            </CardContent>
          </>
        ) : (
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">
              Selecciona un usuario para configurar sus permisos
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

// Exportar también el componente legacy por compatibilidad
export { PermissionsManagerV2 as PermissionsManager }

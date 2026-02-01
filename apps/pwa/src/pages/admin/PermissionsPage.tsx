import { useState, useEffect } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Badge,
  Spinner,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Switch,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import { Search, Shield, Save, RotateCcw, PenSquare } from 'lucide-react'
import { getAllUsers } from '@/services/auth'
import { 
  getRolePermissions, 
  getUserPermissionsOverride, 
  saveUserPermissionsOverride 
} from '@/services/permissions'
import { logger } from '@/lib/logger'
import type { User } from '@/types'
import { 
  APP_MODULES, 
  MODULE_ACTIONS, 
  DEFAULT_ROLE_PERMISSIONS,
  type PermissionsMap,
  type UserPermissionsOverride
} from '@/types/permissions'
import { useToast } from '@/hooks/useToast'

export function PermissionsPage({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const [users, setUsers] = useState<User[]>([])
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  
  // Estado para el editor de permisos
  const [isEditing, setIsEditing] = useState(false)
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false)
  const [currentUserPerms, setCurrentUserPerms] = useState<PermissionsMap>({})
  const [originalUserPerms, setOriginalUserPerms] = useState<PermissionsMap>({})
  const [isSaving, setIsSaving] = useState(false)
  
  const { toast } = useToast()

  // Cargar usuarios
  useEffect(() => {
    loadUsers()
  }, [])

  // Filtrar usuarios
  useEffect(() => {
    if (!searchQuery) {
      setFilteredUsers(users)
    } else {
      const lower = searchQuery.toLowerCase()
      setFilteredUsers(
        users.filter(
          (u) =>
            u.nombre.toLowerCase().includes(lower) ||
            u.apellido.toLowerCase().includes(lower) ||
            u.email.toLowerCase().includes(lower) ||
            u.rol.toLowerCase().includes(lower)
        )
      )
    }
  }, [searchQuery, users])

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const data = await getAllUsers()
      setUsers(data)
      setFilteredUsers(data)
    } catch (error) {
      logger.error('Error cargando usuarios', error as Error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los usuarios',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditUser = async (user: User) => {
    setSelectedUser(user)
    setIsEditing(true)
    setIsLoadingPermissions(true)
    
    try {
      // 1. Obtener permisos base del rol
      const rolePerms = await getRolePermissions(user.rol)
      
      // 2. Obtener override específico del usuario
      const override = await getUserPermissionsOverride(user.id)
      
      let effectivePerms: PermissionsMap
      
      if (override) {
        effectivePerms = override.permisos
      } else {
        effectivePerms = rolePerms ? rolePerms.permisos : DEFAULT_ROLE_PERMISSIONS[user.rol]
      }
      
      setCurrentUserPerms(effectivePerms)
      setOriginalUserPerms(effectivePerms) // Guardar copia para detectar cambios
      
    } catch (error) {
      logger.error('Error cargando permisos de usuario', error as Error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los permisos del usuario',
      })
      setIsEditing(false)
    } finally {
      setIsLoadingPermissions(false)
    }
  }

  const handlePermissionChange = (modulo: string, accion: string, enabled: boolean) => {
    setCurrentUserPerms(prev => {
      const newPerms = { ...prev }
      
      // Asegurar que el módulo existe
      if (!newPerms[modulo]) {
        newPerms[modulo] = []
      }
      
      if (enabled) {
        // Añadir permiso si no existe
        if (!newPerms[modulo].includes(accion)) {
          newPerms[modulo] = [...newPerms[modulo], accion]
        }
      } else {
        // Remover permiso
        newPerms[modulo] = newPerms[modulo].filter(a => a !== accion)
      }
      
      return newPerms
    })
  }
  
  const handleModuleToggle = (modulo: string, enabled: boolean) => {
    setCurrentUserPerms(prev => {
      const newPerms = { ...prev }
      
      if (enabled) {
        // Habilitar todas las acciones del módulo ('read', 'create', 'update', 'delete', 'export')
        newPerms[modulo] = ['read', 'create', 'update', 'delete', 'export']
      } else {
        // Deshabilitar módulo completo
        newPerms[modulo] = []
      }
      
      return newPerms
    })
  }

  const handleSave = async () => {
    if (!selectedUser) return
    
    setIsSaving(true)
    try {
      const override: UserPermissionsOverride = {
        userId: selectedUser.id,
        permisos: currentUserPerms,
        updatedAt: new Date(),
        updatedBy: 'admin', // Idealmente usar ID del admin actual
      }
      
      await saveUserPermissionsOverride(selectedUser.id, override)
      
      toast({
        title: 'Permisos actualizados',
        description: `Los permisos para ${selectedUser.nombre} han sido guardados.`,
      })
      
      setIsEditing(false)
    } catch (error) {
      logger.error('Error guardando permisos', error as Error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron guardar los cambios',
      })
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleResetToDefault = async () => {
    if (!selectedUser) return
    
    // Simplemente recargamos los permisos base del rol
    const rolePerms = await getRolePermissions(selectedUser.rol)
    const defaults = rolePerms ? rolePerms.permisos : DEFAULT_ROLE_PERMISSIONS[selectedUser.rol]
    
    setCurrentUserPerms(defaults)
    
    toast({
      description: 'Permisos restablecidos al valor por defecto del rol. Recuerda Guardar.',
    })
  }

  return (
    <div className="space-y-6">
      {!isEmbedded && (
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Permisos</h1>
          <p className="text-muted-foreground">
            Configura los accesos y permisos específicos por usuario.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Usuarios</CardTitle>
            <div className="flex w-full max-w-sm items-center space-x-2">
              <Input
                placeholder="Buscar usuarios..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
              <Button size="icon" variant="ghost">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="hidden md:flex items-center text-sm font-medium text-muted-foreground px-4 pb-2 border-b">
                <div className="flex-1">Usuario</div>
                <div className="flex-1">Email</div>
                <div className="w-32">Rol</div>
                <div className="w-32 text-right">Acciones</div>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/10">
                  No se encontraron usuarios
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map((user) => (
                    <div 
                      key={user.id} 
                      className="flex flex-col md:flex-row items-start md:items-center p-3 border rounded-lg hover:bg-muted/50 transition-colors gap-3"
                    >
                      <div className="flex-1 font-medium min-w-[200px]">
                        {user.nombre} {user.apellido}
                      </div>
                      <div className="flex-1 text-sm text-muted-foreground min-w-[200px] break-all">
                        {user.email}
                      </div>
                      <div className="flex items-center justify-between w-full md:w-auto gap-4">
                        <Badge variant={user.rol === 'admin' ? 'default' : 'secondary'} className="w-24 justify-center">
                          {user.rol}
                        </Badge>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleEditUser(user)}
                        >
                          <Shield className="h-3.5 w-3.5 mr-2" />
                          Permisos
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Permisos</DialogTitle>
            <DialogDescription>
              Configurando permisos para <span className="font-semibold">{selectedUser?.nombre} {selectedUser?.apellido}</span> ({selectedUser?.rol})
            </DialogDescription>
          </DialogHeader>

          {isLoadingPermissions ? (
            <div className="flex justify-center p-12">
              <Spinner />
            </div>
          ) : (
            <div className="py-4 space-y-6">
              <div className="flex justify-end gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={handleResetToDefault}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restaurar Default
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.entries(APP_MODULES).map(([key, label]) => {
                  const hasAll = ['read', 'create', 'update', 'delete', 'export'].every(
                    action => currentUserPerms[key]?.includes(action)
                  )
                  const hasNone = !currentUserPerms[key] || currentUserPerms[key].length === 0
                  
                  return (
                    <Card key={key} className={hasNone ? 'opacity-70 bg-secondary/20' : ''}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{label}</CardTitle>
                          <Switch 
                            checked={!hasNone}
                            onCheckedChange={(checked) => handleModuleToggle(key, checked)}
                          />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {Object.entries(MODULE_ACTIONS).map(([actionKey, actionLabel]) => (
                            <div key={`${key}-${actionKey}`} className="flex items-center space-x-2">
                              <Switch 
                                id={`${key}-${actionKey}`}
                                checked={currentUserPerms[key]?.includes(actionKey) || false}
                                onCheckedChange={(checked) => handlePermissionChange(key, actionKey, checked)}
                                disabled={hasNone} // Deshabilitar si el módulo está apagado
                              />
                              <Label htmlFor={`${key}-${actionKey}`} className="text-sm font-normal">
                                {actionLabel}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Spinner size="sm" className="mr-2" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

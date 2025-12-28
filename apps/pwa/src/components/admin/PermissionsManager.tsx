import { useState, useEffect } from 'react'
import { Shield, Save, AlertCircle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Spinner,
  Badge,
} from '@/components/ui'
import { logger } from '@/lib/logger'
import type { UserRole } from '@/types'

// Definir permisos configurables por rol
interface Permission {
  key: string
  label: string
  description: string
  category: 'incidents' | 'maintenance' | 'users' | 'iot' | 'reports'
}

const ALL_PERMISSIONS: Permission[] = [
  // INCIDENCIAS
  { key: 'createIncident', label: 'Crear incidencias', description: 'Reportar nuevas incidencias', category: 'incidents' },
  { key: 'viewIncidents', label: 'Ver incidencias', description: 'Acceder a lista de incidencias', category: 'incidents' },
  { key: 'editIncident', label: 'Editar incidencias', description: 'Modificar incidencias existentes', category: 'incidents' },
  { key: 'deleteIncident', label: 'Eliminar incidencias', description: 'Borrar incidencias permanentemente', category: 'incidents' },
  { key: 'validateIncident', label: 'Validar incidencias', description: 'Confirmar o rechazar reportes', category: 'incidents' },
  { key: 'assignIncident', label: 'Asignar incidencias', description: 'Asignar técnicos a trabajos', category: 'incidents' },
  { key: 'closeIncident', label: 'Cerrar incidencias', description: 'Marcar incidencias como resueltas', category: 'incidents' },
  
  // MANTENIMIENTO
  { key: 'createPreventive', label: 'Crear preventivos', description: 'Planificar mantenimiento preventivo', category: 'maintenance' },
  { key: 'executePreventive', label: 'Ejecutar preventivos', description: 'Realizar tareas programadas', category: 'maintenance' },
  { key: 'viewPredictive', label: 'Ver predictivo', description: 'Acceder a análisis predictivo', category: 'maintenance' },
  { key: 'viewProactive', label: 'Ver proactivo', description: 'Acceder a optimización proactiva', category: 'maintenance' },
  
  // USUARIOS
  { key: 'viewUsers', label: 'Ver usuarios', description: 'Listar todos los usuarios', category: 'users' },
  { key: 'createUser', label: 'Crear usuarios', description: 'Registrar nuevos usuarios', category: 'users' },
  { key: 'editUser', label: 'Editar usuarios', description: 'Modificar datos de usuarios', category: 'users' },
  { key: 'deleteUser', label: 'Eliminar usuarios', description: 'Desactivar cuentas', category: 'users' },
  { key: 'manageRoles', label: 'Gestionar roles', description: 'Asignar y modificar roles', category: 'users' },
  
  // IOT
  { key: 'viewIoT', label: 'Ver sensores IoT', description: 'Dashboard de sensores en tiempo real', category: 'iot' },
  { key: 'configureIoT', label: 'Configurar IoT', description: 'Ajustar umbrales y alertas', category: 'iot' },
  { key: 'manageDevices', label: 'Gestionar dispositivos', description: 'Agregar/quitar sensores', category: 'iot' },
  
  // REPORTES
  { key: 'viewReports', label: 'Ver reportes', description: 'Acceder a análisis y métricas', category: 'reports' },
  { key: 'exportReports', label: 'Exportar reportes', description: 'Descargar datos en Excel/PDF', category: 'reports' },
  { key: 'viewAnalytics', label: 'Ver analytics', description: 'Dashboard con IA y predicciones', category: 'reports' },
]

// Permisos por defecto por rol
const DEFAULT_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ALL_PERMISSIONS.map(p => p.key), // Admin tiene todos
  supervisor: [
    'createIncident', 'viewIncidents', 'editIncident', 'validateIncident', 'assignIncident',
    'createPreventive', 'executePreventive', 'viewPredictive', 'viewProactive',
    'viewUsers', 'viewIoT', 'configureIoT', 'viewReports', 'exportReports', 'viewAnalytics'
  ],
  tecnico: [
    'createIncident', 'viewIncidents', 'closeIncident',
    'executePreventive', 'viewPredictive',
    'viewIoT', 'viewReports'
  ]
}

const CATEGORY_LABELS: Record<Permission['category'], { label: string; icon: string }> = {
  incidents: { label: 'Incidencias', icon: '🚨' },
  maintenance: { label: 'Mantenimiento', icon: '🔧' },
  users: { label: 'Usuarios', icon: '👥' },
  iot: { label: 'IoT y Sensores', icon: '📡' },
  reports: { label: 'Reportes y Analytics', icon: '📊' },
}

export function PermissionsManager() {
  const [selectedRole, setSelectedRole] = useState<UserRole>('tecnico')
  const [permissions, setPermissions] = useState<Record<UserRole, string[]>>(DEFAULT_PERMISSIONS)
  const [isLoading, setIsLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Cargar permisos guardados desde localStorage (o Firestore en producción)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('custom_permissions')
      if (saved) {
        setPermissions(JSON.parse(saved))
        logger.info('Permisos personalizados cargados')
      }
    } catch (error) {
      logger.error('Error cargando permisos', error instanceof Error ? error : new Error(String(error)))
    }
  }, [])

  const handleTogglePermission = (permissionKey: string) => {
    setPermissions(prev => {
      const rolePerms = prev[selectedRole] || []
      const newPerms = rolePerms.includes(permissionKey)
        ? rolePerms.filter(p => p !== permissionKey)
        : [...rolePerms, permissionKey]
      
      return {
        ...prev,
        [selectedRole]: newPerms
      }
    })
    setHasChanges(true)
  }

  const handleResetToDefaults = () => {
    if (confirm('¿Restaurar permisos por defecto? Se perderán las personalizaciones.')) {
      setPermissions(DEFAULT_PERMISSIONS)
      setHasChanges(true)
    }
  }

  const handleSave = async () => {
    setIsLoading(true)
    try {
      // TODO: Guardar en Firestore en producción
      localStorage.setItem('custom_permissions', JSON.stringify(permissions))
      logger.info('Permisos guardados', { permissions })
      alert('✅ Permisos guardados correctamente')
      setHasChanges(false)
    } catch (error) {
      logger.error('Error guardando permisos', error instanceof Error ? error : new Error(String(error)))
      alert('❌ Error al guardar permisos')
    } finally {
      setIsLoading(false)
    }
  }

  const groupedPermissions = ALL_PERMISSIONS.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = []
    acc[perm.category].push(perm)
    return acc
  }, {} as Record<Permission['category'], Permission[]>)

  const rolePerms = permissions[selectedRole] || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Gestión de Permisos</h2>
            <p className="text-sm text-muted-foreground">
              Configura qué puede hacer cada rol de usuario
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleResetToDefaults}>
            Restaurar por defecto
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isLoading}>
            {isLoading ? <Spinner size="sm" /> : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar cambios
              </>
            )}
          </Button>
        </div>
      </div>

      {hasChanges && (
        <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning rounded-lg">
          <AlertCircle className="h-4 w-4 text-warning" />
          <span className="text-sm">Hay cambios sin guardar</span>
        </div>
      )}

      {/* Selector de rol */}
      <div className="flex gap-2">
        {(['admin', 'supervisor', 'tecnico'] as UserRole[]).map(role => (
          <button
            key={role}
            onClick={() => setSelectedRole(role)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedRole === role
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {role === 'admin' && '👑 Admin'}
            {role === 'supervisor' && '👔 Supervisor'}
            {role === 'tecnico' && '🔧 Técnico'}
            <Badge variant="secondary" className="ml-2">
              {rolePerms.length}/{ALL_PERMISSIONS.length}
            </Badge>
          </button>
        ))}
      </div>

      {/* Lista de permisos por categoría */}
      <div className="space-y-4">
        {Object.entries(groupedPermissions).map(([category, perms]) => {
          const categoryConfig = CATEGORY_LABELS[category as Permission['category']]
          const categoryActiveCount = perms.filter(p => rolePerms.includes(p.key)).length
          
          return (
            <Card key={category}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <span>{categoryConfig.icon}</span>
                    {categoryConfig.label}
                  </CardTitle>
                  <Badge variant={categoryActiveCount === perms.length ? 'default' : 'secondary'}>
                    {categoryActiveCount}/{perms.length} activos
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {perms.map(perm => {
                    const isActive = rolePerms.includes(perm.key)
                    const isAdminOnly = perm.key === 'deleteIncident' || perm.key === 'deleteUser' || perm.key === 'manageRoles'
                    const isDisabled = selectedRole !== 'admin' && isAdminOnly

                    return (
                      <div
                        key={perm.key}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          isActive
                            ? 'bg-primary/10 border-primary'
                            : 'bg-muted/30 border-muted'
                        } ${isDisabled ? 'opacity-50' : 'cursor-pointer hover:border-primary/50'}`}
                        onClick={() => !isDisabled && handleTogglePermission(perm.key)}
                      >
                        <input
                          type="checkbox"
                          checked={isActive}
                          disabled={isDisabled}
                          readOnly
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{perm.label}</p>
                            {isAdminOnly && (
                              <Badge variant="destructive" className="text-xs">
                                Solo Admin
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{perm.description}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Wrench,
  MapPin,
  TrendingUp,
  Plus,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
} from '@/components/ui'
import { useAppStore, useAuthStore } from '@/store'
import { formatRelativeTime } from '@/lib/utils'

export function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const { incidents, equipment, zones } = useAppStore()

  // Estadísticas
  const stats = {
    incidentesActivos: incidents.filter((i) =>
      ['pendiente', 'confirmada', 'en_proceso'].includes(i.status)
    ).length,
    incidentesCriticos: incidents.filter(
      (i) => i.prioridad === 'critica' && i.status !== 'cerrada'
    ).length,
    equiposOperativos: equipment.filter((e) => e.estado === 'operativo').length,
    equiposTotal: equipment.length,
    zonasConIncidentes: new Set(
      incidents.filter((i) => i.status !== 'cerrada').map((i) => i.zoneId)
    ).size,
  }

  // Últimas incidencias
  const recentIncidents = incidents.slice(0, 5)

  // Incidencias críticas
  const criticalIncidents = incidents.filter(
    (i) => i.prioridad === 'critica' && i.status !== 'cerrada'
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Bienvenido, {user?.nombre || 'Usuario'}
          </h1>
          <p className="text-muted-foreground">
            Panel de control de mantenimiento industrial
          </p>
        </div>
        <Button onClick={() => navigate('/incidents')}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Incidencia
        </Button>
      </div>

      {/* Alertas críticas */}
      {criticalIncidents.length > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Alertas Críticas ({criticalIncidents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {criticalIncidents.slice(0, 3).map((incident) => (
                <div
                  key={incident.id}
                  className="flex items-center justify-between p-2 bg-card rounded cursor-pointer hover:bg-muted"
                  onClick={() => navigate('/incidents')}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="font-medium">{incident.titulo}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatRelativeTime(incident.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/incidents')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Incidencias Activas
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.incidentesActivos}</div>
            <p className="text-xs text-muted-foreground">
              {stats.incidentesCriticos > 0 && (
                <span className="text-destructive font-medium">
                  {stats.incidentesCriticos} críticas
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/equipment')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Equipos</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.equiposOperativos}/{stats.equiposTotal}
            </div>
            <p className="text-xs text-muted-foreground">operativos</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/map')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Zonas</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{zones.length}</div>
            <p className="text-xs text-muted-foreground">
              {stats.zonasConIncidentes} con incidencias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Tasa Resolución
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {incidents.length > 0
                ? Math.round(
                    (incidents.filter((i) => i.status === 'cerrada').length /
                      incidents.length) *
                      100
                  )
                : 0}
              %
            </div>
            <p className="text-xs text-muted-foreground">
              incidencias cerradas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Últimas incidencias */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Últimas Incidencias</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/incidents')}
              >
                Ver todas
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentIncidents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay incidencias recientes</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="flex items-center gap-4 cursor-pointer hover:bg-muted p-2 rounded -mx-2"
                    onClick={() => navigate('/incidents')}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        incident.prioridad === 'critica'
                          ? 'bg-destructive'
                          : incident.prioridad === 'alta'
                          ? 'bg-warning'
                          : 'bg-primary'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{incident.titulo}</p>
                      <p className="text-sm text-muted-foreground">
                        {incident.status === 'pendiente' && 'Pendiente'}
                        {incident.status === 'confirmada' && 'Confirmada'}
                        {incident.status === 'en_proceso' && 'En proceso'}
                        {incident.status === 'cerrada' && 'Cerrada'}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {formatRelativeTime(incident.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumen por zona */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Incidencias por Zona</span>
              <Button variant="ghost" size="sm" onClick={() => navigate('/map')}>
                Ver mapa
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {zones.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay zonas configuradas</p>
              </div>
            ) : (
              <div className="space-y-4">
                {zones.map((zone) => {
                  const zoneIncidents = incidents.filter(
                    (i) => i.zoneId === zone.id && i.status !== 'cerrada'
                  )
                  const criticalCount = zoneIncidents.filter(
                    (i) => i.prioridad === 'critica'
                  ).length

                  return (
                    <div
                      key={zone.id}
                      className="flex items-center gap-4 cursor-pointer hover:bg-muted p-2 rounded -mx-2"
                      onClick={() => navigate('/map')}
                    >
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: zone.color || '#2196f3' }}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{zone.nombre}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {criticalCount > 0 && (
                          <Badge variant="destructive">{criticalCount}</Badge>
                        )}
                        <Badge variant="outline">{zoneIncidents.length}</Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

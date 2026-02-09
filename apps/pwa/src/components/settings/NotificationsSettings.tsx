/**
 * Componente de configuración de notificaciones push
 * Permite activar/desactivar notificaciones y probar el sistema
 */

import { useState } from 'react'
import { Bell, BellOff, AlertCircle, CheckCircle, Loader2, Send } from 'lucide-react'
import { Card, CardContent, Button, Badge } from '@/components/ui'
import { useNotifications } from '@/hooks/useNotifications'
import { useIsAdmin } from '@/store'
import { sendTestNotification } from '@/services/test-notifications'
import { logger } from '@/lib/logger'

export function NotificationsSettings() {
  const {
    isEnabled,
    isLoading,
    canRequest,
    isDenied,
    requestPermission,
    revokePermission,
    showTestNotification,
  } = useNotifications()
  
  const isAdmin = useIsAdmin()
  const [isSendingTest, setIsSendingTest] = useState(false)

  const handleSendTestNotification = async () => {
    setIsSendingTest(true)
    try {
      const result = await sendTestNotification()
      logger.info('✅ Test notification sent:', result)
      
      // Construir mensaje detallado
      let mensaje = `✅ Notificación enviada por: ${result.emisario}\n\n`
      mensaje += `📤 Enviadas exitosamente: ${result.sent}\n`
      
      if (result.destinatarios && result.destinatarios.length > 0) {
        mensaje += `\n👥 Recibieron (${result.destinatarios.length}):\n`
        mensaje += result.destinatarios.map(d => `  • ${d}`).join('\n')
      }
      
      if (result.failed > 0) {
        mensaje += `\n\n❌ Fallidas: ${result.failed}\n`
        if (result.fallidos && result.fallidos.length > 0) {
          mensaje += result.fallidos.map(f => `  • ${f.nombre}: ${f.razon}`).join('\n')
        }
      }
      
      if (result.sinToken && result.sinToken.length > 0) {
        mensaje += `\n\n⚠️ Sin notificaciones activadas (${result.sinToken.length}):\n`
        mensaje += result.sinToken.map(u => `  • ${u}`).join('\n')
      }
      
      alert(mensaje)
    } catch (error) {
      logger.error('❌ Error sending test notification:', error instanceof Error ? error : new Error(String(error)))
      alert('❌ Error al enviar notificación de prueba. Verifica la consola para más detalles.')
    } finally {
      setIsSendingTest(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isEnabled ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <h3 className="font-medium">Notificaciones Push</h3>
              <p className="text-sm text-muted-foreground">
                Recibe alertas en tiempo real sobre incidencias
              </p>
            </div>
          </div>
          
          {/* Estado visual */}
          <Badge variant={isEnabled ? 'success' : isDenied ? 'destructive' : 'secondary'}>
            {isEnabled ? 'Activas' : isDenied ? 'Bloqueadas' : 'Inactivas'}
          </Badge>
        </div>

        {/* Información del estado */}
        <div className="space-y-2">
          {isEnabled && (
            <div className="flex items-start gap-2 p-3 bg-success/10 rounded-lg border border-success/20">
              <CheckCircle className="h-4 w-4 text-success mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-success">Notificaciones activadas</p>
                <p className="text-muted-foreground mt-1">
                  Recibirás alertas cuando:
                </p>
                <ul className="list-disc list-inside mt-1 text-muted-foreground">
                  <li>Te asignen una incidencia</li>
                  <li>Validen tu reporte</li>
                  <li>Cierren una incidencia</li>
                  <li>Haya mantenimiento pendiente</li>
                </ul>
              </div>
            </div>
          )}

          {isDenied && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Notificaciones bloqueadas</p>
                <p className="text-muted-foreground mt-1">
                  Has bloqueado las notificaciones en tu navegador. Para activarlas:
                </p>
                <ol className="list-decimal list-inside mt-1 text-muted-foreground">
                  <li>Haz clic en el candado 🔒 en la barra de direcciones</li>
                  <li>Busca "Notificaciones" en permisos</li>
                  <li>Cambia a "Permitir"</li>
                  <li>Recarga la página</li>
                </ol>
              </div>
            </div>
          )}

          {canRequest && (
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-sm text-muted-foreground">
                Las notificaciones te ayudan a estar al tanto de cambios importantes en tiempo real.
                Puedes desactivarlas en cualquier momento.
              </p>
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2 flex-wrap">
          {canRequest && (
            <Button
              onClick={requestPermission}
              disabled={isLoading}
              className="flex-1 min-w-[150px]"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Bell className="h-4 w-4 mr-2" />
              )}
              Activar notificaciones
            </Button>
          )}

          {isEnabled && (
            <>
              <Button
                variant="outline"
                onClick={showTestNotification}
                disabled={isLoading}
              >
                <Bell className="h-4 w-4 mr-2" />
                Probar local
              </Button>
              {isAdmin && (
                <Button
                  variant="default"
                  onClick={handleSendTestNotification}
                  disabled={isSendingTest}
                  className="gap-2"
                >
                  {isSendingTest ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar a todos (Admin)
                </Button>
              )}
              <Button
                variant="outline"
                onClick={revokePermission}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <BellOff className="h-4 w-4 mr-2" />
                )}
                Desactivar
              </Button>
            </>
          )}
        </div>

        {/* Nota sobre compatibilidad */}
        <p className="text-xs text-muted-foreground">
          💡 <strong>Nota:</strong> Las notificaciones push funcionan mejor en Chrome, Edge y Firefox.
          Safari en iOS requiere agregar la app a la pantalla de inicio primero.
        </p>
      </CardContent>
    </Card>
  )
}

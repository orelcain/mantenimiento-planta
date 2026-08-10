/**
 * Componente de configuración de notificaciones push
 * Permite activar/desactivar notificaciones y probar el sistema
 */

import { useState } from 'react'
import { Bell, BellOff, AlertCircle, CheckCircle, Lightbulb, Loader2, Lock, Send, Users } from 'lucide-react'
import { Card, CardContent, Button, Badge } from '@/components/ui'
import { useNotifications } from '@/hooks/useNotifications'
import { useIsAdmin } from '@/store'
import { sendTestNotification } from '@/services/test-notifications'
import { logger } from '@/lib/logger'
import { ProcessNotificationsPanel } from './ProcessNotificationsPanel'

type TestNotificationResult = Awaited<ReturnType<typeof sendTestNotification>>

/** Una sección del informe de prueba: título con ícono + la lista de nombres. */
function TestResultSection({
  icon: Icon,
  title,
  tone,
  items,
}: {
  icon: typeof Users
  title: string
  tone: 'ok' | 'warn' | 'crit'
  items: string[]
}) {
  if (items.length === 0) return null
  const toneCls = tone === 'ok' ? 'text-ink-ok' : tone === 'warn' ? 'text-ink-warn' : 'text-ink-crit'
  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-1.5 text-footnote font-semibold ${toneCls}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {title} ({items.length})
      </div>
      <ul className="ml-5 list-disc space-y-0.5 text-footnote text-muted-foreground">
        {items.map((n, i) => <li key={i}>{n}</li>)}
      </ul>
    </div>
  )
}

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
  const [testResult, setTestResult] = useState<TestNotificationResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const handleSendTestNotification = async () => {
    setIsSendingTest(true)
    setTestError(null)
    setTestResult(null)
    try {
      const result = await sendTestNotification()
      logger.info('✅ Test notification sent:', result)
      setTestResult(result)
    } catch (error) {
      logger.error('❌ Error sending test notification:', error instanceof Error ? error : new Error(String(error)))
      setTestError('No se pudo enviar la notificación de prueba. Revisa la consola para el detalle.')
    } finally {
      setIsSendingTest(false)
    }
  }

  return (
    <div className="space-y-4">
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
            <div className="flex items-start gap-2 p-3 bg-success/10 rounded-card border border-success/20">
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
            <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-card border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Notificaciones bloqueadas</p>
                <p className="text-muted-foreground mt-1">
                  Has bloqueado las notificaciones en tu navegador. Para activarlas:
                </p>
                <ol className="list-decimal list-inside mt-1 text-muted-foreground">
                  <li>
                    Haz clic en el candado{' '}
                    <Lock className="inline h-3 w-3 align-[-0.125em]" aria-label="candado" /> de la
                    barra de direcciones
                  </li>
                  <li>Busca "Notificaciones" en permisos</li>
                  <li>Cambia a "Permitir"</li>
                  <li>Recarga la página</li>
                </ol>
              </div>
            </div>
          )}

          {canRequest && (
            <div className="flex items-start gap-2 p-3 bg-muted rounded-card">
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

        {testError && (
          <div className="flex items-start gap-2 rounded-card bg-red-500/[0.15] p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-crit" />
            <p className="text-footnote text-ink-crit">{testError}</p>
          </div>
        )}

        {testResult && (
          <div className="space-y-3 rounded-card bg-muted p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 text-footnote font-semibold">
                <CheckCircle className="h-4 w-4 shrink-0 text-ink-ok" />
                Enviadas {testResult.sent} · por {testResult.emisario}
              </div>
              <button
                onClick={() => setTestResult(null)}
                className="shrink-0 text-footnote text-muted-foreground hover:text-foreground"
              >
                Cerrar
              </button>
            </div>
            <TestResultSection icon={Users} title="Recibieron" tone="ok" items={testResult.destinatarios ?? []} />
            <TestResultSection
              icon={AlertCircle}
              title="Fallidas"
              tone="crit"
              items={(testResult.fallidos ?? []).map(f => `${f.nombre}: ${f.razon}`)}
            />
            <TestResultSection
              icon={BellOff}
              title="Sin notificaciones activadas"
              tone="warn"
              items={testResult.sinToken ?? []}
            />
          </div>
        )}

        {/* Nota sobre compatibilidad */}
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Nota:</strong> Las notificaciones push funcionan mejor en Chrome, Edge y Firefox.
            Safari en iOS requiere agregar la app a la pantalla de inicio primero.
          </span>
        </p>
      </CardContent>
    </Card>

    {/* Preferencias por tipo de aviso */}
    <ProcessNotificationsPanel />
    </div>
  )
}

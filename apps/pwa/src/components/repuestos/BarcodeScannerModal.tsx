import { useEffect, useRef, useState, useCallback } from 'react'
import { ScanLine, X, Zap, Camera } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'

// Declaración de tipo para BarcodeDetector (API nativa del navegador)
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => {
      detect: (source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) => Promise<Array<{ rawValue: string; format: string }>>
    }
  }
}

interface BarcodeScannerModalProps {
  open: boolean
  onClose: () => void
  /** Se llama con el valor escaneado cuando se detecta un código */
  onScan: (value: string) => void
  /** Texto que aparece sobre el visor */
  hint?: string
}

export function BarcodeScannerModal({
  open,
  onClose,
  onScan,
  hint = 'Apunta la cámara al código de barras o QR',
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationRef = useRef<number>(0)
  const detectorRef = useRef<InstanceType<NonNullable<Window['BarcodeDetector']>> | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [detected, setDetected] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [supportsTorch, setSupportsTorch] = useState(false)
  const [useFallback, setUseFallback] = useState(false)

  // Inicializar BarcodeDetector si está disponible
  const initDetector = useCallback(() => {
    if (window.BarcodeDetector) {
      try {
        detectorRef.current = new window.BarcodeDetector({
          formats: [
            'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93',
            'qr_code', 'data_matrix', 'upc_a', 'upc_e', 'itf',
          ],
        })
        return true
      } catch {
        return false
      }
    }
    return false
  }, [])

  // Iniciar la cámara
  const startCamera = useCallback(async () => {
    setError(null)
    setDetected(null)
    setScanning(false)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // cámara trasera
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Verificar soporte de linterna (torch)
      const track = stream.getVideoTracks()[0]
      const capabilities = track?.getCapabilities?.() as any
      setSupportsTorch(!!capabilities?.torch)

      setScanning(true)
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Permiso de cámara denegado. Actívalo en la configuración del navegador.')
      } else if (err.name === 'NotFoundError') {
        setError('No se encontró cámara disponible en este dispositivo.')
      } else {
        setError('No se pudo acceder a la cámara: ' + (err.message || err.name))
      }
    }
  }, [])

  // Detener la cámara y liberar recursos
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animationRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setScanning(false)
    setTorchOn(false)
  }, [])

  // Loop de detección de códigos con BarcodeDetector
  const startDetectionLoop = useCallback(() => {
    if (!detectorRef.current || !videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const detect = async () => {
      if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        animationRef.current = requestAnimationFrame(detect)
        return
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      try {
        const results = await detectorRef.current!.detect(canvas)
        if (results.length > 0) {
          const value = results[0]!.rawValue
          setDetected(value)
          stopCamera()
          // Pequeña pausa para que el usuario vea el resultado antes de cerrar
          setTimeout(() => {
            onScan(value)
            onClose()
          }, 600)
          return
        }
      } catch {
        // ignorar errores de detección por frame
      }

      animationRef.current = requestAnimationFrame(detect)
    }

    animationRef.current = requestAnimationFrame(detect)
  }, [stopCamera, onScan, onClose])

  // Controlar linterna
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: !torchOn }] })
      setTorchOn((prev) => !prev)
    } catch {
      // el dispositivo no soporta linterna via API
    }
  }, [torchOn])

  // Fallback: escaneo mediante archivo de imagen capturado con la cámara
  const handleFallbackFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !detectorRef.current) return

      try {
        const bitmap = await createImageBitmap(file)
        const results = await detectorRef.current.detect(bitmap)
        if (results.length > 0) {
          const value = results[0]!.rawValue
          setDetected(value)
          setTimeout(() => {
            onScan(value)
            onClose()
          }, 600)
        } else {
          setError('No se detectó ningún código en la imagen. Intenta de nuevo.')
        }
      } catch {
        setError('Error al procesar la imagen.')
      }
    },
    [onScan, onClose]
  )

  // Efectos al abrir/cerrar el modal
  useEffect(() => {
    if (!open) {
      stopCamera()
      setError(null)
      setDetected(null)
      setUseFallback(false)
      return
    }

    const hasDetector = initDetector()

    if (!hasDetector) {
      // El navegador no soporta BarcodeDetector → modo fallback
      setUseFallback(true)
      return
    }

    startCamera()
  }, [open, initDetector, startCamera, stopCamera])

  // Iniciar loop de detección cuando la cámara esté activa
  useEffect(() => {
    if (scanning) {
      startDetectionLoop()
    }
    return () => cancelAnimationFrame(animationRef.current)
  }, [scanning, startDetectionLoop])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4" />
            Escanear código
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{hint}</p>

          {/* Modo fallback: navegador sin BarcodeDetector */}
          {useFallback && (
            <div className="space-y-3 text-center">
              <p className="text-xs text-muted-foreground">
                Tu navegador no soporta escaneo en tiempo real.
                Toma una foto del código y selecciónala.
              </p>
              <label className="flex flex-col items-center gap-2 cursor-pointer">
                <div className="flex items-center gap-2 rounded-ctl bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
                  <Camera className="h-4 w-4" />
                  Abrir cámara / seleccionar imagen
                </div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFallbackFile}
                />
              </label>
            </div>
          )}

          {/* Visor de cámara */}
          {!useFallback && (
            <div className="relative overflow-hidden rounded-card bg-black aspect-[4/3]">
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                playsInline
                muted
              />
              {/* Canvas oculto para detección */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Overlay: guía visual */}
              {scanning && !detected && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-40 w-40 rounded-card border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
                  <div className="absolute bottom-2 w-full text-center text-[10px] text-white/70">
                    Alineá el código dentro del recuadro
                  </div>
                </div>
              )}

              {/* Resultado detectado */}
              {detected && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="rounded-card bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow">
                    ✓ {detected}
                  </div>
                </div>
              )}

              {/* Botón linterna */}
              {supportsTorch && scanning && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className="absolute bottom-2 right-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                  title={torchOn ? 'Apagar linterna' : 'Encender linterna'}
                >
                  <Zap className={`h-4 w-4 ${torchOn ? 'text-yellow-400' : 'text-white'}`} />
                </button>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="rounded-ctl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="mr-1 h-4 w-4" />
              Cancelar
            </Button>
            {!useFallback && error && (
              <Button size="sm" onClick={startCamera}>
                Reintentar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

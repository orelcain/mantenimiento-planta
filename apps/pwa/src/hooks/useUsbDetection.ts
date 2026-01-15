/**
 * Hook para detección USB de dispositivos ESP32
 * Usa Web Serial API para detectar automáticamente dispositivos conectados por USB
 */

import { useState, useEffect, useCallback, useRef } from 'react'

interface SerialDevice {
  port: SerialPort
  deviceId: string
  productName?: string
  manufacturer?: string
}

export function useUsbDetection() {
  const [connectedDevices, setConnectedDevices] = useState<SerialDevice[]>([])
  const [isSupported, setIsSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const portsRef = useRef<Map<SerialPort, string>>(new Map())

  // Verificar si Web Serial API está soportada
  useEffect(() => {
    const supported = 'serial' in navigator && !!navigator.serial
    setIsSupported(supported)
    
    if (!supported) {
      setError('Tu navegador no soporta Web Serial API. Usa Chrome/Edge')
    }
  }, [])

  // Detectar dispositivos ya conectados
  const detectExistingDevices = useCallback(async () => {
    if (!navigator.serial) return

    try {
      const ports = await navigator.serial.getPorts()
      const devices: SerialDevice[] = []

      for (const port of ports) {
        const info = port.getInfo()
        const deviceId = await getDeviceIdFromPort(port)
        
        if (deviceId) {
          devices.push({
            port,
            deviceId,
            productName: info.usbProductId?.toString(),
            manufacturer: info.usbVendorId?.toString(),
          })
          portsRef.current.set(port, deviceId)
        }
      }

      setConnectedDevices(devices)
    } catch (err) {
      console.error('Error detectando dispositivos:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    }
  }, [])

  // Obtener MAC del ESP32 via Serial
  const getDeviceIdFromPort = useCallback(async (port: SerialPort): Promise<string | null> => {
    try {
      await port.open({ baudRate: 115200 })
      
      const textDecoder = new TextDecoderStream()
      const readableStreamClosed = port.readable?.pipeTo(textDecoder.writable)
      const reader = textDecoder.readable?.getReader()

      if (!reader) {
        await port.close()
        return null
      }

      // Buscar línea con "Device ID:" en los logs
      const timeout = setTimeout(async () => {
        reader.releaseLock()
        await readableStreamClosed?.catch(() => {})
        await port.close()
      }, 5000) // 5 segundos timeout

      let deviceId: string | null = null

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        // Buscar patrón "Device ID: XXXXXXXXXXXX" o similar
        const match = value.match(/Device ID:\s*([A-F0-9]{12})/i)
        if (match?.[1]) {
          deviceId = match[1]
          break
        }

        // También buscar formato "MAC: XX:XX:XX:XX:XX:XX"
        const macMatch = value.match(/MAC:\s*([A-F0-9:]{17})/i)
        if (macMatch?.[1]) {
          deviceId = macMatch[1].replace(/:/g, '')
          break
        }
      }

      clearTimeout(timeout)
      reader.releaseLock()
      await readableStreamClosed?.catch(() => {})
      await port.close()

      return deviceId
    } catch (err) {
      console.error('Error leyendo puerto serial:', err)
      try {
        await port.close()
      } catch {}
      return null
    }
  }, [])

  // Solicitar permiso y conectar nuevo dispositivo
  const requestDevice = useCallback(async () => {
    if (!navigator.serial) {
      setError('Web Serial API no soportada')
      return null
    }

    try {
      // Filtros para ESP32 (Espressif Systems VID: 0x10C4 o 0x1A86)
      const port = await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x10C4 }, // Silicon Labs CP210x
          { usbVendorId: 0x1A86 }, // QinHeng Electronics CH340
          { usbVendorId: 0x0403 }, // FTDI
        ]
      })

      const deviceId = await getDeviceIdFromPort(port)
      
      if (deviceId) {
        const info = port.getInfo()
        const newDevice: SerialDevice = {
          port,
          deviceId,
          productName: info.usbProductId?.toString(),
          manufacturer: info.usbVendorId?.toString(),
        }

        setConnectedDevices(prev => {
          // Evitar duplicados
          if (prev.some(d => d.deviceId === deviceId)) {
            return prev
          }
          return [...prev, newDevice]
        })

        portsRef.current.set(port, deviceId)
        return deviceId
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NotFoundError') {
        // Usuario canceló - no es error
        return null
      }
      console.error('Error solicitando dispositivo:', err)
      setError(err instanceof Error ? err.message : 'Error al conectar dispositivo')
    }

    return null
  }, [getDeviceIdFromPort])

  // Listener para desconexiones
  useEffect(() => {
    if (!navigator.serial) return

    const handleDisconnect = () => {
      detectExistingDevices()
    }

    navigator.serial.addEventListener('disconnect', handleDisconnect)

    return () => {
      navigator.serial?.removeEventListener('disconnect', handleDisconnect)
    }
  }, [detectExistingDevices])

  // Detectar dispositivos al montar
  useEffect(() => {
    detectExistingDevices()
  }, [detectExistingDevices])

  return {
    connectedDevices,
    isSupported,
    error,
    requestDevice,
    detectExistingDevices,
  }
}

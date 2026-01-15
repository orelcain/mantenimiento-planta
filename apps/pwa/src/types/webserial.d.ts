/**
 * Declaraciones de tipos para Web Serial API
 * https://wicg.github.io/serial/
 */

interface SerialPort {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream | null
  writable: WritableStream | null
  getInfo(): SerialPortInfo
}

interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialPortRequestOptions {
  filters?: SerialPortFilter[]
}

interface SerialPortFilter {
  usbVendorId?: number
  usbProductId?: number
}

interface Serial extends EventTarget {
  getPorts(): Promise<SerialPort[]>
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>
  addEventListener(
    type: 'connect' | 'disconnect',
    listener: (this: this, ev: Event) => void
  ): void
  removeEventListener(
    type: 'connect' | 'disconnect',
    listener: (this: this, ev: Event) => void
  ): void
}

interface Navigator {
  serial?: Serial
}

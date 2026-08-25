/**
 * Las 2 ETT que hay en la base están guardadas con el esquema v2.44
 * (`general`, `trabajo_descripcion`, `materiales`, `procedimientos`, `riesgos`).
 * El lector nuevo busca `cabecera` y `descripcion_trabajos`: no encontraba nada
 * y devolvía una ficha en blanco fechada HOY, con todo el contenido escondido.
 */
import { describe, it, expect } from 'vitest'
import { ettFromFirestore } from '../ett'

/** Recorte fiel de una de las dos ETT reales. */
const DOC_VIEJO = {
  general: {
    titulo: 'Cambio y estandarización de collarines',
    codigo: 'ETT-2025-002',
    fecha: { _seconds: 1748822400, _nanoseconds: 0 },
    solicitante: 'Dpto. Mantención Chonchi',
    area: 'Planta de Procesos / Centro AI04',
  },
  trabajo_descripcion: 'ESPECIFICACIÓN DEL SERVICIO:\n\nÁrea de intervención:\nEntretecho de planta principal.',
  materiales: [
    { nombre: 'Collarín 90mm salida 32mm', cantidad: 45, unidad: 'unidades', especificaciones: 'PVC hidráulico' },
  ],
  procedimientos: [
    { numero: 1, titulo: 'Preparación', descripcion: 'Revisar planos', tiempo_estimado: '4 horas', precauciones: 'Coordinar con producción' },
  ],
  riesgos: [
    { peligro: 'Caída de altura', probabilidad: 'media', consecuencia: 'grave', medidas_preventivas: 'Arnés', equipos_seguridad: 'Arnés + casco' },
  ],
  estado: 'borrador',
  createdBy: 'seed-script',
}

describe('ETT guardadas con el esquema viejo', () => {
  const ett = ettFromFirestore('abc', DOC_VIEJO as unknown as Record<string, unknown>)

  it('rescata la cabecera en vez de dejarla en blanco', () => {
    expect(ett.cabecera.proyecto).toBe('Cambio y estandarización de collarines (ETT-2025-002)')
    expect(ett.cabecera.usuario_solicitante).toBe('Dpto. Mantención Chonchi')
    expect(ett.cabecera.sector_realizacion).toBe('Planta de Procesos / Centro AI04')
  })

  it('usa la fecha del documento, no la de hoy', () => {
    expect(ett.cabecera.fecha_requerimiento.toISOString().slice(0, 10)).toBe('2025-06-02')
  })

  it('trae los materiales, los procedimientos y los riesgos como bloques', () => {
    const tipos = ett.descripcion_trabajos.map((b) => b.tipo)
    expect(tipos).toEqual(['parrafo', 'parrafo', 'subtitulo', 'tabla', 'subtitulo', 'lista', 'subtitulo', 'tabla'])
    const tablas = ett.descripcion_trabajos.filter((b) => b.tipo === 'tabla')
    expect(tablas[0]).toMatchObject({ columnas: ['Material', 'Cantidad', 'Unidad', 'Especificaciones'] })
    expect(tablas[0]!.filas[0]!.celdas[0]).toBe('Collarín 90mm salida 32mm')
    expect(tablas[1]!.filas[0]!.celdas[4]).toBe('Arnés + casco')
  })

  it('no toca las ETT del esquema nuevo', () => {
    const nueva = ettFromFirestore('x', {
      cabecera: { proyecto: 'Obra nueva', usuario_solicitante: 'X', sector_realizacion: 'Y' },
      descripcion_trabajos: [{ tipo: 'parrafo', texto: 'hola' }],
    } as unknown as Record<string, unknown>)
    expect(nueva.cabecera.proyecto).toBe('Obra nueva')
    expect(nueva.descripcion_trabajos).toHaveLength(1)
  })
})

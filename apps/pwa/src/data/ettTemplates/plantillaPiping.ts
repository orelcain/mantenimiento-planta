/**
 * Plantilla "Trabajos de piping / collarines"
 *
 * Basada en el ETT real de AquaChile:
 *   "Cambio y estandarización de collarines, piping y mejoras en
 *    líneas de agua – Planta Principal"
 *
 * Caso de uso: cambio, instalación o mejoras en líneas de tuberías,
 * collarines, válvulas, piping en general (PVC hidráulico, inox, etc).
 *
 * Los valores con `[corchetes]` son slots a completar por el usuario o la IA.
 */

import type { ETTPlantilla } from '@/types'

export const plantillaPiping: ETTPlantilla = {
  id: 'piping',
  nombre: 'Trabajos de piping / collarines',
  descripcion: 'Tuberías, collarines, válvulas y líneas de agua',
  icono: 'Droplet',

  defaults: {
    cabecera: {
      fecha_requerimiento: new Date(),
      proyecto: '[Nombre del proyecto]',
      usuario_solicitante: 'Dpto. Mantención Chonchi',
      sector_realizacion:
        'Planta de Procesos / Centro AI04 / Dirección Camino A Huicha S/N',
      garantia_texto: '06 (meses) Garantía Temporada Alta',
    },

    area_intervencion:
      '[Descripción del área, ej: Entretecho de planta principal] (ver imágenes adjuntas). Líneas de tuberías [material, ej: PVC hidráulico], con diámetros [diámetros, ej: 90mm y 75mm].',

    descripcion_trabajos: [
      {
        tipo: 'subtitulo',
        texto: 'Descripción de los trabajos solicitados:',
      },
      {
        tipo: 'lista',
        estilo: 'numerada',
        items: [
          {
            texto:
              '[Acción principal, ej: Cambio de collarines existentes por nuevos collarines estandarizados]:',
            subitems: [
              { texto: '[? unidades] [descripción del item 1]' },
              { texto: '[? unidades] [descripción del item 2]' },
            ],
          },
          {
            texto:
              '[Acción secundaria, ej: Instalación de piping completo asociado]:',
            subitems: [
              { texto: '[Componente 1]' },
              { texto: '[Componente 2]' },
              { texto: '[Componente 3]' },
              { texto: '[Componente 4]' },
            ],
          },
          {
            texto:
              '[Mejora adicional, ej: Mejoras solicitadas en líneas troncales]:',
            subitems: [
              { texto: '[Mejora 1]' },
              { texto: '[Mejora 2]' },
            ],
          },
        ],
      },
    ],

    responsabilidades_contratista: [
      'Retiro de [elementos actuales] y piping antiguo evitando dañar estructuras.',
      'Instalación de nuevos elementos cumpliendo nivelación, fijación y sellado.',
      'Revisión de estanqueidad en todas las conexiones.',
      'Entrega de documentación final esquemática de intervenciones y nuevas conexiones instaladas, modificaciones y mejoras realizadas.',
      'Limpieza del área intervenida y retiro de residuos.',
      'Cumplir normativa sanitaria y de inocuidad vigente.',
    ],

    imagenes: [],
  },
}

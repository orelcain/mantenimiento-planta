/**
 * Plantilla "En blanco"
 *
 * Estructura mínima para casos donde el usuario quiere partir de cero.
 * Solo incluye la cabecera con valores sensatos por defecto y una sección
 * de descripción con un único párrafo vacío listo para editar.
 *
 * El usuario luego puede agregar bloques (párrafos, listas, tablas) desde
 * la toolbar del editor WYSIWYG.
 */

import type { ETTPlantilla } from '@/types'

export const plantillaVacia: ETTPlantilla = {
  id: 'vacia',
  nombre: 'En blanco',
  descripcion: 'Partir desde cero — caso atípico',
  icono: 'FileText',

  defaults: {
    cabecera: {
      fecha_requerimiento: new Date(),
      proyecto: '',
      usuario_solicitante: 'Dpto. Mantención Chonchi',
      sector_realizacion:
        'Planta de Procesos / Centro AI04 / Dirección Camino A Huicha S/N',
      garantia_texto: '06 (meses) Garantía Temporada Alta',
    },

    area_intervencion: '',

    descripcion_trabajos: [
      {
        tipo: 'parrafo',
        texto: '',
      },
    ],

    responsabilidades_contratista: [],

    imagenes: [],
  },
}

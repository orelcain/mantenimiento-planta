/**
 * Plantilla "Cambio de material estructural" (Paneles)
 *
 * Basada en el ETT real de AquaChile:
 *   "Reubicación tablero control - Paneles R.E. (PIR) Cielo Baader/Grader"
 *
 * Caso de uso: cambio, desmontaje o reinstalación de elementos estructurales
 * del cielo/techo de planta (paneles, placas, aislantes, cubiertas).
 *
 * Los valores con `[corchetes]` son slots a completar por el usuario o la IA.
 */

import type { ETTPlantilla } from '@/types'

export const plantillaPaneles: ETTPlantilla = {
  id: 'paneles',
  nombre: 'Cambio de material estructural',
  descripcion: 'Paneles, placas o cubiertas de cielo/techo',
  icono: 'Layers',

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
      'Corresponde al sector de [indicar área específica] indicado en las imágenes adjuntas, marcado con color amarillo. La superficie a intervenir corresponde a [describir cobertura y líneas afectadas].',

    descripcion_trabajos: [
      {
        tipo: 'subtitulo',
        texto: '[Tipo de material] - [Ubicación específica]:',
      },
      {
        tipo: 'tabla',
        columnas: ['Largo', 'Ancho', 'Espesor', 'Cantidad'],
        filas: [{ celdas: ['[? M]', '[? M]', '[? mm]', '[?]'] }],
      },
      {
        tipo: 'parrafo',
        texto:
          'No se incluyen elementos de montaje, por lo tanto, el contratista deberá proporcionar:',
      },
      {
        tipo: 'lista',
        estilo: 'bullets',
        items: [
          { texto: 'Cadenas de suspensión' },
          { texto: 'Tensores' },
          { texto: '"Gorros chinos" M10' },
          {
            texto:
              'Ángulo metálico de soporte u otra estructura necesaria para el montaje seguro',
          },
        ],
      },
    ],

    responsabilidades_contratista: [
      'Desmontar los [elementos existentes] con cuidado, evitando dañar equipos eléctricos, redes de tuberías o estructuras adyacentes.',
      'Instalar los nuevos [elementos] asegurando alineación, nivel y correcta fijación estructural.',
      'Garantizar condiciones de seguridad industrial y orden en el lugar durante y después de la faena.',
      'Retiro de escombros y [elementos antiguos] del lugar de trabajo.',
    ],

    imagenes: [],
  },
}

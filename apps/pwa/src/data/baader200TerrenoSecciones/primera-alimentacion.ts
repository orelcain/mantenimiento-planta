import { FUENTES, PLANTA, V4, type SeccionTerreno } from '../baader200TerrenoTipos'

// Sección 1 · Primera alimentación. Fuentes: V4 §1 (pág. 2) + planta pág. 3.
// Posiciones = dibujo 1 del V4 (el dibujo de planta usa la misma numeración 1 a 6).
export const seccion: SeccionTerreno = {
  id: 'primera-alimentacion',
  orden: 1,
  titulo: 'Primera alimentación',
  zona: 'Alimentación',
  medidaPrincipal: {
    clave: 'chapaletas',
    nombre: 'Distancia entre las chapaletas alimentadoras',
    unidad: 'mm',
    porEspecie: [
      { especie: 'salmon', etiqueta: 'Todas las especies', valor: '32' },
    ],
    valorPlanta: { valor: '32-28 o menos, sin rozar la silleta', fuente: PLANTA(3) },
    pos: ['1', '2'],
    ajusteCon: 'tornillo de tope (pos. 3)',
    fuente: V4(2),
  },
  medidas: [
    { clave: 'cotas-planta', nombre: 'Cotas del dibujo de planta (arriba y abajo de las chapaletas)', valores: ['32', '28'], unidad: 'mm', pos: ['1', '2'], fuente: PLANTA(3) },
  ],
  pasos: [
    { texto: 'Ajustar 32 mm entre la chapaleta derecha (pos. 1) y la izquierda (pos. 2) con el tornillo de tope (pos. 3).', pos: ['1', '2', '3'], medida: 'chapaletas', fuente: V4(2) },
    { texto: 'Controlar la simetría con la silleta (pos. 4). Si no está centrada, corregir con los segmentos dentados (pos. 5).', pos: ['4', '5'], fuente: V4(2) },
    { texto: 'Ajustar la presión de las chapaletas sobre el pescado con la tuerca hexagonal (pos. 6).', pos: ['6'], fuente: V4(2) },
    { texto: 'Método de planta: cerrar las chapaletas por lo general a menos de 32 mm, solo hasta que no rocen la silleta, con el perno de tope, y centrarlas con los segmentos (pos. 5).', pos: ['3', '5'], medida: 'cotas-planta', fuente: PLANTA(3) },
    { texto: 'Método de planta: si la materia prima se trabaja bajo 0 °C, dar más presión al resorte con la tuerca (pos. 6).', pos: ['6'], fuente: PLANTA(3) },
  ],
  advertencias: [
    { texto: 'Las chapaletas no deben rozar la silleta.', pos: ['1', '2', '4'], tipo: 'atencion', fuente: PLANTA(3) },
  ],
  dibujos: [
    { id: 'v4-dib1', url: FUENTES.v4.urlPagina(2), titulo: 'Dibujo 1 · chapaletas (pos. 1·2), tope (pos. 3), silleta (pos. 4), segmentos (pos. 5) y tuerca (pos. 6)', recorte: { x: 19, y: 31, w: 62, h: 59 }, hotspots: [{ pos: '5', x: 36.2, y: 3.7 }, { pos: '6', x: 73.0, y: 6.1 }, { pos: '3', x: 95.3, y: 5.8 }, { pos: '4', x: 33.8, y: 51.0 }, { pos: '1', x: 56.3, y: 64.6 }, { pos: '2', x: 8.0, y: 71.1 }], fuente: V4(2) },
    { id: 'planta-p3', url: FUENTES.planta.urlPagina(3), titulo: 'Esquema de planta · cotas 32 y 28 mm', recorte: { x: 4, y: 17, w: 48, h: 71 }, hotspots: [{ pos: '5', x: 35.7, y: 6.4 }, { pos: '6', x: 82.3, y: 12.2 }, { pos: '3', x: 89.9, y: 23.6 }, { pos: '4', x: 61.7, y: 73.6 }, { pos: '2', x: 8.8, y: 77.1 }, { pos: '1', x: 57.2, y: 80.8 }], fuente: PLANTA(3) },
  ],
  leyenda: [
    { pos: ['1'], nombre: 'Chapaleta alimentadora derecha (guía)', codigoBaader: ['633247'], confianza: 'media', revisar: 'En la variante de la fig. 101-3 el código cambia a 2005102005.' },
    { pos: ['1'], nombre: 'Palanca de la chapaleta derecha', codigoBaader: ['513897'], confianza: 'media' },
    { pos: ['2'], nombre: 'Chapaleta alimentadora izquierda (guía)', codigoBaader: ['633267'], confianza: 'media', revisar: 'En la variante de la fig. 101-3 el código cambia a 2005102004.' },
    { pos: ['2'], nombre: 'Palanca de la chapaleta izquierda', codigoBaader: ['513867'], confianza: 'media' },
    { pos: ['3'], nombre: 'Tornillo de tope (tornillo de amortiguador)', codigoBaader: ['1891910001'], sap: ['3300012375'], confianza: 'media' },
    { pos: ['3'], nombre: 'Bloque del tornillo de tope', codigoBaader: ['513727'], sap: ['3300080954'], confianza: 'media' },
    { pos: ['4'], nombre: 'Silleta', codigoBaader: [], confianza: 'media', revisar: 'El catálogo no numera la silleta completa. Candidato de baja confianza: patín 511057.' },
    { pos: ['5'], nombre: 'Segmento dentado', codigoBaader: ['401107'], sap: ['3300061895'], confianza: 'alta' },
    { pos: ['6'], nombre: 'Tuerca hexagonal M8 (presión del resorte)', codigoBaader: ['30831008'], sap: ['3300089044'], confianza: 'media', tornilleria: true },
    { pos: [], nombre: 'Resorte de presión de las chapaletas', codigoBaader: ['38010012'], confianza: 'media' },
  ],
  diagnostico: [
    {
      falla: 'Detalles o cortes en los filetes',
      seccionApp: 'ts-cortes-filetes',
      chequeos: [
        { texto: 'Primera y segunda alimentación (segmentos dentados) respecto al dorsal' },
        { texto: 'Alineamiento del 1.er y 2.º levantador respecto a la silleta' },
        { texto: 'Filo de los cuchillos dorsales' },
        { texto: 'Aberturas de las guías frontales' },
      ],
      fuente: PLANTA(22),
    },
    {
      falla: 'Entrada del pescado demasiado rápida',
      chequeos: [
        { texto: 'Filo de los cuchillos ventrales y dorsales' },
        { texto: 'Regulación de las guías frontales' },
        { texto: 'Accionamientos del mando dorsal' },
      ],
      fuente: PLANTA(33),
    },
  ],
  didactico: {
    notaAuditoria: 'El V4 fija 32 mm entre chapaletas. El manual de planta cita «32-28 mm» del catálogo original y dice que en la planta por lo general se deja menos, con el único límite de no rozar la silleta. En el dibujo de planta, 32 mm es la cota de arriba y 28 mm la de abajo; la cota de 100 mm junto al resorte no se explica en el texto. Confirmar cuál medida rige hoy en la máquina.',
  },
}

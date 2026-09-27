import { FUENTES, PLANTA, V4, type SeccionTerreno } from '../baader200TerrenoTipos'

// Sección 3 · Levantadores de aletas (1.º y 2.º). Fuentes: V4 §3 (pág. 8) + planta pág. 5.
// Posiciones = dibujo 10 del V4 (el dibujo de planta usa 1-4 igual; 6 = biela de mando solo en planta).
export const seccion: SeccionTerreno = {
  id: 'levantadores-aletas',
  orden: 3,
  titulo: 'Levantadores de aletas (1.º y 2.º)',
  zona: 'Alimentación',
  medidaPrincipal: {
    clave: 'primer-levantador',
    nombre: 'Altura del 1.er levantador de aletas',
    unidad: 'mm',
    porEspecie: [
      { especie: 'salmon', etiqueta: 'Todas las especies', valor: '49' },
    ],
    valorPlanta: { valor: '30', fuente: PLANTA(5) },
    pos: ['1'],
    ajusteCon: 'tornillo de ajuste (pos. 2)',
    fuente: V4(8),
  },
  medidas: [
    { clave: 'segundo-levantador', nombre: 'Altura del 2.º levantador de aletas', valores: ['50'], unidad: 'mm', pos: ['3'], con: 'tornillo de ajuste pos. 4', fuente: V4(8) },
    { clave: 'segundo-contradiente', nombre: 'Parte inferior delantera del 2.º levantador al contradiente de la silleta', valores: ['5'], unidad: 'mm', pos: ['3'], con: 'biela de mando (dibujo de planta, pos. 6)', fuente: PLANTA(5) },
  ],
  pasos: [
    { texto: 'Soltar el tornillo (pos. 5). Ajustar el 1.er levantador (pos. 1) a 49 mm con el tornillo de ajuste (pos. 2) y volver a apretar el tornillo (pos. 5).', pos: ['5', '1', '2'], medida: 'primer-levantador', fuente: V4(8) },
    { texto: 'Ajustar el 2.º levantador (pos. 3) a 50 mm con el tornillo de ajuste (pos. 4).', pos: ['3', '4'], medida: 'segundo-levantador', fuente: V4(8) },
    { texto: 'Método de planta: ajustar primero con los pernos de tope (pos. 2·4) a 30 mm el 1.º y 50 mm el 2.º.', pos: ['2', '4'], fuente: PLANTA(5) },
    { texto: 'Método de planta: si el 1.er levantador queda muy alto, regularlo con los pernos M8 de la parte superior (pos. 1) para que no roce las chapaletas de la primera alimentación.', pos: ['1'], fuente: PLANTA(5) },
    { texto: 'Método de planta: dejar la parte inferior delantera del 2.º levantador a 5 mm del contradiente al paso de la silleta. Si no se cumple, corregir con la biela de mando (dibujo de planta, pos. 6) con el contradiente justo debajo.', pos: ['3'], medida: 'segundo-contradiente', fuente: PLANTA(5) },
  ],
  advertencias: [
    { texto: 'El 1.er levantador no debe rozar las chapaletas de la primera alimentación.', pos: ['1'], tipo: 'atencion', fuente: PLANTA(5) },
    { texto: 'En la planta el 2.º levantador se baja más de lo normal porque trabaja sin chapas guía de aleta; está anotado como tema de mejora.', pos: ['3'], tipo: 'atencion', fuente: PLANTA(5) },
  ],
  dibujos: [
    { id: 'v4-dib10', url: FUENTES.v4.urlPagina(8), titulo: 'Dibujo 10 · levantadores (pos. 1·3), tornillos de ajuste (pos. 2·4) y tornillo pos. 5; cotas 49 y 50 mm', recorte: { x: 17, y: 34, w: 68, h: 56 }, hotspots: [], fuente: V4(8) },
    { id: 'planta-p5', url: FUENTES.planta.urlPagina(5), titulo: 'Esquema de planta · levantadores con cotas 49 y 50 mm y biela pos. 6', recorte: { x: 5, y: 22, w: 44, h: 68 }, hotspots: [], fuente: PLANTA(5) },
  ],
  leyenda: [
    { pos: ['1'], nombre: '1.er levantador de aletas (herramienta derecha e izquierda)', codigoBaader: ['518377', '518397'], confianza: 'media', revisar: 'Conjunto 634327 «1. Flossenrichter».' },
    { pos: ['1'], nombre: 'Chapa guía de aleta del 1.er levantador (derecha e izquierda)', codigoBaader: ['518477', '518487'], confianza: 'media' },
    { pos: ['2', '4'], nombre: 'Tornillo de ajuste (tornillo de amortiguador)', codigoBaader: ['1891910001'], sap: ['3300012375'], confianza: 'alta', tornilleria: true },
    { pos: ['3'], nombre: '2.º levantador de aletas (herramienta izquierda y derecha)', codigoBaader: ['527787', '527807'], confianza: 'media', revisar: 'Conjunto 2001101000.' },
    { pos: ['3'], nombre: 'Chapa guía de aleta del 2.º levantador (izquierda y derecha)', codigoBaader: ['2001101001', '2001101002'], confianza: 'media', revisar: 'El manual de planta dice que en la planta el 2.º levantador trabaja sin chapas guía de aleta: confirmar si están montadas.' },
    { pos: ['5'], nombre: 'Tornillo de fijación', codigoBaader: [], confianza: 'media', revisar: 'No figura en el cruce V4-catálogo.', tornilleria: true },
    { pos: [], nombre: 'Brazo (palanca) del levantador', codigoBaader: ['515467'], sap: ['3300015735'], confianza: 'alta' },
    { pos: [], nombre: 'Eje del brazo', codigoBaader: ['515987', '515997'], sap: ['3300063797', '3300063798'], confianza: 'alta' },
  ],
  diagnostico: [
    {
      falla: 'Detalles o cortes en los filetes',
      seccionApp: 'ts-cortes-filetes',
      chequeos: [
        { texto: 'Alineamiento del 1.er y 2.º levantador respecto a la silleta' },
        { texto: 'Primera y segunda alimentación (segmentos dentados) respecto al dorsal' },
      ],
      fuente: PLANTA(22),
    },
  ],
  didactico: {
    notaAuditoria: '1.er levantador: el texto de planta dice 30 mm y el V4 dice 49 mm. El propio dibujo de planta (pág. 5) trae las cotas 49 y 50 mm, igual que el V4, así que los 30 mm pueden ser un ajuste local o una errata. Hay que confirmar en la máquina cuál rige. El 2.º levantador coincide en 50 mm. En el V4 el texto pide «volver a fijar el tornillo (dib. 10, pos. 7)», pero el dibujo 10 no tiene pos. 7: el tornillo que se suelta es la pos. 5.',
  },
}

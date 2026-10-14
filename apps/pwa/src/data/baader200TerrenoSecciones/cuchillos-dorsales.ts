import { FUENTES, PLANTA, V4, SALMON_INCLUYE, BLANCO_INCLUYE, type SeccionTerreno } from '../baader200TerrenoTipos'

// Sección 6 · Cuchillos dorsales. Fuentes: V4 §5 (págs. 13-15) + planta págs. 9 y 11 (tabla «b»).
// Posiciones = dibujo 17 del V4 (el dibujo de planta pág. 9 usa la misma numeración 1 a 7).
export const seccion: SeccionTerreno = {
  id: 'cuchillos-dorsales',
  orden: 6,
  titulo: 'Cuchillos dorsales',
  zona: 'Corte ventral y dorsal',
  medidaPrincipal: {
    clave: 'b',
    nombre: 'Abertura entre cuchillos dorsales «b» (parte inferior)',
    unidad: 'mm',
    porEspecie: [
      { especie: 'salmon', etiqueta: 'Salmón', valor: '5', incluye: SALMON_INCLUYE },
      { especie: 'trucha', etiqueta: 'Trucha', valor: '4' },
      { especie: 'blanco', etiqueta: 'Pescado blanco', valor: '7', incluye: BLANCO_INCLUYE },
    ],
    valorPlanta: { valor: '4,5', fuente: PLANTA(11) },
    pos: ['3'],
    ajusteCon: 'bujes apretadores, con los contrasoportes (pos. 2) puestos',
    fuente: V4(13),
  },
  medidas: [
    { clave: 'b-planta', nombre: 'Tabla «b» del manual de planta (salmón, trucha, pescado blanco)', valores: ['4,5', '4', '7'], unidad: 'mm', pos: ['3'], fuente: PLANTA(11) },
    { clave: 'cotas-dib19', nombre: 'Cotas del dibujo 19, zona del buje apretador y contrasoporte (el texto no las explica)', valores: ['22', '2', '0,5'], unidad: 'mm', pos: ['2', '3'], fuente: V4(14) },
  ],
  pasos: [
    { texto: 'Con los contrasoportes puestos (pos. 2), ajustar la abertura «b» entre las dorsales (pos. 1), medida abajo, con los bujes apretadores (pos. 3).', pos: ['2', '1', '3'], medida: 'b', fuente: V4(13) },
    { texto: 'Método de planta: con la máquina en posición de reposo, colocar la cruz patrón entre los cuchillos ventrales para que ventrales y dorsales queden exactamente alineados, y ajustar «b» con los cubos sujetadores (pos. 3).', pos: ['3'], medida: 'b-planta', fuente: PLANTA(9) },
    { texto: 'Dejar los filos de las dorsales exactamente encima de los filos de las ventrales. La distancia vertical «c» se ajusta con los tornillos (pos. 4·5); ver «Medidas de cuchillos».', pos: ['4', '5'], fuente: V4(15) },
  ],
  advertencias: [
    { texto: 'Al montar dorsales nuevos, rehacer el ajuste con las guías frontales y, si hace falta, con la guía superior.', tipo: 'atencion', fuente: PLANTA(36) },
  ],
  dibujos: [
    { id: 'v4-dib17', url: FUENTES.v4.urlPagina(13), titulo: 'Dibujo 17 · dorsales (pos. 1), contrasoportes (pos. 2), bujes (pos. 3), tornillos (pos. 4·5) y cojinetes (pos. 6·7)', recorte: { x: 12, y: 24, w: 80, h: 37 }, hotspots: [{ pos: '2', x: 3.3, y: 52.5 }, { pos: '3', x: 6.6, y: 57.4 }, { pos: '4', x: 33.2, y: 55.5 }, { pos: '6', x: 37.3, y: 53.2 }, { pos: '1', x: 46.8, y: 59.0 }, { pos: '7', x: 56.0, y: 53.5 }, { pos: '5', x: 62.7, y: 56.0 }, { pos: '3', x: 87.3, y: 55.2 }, { pos: '2', x: 91.2, y: 51.0 }], fuente: V4(13) },
    { id: 'v4-dib18-19', url: FUENTES.v4.urlPagina(14), titulo: 'Dibujos 18 y 19 · medida «b» y cotas 22, 2 y 0,5 mm', recorte: { x: 21, y: 8, w: 58, h: 82 }, hotspots: [{ pos: '1', x: 57.3, y: 28.6 }], fuente: V4(14) },
    { id: 'planta-p9', url: FUENTES.planta.urlPagina(9), titulo: 'Esquema de planta · medida «b» y posiciones 1 a 7', recorte: { x: 22, y: 20, w: 56, h: 25 }, hotspots: [{ pos: '1', x: 43.5, y: 28.0 }, { pos: '6', x: 27.8, y: 41.0 }, { pos: '7', x: 57.0, y: 42.8 }, { pos: '2', x: 88.8, y: 44.8 }, { pos: '3', x: 76.0, y: 86.4 }, { pos: '4', x: 20.0, y: 92.9 }, { pos: '5', x: 61.8, y: 90.0 }], fuente: PLANTA(9) },
  ],
  leyenda: [
    { pos: ['1'], nombre: 'Cuchilla circular 200 mm (ventral y dorsal)', codigoBaader: ['94011760'], sap: ['3300106403'], confianza: 'alta' },
    { pos: ['2'], nombre: 'Contrasoporte', codigoBaader: ['636977', '636997'], confianza: 'media' },
    { pos: ['3'], nombre: 'Buje apretador (cubo de sujeción)', codigoBaader: ['1890310006'], sap: ['3300054470'], confianza: 'alta', revisar: 'En el maestro SAP la ficha dice «EJE 1420202001». Confirmar antes de pedir.' },
    { pos: ['4', '5'], nombre: 'Tornillo hexagonal de apoyo de los cojinetes', codigoBaader: ['30811040'], confianza: 'media', tornilleria: true },
    { pos: ['6'], nombre: 'Cuerpo de cojinete izquierdo', codigoBaader: ['513787'], confianza: 'alta' },
    { pos: ['7'], nombre: 'Cuerpo de cojinete derecho', codigoBaader: ['513817'], confianza: 'alta' },
    { pos: [], nombre: 'Eje de cuchilla dorsal izquierda', codigoBaader: ['1870520008'], sap: ['3300012151'], confianza: 'alta' },
    { pos: [], nombre: 'Eje de cuchilla dorsal derecha', codigoBaader: ['519317'], confianza: 'alta' },
  ],
  diagnostico: [
    {
      falla: 'Detalles o cortes en los filetes',
      seccionApp: 'ts-cortes-filetes',
      chequeos: [
        { texto: 'Filo de los cuchillos dorsales y sus resortes complementarios (1.º y 2.º)' },
        { texto: 'Primera y segunda alimentación (segmentos dentados) respecto al dorsal' },
      ],
      fuente: PLANTA(22),
    },
    {
      falla: 'Gaping en la zona de la cola, bajo el esquelón / aleta anal',
      seccionApp: 'ts-gay-ping-cola',
      chequeos: [
        { texto: 'Separación entre cuchillos ventrales y dorsales, máximo', valor: '12', unidad: 'mm' },
      ],
      fuente: PLANTA(30),
    },
    {
      falla: 'Entrada del pescado demasiado rápida',
      chequeos: [
        { texto: 'Filo de los cuchillos ventrales y dorsales' },
      ],
      fuente: PLANTA(33),
    },
  ],
  didactico: {
    porQue: { texto: 'Los dorsales completan el corte que abren los ventrales. Por eso la planta los calibra con la cruz patrón puesta entre los ventrales: unos y otros tienen que quedar exactamente alineados.', dibujoId: 'planta-p9', fuente: PLANTA(9) },
    notaAuditoria: 'Medida «b» para salmón: el V4 dice 5 mm; la tabla del manual de planta (pág. 11) tiene 4,5 mm escrito a mano sobre la tabla original. Trucha (4 mm) y pescado blanco (7 mm) coinciden en ambos. Confirmar cuál se usa hoy para salmón. Las cotas 22, 2 y 0,5 mm del dibujo 19 del V4 también aparecen en el dibujo de planta (pág. 9), pero ninguno de los dos textos dice qué miden.',
  },
}

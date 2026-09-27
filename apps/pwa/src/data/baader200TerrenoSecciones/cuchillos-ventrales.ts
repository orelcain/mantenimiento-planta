import { FUENTES, PLANTA, V4, SALMON_INCLUYE, BLANCO_INCLUYE, type SeccionTerreno } from '../baader200TerrenoTipos'

export const seccion: SeccionTerreno = {
  id: 'cuchillos-ventrales',
  orden: 4,
  titulo: 'Cuchillos ventrales',
  zona: 'Corte ventral y dorsal',
  medidaPrincipal: {
    clave: 'a',
    nombre: 'Abertura entre cuchillos «a»',
    unidad: 'mm',
    porEspecie: [
      { especie: 'salmon', etiqueta: 'Salmón', valor: '5', incluye: SALMON_INCLUYE },
      { especie: 'trucha', etiqueta: 'Trucha', valor: '4' },
      { especie: 'blanco', etiqueta: 'Pescado blanco', valor: '7', incluye: BLANCO_INCLUYE },
    ],
    valorPlanta: { valor: '5', fuente: PLANTA(6) },
    pos: ['8', '9'],
    ajusteCon: 'bujes apretadores',
    fuente: V4(10),
  },
  medidas: [
    { clave: 'ref-izq', nombre: 'Referencia a la cara interna del cuchillo izquierdo', valores: ['177,5'], unidad: 'mm', con: 'medida patrón o reglilla', fuente: PLANTA(6) },
    { clave: 'entradas', nombre: 'Entradas', valores: ['15'], unidad: 'mm', pos: ['10', '11'], con: 'tornillos pos. 12', fuente: V4(10) },
    { clave: 'entre-entradas', nombre: 'Distancia entre las entradas', valores: ['5'], unidad: 'mm', pos: ['10', '11'], fuente: V4(10) },
    { clave: 'control-contrasoportes', nombre: 'Control con los contrasoportes puestos', valores: ['320', '180'], unidad: 'mm', pos: ['6', '7'], fuente: V4(9) },
    { clave: 'alojamientos', nombre: 'Alojamientos de las cuchillas (árboles alineados)', valores: ['302', '162'], unidad: 'mm', pos: ['3', '4'], con: 'tornillos de tope pos. 1·2', soloAnual: true, fuente: V4(9) },
    { clave: 'silleta-cuchilla', nombre: 'Silleta a cuchilla en el sitio más estrecho', valores: ['1,5'], unidad: 'mm', pos: ['13', '14'], con: 'bielas de mando', fuente: V4(11) },
    { clave: 'silleta-leva', nombre: 'Posición de la silleta para fijar la leva', valores: ['900'], unidad: 'mm', fuente: V4(12) },
  ],
  pasos: [
    { texto: 'Con la silleta en reposo, ajustar «a» con los bujes apretadores (pos. 8·9), con los contrasoportes puestos a izquierda y derecha (pos. 6·7). Controlar 320 y 180 mm.', pos: ['8', '9', '6', '7'], medida: 'a', fuente: V4(9) },
    { texto: 'Método de planta: tomar 177,5 mm a la cara interna del cuchillo izquierdo con la reglilla y colocar la cruz patrón para calibrar.', medida: 'ref-izq', fuente: PLANTA(6) },
    { texto: 'Ajustar las entradas (pos. 10·11) a 15 mm con los tornillos pos. 12. Entre las dos entradas quedan 5 mm.', pos: ['10', '11', '12'], medida: 'entradas', fuente: V4(10) },
    { texto: 'Pasar una silleta entre las cuchillas, con el rodillo en el punto más alto de la leva, y dejar 1,5 mm en el sitio más estrecho con las bielas de mando (pos. 13·14).', pos: ['13', '14'], medida: 'silleta-cuchilla', fuente: V4(11) },
    { texto: 'Con la silleta a 900 mm, soltar la leva y girarla en el sentido de trabajo hasta que el rodillo toque la vía de leva. Volver a fijar.', medida: 'silleta-leva', fuente: V4(12) },
    { texto: 'Solo en la mantención anual: alinear los alojamientos (pos. 3·4) con los tornillos de tope (pos. 1·2) a 302 y 162 mm, para que los árboles queden paralelos.', pos: ['3', '4', '1', '2'], medida: 'alojamientos', fuente: V4(9) },
  ],
  advertencias: [
    { texto: 'Los pernos de fijación pos. 1·2 solo se mueven en la mantención anual, para alinear los cuchillos entre sí.', pos: ['1', '2'], tipo: 'soloAnual', fuente: PLANTA(6) },
  ],
  dibujos: [
    // Recortes y hotspots medidos sobre los renders (2026-09-27): el % es de la página
    // completa; las coordenadas de los hotspots, del recorte. Marcan el NÚMERO impreso.
    {
      id: 'v4-dib11', url: FUENTES.v4.urlPagina(9), titulo: 'Dibujo 11 · posiciones 1 a 14 (vista superior)',
      recorte: { x: 8, y: 36, w: 85, h: 45.5 },
      hotspots: [
        { pos: '1', x: 45.3, y: 28.2 }, { pos: '2', x: 65.8, y: 28.2 }, { pos: '3', x: 30.7, y: 70 },
        { pos: '4', x: 80.9, y: 72 }, { pos: '6', x: 2.8, y: 37.7 }, { pos: '7', x: 98.2, y: 45.8 },
        { pos: '8', x: 7.3, y: 48 }, { pos: '9', x: 95.8, y: 33.5 }, { pos: '10', x: 49.9, y: 19.5 },
        { pos: '11', x: 62.1, y: 19.5 }, { pos: '13', x: 13.2, y: 28 }, { pos: '14', x: 88.4, y: 24.4 },
      ],
      fuente: V4(9),
    },
    {
      id: 'v4-dib12', url: FUENTES.v4.urlPagina(10), titulo: 'Dibujo 12 · entradas (pos. 11) y tornillos (pos. 12)',
      recorte: { x: 12.5, y: 36, w: 70, h: 28 },
      hotspots: [{ pos: '11', x: 92.2, y: 54.5 }, { pos: '12', x: 17.1, y: 20.9 }],
      fuente: V4(10),
    },
    {
      id: 'planta-p6', url: FUENTES.planta.urlPagina(6), titulo: 'Esquema de planta · medida «a» y referencia 177,5',
      recorte: { x: 0, y: 26.7, w: 48.8, h: 44.8 },
      hotspots: [
        { pos: '1', x: 35.4, y: 42.2 }, { pos: '2', x: 49.8, y: 42.2 }, { pos: '3', x: 4.7, y: 91.8 },
        { pos: '4', x: 73.6, y: 79.1 }, { pos: '5', x: 75, y: 70.1 }, { pos: '6', x: 4.2, y: 68.4 },
        { pos: '7', x: 73.2, y: 63 }, { pos: '8', x: 3.6, y: 47 }, { pos: '9', x: 71.4, y: 45.8 },
        { pos: '10', x: 38.5, y: 30.3 }, { pos: '11', x: 48.1, y: 30.9 }, { pos: '12', x: 80.5, y: 92.1 },
        { pos: '13', x: 3.6, y: 37 }, { pos: '14', x: 72.9, y: 38.5 },
      ],
      fuente: PLANTA(6),
    },
  ],
  leyenda: [
    { pos: ['1', '2'], nombre: 'Pernos de fijación (tornillos de tope)', codigoBaader: [], confianza: 'media', revisar: 'Sin código en el catálogo cruzado.' },
    { pos: ['3', '4'], nombre: 'Alojamiento de cuchilla (brazo de cojinete)', codigoBaader: ['511587'], sap: ['3300064927'], confianza: 'media' },
    { pos: ['6', '7'], nombre: 'Contrasoporte', codigoBaader: ['636977', '636997'], confianza: 'media' },
    { pos: ['8', '9'], nombre: 'Buje apretador (cubo de sujeción)', codigoBaader: ['1890310006'], sap: ['3300054470'], confianza: 'alta', revisar: 'En el maestro SAP la ficha dice «EJE 1420202001». Confirmar antes de pedir.' },
    { pos: ['10'], nombre: 'Entrada izquierda', codigoBaader: ['2000502001'], confianza: 'alta' },
    { pos: ['11'], nombre: 'Entrada derecha', codigoBaader: ['2000501001'], confianza: 'alta' },
    { pos: ['12'], nombre: 'Tornillo M8x25 y arandela 8,4', codigoBaader: ['30810825', '31800084'], sap: ['3300014281', '3300012313'], confianza: 'alta', tornilleria: true },
    { pos: ['13', '14'], nombre: 'Biela de mando (varilla roscada)', codigoBaader: ['518727', '518847'], confianza: 'media' },
    { pos: ['13', '14'], nombre: 'Cabeza articulada de la biela', codigoBaader: ['94000005', '94000006'], sap: ['3300035291', '3300035292'], confianza: 'alta' },
    { pos: [], nombre: 'Cuchilla circular 200 mm (ventral y dorsal)', codigoBaader: ['94011760'], sap: ['3300106403'], confianza: 'alta' },
    { pos: [], nombre: 'Eje de cuchilla ventral derecha', codigoBaader: ['519337'], sap: ['3300012203'], confianza: 'alta' },
    { pos: [], nombre: 'Eje de cuchilla ventral izquierda', codigoBaader: ['1870510012'], sap: ['3300012201'], confianza: 'alta' },
  ],
  diagnostico: [
    {
      falla: 'Gaping en la zona de la cola, bajo el esquelón / aleta anal',
      seccionApp: 'ts-gay-ping-cola',
      chequeos: [
        { texto: 'Diámetro de los cuchillos ventrales, lo más cercano a', valor: '200', unidad: 'mm' },
        { texto: 'Filo en excelente estado' },
        { texto: 'Separación entre cuchillos ventrales y dorsales, máximo', valor: '12', unidad: 'mm' },
        { texto: 'Presión de los resortes de las guías flotantes; ninguno quebrado' },
        { texto: 'Que la leva del mando dorsal no levante antes de lo normal' },
        { texto: 'Aleta anal: abertura de la guía flotante respecto a los ventrales, referencia', valor: '4,8', unidad: 'mm' },
      ],
      fuente: PLANTA(30),
    },
    {
      falla: 'Exceso de aleta anal en un lado',
      seccionApp: 'ts-exceso-aleta-anal',
      chequeos: [
        { texto: 'Alineamiento de las guías flotantes' },
        { texto: 'Calidad del filo de los cuchillos ventrales' },
        { texto: 'Estado de los resortes de las guías flotantes' },
      ],
      fuente: PLANTA(32),
    },
  ],
  didactico: {
    porQue: { texto: 'Los cuchillos ventrales abren el vientre y dejan el corte que después completan los dorsales; por eso su abertura «a» y su alineación con los dorsales (12 mm) definen el filete.', dibujoId: 'planta-p7', fuente: PLANTA(7) },
    notaAuditoria: 'La medida «a» es la distancia ENTRE los cuchillos, no un avance: el manual de planta dice «5 m/m de aventura» por una errata de «abertura». El valor de 5 mm coincide con el manual V4 para salmón; para trucha son 4 mm y para pescado blanco 7 mm.',
  },
}

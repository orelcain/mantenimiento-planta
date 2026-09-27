import { FUENTES, PLANTA, type SeccionTerreno } from '../baader200TerrenoTipos'

// Sección 5 · Guías flotantes. Solo planta (pág. 8 + troubleshooting págs. 30, 32, 36-37).
// El V4 no tiene sección propia ni dibujo de esta pieza; la leyenda queda vacía.
export const seccion: SeccionTerreno = {
  id: 'guias-flotantes',
  orden: 5,
  titulo: 'Guías flotantes',
  zona: 'Corte ventral y dorsal',
  medidaPrincipal: {
    clave: 'abertura',
    nombre: 'Abertura de las guías flotantes, máximo',
    unidad: 'mm',
    porEspecie: [
      { especie: 'salmon', etiqueta: 'Todas las especies', valor: '4,8' },
    ],
    pos: [],
    ajusteCon: 'pernos Parker M6, dos por lado',
    fuente: PLANTA(8),
  },
  medidas: [
    { clave: 'altura', nombre: 'Altura por debajo de las guías de la 2.ª alimentación', valores: ['5'], unidad: 'mm', fuente: PLANTA(8) },
  ],
  pasos: [
    { texto: 'Ajustar primero los cuchillos ventrales; las guías flotantes se ajustan después.', fuente: PLANTA(8) },
    { texto: 'Con la silleta en posición de reposo, dejar las guías solapando a los cuchillos ventrales por su cara interior.', fuente: PLANTA(8) },
    { texto: 'Dejar la abertura en 4,8 mm como máximo con los pernos Parker M6 (dos por lado) que sujetan los soportes de las guías a sus cojinetes.', medida: 'abertura', fuente: PLANTA(8) },
    { texto: 'Regular la altura a 5 mm por debajo de las guías de la segunda alimentación.', medida: 'altura', fuente: PLANTA(8) },
    { texto: 'Después de montar cuchillos ventrales nuevos, repetir el ajuste de las guías flotantes.', fuente: PLANTA(36) },
  ],
  advertencias: [
    { texto: 'Todos estos ajustes se hacen con la silleta en posición de reposo.', tipo: 'atencion', fuente: PLANTA(8) },
    { texto: 'Con cuchillos nuevos hay que volver a ajustar las guías flotantes para cuidar el filo.', tipo: 'atencion', fuente: PLANTA(37) },
  ],
  dibujos: [
    { id: 'planta-p7', url: FUENTES.planta.urlPagina(7), titulo: 'Principio de corte de ventrales y dorsales (manual de planta)', recorte: { x: 30, y: 20, w: 38, h: 70 }, hotspots: [], fuente: PLANTA(7) },
  ],
  leyenda: [],
  diagnostico: [
    {
      falla: 'Gaping en la zona de la cola, bajo el esquelón / aleta anal',
      seccionApp: 'ts-gay-ping-cola',
      chequeos: [
        { texto: 'Presión de los resortes de las guías flotantes; ninguno quebrado' },
        { texto: 'Aleta anal: abertura de la guía flotante respecto a los ventrales, referencia', valor: '4,8', unidad: 'mm' },
        { texto: 'Filo de los cuchillos ventrales en excelente estado' },
      ],
      fuente: PLANTA(30),
    },
    {
      falla: 'Exceso de aleta anal en un lado',
      seccionApp: 'ts-exceso-aleta-anal',
      chequeos: [
        { texto: 'Alineamiento de las guías flotantes' },
        { texto: 'Estado de los resortes de las guías flotantes' },
        { texto: 'Calidad del filo de los cuchillos ventrales' },
      ],
      fuente: PLANTA(32),
    },
  ],
  didactico: {
    porQue: { texto: 'Las guías flotantes acompañan a los cuchillos ventrales por la cara interior, apretadas por resortes. Si se abren más de la cuenta o un resorte pierde presión, aparece gaping bajo el esquelón y queda aleta anal en un lado.', dibujoId: 'planta-p7', fuente: PLANTA(30) },
    notaAuditoria: 'Toda la sección sale del manual de planta: el V4 no trae ajuste de guías flotantes ni un dibujo donde identificarlas, por eso no hay leyenda ni códigos. No confundir los 4,8 mm de esta abertura con la medida «e» del V4 para trucha (4,8 mm), que es de la guía de espinas superior. Tampoco está confirmado que las «entradas» del V4 (pág. 10) sean estas guías.',
  },
}

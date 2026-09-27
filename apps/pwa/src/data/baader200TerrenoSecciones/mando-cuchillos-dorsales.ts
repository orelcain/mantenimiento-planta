import { FUENTES, PLANTA, V4, type SeccionTerreno } from '../baader200TerrenoTipos'

// Sección 8 · Mando de cuchillos dorsales. Fuentes: V4 §5.1 (págs. 16-19) + planta pág. 11.
// Posiciones = dibujos 21 a 26 del V4, que comparten numeración (8 rodillo, 9 soporte, 10 tope, 11-15 trinquete, 16 leva, 17 tornillo).
// El dibujo de planta pág. 11 usa los mismos números. Pos. 4 a 7 son del dibujo 17.
export const seccion: SeccionTerreno = {
  id: 'mando-cuchillos-dorsales',
  orden: 8,
  titulo: 'Mando de cuchillos dorsales',
  zona: 'Corte ventral y dorsal',
  medidaPrincipal: {
    clave: 'control-20',
    nombre: 'Distancia ventrales-dorsales en el control (rodillo arriba, trinquete en la 4.ª entalla)',
    unidad: 'mm',
    porEspecie: [
      { especie: 'salmon', etiqueta: 'Todas las especies', valor: '20' },
    ],
    valorPlanta: { valor: '20 (levante de las dorsales al paso de la silleta)', fuente: PLANTA(11) },
    pos: ['12', '13'],
    ajusteCon: 'trinquete en la 4.ª entalla del fiador y posición de la leva',
    fuente: V4(19),
  },
  medidas: [
    { clave: 'rodillo-soporte', nombre: 'Rodillo a soporte de leva', valores: ['28'], unidad: 'mm', pos: ['8', '9'], con: 'tornillo de tope pos. 10', fuente: V4(16) },
    { clave: 'trinquete-fiador', nombre: 'Trinquete a fiador', valores: ['12'], unidad: 'mm', pos: ['12', '13'], con: 'tornillos pos. 11', fuente: V4(17) },
    { clave: 'silleta', nombre: 'Posición de la silleta para calar el trinquete y la leva', valores: ['940'], unidad: 'mm', fuente: V4(18) },
  ],
  pasos: [
    { texto: 'Soltar el tornillo (pos. 17). Dejar 28 mm entre el rodillo (pos. 8) y el soporte de leva (pos. 9) con el tornillo de tope (pos. 10).', pos: ['17', '8', '9', '10'], medida: 'rodillo-soporte', fuente: V4(16) },
    { texto: 'Soltar los tornillos (pos. 11) y dejar 12 mm entre el trinquete (pos. 12) y el fiador (pos. 13).', pos: ['11', '12', '13'], medida: 'trinquete-fiador', fuente: V4(17) },
    { texto: 'Con la silleta a 940 mm, soltar los tornillos (pos. 14) y subir el trinquete (pos. 12) a la 4.ª entalla del fiador (pos. 13), contando desde la izquierda.', pos: ['14', '12', '13'], medida: 'silleta', fuente: V4(18) },
    { texto: 'Poner la palanca (pos. 15) en vertical y apretar los tornillos (pos. 14).', pos: ['15', '14'], fuente: V4(19) },
    { texto: 'Soltar la leva (pos. 16) y girarla en el sentido de trabajo, con la palanca levantada y el trinquete en la 4.ª entalla, hasta que el rodillo (pos. 8) toque la vía de leva. Fijar la leva y apretar el tornillo (pos. 17).', pos: ['16', '8', '17'], fuente: V4(19) },
    { texto: 'Control: con el rodillo en el punto más alto de la leva y el trinquete en la 4.ª entalla, la distancia entre ventrales y dorsales es de 20 mm.', medida: 'control-20', fuente: V4(19) },
    { texto: 'Si las dorsales no levantan, revisar la posición del trinquete, luego el bulón con gollete del mando dorsal y el conjunto del cárter de levas.', pos: ['12'], fuente: PLANTA(11) },
  ],
  advertencias: [
    { texto: 'Los cuerpos de cojinete de las dorsales (dib. 17, pos. 6·7) descansan sobre los tornillos (dib. 17, pos. 4·5): el mando levanta las dorsales desde ese apoyo.', pos: ['6', '7', '4', '5'], tipo: 'atencion', fuente: V4(16) },
  ],
  dibujos: [
    { id: 'v4-dib23', url: FUENTES.v4.urlPagina(17), titulo: 'Dibujo 23 · trinquete (pos. 12), fiador (pos. 13), tornillos (pos. 11·14), palanca (pos. 15) y tope (pos. 10)', recorte: { x: 15, y: 15, w: 67, h: 68 }, hotspots: [], fuente: V4(17) },
    { id: 'v4-dib25', url: FUENTES.v4.urlPagina(18), titulo: 'Dibujo 25 · trinquete en la 4.ª entalla del fiador', recorte: { x: 20, y: 50, w: 60, h: 37 }, hotspots: [], fuente: V4(18) },
    { id: 'planta-p11', url: FUENTES.planta.urlPagina(11), titulo: 'Esquema de planta · mando dorsal con cotas 12 y 28 mm', recorte: { x: 5, y: 29, w: 42, h: 50 }, hotspots: [], fuente: PLANTA(11) },
  ],
  leyenda: [
    { pos: ['8'], nombre: 'Rodillo', codigoBaader: ['95060123'], sap: ['3300012368'], confianza: 'media' },
    { pos: ['9'], nombre: 'Soporte de leva (cubo de sujeción)', codigoBaader: ['514357'], confianza: 'media' },
    { pos: ['10'], nombre: 'Tornillo de tope (tornillo de amortiguador)', codigoBaader: ['1891910001'], sap: ['3300012375'], confianza: 'media', revisar: 'El Excel del catálogo lo trae como «Tuerca hexagonal»; la página dice tornillo amortiguador (Pufferschraube).' },
    { pos: ['10'], nombre: 'Ángulo del tornillo de tope', codigoBaader: ['2000900005'], confianza: 'media' },
    { pos: ['11'], nombre: 'Tornillos de la palanca del trinquete', codigoBaader: ['30811020'], confianza: 'alta', tornilleria: true },
    { pos: ['12'], nombre: 'Trinquete', codigoBaader: ['1886510007'], confianza: 'alta', revisar: 'Tiene 2 fichas en el maestro SAP y sin stock.' },
    { pos: ['13'], nombre: 'Fiador (4 entallas)', codigoBaader: [], confianza: 'media', revisar: 'No aparece «fiador», «muesca» ni «entalla» en el catálogo (revisadas las figs. 9-8 a 9-13, 9-1-2 y 9-1-3).' },
    { pos: ['14'], nombre: 'Tornillo hexagonal y arandela de la palanca', codigoBaader: ['30810815', '31800084'], sap: ['3300084314'], confianza: 'media', tornilleria: true },
    { pos: ['15'], nombre: 'Palanca (posición vertical)', codigoBaader: ['517947'], confianza: 'media', revisar: 'Contraparte 517927. Hay un segundo candidato para la pos. 15: el conjunto 520207 (517997 + 518007).' },
    { pos: ['15'], nombre: 'Palanca del trinquete (conjunto 520207)', codigoBaader: ['517997', '518007'], confianza: 'media', revisar: 'Compite con la 517947 por la pos. 15: confirmar en la máquina.' },
    { pos: ['16'], nombre: 'Leva del mando dorsal', codigoBaader: [], confianza: 'media', revisar: 'No identificada. La 2000904001 (fig. 9-9) es la leva del cuchillo punzón, no esta.' },
    { pos: ['17'], nombre: 'Tornillo de apriete de la palanca', codigoBaader: [], confianza: 'media', revisar: 'Candidato de baja confianza: 30050840, en el cubo de la palanca 515397.', tornilleria: true },
  ],
  diagnostico: [
    {
      falla: 'Gaping en la zona de la cola, bajo el esquelón / aleta anal',
      seccionApp: 'ts-gay-ping-cola',
      chequeos: [
        { texto: 'Que la leva del mando dorsal no levante antes de lo normal' },
        { texto: 'Separación entre cuchillos ventrales y dorsales, máximo', valor: '12', unidad: 'mm' },
      ],
      fuente: PLANTA(30),
    },
    {
      falla: 'Entrada del pescado demasiado rápida',
      chequeos: [
        { texto: 'Accionamientos del mando dorsal' },
        { texto: 'Filo de los cuchillos ventrales y dorsales' },
      ],
      fuente: PLANTA(33),
    },
  ],
  didactico: {
    porQue: { texto: 'Al paso de la silleta los cuchillos dorsales tienen que levantar. Esa altura la da la palanca del trinquete, por eso la entalla del fiador y los 12 mm del trinquete deciden cuánto suben.', dibujoId: 'planta-p11', fuente: PLANTA(11) },
    notaAuditoria: 'Ambos manuales dan 20 mm, pero no describen lo mismo: el V4 mide la distancia entre ventrales y dorsales con el rodillo en el punto más alto de la leva y el trinquete en la 4.ª entalla; la planta dice que las dorsales «tienen que levantar 20 mm al paso de la silleta». Confirmar cómo se mide en terreno. Los 12 mm del trinquete a la entalla y los 28 mm del rodillo coinciden en ambos.',
  },
}

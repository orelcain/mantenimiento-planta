import { FUENTES, PLANTA, V4, type SeccionTerreno } from '../baader200TerrenoTipos'

// Sección 2 · Segunda alimentación. Fuentes: V4 §2 (págs. 3-7) + planta pág. 4.
// `pos` = numeración del dibujo 3 del V4 (chapaletas, topes, segmentos, palancas).
// Las piezas de los dibujos 2, 6, 7 y 9 (leva, rodillo, biela) repiten números con otro significado:
// van citadas en el texto con su dibujo y sin `pos`.
export const seccion: SeccionTerreno = {
  id: 'segunda-alimentacion',
  orden: 2,
  titulo: 'Segunda alimentación',
  zona: 'Alimentación',
  medidaPrincipal: {
    clave: 'solape',
    nombre: 'Solape de las chapaletas hacia dentro sobre las cuchillas ventrales y dorsales',
    unidad: 'mm',
    porEspecie: [
      { especie: 'salmon', etiqueta: 'Todas las especies', valor: '0,5' },
    ],
    valorPlanta: { valor: '0,5; por lo general más, casi tocándose', fuente: PLANTA(4) },
    pos: ['3', '4'],
    ajusteCon: 'tornillos de tope (pos. 1·2)',
    fuente: V4(3),
  },
  medidas: [
    { clave: 'amortiguador', nombre: 'Tornillo amortiguador (dib. 2, pos. 2)', valores: ['35'], unidad: 'mm', fuente: V4(3) },
    { clave: 'rodillo-soporte', nombre: 'Rodillo a soporte de leva (dib. 2, pos. 3 y 4)', valores: ['14'], unidad: 'mm', fuente: V4(3) },
    { clave: 'palancas', nombre: 'Palancas junto a los tornillos de tope', valores: ['0,5'], unidad: 'mm', pos: ['14'], con: 'tornillos pos. 15', fuente: V4(5) },
    { clave: 'cuchillas-nuevas', nombre: 'Con cuchillas nuevas de 200 mm: chapa a ventral y a dorsal (dib. 5)', valores: ['2', '3'], unidad: 'mm', fuente: V4(5) },
    { clave: 'salida', nombre: 'Entre chapaletas en la salida, rodillo en el punto más alto de la leva', valores: ['26'], unidad: 'mm', pos: ['3', '4'], con: 'biela de mando (dib. 2 y 7, pos. 5)', fuente: V4(6) },
    { clave: 'silleta-leva', nombre: 'Posición de la silleta para fijar la leva', valores: ['895'], unidad: 'mm', fuente: V4(7) },
  ],
  pasos: [
    { texto: 'Desplazar las silletas hasta que la leva 6 quede como en el dibujo 2. Ajustar el tornillo amortiguador a 35 mm y dejar 14 mm entre el rodillo y el soporte de leva (dib. 2, pos. 2, 3 y 4).', medida: 'amortiguador', fuente: V4(3) },
    { texto: 'Ajustar las chapaletas (pos. 3·4) con los tornillos de tope (pos. 1·2) para que solapen 0,5 mm hacia dentro las cuchillas ventrales (pos. 12) y dorsales (pos. 13).', pos: ['3', '4', '1', '2', '12', '13'], medida: 'solape', fuente: V4(3) },
    { texto: 'Si quedan desalineadas, soltar los tornillos (pos. 10), corregir con los segmentos dentados (pos. 11) y volver a apretar.', pos: ['10', '11'], fuente: V4(4) },
    { texto: 'Con las palancas (pos. 14) junto a los tornillos de tope, dejar 0,5 mm con los tornillos (pos. 15).', pos: ['14', '15'], medida: 'palancas', fuente: V4(5) },
    { texto: 'Ajustar la presión de las chapaletas sobre el pescado con las tuercas hexagonales (pos. 5·6).', pos: ['5', '6'], fuente: V4(6) },
    { texto: 'Con el rodillo en el punto más alto de la leva (dib. 6), controlar 26 mm entre chapaletas en la salida. Corregir con la biela de mando (dib. 7, pos. 5), simétrico al centro de la máquina.', pos: ['3', '4'], medida: 'salida', fuente: V4(6) },
    { texto: 'Con una silleta a 895 mm, soltar la leva (dib. 9, pos. 8), girarla en el sentido de trabajo contra el rodillo (dib. 9, pos. 7) y fijarla. Pasar una silleta: las chapaletas se abren antes de ella y no la tocan.', medida: 'silleta-leva', fuente: V4(7) },
  ],
  advertencias: [
    { texto: 'Al montar cuchillos nuevos hay que reajustar las chapaletas: al bajar el mando dorsal, los cuchillos rozarían con ellas. La planta las regula con los pernos M10.', pos: ['3', '4'], tipo: 'atencion', fuente: PLANTA(4) },
    { texto: 'Los resortes de ambas chapaletas deben quedar con la misma tensión (tuercas pos. 5·6).', pos: ['5', '6'], tipo: 'atencion', fuente: PLANTA(4) },
    { texto: 'Al pasar la silleta, silleta y chapaletas no deben tocarse.', pos: ['3', '4'], tipo: 'atencion', fuente: V4(7) },
  ],
  dibujos: [
    { id: 'v4-dib3', url: FUENTES.v4.urlPagina(4), titulo: 'Dibujo 3 · chapaletas (pos. 3·4), topes (pos. 1·2), segmentos (pos. 10·11) y palancas (pos. 14·15)', recorte: { x: 17, y: 19, w: 66, h: 64 }, hotspots: [], fuente: V4(4) },
    { id: 'v4-dib2', url: FUENTES.v4.urlPagina(3), titulo: 'Dibujo 2 · leva 6, amortiguador 35 mm y rodillo a soporte 14 mm', recorte: { x: 6, y: 25, w: 86, h: 48 }, hotspots: [], fuente: V4(3) },
    { id: 'planta-p4', url: FUENTES.planta.urlPagina(4), titulo: 'Esquema de planta · segunda alimentación (35, 14 y 0,5 mm)', recorte: { x: 5, y: 18, w: 48, h: 73 }, hotspots: [], fuente: PLANTA(4) },
  ],
  leyenda: [
    { pos: ['1', '2'], nombre: 'Tornillo de tope (tornillo de amortiguador)', codigoBaader: ['1891910001'], sap: ['3300012375'], confianza: 'media' },
    { pos: ['3'], nombre: 'Chapaleta alimentadora derecha', codigoBaader: ['635607'], sap: ['3300053760'], confianza: 'media', revisar: 'La variante de la fig. 101-4 usa 2004103001.' },
    { pos: ['3'], nombre: 'Palanca de la chapaleta derecha', codigoBaader: ['514047'], confianza: 'media' },
    { pos: ['4'], nombre: 'Chapaleta alimentadora izquierda', codigoBaader: ['635617'], confianza: 'media' },
    { pos: ['4'], nombre: 'Palanca de la chapaleta izquierda', codigoBaader: ['514017'], confianza: 'media' },
    { pos: ['5', '6'], nombre: 'Tuerca hexagonal M8 (presión del resorte)', codigoBaader: ['30831008'], sap: ['3300089044'], confianza: 'media', tornilleria: true },
    { pos: ['10'], nombre: 'Tornillo hexagonal y arandela de los segmentos', codigoBaader: ['30050830', '31800084'], confianza: 'alta', tornilleria: true },
    { pos: ['11'], nombre: 'Segmento dentado', codigoBaader: ['401107'], sap: ['3300061895'], confianza: 'alta' },
    { pos: ['12', '13'], nombre: 'Cuchilla circular 200 mm (ventral y dorsal)', codigoBaader: ['94011760'], sap: ['3300106403'], confianza: 'alta' },
    { pos: ['14'], nombre: 'Palanca (medida 0,5 mm)', codigoBaader: [], confianza: 'media', revisar: 'Candidato de baja confianza: palanca 524367; el tope de goma sería el amortiguador 39200205.' },
    { pos: ['15'], nombre: 'Tornillo M10x50 con tuerca', codigoBaader: ['30811050', '20600100'], sap: ['3300098569'], confianza: 'media', tornilleria: true },
    { pos: [], nombre: 'Zoquete de la chapaleta (bloque naranja del dib. 3)', codigoBaader: ['635637'], confianza: 'alta', revisar: 'La variante de la fig. 101-4 usa 2004103006.' },
    { pos: [], nombre: 'Resorte de presión de las chapaletas', codigoBaader: ['38010104'], sap: ['3300012424'], confianza: 'media' },
    { pos: [], nombre: 'Tornillo amortiguador 35 mm (dib. 2, pos. 2)', codigoBaader: ['1891910001'], sap: ['3300012375'], confianza: 'media' },
    { pos: [], nombre: 'Palanca donde apoya el amortiguador (dib. 2)', codigoBaader: ['524447'], confianza: 'media' },
    { pos: [], nombre: 'Rodillo (dib. 2, pos. 3; dib. 6 y 9, pos. 7)', codigoBaader: ['95060121'], sap: ['3300012369'], confianza: 'media' },
    { pos: [], nombre: 'Soporte de leva (dib. 2, pos. 4)', codigoBaader: [], confianza: 'media', revisar: 'Candidato de baja confianza: cubo de sujeción 514357.' },
    { pos: [], nombre: 'Biela de mando (dib. 2 y 7, pos. 5)', codigoBaader: ['524437'], confianza: 'media', revisar: 'Lleva cabezas articuladas 94000005 y 94000006.' },
    { pos: [], nombre: 'Leva 6 (dib. 2, pos. 1; dib. 6 y 9, pos. 8)', codigoBaader: [], confianza: 'media', revisar: 'No identificada: las levas del árbol de la fig. 9-1 van sin número en el catálogo.' },
  ],
  diagnostico: [
    {
      falla: 'Detalles o cortes en los filetes',
      seccionApp: 'ts-cortes-filetes',
      chequeos: [
        { texto: 'Primera y segunda alimentación (segmentos dentados) respecto al dorsal' },
        { texto: 'Filo de los cuchillos dorsales' },
      ],
      fuente: PLANTA(22),
    },
  ],
  didactico: {
    porQue: { texto: 'Las chapaletas de la segunda alimentación trabajan pegadas a los cuchillos ventrales y dorsales. Por eso cada cambio de cuchillos obliga a revisarlas: al bajar el mando dorsal, un cuchillo nuevo más grande rozaría con ellas.', dibujoId: 'v4-dib3', fuente: PLANTA(4) },
    notaAuditoria: 'Solape: el V4 pide 0,5 mm hacia dentro; el manual de planta dice 0,5 mm, pero que «por lo general es más, casi chocando entre sí». Cuchillos nuevos: el V4 da 2 mm a la ventral y 3 mm a la dorsal con cuchillas de 200 mm; la planta solo dice regular con los pernos M10, sin medida. Posición de partida: el V4 habla de la «leva 6» según el dibujo 2; la planta, de la posición de reposo con la 2.ª leva del lado del operador. La medida de 0,5 mm en las palancas (pos. 14·15) coincide en ambos. Confirmar qué solape se usa hoy.',
  },
}

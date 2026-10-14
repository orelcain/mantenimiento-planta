import { FUENTES, PLANTA, V4, type SeccionTerreno } from '../baader200TerrenoTipos'

// Sección 9 · Guías de espinas superiores. Fuentes: V4 §6.1-6.2 (págs. 20-24) + planta pág. 12.
// Posiciones = dibujos 28 a 30 del V4 (3 chapa trasera, 4 unidad delantera, 5·6 tornillos, 7 tornillo, 8 protección,
// 9·11 tuercas, 10 tornillo hexagonal, 14 placa superior). El dibujo de planta pág. 12 usa los mismos números.
// La cuchilla dorsal es pos. 2 en el dib. 28 y pos. 1 en el dib. 30: va sin `pos`. En el dib. 31 la chapa delantera es pos. 1 (= pos. 4 del dib. 30).
export const seccion: SeccionTerreno = {
  id: 'guias-espinas-superiores',
  orden: 9,
  titulo: 'Guías de espinas superiores',
  zona: 'Guías de espinas',
  medidaPrincipal: {
    clave: 'guia-diente',
    nombre: 'Parte trasera de las chapas guía al diente más alto de la silleta',
    unidad: 'mm',
    porEspecie: [
      { especie: 'salmon', etiqueta: 'Todas las especies', valor: '2' },
    ],
    valorPlanta: { valor: '2 aprox., respecto al contradiente', fuente: PLANTA(12) },
    pos: ['3'],
    ajusteCon: 'tuercas (pos. 9·11)',
    fuente: V4(21),
  },
  medidas: [
    { clave: 'e-salmon', nombre: 'Abertura «e» entre chapas guía · salmón, trucha asalmonada, salmón japonés', valores: ['6,5'], unidad: 'mm', fuente: V4(23) },
    { clave: 'e-trucha', nombre: 'Abertura «e» entre chapas guía · trucha', valores: ['4,8'], unidad: 'mm', fuente: V4(23) },
    { clave: 'e-blanco', nombre: 'Abertura «e» entre chapas guía · pescado blanco, bacalao japonés, perca y yellowtail', valores: ['8'], unidad: 'mm', fuente: V4(23) },
    { clave: 'd-salmon', nombre: 'Medida «d» · salmón y trucha', valores: ['17'], unidad: 'mm', pos: ['3'], fuente: V4(20) },
    { clave: 'd-blanco', nombre: 'Medida «d» · pescado blanco', valores: ['15'], unidad: 'mm', pos: ['3'], fuente: V4(20) },
    { clave: 'sobresale', nombre: 'Dorsales sobresalen del canto inferior de las chapas guía delanteras', valores: ['3'], unidad: 'mm', pos: ['4'], con: 'tornillos pos. 5·6', fuente: V4(22) },
    { clave: 'tornillo-proteccion', nombre: 'Tornillo a la protección de cuchillas', valores: ['1'], unidad: 'mm', pos: ['7', '8'], fuente: V4(22) },
    { clave: 'delantera-dorsal', nombre: 'Parte delantera de las chapas guía a las dorsales (dib. 31), exacta', valores: ['0,5-1,0'], unidad: 'mm', pos: ['4'], fuente: V4(23) },
    { clave: 'muelles', nombre: 'Cotas de los muelles para su presión (dib. 28 y 30)', valores: ['50', '55'], unidad: 'mm', fuente: V4(23) },
    { clave: 'guias-inferiores', nombre: 'Entre chapas guía de las guías de espina inferiores (dib. 27)', valores: ['5,8'], unidad: 'mm', fuente: V4(20) },
    { clave: 'planta-reposo', nombre: 'Planta: guías sobre el filo de los dorsales, silleta en reposo', valores: ['3'], unidad: 'mm', fuente: PLANTA(12) },
    { clave: 'planta-escondido', nombre: 'Planta: filo de los dorsales escondido sobre las guías', valores: ['1'], unidad: 'mm', pos: ['7'], con: 'perno M10 pos. 7', fuente: PLANTA(12) },
    { clave: 'planta-separador', nombre: 'Planta: perno separador a la guía superior', valores: ['0,5'], unidad: 'mm', pos: ['14'], fuente: PLANTA(12) },
  ],
  pasos: [
    { texto: 'Método de planta: antes de empezar, soltar el perno separador entre la guía delantera y la guía de espinas superior (pos. 14) para que no interfiera.', pos: ['14'], fuente: PLANTA(12) },
    { texto: 'Con las dorsales en posición inicial, dejar 2 mm parejos entre la parte trasera de las chapas guía (pos. 3) y el diente más alto de la silleta con las tuercas (pos. 9·11).', pos: ['3', '9', '11'], medida: 'guia-diente', fuente: V4(21) },
    { texto: 'Ajustar la unidad delantera (pos. 4) con los tornillos (pos. 5·6) para que las dorsales sobresalgan 3 mm del canto inferior de sus chapas guía. Dejar ese canto a la misma altura que el de la unidad siguiente.', pos: ['4', '5', '6'], medida: 'sobresale', fuente: V4(22) },
    { texto: 'Ajustar el tornillo hexagonal (pos. 10) hasta que toque la placa superior (pos. 14) sin juego.', pos: ['10', '14'], fuente: V4(22) },
    { texto: 'Ajustar el tornillo (pos. 7) a 1 mm de la protección de cuchillas (pos. 8).', pos: ['7', '8'], medida: 'tornillo-proteccion', fuente: V4(22) },
    { texto: 'Controlar entre 0,5 y 1,0 mm entre la parte delantera de las chapas guía y las dorsales (dib. 31).', pos: ['4'], medida: 'delantera-dorsal', fuente: V4(23) },
    { texto: 'Método de planta: con la silleta bajo las dos guías, nivelar la guía delantera (pos. 4) con el perno (pos. 5) y dejar el filo 1 mm escondido con el perno M10 (pos. 7). Con la silleta en reposo, dejar las guías 3 mm sobre el filo de los dorsales y el perno separador a 0,5 mm de la guía superior (pos. 14).', pos: ['4', '5', '7', '14'], medida: 'planta-reposo', fuente: PLANTA(12) },
  ],
  advertencias: [
    { texto: 'Los 0,5 a 1,0 mm entre la parte delantera de las chapas guía y las dorsales son una medida exacta.', pos: ['4'], tipo: 'atencion', fuente: V4(23) },
    { texto: 'Al montar dorsales nuevos, rehacer el ajuste con las guías frontales y, si hace falta, con la guía superior.', tipo: 'atencion', fuente: PLANTA(36) },
  ],
  dibujos: [
    { id: 'v4-dib30', url: FUENTES.v4.urlPagina(22), titulo: 'Dibujo 30 · unidad delantera (pos. 4), tornillos (pos. 5·6·7·10), protección (pos. 8), placa (pos. 14); 3 mm y muelles 55 mm', recorte: { x: 6, y: 25, w: 88, h: 43 }, hotspots: [{ pos: '5', x: 43.3, y: 14.7 }, { pos: '6', x: 46.7, y: 16.0 }, { pos: '8', x: 60.2, y: 13.6 }, { pos: '7', x: 66.7, y: 11.6 }, { pos: '14', x: 11.2, y: 37.5 }, { pos: '10', x: 25.0, y: 44.5 }, { pos: '1', x: 74.1, y: 68.7 }, { pos: '4', x: 71.7, y: 71.8 }], fuente: V4(22) },
    { id: 'v4-dib28-29', url: FUENTES.v4.urlPagina(21), titulo: 'Dibujos 28 y 29 · tuercas (pos. 9·11), chapa trasera (pos. 3), 2 mm al diente y medida «d»', recorte: { x: 5, y: 23, w: 92, h: 67 }, hotspots: [{ pos: '11', x: 24.5, y: 2.1 }, { pos: '9', x: 63.3, y: 1.8 }, { pos: '2', x: 86.9, y: 25.6 }, { pos: '3', x: 14.3, y: 83.2 }], fuente: V4(21) },
    { id: 'v4-dib32', url: FUENTES.v4.urlPagina(24), titulo: 'Dibujo 32 · abertura «e» entre chapas guía', recorte: { x: 20, y: 8, w: 60, h: 36 }, hotspots: [], fuente: V4(24) },
  ],
  leyenda: [
    { pos: ['3'], nombre: 'Chapa guía trasera', codigoBaader: ['2001203002', '2001203003'], confianza: 'alta', revisar: 'Igual en las figs. 102-3/4/5; el catálogo no indica el lado.' },
    { pos: ['4'], nombre: 'Chapa guía delantera (curva)', codigoBaader: ['2001202002', '2001202004'], sap: ['3300017418', '3300017417'], confianza: 'alta', revisar: 'En la fig. 102-4 (pág. 431 del catálogo) la 2001202004 aparece sin nombre.' },
    { pos: ['4'], nombre: 'Soporte de la unidad delantera', codigoBaader: ['2001202001'], confianza: 'alta' },
    { pos: ['5'], nombre: 'Tornillo de ajuste de la unidad delantera', codigoBaader: [], confianza: 'media', revisar: 'Candidatos de baja confianza: 30811050 o 30811040.', tornilleria: true },
    { pos: ['6'], nombre: 'Varilla roscada con muelle de 55 mm', codigoBaader: ['632367'], confianza: 'media' },
    { pos: ['6'], nombre: 'Muelle de la varilla (55 mm)', codigoBaader: ['38000366'], sap: ['3300098510'], confianza: 'media', revisar: 'Tuercas 20600100 y 20670010.' },
    { pos: ['7'], nombre: 'Tornillo (1 mm a la protección)', codigoBaader: [], confianza: 'media', revisar: 'Candidato de baja confianza: 30811040.', tornilleria: true },
    { pos: ['8'], nombre: 'Protección de las cuchillas (pieza naranja)', codigoBaader: [], confianza: 'media', revisar: 'No identificada en el catálogo.' },
    { pos: ['9'], nombre: 'Tuerca hexagonal de altura, delantera', codigoBaader: ['30831012', '73141001'], confianza: 'media', revisar: 'Con arandela 73141001.', tornilleria: true },
    { pos: ['10'], nombre: 'Tornillo hexagonal de contacto con la placa superior', codigoBaader: [], confianza: 'media', revisar: 'Candidato de baja confianza: 30811245 con tuerca 36000112.', tornilleria: true },
    { pos: ['11'], nombre: 'Tuerca hexagonal de altura, trasera', codigoBaader: ['30831012'], confianza: 'media', revisar: 'Va sobre el eje 513187.', tornilleria: true },
    { pos: ['14'], nombre: 'Placa superior', codigoBaader: [], confianza: 'media', revisar: 'Candidatos de baja confianza: cojinete de horquilla 513237 o placa 2001202015 (fig. 12-3, pos. 56).' },
    { pos: [], nombre: 'Muelle del soporte de la guía superior (dib. 28)', codigoBaader: ['38000367'], sap: ['3300012422'], confianza: 'media', revisar: 'Va sobre los pernos de resorte 512897.' },
    { pos: [], nombre: 'Chapa guía de la guía de espina inferior (dib. 27)', codigoBaader: ['2000600004', '2000600005'], confianza: 'media', revisar: 'Chapas largas de la guía de silletas; la 2000600001 es un tramo corto del extremo.' },
    { pos: [], nombre: 'Cuchilla circular 200 mm (dorsal)', codigoBaader: ['94011760'], sap: ['3300106403'], confianza: 'alta' },
  ],
  diagnostico: [
    {
      falla: 'Detalles o cortes en los filetes',
      seccionApp: 'ts-cortes-filetes',
      chequeos: [
        { texto: 'Aberturas de las guías frontales (resortes y ejes)' },
        { texto: 'Filo de los cuchillos dorsales' },
      ],
      fuente: PLANTA(22),
    },
    {
      falla: 'Entrada del pescado demasiado rápida',
      chequeos: [
        { texto: 'Regulación de las guías frontales' },
      ],
      fuente: PLANTA(33),
    },
  ],
  didactico: {
    notaAuditoria: 'Hay cuatro diferencias entre manuales. (1) Placa superior pos. 14: el V4 pide el tornillo pos. 10 en contacto sin juego; la planta deja el perno separador a 0,5 mm. (2) Pos. 7: en el V4 es 1 mm a la protección de cuchillas; en la planta, el perno M10 deja el filo 1 mm escondido. (3) Los 3 mm: en el V4 las dorsales sobresalen 3 mm del canto inferior de las chapas; en la planta las guías quedan 3 mm sobre el filo con la silleta en reposo. (4) Los 2 mm: el V4 los mide al diente más alto de la silleta; la planta, al contradiente. Confirmar cuál rige en cada caso. En el V4 la tabla «d» (17/15 mm) está impresa bajo 6.1 (guías inferiores), pero la cota «d» aparece en el dibujo 29 de la guía superior. La tabla «e» agrupa bacalao japonés, perca y yellowtail con el pescado blanco, a diferencia de las tablas «a», «b» y «c».',
  },
}

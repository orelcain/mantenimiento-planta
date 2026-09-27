import { FUENTES, PLANTA, V4, type SeccionTerreno } from '../baader200TerrenoTipos'

// Sección «cuchillos-rascadores-altura» · V4 §8 (págs. 38-40, más el ajuste fino de la pág. 35) + planta págs. 15-16.
// Convención de `pos`: 'dibujo.posición' de la V4 (p. ej. '52.11' = dib. 52, pos. 11).
export const seccion: SeccionTerreno = {
  id: 'cuchillos-rascadores-altura',
  orden: 12,
  titulo: 'Cuchillos rascadores: altura de trabajo',
  zona: 'Raspado y cola',
  medidaPrincipal: {
    clave: 'altura-trabajo',
    nombre: 'Altura de trabajo sobre la base del diente de la silleta',
    unidad: 'mm',
    porEspecie: [
      { especie: 'salmon', etiqueta: 'Todas las especies', valor: '3' },
    ],
    pos: [],
    ajusteCon: 'biela de mando del brazo soporte de cada cuchillo',
    fuente: PLANTA(16),
  },
  medidas: [
    { clave: 'filo-contradiente', nombre: 'Filo por debajo del contradiente de la silleta (V4, aprox.)', valores: ['1,5'], unidad: 'mm', pos: ['48.1'], con: 'ajuste fino con la biela pos. 5 del dibujo 49', fuente: V4(34) },
    { clave: 'cota-dibujo-planta', nombre: 'Cota que marca el dibujo de altura de trabajo de planta (el texto no la explica)', valores: ['1'], unidad: 'mm', fuente: PLANTA(16) },
    { clave: 'bajo-guia', nombre: 'Posición inferior: punta del rascador bajo la guía de silletas', valores: ['3'], unidad: 'mm', pos: ['53.8', '53.12'], con: 'tornillo de tope pos. 11 del dibujo 52', fuente: V4(39) },
    { clave: 'bajo-guia-planta', nombre: 'Posición inferior: rascador bajo la guía (cota del dibujo A de planta)', valores: ['4'], unidad: 'mm', con: 'topes de seguridad de los rodillos de cada leva', fuente: PLANTA(15) },
    { clave: 'silleta-1350', nombre: 'Silleta para revisar la posición inferior (planta, aprox.)', valores: ['1350'], unidad: 'mm', fuente: PLANTA(15) },
    { clave: 'silleta-30', nombre: 'Silleta para fijar la leva', valores: ['30'], unidad: 'mm', fuente: V4(39) },
  ],
  pasos: [
    { texto: 'Soltar la leva (dib. 52, pos. 3) y girarla hasta que la palanca de rodillo (pos. 10) quede sobre el tornillo de tope (pos. 11). Volver a fijar la leva.', pos: ['52.3', '52.10', '52.11'], fuente: V4(38) },
    { texto: 'Con el tornillo de tope (dib. 52, pos. 11), dejar la punta del rascador (dib. 53, pos. 8) 3 mm por debajo de la guía de silletas (pos. 12).', pos: ['52.11', '53.8', '53.12'], medida: 'bajo-guia', fuente: V4(39) },
    { texto: 'Desplazar una silleta a 30 mm (dib. 54). Soltar la leva (dib. 55, pos. 3), girarla en el sentido de trabajo hasta que el rodillo (pos. 4) toque la vía de leva y volver a fijarla.', pos: ['55.3', '55.4'], medida: 'silleta-30', fuente: V4(40) },
    { texto: 'Hacer el ajuste fino de la altura de los rascadores con la biela de mando (dib. 49, pos. 5).', pos: ['49.5'], fuente: V4(35) },
    { texto: 'Método de planta: dejar el rascador 3 mm sobre la base del diente de la silleta, con la biela de mando del brazo soporte de cada cuchillo.', medida: 'altura-trabajo', fuente: PLANTA(16) },
    { texto: 'Método de planta: con la silleta a unos 1350 mm, verificar que los rascadores queden bajo la guía inferior de espinas. Se corrige, solo en esa posición, con los topes de seguridad de los rodillos de cada leva.', medida: 'silleta-1350', fuente: PLANTA(15) },
  ],
  advertencias: [
    { texto: 'Verificar en intervalos regulares que los tornillos de sujeción (dib. 50, pos. 13) de los rascadores (pos. 8) estén firmes.', pos: ['50.13', '50.8'], tipo: 'atencion', fuente: V4(40) },
  ],
  dibujos: [
    { id: 'v4-dib53', url: FUENTES.v4.urlPagina(39), titulo: 'Dibujo 53 · rascador (pos. 8) 3 mm bajo la guía de silletas (pos. 12)', recorte: { x: 17, y: 17, w: 66, h: 28 }, hotspots: [], fuente: V4(39) },
    { id: 'v4-dib52', url: FUENTES.v4.urlPagina(38), titulo: 'Dibujo 52 · leva (pos. 3), palanca de rodillo (pos. 10) y tornillo de tope (pos. 11)', recorte: { x: 14, y: 19, w: 72, h: 41 }, hotspots: [], fuente: V4(38) },
    { id: 'planta-p16', url: FUENTES.planta.urlPagina(16), titulo: 'Esquema de planta · altura de trabajo del rascador', recorte: { x: 7, y: 33, w: 44, h: 41 }, hotspots: [], fuente: PLANTA(16) },
  ],
  leyenda: [
    { pos: ['48.1', '50.8', '53.8'], nombre: 'Cuchilla rascadora izquierda, 30° (salmón II, trucha, salmón pequeño)', codigoBaader: ['2005902029'], sap: ['3300011620'], confianza: 'alta', revisar: 'Solo para el dispositivo de 30°. En la versión de 0° cambia: salmón I 638307, pescado blanco 2004175002. Confirmar la versión de la máquina.' },
    { pos: ['48.1', '50.8', '53.8'], nombre: 'Cuchilla rascadora derecha, 30° (salmón II, trucha, salmón pequeño)', codigoBaader: ['2005902030'], sap: ['3300011616'], confianza: 'alta', revisar: 'Solo para el dispositivo de 30°. En la versión de 0° cambia: salmón I 638297, pescado blanco 2004175001. Confirmar la versión de la máquina.' },
    { pos: ['50.11', '52.11'], nombre: 'Tornillo de tope (izquierdo y derecho)', codigoBaader: ['1891910001'], sap: ['3300012375'], confianza: 'alta', tornilleria: true, revisar: 'El catálogo en español lo llama «tuerca hexagonal» por error de traducción; es un tornillo de tope.' },
    { pos: [], nombre: 'Caballete del tornillo de tope', codigoBaader: ['1890700001'], confianza: 'media' },
    { pos: ['52.10'], nombre: 'Palanca de rodillo (izquierda y derecha)', codigoBaader: ['512207'], confianza: 'media' },
    { pos: ['52.3', '55.3'], nombre: 'Leva de la cuchilla rascadora', codigoBaader: ['2000900002'], confianza: 'media' },
    { pos: ['55.4'], nombre: 'Rodillo de la palanca de mando', codigoBaader: ['95060121'], sap: ['3300012369'], confianza: 'media' },
    { pos: ['49.5'], nombre: 'Biela de mando (varilla roscada)', codigoBaader: ['518737'], confianza: 'media', revisar: 'Alternativa: varilla larga 637947.' },
    { pos: ['49.5'], nombre: 'Terminales de la biela (superior rosca derecha, inferior rosca izquierda)', codigoBaader: ['94000005', '94000006'], sap: ['3300035291', '3300035292'], confianza: 'media' },
    { pos: ['50.13'], nombre: 'Tornillos de sujeción de la cuchilla rascadora', codigoBaader: ['30920820'], sap: ['3300012371'], confianza: 'alta', tornilleria: true },
    { pos: ['53.12'], nombre: 'Guía de silletas', codigoBaader: [], confianza: 'media', revisar: 'Superficie de referencia; no identificada en el catálogo (rieles 516467 a 516497 sin revisar con imagen).' },
  ],
  diagnostico: [
    {
      falla: 'Espina en el belly',
      seccionApp: 'ts-espina-belly',
      chequeos: [
        { texto: 'Altura de los cuchillos rascadores' },
        { texto: 'Calidad del eviscerado: sin esófago ni riñón' },
      ],
      fuente: PLANTA(27),
    },
    {
      falla: 'Gaping en la mitad del filete, a lo largo',
      seccionApp: 'ts-gay-ping-filete',
      chequeos: [
        { texto: 'Filo, altura de trabajo y nivelación del cuchillo de punta' },
        { texto: 'Altura de trabajo del cuchillo rascador' },
        { texto: 'Abertura de los cuchillos rascadores' },
      ],
      fuente: PLANTA(25),
    },
  ],
  didactico: {
    porQue: { texto: 'El rascador trabaja en la zona de las ijadas y su altura decide qué toma de esa zona. Por eso es lo primero que planta revisa cuando queda espina en el belly.', dibujoId: 'planta-p18', fuente: PLANTA(27) },
    notaAuditoria: 'Altura de trabajo: planta la mide desde la base del diente (3 mm por encima, texto de la pág. 16), pero la cota de su propio dibujo marca 1 mm. La V4 la mide desde el contradiente: filo unos 1,5 mm por debajo (pág. 34). Son referencias distintas y no se pueden convertir entre sí sin medir la silleta; hay que confirmar cuál rige. Posición inferior: la V4 pide 3 mm bajo la guía de silletas (pág. 39) y el dibujo A de planta marca 4 mm bajo la guía (pág. 15). El texto de planta de esa página no da cota.',
  },
}

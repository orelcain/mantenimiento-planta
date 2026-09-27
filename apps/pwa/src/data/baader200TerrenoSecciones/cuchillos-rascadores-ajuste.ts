import { FUENTES, PLANTA, V4, type SeccionTerreno } from '../baader200TerrenoTipos'

// Sección «cuchillos-rascadores-ajuste» · V4 §8 (págs. 32-37) + planta págs. 15 y 17.
// Convención de `pos`: 'dibujo.posición' de la V4 (p. ej. '50.9' = dib. 50, pos. 9).
export const seccion: SeccionTerreno = {
  id: 'cuchillos-rascadores-ajuste',
  orden: 11,
  titulo: 'Cuchillos rascadores: ajuste',
  zona: 'Raspado y cola',
  medidaPrincipal: {
    clave: 'g',
    nombre: 'Distancia «g» entre los filos de los rascadores',
    unidad: 'mm',
    porEspecie: [
      // La tabla «g» agrupa distinto que las demás de la V4 (bacalao japonés y yellowtail van aparte),
      // por eso no se usa SALMON_INCLUYE. No trae valores para trucha ni para pescado blanco.
      { especie: 'salmon', etiqueta: 'Salmón', valor: '14', incluye: ['trucha asalmonada', 'salmón japonés', 'perca (Barsch)'] },
    ],
    valorPlanta: { valor: '17-18', fuente: PLANTA(17) },
    pos: ['50.9'],
    ajusteCon: 'soportes de las cuchillas rascadoras',
    fuente: V4(37),
  },
  medidas: [
    { clave: 'g-yellowtail', nombre: '«g» para yellowtail y máquina combinada yellowtail/perca-salmón (Noruega)', valores: ['18'], unidad: 'mm', pos: ['50.9'], fuente: V4(37) },
    { clave: 'g-bacalao', nombre: '«g» para bacalao japonés', valores: ['22'], unidad: 'mm', pos: ['50.9'], fuente: V4(37) },
    { clave: 'g-planta', nombre: 'Abertura de los rascadores en posición de trabajo (planta)', valores: ['17-18'], unidad: 'mm', con: 'referencia: abertura de las guías superiores de espinas entre el contradiente y el primer diente', fuente: PLANTA(17) },
    { clave: 'biela-145', nombre: 'Preajuste de la biela de mando', valores: ['145'], unidad: 'mm', pos: ['49.5'], fuente: V4(34) },
    { clave: 'filo-contradiente', nombre: 'Filo por debajo del contradiente de la silleta (aprox.)', valores: ['1,5'], unidad: 'mm', pos: ['48.1'], con: 'pernos sujetadores pos. 6 del dibujo 46·46.7', fuente: V4(34) },
    { clave: 'axial-35', nombre: 'Posición axial de los alojamientos de cuchilla', valores: ['35'], unidad: 'mm', pos: ['50.2'], fuente: V4(35) },
    { clave: 'silleta-1350', nombre: 'Silleta para la posición inferior de los rascadores (planta, aprox.)', valores: ['1350'], unidad: 'mm', con: 'topes de seguridad de los rodillos de cada leva', fuente: PLANTA(15) },
  ],
  pasos: [
    { texto: 'Desplazar las silletas hasta que una quede con los dientes de transporte entre las puntas de los rascadores. Soltar la leva (dib. 47, pos. 3), girarla hasta que el rodillo (pos. 4) quede en lo más alto de la vía de leva y volver a fijarla.', pos: ['47.3', '47.4'], fuente: V4(33) },
    { texto: 'Preajustar la biela de mando (dib. 49, pos. 5) a 145 mm. Con esta biela se mueven los alojamientos de cuchilla (dib. 46, pos. 2) en horizontal.', pos: ['49.5', '46.2'], medida: 'biela-145', fuente: V4(34) },
    { texto: 'Soltar los pernos sujetadores (dib. 46, pos. 6·7) y dejar el filo de los rascadores (dib. 48, pos. 1) unos 1,5 mm por debajo del contradiente de la silleta.', pos: ['46.6', '46.7', '48.1'], medida: 'filo-contradiente', fuente: V4(34) },
    { texto: 'Llevar los alojamientos (dib. 50, pos. 2) axialmente a 35 mm y volver a fijar los pernos sujetadores (dib. 46, pos. 6·7). El ajuste fino de altura se hace después con la biela (dib. 49, pos. 5).', pos: ['50.2', '46.6', '46.7'], medida: 'axial-35', fuente: V4(35) },
    { texto: 'Soltar los soportes (dib. 50, pos. 9) y ajustar la distancia «g» entre los filos según la especie.', pos: ['50.9'], medida: 'g', fuente: V4(37) },
    { texto: 'Método de planta: con la máquina en posición de trabajo, dejar la abertura entre 17 y 18 mm, tomando como referencia la abertura de las guías superiores de espinas entre el contradiente y el primer diente.', medida: 'g-planta', fuente: PLANTA(17) },
    { texto: 'Método de planta: desplazar la silleta a unos 1350 mm y verificar que los rascadores queden por debajo de la guía inferior de espinas. Se ajusta, solo en esa posición, con los topes de seguridad de los rodillos de cada leva.', medida: 'silleta-1350', fuente: PLANTA(15) },
  ],
  advertencias: [
    { texto: 'Esta sección es para el raspador oblicuo de 30° (salmón, trucha asalmonada, salmón japonés, bacalao japonés, perca, yellowtail). Si la máquina tiene otra versión del dispositivo, las cuchillas y las levas de la leyenda cambian.', tipo: 'atencion', fuente: V4(32) },
  ],
  dibujos: [
    { id: 'v4-dib46', url: FUENTES.v4.urlPagina(32), titulo: 'Dibujo 46 · biela de mando (pos. 1), alojamientos (pos. 2) y pernos sujetadores (pos. 6·7)', recorte: { x: 14, y: 32, w: 72, h: 43 }, hotspots: [], fuente: V4(32) },
    { id: 'v4-dib50', url: FUENTES.v4.urlPagina(36), titulo: 'Dibujo 50 · alojamiento a 35 mm (pos. 2), rascador (pos. 8), soporte (pos. 9) y tornillos (pos. 13)', recorte: { x: 10, y: 9, w: 80, h: 51 }, hotspots: [], fuente: V4(36) },
    { id: 'v4-dib51', url: FUENTES.v4.urlPagina(37), titulo: 'Dibujo 51 · distancia «g» y tabla por especie', recorte: { x: 14, y: 15, w: 72, h: 53 }, hotspots: [], fuente: V4(37) },
  ],
  leyenda: [
    { pos: ['48.1', '50.8', '53.8'], nombre: 'Cuchilla rascadora izquierda, 30° (salmón II, trucha, salmón pequeño)', codigoBaader: ['2005902029'], sap: ['3300011620'], confianza: 'alta', revisar: 'Solo para el dispositivo de 30°. En la versión de 0° cambia: salmón I 638307, pescado blanco 2004175002. Confirmar la versión de la máquina.' },
    { pos: ['48.1', '50.8', '53.8'], nombre: 'Cuchilla rascadora derecha, 30° (salmón II, trucha, salmón pequeño)', codigoBaader: ['2005902030'], sap: ['3300011616'], confianza: 'alta', revisar: 'Solo para el dispositivo de 30°. En la versión de 0° cambia: salmón I 638297, pescado blanco 2004175001. Confirmar la versión de la máquina.' },
    { pos: ['48.1'], nombre: 'Cuchilla rascadora 30°, variante besugo (izquierda y derecha)', codigoBaader: ['2004164029', '2004164030'], confianza: 'media', revisar: 'Variante besugo del dispositivo de 30°; no es la de salmón.' },
    { pos: ['46.2', '50.2'], nombre: 'Alojamiento de cuchilla (izquierdo y derecho)', codigoBaader: ['2004303002', '2004303003'], confianza: 'media' },
    { pos: ['50.9'], nombre: 'Soporte de la cuchilla rascadora (izquierdo y derecho)', codigoBaader: ['2004303004', '2004303005'], confianza: 'media' },
    { pos: ['50.9'], nombre: 'Pieza de apriete del soporte', codigoBaader: ['2004303011'], confianza: 'media' },
    { pos: ['46.1', '49.5'], nombre: 'Biela de mando (varilla roscada)', codigoBaader: ['518737'], confianza: 'media', revisar: 'Alternativa: varilla larga 637947.' },
    { pos: ['46.1', '49.5'], nombre: 'Terminales de la biela (superior rosca derecha, inferior rosca izquierda)', codigoBaader: ['94000005', '94000006'], sap: ['3300035291', '3300035292'], confianza: 'media' },
    { pos: ['46.6'], nombre: 'Perno sujetador del alojamiento (bloque izquierdo)', codigoBaader: [], confianza: 'media', tornilleria: true, revisar: 'Candidato 30051050 (M10x50) o 30031050, confianza baja.' },
    { pos: ['46.7'], nombre: 'Perno sujetador del alojamiento (bloque central partido)', codigoBaader: [], confianza: 'media', tornilleria: true, revisar: 'Candidato 30811065 (M10x65) o 30051045, confianza baja.' },
    { pos: ['47.3'], nombre: 'Leva de la cuchilla rascadora', codigoBaader: ['2000900002'], confianza: 'media', revisar: 'El dibujo 47 muestra dos levas en el mismo eje; la otra sería 2001600052 (confianza baja).' },
    { pos: [], nombre: 'Cubo de sujeción de la leva', codigoBaader: ['514357'], confianza: 'media' },
    { pos: ['47.4'], nombre: 'Rodillo de la palanca de mando', codigoBaader: ['95060121'], sap: ['3300012369'], confianza: 'media' },
    { pos: ['50.13'], nombre: 'Tornillos de sujeción de la cuchilla rascadora', codigoBaader: ['30920820'], sap: ['3300012371'], confianza: 'alta', tornilleria: true },
  ],
  diagnostico: [
    {
      falla: 'Gaping en la mitad del filete, a lo largo',
      seccionApp: 'ts-gay-ping-filete',
      chequeos: [
        { texto: 'Filo del cuchillo de punta' },
        { texto: 'Altura de trabajo del cuchillo de punta' },
        { texto: 'Nivelación del cuchillo de punta, si el defecto sale de un solo lado' },
        { texto: 'Altura de trabajo del cuchillo rascador' },
        { texto: 'Abertura de los cuchillos rascadores' },
      ],
      fuente: PLANTA(25),
    },
  ],
  didactico: {
    porQue: { texto: 'Los rascadores trabajan en la zona de las ijadas y retiran sus espinas. La abertura «g» y la altura deciden cuánto toman; por eso planta revisa las dos cuando el filete sale con gaping a lo largo.', dibujoId: 'planta-p18', fuente: V4(52) },
    notaAuditoria: 'Abertura para salmón: la V4 da 14 mm para «g» (pág. 37) y planta pide 17-18 mm (pág. 17). La V4 asigna 18 mm a yellowtail y a la máquina combinada yellowtail/perca-salmón (Noruega); el valor de planta se acerca a ese, pero ningún manual dice que la máquina de la planta sea la combinada. Hay que confirmar cuál rige. La tabla «g» no trae valores para trucha ni para pescado blanco. Planta mide la abertura con referencia en las guías superiores de espinas y la V4 entre los filos; no son la misma referencia. El texto de planta de la pág. 15 no da cota, pero su dibujo A marca 4 mm bajo la guía (ver la sección de altura de trabajo).',
  },
}

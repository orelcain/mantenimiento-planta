import { FUENTES, PLANTA, V4, SALMON_INCLUYE, BLANCO_INCLUYE, type SeccionTerreno } from '../baader200TerrenoTipos'

// Sección 7 · Medidas de cuchillos (distancia ventrales-dorsales). Fuentes: V4 pág. 15 (medida «c») + planta pág. 10.
// Posiciones = dibujo 17 del V4 (tornillos 4·5, cojinetes 6·7). En el dibujo 20 la dorsal es la pos. 1 y la ventral la pos. 2.
export const seccion: SeccionTerreno = {
  id: 'medidas-cuchillos',
  orden: 7,
  titulo: 'Medidas de cuchillos',
  zona: 'Corte ventral y dorsal',
  medidaPrincipal: {
    clave: 'c',
    nombre: 'Distancia entre cuchillos ventrales y dorsales «c»',
    unidad: 'mm',
    porEspecie: [
      { especie: 'salmon', etiqueta: 'Salmón', valor: '13', incluye: SALMON_INCLUYE },
      { especie: 'trucha', etiqueta: 'Trucha', valor: '7' },
      { especie: 'blanco', etiqueta: 'Pescado blanco', valor: '15', incluye: BLANCO_INCLUYE },
    ],
    valorPlanta: { valor: '12', fuente: PLANTA(10) },
    pos: ['4', '5'],
    ajusteCon: 'tornillos de tope',
    fuente: V4(15),
  },
  medidas: [
    { clave: 'diametro', nombre: 'Diámetro de cuchilla para el que vale «c»', valores: ['200'], unidad: 'mm', fuente: V4(15) },
    { clave: 'c-planta', nombre: 'Tabla «c» del manual de planta (salmón, trucha, pescado blanco)', valores: ['12', '7', '15'], unidad: 'mm', pos: ['4', '5'], fuente: PLANTA(10) },
  ],
  pasos: [
    { texto: 'Con la máquina en posición de reposo, ajustar la distancia «c» con los tornillos de tope (pos. 4·5), sobre los que descansan los cuerpos de cojinete de las dorsales (pos. 6·7).', pos: ['4', '5', '6', '7'], medida: 'c', fuente: V4(15) },
    { texto: 'Verificar que los filos de las dorsales queden exactamente encima de los filos de las ventrales (dib. 20).', fuente: V4(15) },
    { texto: 'Método de planta: verificar los 12 mm entre ventrales y dorsales de forma rutinaria y siempre después de montar cuchillos nuevos, para que no rocen las chapaletas de la 2.ª alimentación.', pos: ['4', '5'], medida: 'c-planta', fuente: PLANTA(10) },
    { texto: 'Después de montar cuchillos nuevos: dejarlos a la medida patrón de 12 mm entre sí y rehacer el ajuste con las guías flotantes, con las guías frontales y, si hace falta, con la guía superior.', fuente: PLANTA(36) },
  ],
  advertencias: [
    { texto: 'Los valores de «c» del V4 valen para cuchillas circulares de 200 mm de diámetro.', tipo: 'atencion', fuente: V4(15) },
    { texto: 'Con cuchillos nuevos, revisar que no rocen las chapaletas de la 2.ª alimentación.', tipo: 'atencion', fuente: PLANTA(10) },
  ],
  dibujos: [
    { id: 'v4-dib20', url: FUENTES.v4.urlPagina(15), titulo: 'Dibujo 20 · dorsal (pos. 1) sobre ventral (pos. 2) y medida «c»', recorte: { x: 38, y: 9, w: 56, h: 55 }, hotspots: [{ pos: '1', x: 21.3, y: 35.3 }, { pos: '2', x: 19.8, y: 57.0 }], fuente: V4(15) },
    { id: 'planta-p10', url: FUENTES.planta.urlPagina(10), titulo: 'Esquema y tabla «c» del manual de planta', recorte: { x: 24, y: 18, w: 51, h: 30 }, hotspots: [], fuente: PLANTA(10) },
    { id: 'v4-dib17', url: FUENTES.v4.urlPagina(13), titulo: 'Dibujo 17 · tornillos de tope (pos. 4·5) y cuerpos de cojinete (pos. 6·7)', recorte: { x: 12, y: 24, w: 80, h: 37 }, hotspots: [{ pos: '2', x: 3.3, y: 52.5 }, { pos: '3', x: 6.6, y: 57.4 }, { pos: '4', x: 33.2, y: 55.5 }, { pos: '6', x: 37.3, y: 53.2 }, { pos: '1', x: 46.8, y: 59.0 }, { pos: '7', x: 56.0, y: 53.5 }, { pos: '5', x: 62.7, y: 56.0 }, { pos: '3', x: 87.3, y: 55.2 }, { pos: '2', x: 91.2, y: 51.0 }], fuente: V4(13) },
  ],
  leyenda: [
    { pos: ['4', '5'], nombre: 'Tornillo hexagonal de tope (apoyo de los cojinetes)', codigoBaader: ['30811040'], confianza: 'media', tornilleria: true },
    { pos: ['6'], nombre: 'Cuerpo de cojinete izquierdo', codigoBaader: ['513787'], confianza: 'alta' },
    { pos: ['7'], nombre: 'Cuerpo de cojinete derecho', codigoBaader: ['513817'], confianza: 'alta' },
    { pos: [], nombre: 'Cuchilla circular 200 mm (ventral y dorsal)', codigoBaader: ['94011760'], sap: ['3300106403'], confianza: 'alta' },
  ],
  diagnostico: [
    {
      falla: 'Gaping en la zona de la cola, bajo el esquelón / aleta anal',
      seccionApp: 'ts-gay-ping-cola',
      chequeos: [
        { texto: 'Separación entre cuchillos ventrales y dorsales, máximo', valor: '12', unidad: 'mm' },
        { texto: 'Diámetro de los cuchillos ventrales, lo más cercano a', valor: '200', unidad: 'mm' },
        { texto: 'Filo en excelente estado' },
      ],
      fuente: PLANTA(30),
    },
  ],
  didactico: {
    notaAuditoria: 'Medida «c» para salmón: el V4 dice 13 mm con cuchillas de 200 mm; la tabla del manual de planta (pág. 10) tiene 12 mm escrito a mano sobre la tabla original, y la planta repite los 12 mm como máximo en el troubleshooting (pág. 30). Trucha (7 mm) y pescado blanco (15 mm) coinciden en ambos. La planta no dice para qué diámetro de cuchilla vale su 12. Confirmar cuál se usa hoy para salmón.',
  },
}

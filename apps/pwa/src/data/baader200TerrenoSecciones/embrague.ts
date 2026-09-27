import { FUENTES, PLANTA, type SeccionTerreno } from '../baader200TerrenoTipos'

// Sección «embrague» · solo manual de planta (pág. 21). La V4 no tiene sección de embrague.
// Convención de `pos`: 'figura.posición' del dibujo de planta (p. ej. 'b.1' = fig. b, pos. 1).
export const seccion: SeccionTerreno = {
  id: 'embrague',
  orden: 14,
  titulo: 'Embrague',
  zona: 'Transmisión',
  medidas: [
    { clave: 'perfil', nombre: 'Perfil para hacer palanca (30 × 30, largo 130)', valores: ['30 × 30 × 130'], unidad: 'mm', fuente: PLANTA(21) },
    { clave: 'giro', nombre: 'Giro del eje hasta el otro canal chavetero (media vuelta)', valores: ['180'], unidad: '°', fuente: PLANTA(21) },
  ],
  pasos: [
    { texto: 'Antes de reajustar, confirmar que el bloqueo no tiene causa justificada: que no haya un pescado u otro elemento interpuesto en el accionamiento.', fuente: PLANTA(21) },
    { texto: 'Dejar en posición vertical el perno Parker M8 que hace de seguro (fig. a, pos. 1). A su izquierda queda un hilo M8 libre.', pos: ['a.1'], fuente: PLANTA(21) },
    { texto: 'Colocar en ese hilo un perno hexagonal M8 (fig. b, pos. 1) y, para hacer la palanca, un perfil de 30 × 30 × 130 mm.', pos: ['b.1'], medida: 'perfil', fuente: PLANTA(21) },
    { texto: 'Sacar el perno Parker.', pos: ['a.1'], fuente: PLANTA(21) },
    { texto: 'Girar con el volante en el sentido de las manecillas del reloj.', fuente: PLANTA(21) },
    { texto: 'Girar el eje 180° (media vuelta) hasta que aparezca el otro canal chavetero y volver a colocar el prisionero.', medida: 'giro', fuente: PLANTA(21) },
  ],
  advertencias: [
    { texto: 'Este reajuste es solo para bloqueos sin causa visible. Si hay pescado u otro elemento trabando el accionamiento, retirarlo primero.', tipo: 'atencion', fuente: PLANTA(21) },
  ],
  dibujos: [
    { id: 'planta-p21', url: FUENTES.planta.urlPagina(21), titulo: 'Esquema de planta · embrague, figuras a, b y c', recorte: { x: 11, y: 23, w: 34, h: 61 }, hotspots: [{ pos: 'a.1', x: 14.3, y: 19.7 }, { pos: 'b.1', x: 9.2, y: 38.0 }, { pos: 'b.2', x: 9.5, y: 54.0 }, { pos: 'c.1', x: 12.7, y: 72.7 }, { pos: 'c.2', x: 51.2, y: 74.2 }], fuente: PLANTA(21) },
  ],
  leyenda: [
    { pos: ['a.1'], nombre: 'Perno Parker M8 (seguro / prisionero)', codigoBaader: [], confianza: 'media', tornilleria: true, revisar: 'Sin cruce con el catálogo Baader. Posición leída del dibujo a; el texto no la numera.' },
    { pos: ['b.1'], nombre: 'Perno hexagonal M8 usado como palanca', codigoBaader: [], confianza: 'media', tornilleria: true, revisar: 'Herramienta de ajuste, no pieza de la máquina. Sin cruce con el catálogo Baader.' },
  ],
  diagnostico: [
    {
      falla: 'La máquina se bloquea sin causa visible',
      chequeos: [
        { texto: 'Que no haya pescado u otro elemento interpuesto en el accionamiento' },
        { texto: 'Si no lo hay, reajustar el embrague' },
      ],
      fuente: PLANTA(21),
    },
  ],
  didactico: {
    notaAuditoria: 'Solo el manual de planta cubre el embrague; la V4 no tiene sección. El texto no menciona el bloqueo de energía antes de girar el volante: confirmar el procedimiento de bloqueo vigente antes de usar esta ficha. Tampoco dice qué pieza se gira media vuelta respecto a cuál; el paso se transcribe tal como está.',
  },
}

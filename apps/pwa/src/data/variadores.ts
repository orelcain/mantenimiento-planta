/**
 * variadores — Catálogo de variadores de frecuencia y partidores suaves de planta.
 *
 * Para qué: cuando se quema un variador y hay que poner otro (del mismo modelo o
 * de otro), esto dice qué parámetros espera cada familia y en qué menú están, sin
 * tener que buscar el manual.
 *
 * Fuente de cada dato: el manual oficial de cada equipo, descargado a
 * `⚙️ EQUIPOS PLANTA/VARIADORES/_MANUALES/` en OneDrive. Los rangos y ajustes de
 * fábrica son textuales — no estimados. Lo que dice «según calibre» es la notación
 * ExpressionLimit de Danfoss / «según calibre» de Schneider: el valor depende del
 * tamaño del equipo y se resuelve con la referencia comercial de la unidad instalada.
 *
 * Levantamiento de terreno y trazabilidad completa:
 * `ARIA_MANTENIMIENTO_PLANTA/docs/INVENTARIO_VARIADORES.md`
 */

/** Estado del contenido de una ficha. */
export type EstadoFicha = 'listo' | 'parcial' | 'bloqueado'

/** Una fila de parámetro dentro de un menú. */
export interface ParametroVariador {
  /** Código tal cual aparece en el equipo: `nCr`, `1-24`, `P-08`… */
  codigo: string
  descripcion: string
  /** Rango de ajuste textual del manual. `—` si el manual no lo tabula. */
  rango: string
  /** Ajuste de fábrica textual del manual. */
  fabrica: string
  /** true si el valor lo dicta la placa del motor (lo que hay que levantar en terreno). */
  dePlaca?: boolean
  /** Advertencia o contexto que evita un error real en terreno. */
  nota?: string
}

export interface FichaVariador {
  id: string
  nombre: string
  tipo: string
  /** En qué equipos de planta está instalado. */
  donde: string
  estado: EstadoFicha
  /** De qué manual salieron los datos. */
  fuente: string
  /** Advertencia de cabecera: lo que hay que saber ANTES de tocar el equipo. */
  aviso?: string
  /** Se ajusta con potenciómetros, no con teclado (ABB PSR). */
  perillas?: boolean
  /** Resumen corto para la tarjeta cuando no hay parámetros tabulados. */
  resumen?: string
  menus?: Record<string, ParametroVariador[]>
}

/** Atajo para no repetir `codigo:`/`descripcion:` en 157 filas. */
const p = (
  codigo: string,
  descripcion: string,
  rango: string,
  fabrica: string,
  dePlaca = false,
  nota?: string,
): ParametroVariador => ({ codigo, descripcion, rango, fabrica, dePlaca, nota })

export const VARIADORES: FichaVariador[] = [
  {
    id: 'atv312',
    nombre: 'Schneider Altivar 312',
    tipo: 'VFD con teclado',
    donde: 'Cinta alimentadora Baader 142 · desangrador · tablero de bombas SIHI',
    estado: 'listo',
    fuente: 'Guía de programación ATV312 · BBV46387 v04 · Schneider (español).',
    aviso:
      'Calibre confirmado en terreno: ATV312HU30N4 — 3 kW, 380-500 V trifásico. Con esa referencia se resuelven los rangos que dicen «según calibre» para esa unidad.',
    menus: {
      'drC- Control motor': [
        p('bFr', 'Frec. estándar motor', '50 / 60 Hz', '50 Hz IEC'),
        p('UnS', 'Tensión nom. motor', 'N4: 100 a 500 V', 'según calibre', true,
          'La planta es 380 V. El manual dice que cuando la tensión de línea es MENOR que la nominal del motor, UnS va con la tensión de línea. O sea 380, aunque la placa del motor diga 400.'),
        p('FrS', 'Frec. nom. motor', '10 a 500 Hz', '50 Hz', true),
        p('nCr', 'Int. nominal motor', '0,25 a 1,5 In', 'según calibre', true),
        p('nSP', 'Vel. nominal motor', '0 a 32760 rpm', 'según calibre', true),
        p('COS', 'Motor 1 cos fi', '0,5 a 1', 'según calibre', true),
        p('rSC', 'Res. estátor sinc.', 'NO / InIt', 'NO'),
        p('tUn', 'Autoajuste', '—', 'NO'),
        p('UFt', 'U/f mot 1 selecc.', 'L / P / n / nLd', 'n'),
      ],
      'SEt- Ajustes': [
        p('ACC', 'Rampa aceleración', 'según Inr', '3 s'),
        p('dEC', 'Rampa deceleración', 'según Inr', '3 s'),
        p('LSP', 'Velocidad mínima', '0 a HSP', '0'),
        p('HSP', 'Velocidad máxima', 'LSP a tFr', 'bFr'),
        p('ItH', 'I térmica motor', '0,2 a 1,5 In', 'según calibre', true),
        p('UFr', 'Compensación RI', '0 a 100 %', '20 %'),
        p('FLG', 'Ganancia velocidad', '1 a 100 %', '20 %'),
        p('SLP', 'Compens. deslizamiento', '0 a 150 %', '100 %'),
      ],
      'I-O- Mando': [
        p('tCC', 'Control 2/3 hilos', '2C / 3C / LOC', '2C · 2 hilos', false,
          'Selector mantenido = 2 hilos (2C). Botonera de pulsadores = 3 hilos (3C). PELIGRO del manual: al cambiar tCC, los parámetros tCt, rrS y TODAS las funciones de entradas lógicas vuelven a fábrica.'),
        p('tCt', 'Tipo de control 2 hilos', 'LEL / trn / PFO', 'trn · Transición', false,
          'trn exige un flanco para arrancar, «a fin de evitar un rearranque imprevisto tras una interrupción de la alimentación» (texto del manual). Con LEL y el selector en ON, la cinta arranca sola cuando vuelve la luz. El de fábrica es el seguro.'),
        p('Fr1', 'Canal de referencia 1', 'AI1 / AI2 / AI3 / consola', 'AI1'),
        p('rrS', 'Asignación marcha atrás', '—', '—'),
      ],
    },
  },
  {
    id: 'atv31',
    nombre: 'Schneider Altivar 31',
    tipo: 'VFD con teclado',
    donde: 'Cinta de la Fishken — por confirmar',
    estado: 'parcial',
    fuente: 'Guía de programación ATV31 · Schneider (español).',
    aviso:
      'El ATV312 es su sucesor directo y comparte la nomenclatura, pero verificá parámetro por parámetro antes de copiar una configuración de una generación a la otra.',
    menus: {
      'drC- Control motor': [
        p('bFr', 'Frec. estándar motor', '50 / 60 Hz', '50 Hz IEC'),
        p('UnS', 'Tensión nom. motor', 'según calibre', 'según calibre', true),
        p('FrS', 'Frec. nom. motor', '10 a 500 Hz', '50 Hz', true),
        p('nCr', 'Int. nominal motor', '0,25 a 1,5 In', 'según calibre', true),
        p('nSP', 'Vel. nominal motor', '0 a 32760 rpm', 'según calibre', true),
        p('COS', 'Motor 1 cos fi', '0,5 a 1', 'según calibre', true),
        p('tUn', 'Autoajuste', '—', 'NO'),
      ],
      'SEt- Ajustes': [
        p('ACC', 'Rampa aceleración', 'según Inr', '3 s'),
        p('dEC', 'Rampa deceleración', 'según Inr', '3 s'),
        p('LSP', 'Velocidad mínima', '0 a HSP', '0'),
        p('HSP', 'Velocidad máxima', 'LSP a tFr', 'bFr'),
        p('ItH', 'I térmica motor', '0,2 a 1,5 In', 'según calibre', true),
      ],
      'I-O- Mando': [
        p('tCC', 'Control 2/3 hilos', '2C / 3C / LOC', '2C · 2 hilos'),
        p('tCt', 'Tipo de control 2 hilos', 'LEL / trn / PFO', 'trn · Transición', false,
          'Verificar en el manual del ATV31 antes de copiar valores del 312.'),
        p('Fr1', 'Canal de referencia 1', 'AI1 / AI2 / AI3 / consola', 'AI1'),
      ],
    },
  },
  {
    id: 'danfoss-ad',
    nombre: 'Danfoss VLT AutomationDrive · FC 301/302',
    tipo: 'VFD con teclado',
    donde: 'Grader — 3 unidades (las grandes del tablero)',
    estado: 'listo',
    fuente:
      'Guía de programación VLT AutomationDrive FC 301/302 · MG33MJ05 · Danfoss (español). Comparte la numeración del Midi en los grupos 1-2x, 3-4x y 4-1x, pero tiene parámetros propios.',
    aviso:
      'Los rótulos a mano del tablero dicen «IF 2.», «…ader» y «Cinta 2». No confíes en ellos para identificar el equipo — en esta planta ya apareció un rótulo desactualizado (el ATV312 que decía CHILLER y hoy mueve otra cinta).',
    menus: {
      '0-5x Copia con LCP': [
        p('0-50', 'Copia con LCP', '1: VFD→LCP · 2: LCP→VFD · 3: LCP→VFD sin datos de placa', '—', false,
          'Entre AutomationDrive y AutomationDrive funciona. Hacia un Midi, NO.'),
        p('0-51', 'Copia de ajuste (Set-Up)', 'al ajuste deseado o a todos', '—'),
      ],
      '1-0x Principio de control': [
        p('1-00', 'Modo configuración', 'par constante / lazo cerrado…', '[0] Par constante'),
        p('1-01', 'Principio control motor', 'U/f · VVC+ · Flux', 'VVC+', false,
          'Es la diferencia grande contra el Midi: el AutomationDrive suma control Flux (vectorial). No se puede ajustar con el motor en marcha.'),
        p('1-02', 'Realimentación encoder motor', '—', '—', false,
          'Solo aplica si se usa Flux con encoder. En cintas normalmente no se usa.'),
      ],
      '1-2x Datos del motor': [
        p('1-20', 'Potencia motor [kW]', 'según calibre', 'según calibre', true),
        p('1-21', 'Potencia motor [CV]', 'según calibre', 'según calibre', true,
          'Existe en el AutomationDrive y no en el Midi. Se carga uno u otro, no los dos.'),
        p('1-22', 'Tensión motor', 'según calibre', 'según calibre', true,
          'La planta es 380 V: cargar la tensión de línea real, no los 400 V nominales de placa.'),
        p('1-23', 'Frecuencia motor', 'según calibre', 'según calibre', true),
        p('1-24', 'Intensidad motor', 'según calibre', 'según calibre', true),
        p('1-25', 'Veloc. nominal motor', 'según calibre', 'según calibre', true,
          'En la foto del tablero uno marca 1500 RPM — motor de 4 polos a 50 Hz.'),
        p('1-26', 'Par nominal continuo', 'según calibre', 'según calibre'),
        p('1-29', 'Adaptación automática del motor (AMA)', '—', '[0] No', false,
          'Cargar 1-20 a 1-25 correctamente ANTES de correr el AMA.'),
        p('1-30', 'Resistencia estator (Rs)', 'según calibre', 'según calibre'),
        p('1-39', 'Polos motor', 'según calibre', 'según calibre', true),
      ],
      '3-4x Rampa 1': [
        p('3-40', 'Rampa 1 tipo', 'Lineal / Rampa-S', '[0] Lineal'),
        p('3-41', 'Rampa 1 tiempo acel.', 'según calibre', 'según calibre'),
        p('3-42', 'Rampa 1 tiempo desacel.', 'según calibre', 'según calibre'),
        p('3-45', 'Rel. Rampa-S comienzo acel.', '—', '—'),
        p('3-46', 'Rel. Rampa-S final acel.', '0 a 100 %', '50 %'),
      ],
      '4-1x Límites': [
        p('4-10', 'Dirección veloc. motor', '—', 'según calibre'),
        p('4-11', 'Límite bajo veloc. motor [RPM]', '4-13 a 60000 rpm', 'según calibre'),
        p('4-12', 'Límite bajo veloc. motor [Hz]', 'según calibre', 'según calibre'),
        p('4-13', 'Límite alto veloc. motor [RPM]', 'según calibre', 'según calibre'),
        p('4-14', 'Límite alto veloc. motor [Hz]', 'según calibre', 'según calibre'),
        p('4-16', 'Modo motor límite de par', 'según calibre', 'según calibre'),
        p('4-17', 'Modo generador límite de par', 'según calibre', 'según calibre'),
        p('4-18', 'Límite de intensidad', 'según calibre', 'según calibre'),
        p('4-19', 'Frecuencia salida máx.', '—', '—'),
      ],
      '5-1x Mando · entradas digitales': [
        p('5-10', 'Terminal 18 entrada digital', '—', '—', false, 'Borne de marcha en el cableado típico.'),
        p('5-11', 'Terminal 19 entrada digital', '—', '—'),
        p('5-12', 'Terminal 27 entrada digital', '—', '—'),
        p('5-13', 'Terminal 29 entrada digital', '—', '—'),
      ],
    },
  },
  {
    id: 'danfoss-midi',
    nombre: 'Danfoss VLT Midi Drive · FC 280',
    tipo: 'VFD con teclado',
    donde: 'Grader — 1 unidad (la chica del tablero)',
    estado: 'listo',
    fuente:
      'Guía de programación Danfoss MG07C305 · serie FC 280. «Según calibre» es la notación ExpressionLimit del manual: el rango depende del tamaño del variador.',
    aviso:
      'En el mismo tablero del Grader hay 3 VLT AutomationDrive (ficha aparte). El clonado con LCP solo funciona ENTRE LA MISMA SERIE: no se puede copiar de un AutomationDrive a este Midi ni al revés, aunque estén uno al lado del otro.',
    menus: {
      '0-5x Copia con LCP': [
        p('0-50', 'Copia con LCP', '1: VFD→LCP · 2: LCP→VFD · 3: LCP→VFD sin datos de placa', '—', false,
          'La opción 3 sirve para el mismo modelo en otro motor: hereda mando, rampas y protecciones, y deja los datos de placa para recargar.'),
        p('0-51', 'Copia de ajuste (Set-Up)', 'al ajuste deseado o a todos', '—'),
      ],
      '1-2x Datos del motor': [
        p('1-20', 'Potencia motor [kW]', 'según calibre', 'según calibre', true),
        p('1-22', 'Tensión motor', 'según calibre', 'según calibre', true,
          'La planta es 380 V. Cargar la tensión de línea real, no los 400 V nominales de la placa.'),
        p('1-23', 'Frecuencia motor', 'según calibre', 'según calibre', true),
        p('1-24', 'Intensidad motor', 'según calibre', 'según calibre', true),
        p('1-25', 'Veloc. nominal motor', 'según calibre', 'según calibre', true),
        p('1-26', 'Par nominal continuo', 'según calibre', 'según calibre'),
        p('1-29', 'Adaptación automática del motor (AMA)', '—', '[0] No', false,
          'El manual pide cargar 1-20 a 1-25 correctamente ANTES de correr el AMA.'),
        p('1-39', 'Polos motor', 'según calibre', 'según calibre', true),
      ],
      '3-4x Rampa 1': [
        p('3-40', 'Rampa 1 tipo', 'Lineal / S', '[0] Lineal'),
        p('3-41', 'Rampa 1 tiempo acel.', 'según calibre', 'según calibre'),
        p('3-42', 'Rampa 1 tiempo desacel.', 'según calibre', 'según calibre'),
      ],
      '4-1x Límites': [
        p('4-12', 'Límite bajo veloc. motor [Hz]', 'según calibre', 'según calibre'),
        p('4-14', 'Límite alto veloc. motor [Hz]', 'según calibre', 'según calibre'),
        p('4-16', 'Modo motor límite de par', 'según calibre', 'según calibre'),
        p('4-18', 'Límite de intensidad', 'según calibre', 'según calibre'),
        p('4-19', 'Frecuencia de salida máx.', '—', '—'),
      ],
      '5-1x Mando · entradas digitales': [
        p('5-10', 'Terminal 18 entrada digital', '—', '—', false, 'Es el borne de marcha en el cableado típico.'),
        p('5-11', 'Terminal 19 entrada digital', '—', '—'),
        p('5-12', 'Terminal 27 entrada digital', '—', '—'),
        p('5-13', 'Terminal 29 entrada digital', '—', '—'),
      ],
    },
  },
  {
    id: 'v20',
    nombre: 'Siemens Sinamics V20',
    tipo: 'VFD con teclado',
    donde: 'Cinta cuello de cisnes · cinta transversal salida Baader 142',
    estado: 'listo',
    fuente:
      'Manual de operación Sinamics V20 (v20_OPI_es-SP). P0304, P0305, P0310, P0700 y P1000 verificados en el manual.',
    menus: {
      'P03xx Datos del motor': [
        p('P0304', 'Tensión nominal del motor', 'según calibre', 'según calibre', true,
          'La planta es 380 V, aunque la etiqueta del V20 diga «AC 400 V» (esa es su tensión de diseño). Revisar que P0304 esté cargado con la tensión de línea real.'),
        p('P0305', 'Corriente nominal del motor', 'según calibre', 'según calibre', true),
        p('P0307', 'Potencia nominal del motor', 'según calibre', 'según calibre', true),
        p('P0308', 'Coseno fi del motor', 'según calibre', 'según calibre', true),
        p('P0310', 'Frecuencia nominal del motor', 'según calibre', '50 Hz', true),
        p('P0311', 'Velocidad nominal del motor', 'según calibre', 'según calibre', true),
      ],
      'P07xx Mando': [
        p('P0700', 'Fuente de las señales de mando', '—', '—', false,
          'P0700 = 2 es mando por bornes: el caso del selector en el tablero.'),
        p('P0701', 'Función de la entrada digital 1', '—', '—'),
        p('P0702', 'Función de la entrada digital 2', '—', '—'),
        p('P1000', 'Fuente de la consigna de frecuencia', '—', '—'),
      ],
      'P10xx-P11xx Rampas y límites': [
        p('P1080', 'Frecuencia mínima', '—', '0 Hz'),
        p('P1082', 'Frecuencia máxima', '—', '50 Hz'),
        p('P1120', 'Tiempo de aceleración', '—', '10 s'),
        p('P1121', 'Tiempo de deceleración', '—', '10 s'),
      ],
    },
  },
  {
    id: 'ats22',
    nombre: 'Schneider Altistart 22',
    tipo: 'Partidor suave con display',
    donde: 'Bombas SIHI de repaso (planta principal) · bombas SIHI de riles',
    estado: 'listo',
    fuente: 'Manual del usuario Altistart 22 · BBV51332 v04 09/2015 · Schneider (español).',
    aviso:
      'El menú Protección (PrO) solo aparece si el Modo avanzado (LAC, menú ConF) está en On. Con LAC en oFF esos parámetros ni se ven.',
    menus: {
      'ConF Configuración': [
        p('IcL', 'Int. nominal del arrancador', '17 a 590 A · solo lectura', 'según capacidad', false,
          'Sale de la placa del ARRANCADOR, no del motor. Es el techo de todo lo demás.'),
        p('In', 'Int. nominal del motor', '0,4·IcL hasta IcL', 'según capacidad', true,
          'Conectado en línea: In = corriente de placa. Dentro del triángulo del motor: In = corriente de placa ÷ √3.'),
        p('dLtA', 'Tipo de conexión', 'LInE / dLt', 'LInE', false,
          'Solo el rango ATS22pppQ admite montaje dentro del triángulo, y ahí la red no puede pasar de 440 V.'),
        p('Uln', 'Tensión de alimentación', 'Q: 200 a 440 V · S6: 200 a 600 V', 'Q: 400 V · S6: 480 V', false,
          'Es la referencia de las protecciones de sobre y subtensión. Mal ajustada, dispara sin motivo.'),
        p('LAC', 'Modo avanzado', 'oFF / On', 'oFF'),
        p('Cod', 'Protección de parámetros', 'nLOC / LOC', 'nLOC'),
      ],
      'SEt Ajustes': [
        p('t90', 'Tensión inicial', '10 a 50 % (incrementos de 5)', '30 %', false,
          'Debe alcanzar para que el motor gire apenas se le aplica tensión.'),
        p('ILt', 'Limitación de intensidad', '200 a 700 % de In (máx. 350 % de IcL)', '350 %', false,
          'Si la aplicación pide más de 350 % de IcL, hay que sobredimensionar el arrancador.'),
        p('ACC', 'Tiempo de aceleración', '1 a 60 s', '10 s'),
        p('dEC', 'Tiempo de deceleración', 'FrEE, 1 a 60 s', 'FrEE'),
        p('EdC', 'Fin de deceleración', '0 a 10', '0', false, 'Inactivo cuando dLtA = dLt.'),
        p('tLS', 'Tiempo de arranque máximo', '1 a 250 s', '15 s', false,
          'Tiene que ser mayor que ACC, si no dispara StF en cada partida.'),
        p('tHP', 'Protección térmica del motor', 'clase IEC 10 / 20 / 30', '10', false,
          'Para que actúe hay que poner ItH en On o ErUn.'),
      ],
      'AdJ Avanzados': [
        p('Snb', 'Número de arranques', 'oFF, 1 a 10', 'oFF', false,
          'Limita arranques y paradas dentro del período SLG. Al superarlo dispara SnbF.'),
        p('SLG', 'Período de conteo', '—', '—'),
        p('bSt', 'Tiempo de boost', '—', '0'),
      ],
      'PrO Protección': [
        p('UId', 'Límite de subintensidad', 'oFF, 20 a 90 % de In', 'oFF', false, 'Dispara UCF.'),
        p('UIt', 'Retardo de subintensidad', '1 a 40 s', '10 s'),
        p('OId', 'Límite de sobreintensidad', '100 a 300 % de In', '200 %', false, 'Dispara OCF.'),
        p('OIt', 'Retardo de sobreintensidad', '0,0 a 5,0 s', '0,5 s'),
        p('USd', 'Límite de subtensión', '50 a 90 %', '70 %'),
        p('USt', 'Tiempo de límite de subtensión', '1 a 10', '5 s'),
        p('OSt', 'Retardo de límite de sobretensión', '1 a 10', '2 s'),
        p('PHL', 'Detección de pérdida de fase', '—', 'On'),
        p('PHr', 'Secuencia de fases', '—', 'oFF'),
        p('ItH', 'Protección de sobrecarga', '—', 'On', false,
          'Interruptor maestro de la protección térmica: sin esto, tHP no hace nada.'),
      ],
      'IO Mando · entradas lógicas': [
        p('LI2', 'Entrada lógica 2', '—', 'rUn · marcha', false,
          'Borne del selector de marcha. Regleta real: LI1 LI2 LI3 24V Com.'),
        p('LI3', 'Entrada lógica 3', '—', 'rSt · reset'),
        p('PTC', 'PTC1 / PTC2', '—', '—', false,
          'Bornes para el termistor del motor. Si el motor lo tiene, es protección térmica directa — mejor que estimarla por corriente.'),
        p('R1/R2', 'Relés de salida', '—', '—', false, 'Señalizan al tablero: marcha, fallo, bypass.'),
      ],
    },
  },
  {
    id: 'sew',
    nombre: 'SEW MOVITRAC LTE-B+',
    tipo: 'VFD con teclado',
    donde: 'Tablero de filete (6) · desplazadores de empaque · motores internos Baader 200',
    estado: 'listo',
    fuente:
      'Operating Instructions MOVITRAC LTE-B (SEW-EURODRIVE). Los equipos de planta son LTE-B+, la variante posterior: el juego de parámetros es el mismo, pero conviene verificar contra el manual del «+» antes de un cambio.',
    aviso:
      'En el tablero de filete hay un variador que mueve DOS cintas a la vez (desperdicio pimponeo + pimponeo), con un guardamotor en serie. Ahí P-08 no protege cada motor por separado — protege la suma. El guardamotor es la protección real de cada uno: no lo saques.',
    menus: {
      'P-07…P-10 Datos del motor': [
        p('P-07', 'Tensión nominal del motor', '0, 20 a 500 V', '400 V', true,
          'La planta es 380 V. Poner 0 desactiva la compensación de tensión.'),
        p('P-08', 'Corriente nominal del motor', '25 a 100 % de la corriente del variador', 'según motor DR', true,
          'Es también el nivel de protección por sobrecarga. En el variador que mueve dos cintas, este valor cubre la suma — por eso va el guardamotor.'),
        p('P-09', 'Frecuencia nominal del motor', '25 a 500 Hz', '50 Hz', true),
        p('P-10', 'Velocidad nominal del motor', '0 a 30000 rpm', '0', true,
          'Si se carga distinto de 0, todos los parámetros de velocidad pasan a mostrarse en rpm y se activa la compensación de deslizamiento.'),
        p('P-11', 'Refuerzo de tensión (boost)', '0 a 20 % de la tensión máx.', 'Tamaño 1: 20 % · Tamaño 2: 15 %', false,
          'Sube la tensión a baja velocidad para ayudar a partir con carga.'),
      ],
      'P-01…P-06 Velocidad y rampas': [
        p('P-01', 'Límite máximo de velocidad', 'P-02 a 5 × P-09 (máx. 500 Hz)', '50,0 Hz'),
        p('P-02', 'Límite mínimo de velocidad', '0 a P-01 (máx. 500 Hz)', '0,0 Hz'),
        p('P-03', 'Rampa de aceleración', '0,0 a 600 s', '5,0 s', false, 'Tiempo de 0 a 50 Hz.'),
        p('P-04', 'Rampa de deceleración', '0,0 a 600 s', '5,0 s', false,
          'De 50 Hz a parada. En 0 usa la rampa más rápida posible sin disparar.'),
        p('P-05', 'Modo de parada', '0 rampa · 1 inercia · 2 rampa rápida', '0 · rampa'),
        p('P-06', 'Optimizador de energía', '0 desactivado · 1 activado', '0', false,
          'Baja sola la tensión aplicada cuando el motor va descargado.'),
      ],
      'P-12…P-17 Mando y entradas': [
        p('P-12', 'Fuente de mando', 'terminal / teclado / fieldbus', 'terminal', false,
          'Es el equivalente al tCC de Schneider: define si manda el selector del tablero o el teclado.'),
        p('P-14', 'Código de acceso al menú extendido', '0 a 9999', '0', false,
          'Sin esto no se ven los parámetros avanzados — misma trampa que el LAC del Altistart 22.'),
        p('P-15', 'Función de las entradas digitales', '—', '0'),
        p('P-16', 'Formato de la entrada analógica', '0-10 V · 0-20 mA', '0-10 V'),
        p('P-17', 'Frecuencia de conmutación de salida', '2 a 16 kHz', '4 / 8 kHz', false,
          'Más alta = menos ruido audible del motor, más calentamiento del variador.'),
      ],
      'P-20…P-29 Velocidades fijas': [
        p('P-20', 'Velocidad preseleccionada 1', '−P-01 a P-01', '0,0 Hz'),
        p('P-21', 'Velocidad preseleccionada 2', '−P-01 a P-01', '0,0 Hz'),
        p('P-22', 'Velocidad preseleccionada 3', '−P-01 a P-01', '0,0 Hz'),
        p('P-23', 'Velocidad preseleccionada 4', '−P-01 a P-01', '0,0 Hz'),
        p('P-24', 'Rampa de deceleración rápida', '—', '—'),
        p('P-29', 'Ajuste de la curva V/f', '0 a P-09', '0 Hz'),
      ],
    },
  },
  {
    id: 'psr60',
    nombre: 'ABB PSR60-600-70',
    tipo: 'Partidor suave con perillas',
    donde: 'Sopladoras de vacío — 4 unidades: 1 por Baader 142 + 1 de respaldo',
    estado: 'listo',
    perillas: true,
    resumen: '3 potenciómetros · 60 A · 30 kW · 4 unidades',
    fuente:
      'Catálogo ABB 1SFC132005C0201 rev. I, sección «PSR – The compact range», y VERIFICADO contra el equipo físico: las escalas impresas en el frente (1–20 S · 0–20 S · 40–70 %) coinciden exactamente. Ojo: las gamas PSS, PSE y PST del mismo catálogo tienen valores distintos.',
  },
]

// ── Potenciómetros del ABB PSR60 ──────────────────────────────────────────────
// Rangos del catálogo ABB, confirmados contra las escalas impresas en el equipo.
export interface PotenciometroPSR {
  id: string
  nombre: string
  min: number
  max: number
  inicial: number
  unidad: string
  rango: string
}

export const POTENCIOMETROS_PSR: PotenciometroPSR[] = [
  { id: 'start', nombre: '1 · Start', min: 1, max: 20, inicial: 10, unidad: ' s', rango: '1 … 20 s' },
  { id: 'stop', nombre: '2 · Stop', min: 0, max: 20, inicial: 10, unidad: ' s', rango: '0 … 20 s' },
  { id: 'uini', nombre: '3 · U inicial', min: 40, max: 70, inicial: 40, unidad: ' %', rango: '40 … 70 %' },
]

/** Uini 40…70 % da Uend 30…60 % → son 10 puntos menos (catálogo ABB). */
export const tensionFinalPSR = (uini: number) => uini - 10

/** El escalón de bajada cae 2 % por cada segundo de rampa de parada (catálogo ABB). */
export const escalonBajadaPSR = (segundosParada: number) => 100 - 2 * segundosParada

// ── Motores de las cintas ─────────────────────────────────────────────────────
/**
 * Motorreductores Sumitomo Hyponic (serie RNYM, hipoidal de ángulo recto).
 * Formato: RNYM{potencia}-{tamaño}{variante}-{reducción}.
 *
 * Potencia y reducción salen del código, verificados contra el catálogo oficial
 * página por página (`SUMITOMO_Hyponic_catalogo.pdf`): 05 = 0,4 kW · 08 = 0,55 kW ·
 * 1 = 0,75 kW. La velocidad de salida es 1450 rpm (n1 a 50 Hz, 4 polos) ÷ reducción,
 * contrastada contra la tabla del propio catálogo.
 *
 * ⚠ Lo que el código NO da: tensión, corriente nominal, cos φ ni conexión Δ/Y.
 * El catálogo dice «Designate model and voltage and frequency when ordering» — la
 * tensión se define al pedir. La corriente es el dato más crítico porque fija la
 * protección térmica del variador, y esa NUNCA se estima: va leída de la placa.
 */
export interface MotorCinta {
  modelo: string
  potencia: string
  reduccion: string
  rpmSalida: string
  usos: string
  /** true si algún dato del modelo todavía no está confirmado. */
  porConfirmar?: boolean
}

export const MOTORES_CINTAS: MotorCinta[] = [
  {
    modelo: 'RNYM08-1320B-30',
    potencia: '0,55 kW',
    reduccion: '1 : 30',
    rpmSalida: '48,3 rpm',
    usos: 'Desperdicio Baader 200 · desperdicio filete · cinta filete · transversal Baader 142 · cinta curva · pimponeo',
  },
  {
    modelo: 'RNYM1-1320A-30',
    potencia: '0,75 kW',
    reduccion: '1 : 30',
    rpmSalida: '48,3 rpm',
    usos: 'Cinta Z elevadora HG',
  },
  {
    modelo: 'RNYM1-1320A-7',
    potencia: '0,75 kW',
    reduccion: '1 : 7',
    rpmSalida: '207 rpm',
    usos: 'Cinta alimentación Baader 142 — la única con reducción corta',
  },
  {
    modelo: 'RNYMS05-1320C-30',
    potencia: '0,4 kW',
    reduccion: '1 : 30',
    rpmSalida: '48,3 rpm',
    usos: 'Cinta alimentación GEA',
    porConfirmar: true,
  },
]

/** Datos eléctricos que solo salen de la placa física del motor. */
export const FALTAN_DE_PLACA = ['Tensión', 'Corriente', 'cos φ', 'Conexión Δ/Y'] as const

// ── Equivalencias entre marcas ────────────────────────────────────────────────
/**
 * El mismo dato, en el dialecto de cada fabricante. Es la tabla para el caso real:
 * se quemó un variador y el repuesto que hay a mano es de otra marca.
 *
 * Los huecos (`—`) son información, no falta de datos: **no todos los equipos piden
 * lo mismo**. El ATV312 no pide potencia del motor, pide corriente. Un partidor suave
 * no tiene frecuencia porque no sintetiza tensión. Ver la nota de cada fila.
 */
export interface EquivalenciaParametro {
  concepto: string
  /** Código en cada familia, o `null` si ese equipo no tiene ese parámetro. */
  codigos: Record<string, string | null>
  /** Por qué falta en algunos, o en qué se diferencia. */
  nota?: string
  dePlaca?: boolean
}

/** Columnas de la tabla de equivalencias, en orden. */
export const COLUMNAS_EQUIVALENCIA = [
  { id: 'atv', titulo: 'Altivar 31/312' },
  { id: 'danfoss', titulo: 'Danfoss VLT' },
  { id: 'v20', titulo: 'Sinamics V20' },
  { id: 'sew', titulo: 'SEW LTE-B+' },
  { id: 'ats22', titulo: 'Altistart 22' },
] as const

export const EQUIVALENCIAS: EquivalenciaParametro[] = [
  {
    concepto: 'Tensión nominal del motor',
    dePlaca: true,
    codigos: { atv: 'UnS', danfoss: '1-22', v20: 'P0304', sew: 'P-07', ats22: null },
    nota: 'El Altistart no lo pide: no sintetiza tensión, la rampa la hace sobre la red. Su Uln es la tensión de LÍNEA, que es otra cosa. Y ojo en todos: la planta es 380 V, no los 400 V nominales de placa.',
  },
  {
    concepto: 'Corriente nominal del motor',
    dePlaca: true,
    codigos: { atv: 'nCr', danfoss: '1-24', v20: 'P0305', sew: 'P-08', ats22: 'In' },
    nota: 'El dato más crítico: fija la protección térmica en los cinco. Nunca se estima. En el ATS22 dentro del triángulo va dividido por √3.',
  },
  {
    concepto: 'Frecuencia nominal del motor',
    dePlaca: true,
    codigos: { atv: 'FrS', danfoss: '1-23', v20: 'P0310', sew: 'P-09', ats22: null },
    nota: 'Un partidor suave no varía la frecuencia, por eso no la pide.',
  },
  {
    concepto: 'Velocidad nominal del motor',
    dePlaca: true,
    codigos: { atv: 'nSP', danfoss: '1-25', v20: 'P0311', sew: 'P-10', ats22: null },
    nota: 'En el SEW, cargarla distinta de 0 cambia toda la interfaz a rpm y activa la compensación de deslizamiento.',
  },
  {
    concepto: 'Potencia nominal del motor',
    dePlaca: true,
    codigos: { atv: null, danfoss: '1-20', v20: 'P0307', sew: null, ats22: null },
    nota: 'El Altivar y el SEW no la piden: se conforman con corriente, tensión y frecuencia. No es un olvido, es su forma de trabajar.',
  },
  {
    concepto: 'cos φ del motor',
    dePlaca: true,
    codigos: { atv: 'COS', danfoss: null, v20: 'P0308', sew: null, ats22: null },
  },
  {
    concepto: 'Rampa de aceleración',
    codigos: { atv: 'ACC', danfoss: '3-41', v20: 'P1120', sew: 'P-03', ats22: 'ACC' },
    nota: 'Mismo nombre, distinto significado: en los variadores es rampa de FRECUENCIA; en el Altistart 22 es rampa de TENSIÓN. No copiar el valor de uno a otro.',
  },
  {
    concepto: 'Rampa de deceleración',
    codigos: { atv: 'dEC', danfoss: '3-42', v20: 'P1121', sew: 'P-04', ats22: 'dEC' },
  },
  {
    concepto: 'Velocidad / frecuencia mínima',
    codigos: { atv: 'LSP', danfoss: '4-12', v20: 'P1080', sew: 'P-02', ats22: null },
  },
  {
    concepto: 'Velocidad / frecuencia máxima',
    codigos: { atv: 'HSP', danfoss: '4-14', v20: 'P1082', sew: 'P-01', ats22: null },
  },
  {
    concepto: 'Límite de intensidad',
    codigos: { atv: 'ItH', danfoss: '4-18', v20: null, sew: null, ats22: 'ILt' },
    nota: 'En el SEW no hay parámetro aparte: el propio P-08 hace de nivel de sobrecarga.',
  },
  {
    concepto: 'Protección térmica del motor',
    codigos: { atv: 'ItH', danfoss: '1-90', v20: 'P0610', sew: 'P-08', ats22: 'tHP + ItH' },
    nota: 'Dos trampas distintas. En el Altistart son DOS parámetros: tHP fija la clase y ItH es el interruptor maestro — con ItH apagado, tHP no hace nada. En el Siemens, P0610 = 0 significa «solo aviso, sin reacción»: el variador avisa y sigue andando. Vale revisar cómo quedó cargado.',
  },
  {
    concepto: 'Fuente de mando (selector / botonera)',
    codigos: { atv: 'tCC + tCt', danfoss: '5-10…5-13', v20: 'P0700', sew: 'P-12', ats22: 'LI2' },
    nota: 'El bloque que no está en ninguna placa. En el Altivar, tCt decide si la cinta arranca sola al volver la luz.',
  },
  {
    concepto: 'Autoajuste al motor',
    codigos: { atv: 'tUn', danfoss: '1-29 (AMA)', v20: null, sew: null, ats22: null },
    nota: 'Correr SIEMPRE después de cargar los datos de placa, nunca antes.',
  },
  {
    concepto: 'Acceso al menú avanzado',
    codigos: { atv: null, danfoss: null, v20: null, sew: 'P-14', ats22: 'LAC' },
    nota: 'La trampa compartida de SEW y Altistart: si no se habilita, la mitad de los parámetros ni aparecen y parece que el equipo no los tuviera.',
  },
  {
    concepto: 'Copiar configuración a otro equipo',
    codigos: { atv: null, danfoss: '0-50 / 0-51', v20: null, sew: null, ats22: null },
    nota: 'Solo Danfoss lo resuelve con la consola LCP, y únicamente entre equipos de la MISMA serie.',
  },
]

/** Total de parámetros catalogados — para el contador del hub. */
export const TOTAL_PARAMETROS = VARIADORES.reduce(
  (acc, f) => acc + Object.values(f.menus ?? {}).reduce((n, filas) => n + filas.length, 0),
  0,
)

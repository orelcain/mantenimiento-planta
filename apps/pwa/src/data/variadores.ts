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

/**
 * Una opción de un parámetro enumerado, con el criterio para elegirla.
 * El manual lista las opciones pero rara vez dice CUÁNDO usar cada una; ese
 * criterio es lo que convierte la lista en algo accionable.
 */
export interface OpcionParametro {
  /** Valor tal cual aparece en el equipo. */
  valor: string
  /** Qué hace. */
  que: string
  /** Cuándo elegirla. */
  cuando?: string
  /** Solo visible con cierto nivel de acceso u otra condición. */
  requiere?: string
}

/**
 * Una falla del equipo: qué muestra el display, por qué pasa y qué hacer.
 * Es el caso de uso más frecuente — más que el cambio de variador.
 */
export interface FallaVariador {
  /** Código en el display. */
  codigo: string
  /** Nombre de la falla según el manual (unificado a «falla», uso chileno). */
  nombre: string
  causas: string[]
  soluciones: string[]
}

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
  /** Para parámetros enumerados: qué significa cada opción y cuándo elegirla. */
  opciones?: OpcionParametro[]
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
  /** Códigos de falla del display, con causa probable y qué hacer. */
  fallas?: FallaVariador[]
}

/** Atajo para las filas de falla. */
const falla = (
  codigo: string,
  nombre: string,
  causas: string[],
  soluciones: string[],
): FallaVariador => ({ codigo, nombre, causas, soluciones })

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
      'Calibre confirmado en terreno: ATV312HU30N4 — 3 kW, 380-500 V trifásico. Primera receta completa — DESANGRADOR: motor SEW KA87R57DRN100L4, 3 kW · 380 V en estrella · 6,8 A · 1456 rpm · cos φ 0,76 (placa del 17-10-2024, grupo Levantamiento). O sea: UnS 380 · FrS 50 · nCr 6,8 · nSP 1456 · COS 0,76 · ItH 6,8.',
    menus: {
      'rEF- Referencia de velocidad': [
        p('LFr', 'Referencia de frecuencia por consola', '0 a 500 Hz', '—', false,
          'Solo aparece si el control por consola está activado. No hace falta pulsar ENT para validar el cambio.'),
        p('AIV1', 'Imagen de la entrada AIV1', '0 a 100 %', '—', false,
          'Es la rueda del propio variador actuando como potenciómetro. El mismo AIV1 aparece como opción de Fr1 en el menú CtL-: allá se ELIGE que la rueda mande, acá se ve y se mueve su valor.'),
        p('FrH', 'Referencia de frecuencia aplicada', 'de LSP a HSP', 'lectura', false,
          'Solo lectura. Muestra la consigna que le llega al motor sea cual sea el canal elegido — sirve para saber si el problema es la señal o el variador.'),
      ],
      'drC- Control motor': [
        p('FCS', 'Restaurar configuración', 'nO / rECI / InI', 'nO', false,
          'Paso 0 con un variador USADO: InI vuelve todo a fábrica (mantener ENT 2 s). Un repuesto con pasado puede traer cargado cualquiera de los ~200 parámetros que esta ficha no tabula — fábrica + esta ficha = estado conocido. PELIGRO del manual: verificar que el cambio sea compatible con el cableado.'),
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
        p('CL1', 'Limitación de intensidad', '0,25 a 1,5 In', '1,5 In', false,
          'No confundir con ItH: CL1 limita el par y el calentamiento en el momento; ItH es la protección térmica acumulada.'),
        p('UFr', 'Compensación RI', '0 a 100 %', '20 %'),
        p('FLG', 'Ganancia velocidad', '1 a 100 %', '20 %'),
        p('SLP', 'Compens. deslizamiento', '0 a 150 %', '100 %'),
      ],
      'I-O- Entradas / Salidas': [
        p('tCC', 'Control 2/3 hilos', '2C / 3C / LOC', '2C · 2 hilos', false,
          'Selector mantenido = 2 hilos (2C). Botonera de pulsadores = 3 hilos (3C). PELIGRO del manual: al cambiar tCC, los parámetros tCt, rrS y TODAS las funciones de entradas lógicas vuelven a fábrica.'),
        p('tCt', 'Tipo de control 2 hilos', 'LEL / trn / PFO', 'trn · Transición', false,
          'trn exige un flanco para arrancar, «a fin de evitar un rearranque imprevisto tras una interrupción de la alimentación» (texto del manual). Con LEL y el selector en ON, la cinta arranca sola cuando vuelve la luz. El de fábrica es el seguro.'),
        p('rrS', 'Asignación marcha atrás', 'LI2 / LI3 / LI4 / nO', 'LI2'),
        p('CrL3', 'Valor mínimo AI3', '0 a 20 mA', '4 mA', false,
          'AI3 es la entrada de corriente: dejarla en 4 mA habilita la detección de cable cortado (fallo LFF).'),
        p('CrH3', 'Valor máximo AI3', '4 a 20 mA', '20 mA'),
        p('r1', 'Asignación del relé R1', 'FLt / rUn / FtA…', 'FLt · variador en fallo', false,
          'De fábrica el contacto se ABRE cuando hay fallo o cuando el variador queda sin tensión — así el tablero se entera aunque se corte la alimentación.'),
        p('r2', 'Asignación del relé R2', 'nO / FLt / rUn…', 'nO'),
        p('dO', 'Salida analógica / lógica', '—', 'nO'),
        p('AO1t', 'Configuración de AO1', '0-20 mA / 4-20 mA / 0-10 V', '0-20 mA'),
        p('SCS', 'Guardar configuración', 'nO / StrI', 'nO', false,
          'Guarda la config actual en el propio variador. Hacerlo DESPUÉS de dejar la cinta andando bien: es el respaldo al que vuelve FCS.'),
        p('CFG', 'Macroconfiguración', 'Std / …', 'Std'),
        p('FCS', 'Restaurar configuración', 'nO / rECI / InI', 'nO', false,
          'InI vuelve a fábrica; rECI recupera lo guardado con SCS.'),
      ],
      'CtL- Control': [
        {
          codigo: 'Fr1',
          descripcion: 'Canal de referencia 1',
          rango: 'AI1 / AI2 / AI3 / AIV1 / …',
          fabrica: 'AI1',
          nota: 'De dónde sale la CONSIGNA de velocidad. Es distinto del mando (tCC): tCC dice quién arranca, Fr1 dice quién fija la frecuencia.',
          opciones: [
            { valor: 'AI1', que: 'Entrada analógica AI1', cuando: 'Lo normal en planta: un potenciómetro en la puerta del tablero o una señal 0-10 V del PLC.' },
            { valor: 'AI2', que: 'Entrada analógica AI2', cuando: 'Cuando AI1 ya está ocupada, o si la señal viene en ±10 V.' },
            { valor: 'AI3', que: 'Entrada analógica AI3', cuando: 'Es la entrada de 4-20 mA: úsala si la señal viene en corriente. Ventaja real: si se corta el cable el variador lo detecta (fallo LFF), cosa que en 0-10 V no pasa.' },
            { valor: 'AIV1', que: 'La rueda del propio variador actúa como potenciómetro', cuando: 'Para probar en el banco o mover la cinta sin señal externa. No dejarla así en producción.' },
            { valor: 'UPdt', que: 'Consigna +velocidad / −velocidad por entradas lógicas', cuando: 'Si el operador sube y baja con dos pulsadores en vez de un potenciómetro.', requiere: 'Nivel de acceso L2 o L3' },
            { valor: 'UPdH', que: 'Consigna +velocidad / −velocidad girando la rueda', requiere: 'Nivel de acceso L2 o L3' },
            { valor: 'LCC', que: 'Consigna desde el terminal remoto', requiere: 'Nivel de acceso L3' },
            { valor: 'Mdb', que: 'Consigna por Modbus', cuando: 'Cuando manda un PLC por red.', requiere: 'Nivel de acceso L3' },
            { valor: 'nEt', que: 'Consigna por tarjeta de red', requiere: 'Nivel de acceso L3' },
          ],
        },
        p('Fr2', 'Canal de referencia 2', 'AI1 / AI2 / AI3 / …', 'nO', false,
          'La segunda fuente de consigna, para conmutar entre dos (ej. potenciómetro local / PLC).'),
        p('rFC', 'Conmutación de referencia', 'Fr1 / Fr2 / LI…', 'Fr1', false,
          'Qué decide cuál de las dos referencias manda.'),
        p('Cd1', 'Canal de control 1', 'tEr / LCC / Mdb / nEt', 'tEr · bornero', false,
          'De dónde vienen las ÓRDENES (marcha/paro). No confundir con Fr1, que es de dónde viene la velocidad.'),
        p('Cd2', 'Canal de control 2', 'tEr / LCC / Mdb / nEt', 'LCC'),
        p('CCS', 'Conmutación de canal de control', 'Cd1 / Cd2 / LI…', 'Cd1'),
        p('CHCF', 'Perfil', 'SIM / SEP / IO', 'SIM · canales no separados', false,
          'SIM: el mismo canal manda órdenes y consigna. SEP los separa.'),
        p('FLO', 'Asignación de forzado local', '—', 'nO'),
        p('FLOC', 'Canal de forzado local', 'AI1 / …', 'AI1'),
        p('LAC', 'Nivel de acceso', 'L1 / L2 / L3', 'L1', false,
          'Igual que el LAC del Altistart: en L1 no se ven los parámetros avanzados y parece que el equipo no los tuviera.'),
      ],
      'FLt- Gestión de fallos': [
        p('Atr', 'Rearranque automático', 'nO / YES', 'nO', false,
          'PELIGRO en una cinta: con YES el equipo rearranca solo tras un fallo. Dejar en nO salvo que haya una razón muy clara y el acceso esté enclavado.'),
        p('OPL', 'Pérdida de fase del motor', 'YES / nO / OAC', 'YES', false,
          'Con contactor aguas abajo del variador hay que ponerlo en OAC, si no dispara OPF cada vez que abre.'),
        p('IPL', 'Pérdida de fase de red', 'YES / nO', 'YES'),
        p('tnL', 'Gestión del fallo de autoajuste', 'YES / nO', 'YES', false,
          'Es lo que hace aparecer el fallo tnF cuando el autoajuste no cuadra.'),
        p('OLL', 'Gestión de sobrecarga del motor', 'nO / YES / …', 'YES'),
        p('OHL', 'Gestión de sobretemperatura del variador', 'nO / YES / …', 'YES'),
        p('EtF', 'Asignación de fallo externo', 'LI / nO', 'nO'),
        p('LEt', 'Configuración del fallo externo', '—', '—'),
        p('drn', 'Marcha degradada', 'nO / YES', 'nO'),
        p('rSF', 'Borrar fallos', 'LI / nO', 'nO'),
      ],
      'SUP- Supervisión (solo lectura)': [
        p('rFr', 'Frecuencia de salida', 'Hz', 'lectura', false,
          'La frecuencia real que está recibiendo el motor. Es el primer número a mirar cuando la cinta va lenta.'),
        p('LCr', 'Intensidad del motor', 'A', 'lectura', false,
          'Compararla con nCr dice si la cinta está forzando: es diagnóstico gratis antes de que dispare OLF.'),
        p('Opr', 'Potencia de salida', '%', 'lectura'),
        p('Utr', 'Par motor', '%', 'lectura'),
        p('tHr', 'Estado térmico del motor', '%', 'lectura', false,
          'Sube con la carga acumulada; al 118 % dispara OLF. Ver esto en 90 % avisa antes de la parada.'),
        p('tHd', 'Estado térmico del variador', '%', 'lectura'),
        p('ULn', 'Tensión de red', 'V', 'lectura'),
        p('tUL', 'Estado del autoajuste', '—', 'lectura'),
      ]
    },
    fallas: [
      falla('OCF', 'Sobrecorriente', ['Parámetros del menú drC- mal cargados', 'Inercia o carga excesiva', 'Bloqueo mecánico'], ['Verificar los datos de placa en drC-', 'Revisar que la cinta gire libre', 'Alargar la rampa de aceleración (ACC)']),
      falla('OLF', 'Sobrecarga motor', ['Intensidad del motor demasiado elevada', 'Valor de [Resist. estátor fría] (rSC) erróneo'], ['Verificar el ajuste de I térmica motor (ItH) y comprobar la carga del motor', 'Esperar a que el motor se enfríe antes de rearrancar', 'Recalcular rSC']),
      falla('OPF', 'Pérdida de fase motor', ['Corte de fase a la salida del variador', 'Contactor aguas abajo abierto', 'Motor no conectado o de potencia demasiado baja'], ['Comprobar las conexiones del variador al motor', 'Con contactor aguas abajo, poner [Pérdida fase motor] (OPL) en OAC', 'Verificar UFr, UnS y nCr, y hacer un autoajuste con tUn']),
      falla('OSF', 'Sobretensión de red', ['Tensión de red demasiado elevada', 'Red perturbada'], ['Comprobar la tensión de red']),
      falla('USF', 'Subtensión', ['Red sin potencia suficiente'], ['Verificar la tensión y el parámetro de tensión (UnS)']),
      falla('PHF', 'Pérdida de fase de red', ['Variador mal alimentado o fusible fundido', 'Corte de una fase', 'ATV312 trifásico alimentado en red monofásica'], ['Comprobar la conexión de potencia y los fusibles', 'Rearmar', 'Usar una red trifásica']),
      falla('OHF', 'Sobrecalentamiento del variador', ['Temperatura del variador demasiado alta'], ['Comprobar la carga del motor y la ventilación del variador', 'Revisar que el radiador esté limpio y con aire libre']),
      falla('SCF', 'Cortocircuito motor', ['Cortocircuito o puesta a tierra a la salida'], ['Verificar los cables de conexión del variador al motor y el aislamiento del motor']),
      falla('ObF', 'Exceso de frenado', ['Frenado demasiado brusco'], ['Aumentar el tiempo de deceleración (dEC)', 'Instalar resistencia de frenado si hace falta']),
      falla('SOF', 'Sobrevelocidad', ['Inestabilidad', 'Carga arrastrante'], ['Comprobar los parámetros del motor y la ganancia (FLG)']),
      falla('tnF', 'Falla de autoajuste', ['Motor especial o de potencia muy distinta a la del variador', 'Motor no conectado'], ['Usar la ley U/f L o P en vez del autoajuste', 'Verificar que el motor esté conectado durante el tUn']),
      falla('LFF', 'Pérdida de la consigna 4-20 mA', ['Se cortó la señal de 4-20 mA'], ['Verificar la conexión en la entrada AI3']),
      falla('EPF', 'Falla externa', ['Lo dispara una señal externa asignada por el usuario'], ['Revisar qué equipo o contacto está dando la señal']),
      falla('SLF', 'Falla Modbus', ['Interrupción de comunicación en el bus', 'Terminal remoto validado (LCC) pero desconectado'], ['Comprobar el bus de comunicación', 'Comprobar el enlace con el terminal remoto']),
      falla('CFI', 'Configuración no válida', ['Configuración cargada incompatible'], ['Comprobar la configuración previamente cargada', 'Volver a ajuste de fábrica y reconfigurar']),
      falla('bLF', 'Falla del control de freno', ['No se alcanzó la intensidad de apertura del freno'], ['Comprobar la conexión variador/motor']),
    ],
  },
  {
    id: 'atv31',
    nombre: 'Schneider Altivar 31',
    tipo: 'VFD con teclado',
    donde: 'Cinta de la Fishken — por confirmar',
    estado: 'parcial',
    fuente: 'Guía de programación ATV31 · Schneider (español).',
    aviso:
      'El ATV312 es su sucesor directo y comparte la nomenclatura, pero verifica parámetro por parámetro antes de copiar una configuración de una generación a la otra.',
    menus: {
      'drC- Control motor': [
        p('FCS', 'Retorno a ajustes de fábrica', 'poner InI', '—', false,
          'Paso 0 con un variador usado. El manual ATV31 lo deja accesible desde drC-, I-O-, CtL- y FUn-.'),
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
      'rEF- Referencia de velocidad': [
        p('LFr', 'Referencia de frecuencia por consola', '0 a 500 Hz', '—'),
        p('AIV1', 'Imagen de la entrada AIV1', '0 a 100 %', '—', false,
          'La rueda del variador como potenciómetro.'),
        p('FrH', 'Referencia de frecuencia aplicada', 'de LSP a HSP', 'lectura'),
      ],
      'I-O- Entradas / Salidas': [
        p('tCC', 'Control 2/3 hilos', '2C / 3C / LOC', '2C · 2 hilos'),
        p('tCt', 'Tipo de control 2 hilos', 'LEL / trn / PFO', 'trn · Transición', false,
          'Verificar en el manual del ATV31 antes de copiar valores del 312.'),
        p('rrS', 'Asignación marcha atrás', 'LI2 / LI3 / LI4 / nO', 'LI2'),
        p('r1', 'Asignación del relé R1', 'FLt / rUn…', 'FLt'),
        p('SCS', 'Guardar configuración', 'nO / StrI', 'nO'),
        p('FCS', 'Restaurar configuración', 'nO / rECI / InI', 'nO'),
      ],
      'CtL- Control': [
        p('Fr1', 'Canal de referencia 1', 'AI1 / AI2 / AI3 / AIV1 / …', 'AI1', false,
          'De dónde sale la CONSIGNA de velocidad. Mismas opciones que el ATV312.'),
        p('Fr2', 'Canal de referencia 2', 'AI1 / AI2 / AI3 / …', 'nO'),
        p('Cd1', 'Canal de control 1', 'tEr / LCC / Mdb / nEt', 'tEr · bornero', false,
          'De dónde vienen las órdenes de marcha/paro — distinto de Fr1.'),
        p('LAC', 'Nivel de acceso', 'L1 / L2 / L3', 'L1'),
      ],
      'FLt- Gestión de fallos': [
        p('Atr', 'Rearranque automático', 'nO / YES', 'nO', false,
          'PELIGRO en una cinta: con YES rearranca solo tras un fallo.'),
        p('OPL', 'Pérdida de fase del motor', 'YES / nO / OAC', 'YES'),
        p('IPL', 'Pérdida de fase de red', 'YES / nO', 'YES'),
      ],
      'SUP- Supervisión (solo lectura)': [
        p('rFr', 'Frecuencia de salida', 'Hz', 'lectura'),
        p('LCr', 'Intensidad del motor', 'A', 'lectura'),
        p('tHr', 'Estado térmico del motor', '%', 'lectura'),
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
      '14-2x Reset a fábrica': [
        p('14-22', 'Modo de funcionamiento', '[0] Normal · [2] Inicialización', '[0] Normal', false,
          'Paso 0 con un variador usado: poner [2], cortar la alimentación y volver a energizar — inicializa todo excepto registros de fallos y contadores. Después cargar los datos de esta ficha.'),
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
      '0-** Func. / Display': [
        p('0-01', 'Idioma', '—', '—'),
        p('0-03', 'Ajustes regionales', 'Internacional / EE.UU.', 'Internacional', false,
          'Internacional deja 1-23 en 50 Hz; EE.UU. lo pone en 60. Cambiarlo por error deja el motor girando 20 % más rápido.'),
        p('0-2x', 'Display del LCP', '—', '—', false,
          'Qué se muestra en las tres líneas de la consola. Poner intensidad y frecuencia ahorra entrar al menú cada vez.'),
      ],
      '2-** Frenos': [
        p('2-00', 'Intensidad de mantenimiento CC', '—', 'según calibre'),
        p('2-10', 'Función de freno', 'off / resistencia / CA', 'off', false,
          'Si dispara sobretensión al desacelerar (fallo de bus), acá se habilita la resistencia de frenado.'),
        p('2-2x', 'Freno mecánico', '—', '—'),
      ],
      '6-** E/S analógica': [
        p('6-1x', 'Entrada analógica 53', '—', '—'),
        p('6-2x', 'Entrada analógica 54', '—', '—', false,
          'Es la entrada de corriente: 4-20 mA permite detectar cable cortado, cosa que 0-10 V no.'),
        p('6-9x', 'Salida analógica 42', '—', '—'),
      ],
      '8-** Comunicaciones': [
        p('8-01', 'Puesto de control', '—', '—', false,
          'Decide si mandan los bornes o el bus. Mal puesto, el selector del tablero deja de responder.'),
        p('8-3x', 'Ajustes del puerto FC', '—', '—'),
      ],
      '15-** / 16-** Información y lecturas': [
        p('15-00', 'Horas de funcionamiento', 'h', 'lectura'),
        p('15-03', 'Arranques', '—', 'lectura'),
        p('15-46', 'Referencia del variador', '—', 'lectura', false,
          'Acá está el código comercial del equipo — el que resuelve todos los «según calibre» de esta ficha.'),
        p('16-1x', 'Estado del motor', 'lectura', 'lectura', false,
          'Frecuencia, intensidad, par y estado térmico en vivo.'),
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
      '14-2x Reset a fábrica': [
        p('14-22', 'Modo de funcionamiento', '[0] Normal · [2] Inicialización', '[0] Normal', false,
          'Paso 0 con un variador usado: poner [2], cortar la alimentación y volver a energizar — inicializa todo excepto registros de fallos y contadores. Después cargar los datos de esta ficha.'),
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
      '0-** Func. / Display': [
        p('0-01', 'Idioma', '—', '—'),
        p('0-03', 'Ajustes regionales', 'Internacional / EE.UU.', 'Internacional', false,
          'Internacional deja 1-23 en 50 Hz; EE.UU. lo pone en 60. Cambiarlo por error deja el motor girando 20 % más rápido.'),
        p('0-2x', 'Display del LCP', '—', '—', false,
          'Qué se muestra en las tres líneas de la consola. Poner intensidad y frecuencia ahorra entrar al menú cada vez.'),
      ],
      '2-** Frenos': [
        p('2-00', 'Intensidad de mantenimiento CC', '—', 'según calibre'),
        p('2-10', 'Función de freno', 'off / resistencia / CA', 'off', false,
          'Si dispara sobretensión al desacelerar (fallo de bus), acá se habilita la resistencia de frenado.'),
        p('2-2x', 'Freno mecánico', '—', '—'),
      ],
      '6-** E/S analógica': [
        p('6-1x', 'Entrada analógica 53', '—', '—'),
        p('6-2x', 'Entrada analógica 54', '—', '—', false,
          'Es la entrada de corriente: 4-20 mA permite detectar cable cortado, cosa que 0-10 V no.'),
        p('6-9x', 'Salida analógica 42', '—', '—'),
      ],
      '8-** Comunicaciones': [
        p('8-01', 'Puesto de control', '—', '—', false,
          'Decide si mandan los bornes o el bus. Mal puesto, el selector del tablero deja de responder.'),
        p('8-3x', 'Ajustes del puerto FC', '—', '—'),
      ],
      '15-** / 16-** Información y lecturas': [
        p('15-00', 'Horas de funcionamiento', 'h', 'lectura'),
        p('15-03', 'Arranques', '—', 'lectura'),
        p('15-46', 'Referencia del variador', '—', 'lectura', false,
          'Acá está el código comercial del equipo — el que resuelve todos los «según calibre» de esta ficha.'),
        p('16-1x', 'Estado del motor', 'lectura', 'lectura', false,
          'Frecuencia, intensidad, par y estado térmico en vivo.'),
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
      'P00xx Acceso y puesta en marcha': [
        p('P0003', 'Nivel de acceso de usuario', '1 estándar / 2 extendido / 3 experto', '1', false,
          'En nivel 1 no se ven la mayoría de los parámetros. Es la misma trampa que el LAC del Altistart y el P-14 del SEW.'),
        p('P0004', 'Filtro de parámetros', '—', '0'),
        p('P0700', 'Fuente de las señales de mando', '—', '—'),
      ],
      'P08xx-P13xx Control y protección': [
        p('P0610', 'Reacción ante sobretemperatura del motor', '0 aviso / 1 aviso y disparo', '—', false,
          'PELIGRO: en 0 el variador AVISA pero sigue andando. Verificar cómo quedó cargado.'),
        p('P0640', 'Factor de sobrecarga del motor', '%', '150 %'),
        p('P1300', 'Modo de control', 'V/f lineal · cuadrática · vectorial', 'V/f lineal', false,
          'Para cintas la V/f lineal es lo normal. La cuadrática es para bombas y ventiladores.'),
        p('P1310', 'Elevación de tensión constante (boost)', '%', '50 %', false,
          'Súbelo si la cinta cuesta arrancar con carga.'),
        p('P1320', 'Boost programable', '%', '—'),
      ],
      'P20xx Visualización (solo lectura)': [
        p('r0021', 'Frecuencia de salida', 'Hz', 'lectura'),
        p('r0027', 'Corriente de salida', 'A', 'lectura', false,
          'Compararla con P0305 dice si el motor está forzando.'),
        p('r0025', 'Tensión de salida', 'V', 'lectura'),
        p('r0026', 'Tensión del bus DC', 'V', 'lectura'),
        p('r0947', 'Último fallo', '—', 'lectura'),
      ],
      'P0010+P0970 Reset a fábrica': [
        p('P0010', 'Parámetro de puesta en marcha', '0 / 30', '0', false,
          'Ponerlo en 30 habilita el restablecimiento.'),
        p('P0970', 'Restablecer ajustes de fábrica', '0 / 1', '0', false,
          'Paso 0 con un variador usado: P0010 = 30 y luego P0970 = 1 (procedimiento textual del manual). Ojo: las macros de conexión Cn010/Cn011 NO se restablecen solas.'),
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
        p('OSd', 'Límite de sobretensión', '110 a 125 % de Uln', '120 %'),
        p('OSt', 'Retardo de límite de sobretensión', '1 a 10', '2 s'),
        p('Ubd', 'Límite de desequilibrio de intensidad', 'oFF, 10 a 100 % de In', '25 %'),
        p('Ubt', 'Retardo de desequilibrio', '1 a 60 s', '10 s'),
        p('Grdd', 'Límite de fuga a tierra', 'oFF, 10 a 100 % de In', '25 % (S6)'),
        p('Grdt', 'Tiempo de fuga a tierra', '—', '—'),
        p('PtC', 'Supervisión de sondas PTC', '—', 'oFF', false,
          'Habilita el disparo DtF por termistor del motor (bornes PTC1/PTC2 del menú IO).'),
        p('PHL', 'Detección de pérdida de fase', '—', 'On'),
        p('PHr', 'Secuencia de fases', '—', 'oFF'),
        p('ItH', 'Protección de sobrecarga', '—', 'On', false,
          'Interruptor maestro de la protección térmica: sin esto, tHP no hace nada.'),
      ],
      'SEt2 · 2º juego de ajustes': [
        p('In2', 'Int. nominal del motor (2º juego)', 'como In', '—', true,
          'SEt2 es un segundo conjunto de 5 parámetros con la misma definición que SEt. Sirve cuando el mismo arrancador mueve dos motores distintos o una carga con dos regímenes.'),
        p('ILt2', 'Limitación de intensidad (2º juego)', 'como ILt', '—'),
        p('ACC2', 'Tiempo de aceleración (2º juego)', 'como ACC', '—'),
        p('dEC2', 'Tiempo de deceleración (2º juego)', 'como dEC', '—'),
        p('t902', 'Tensión inicial (2º juego)', 'como t90', '—'),
      ],
      'IO Entradas / salidas lógicas': [
        p('LI2', 'Entrada lógica 2', 'Strt / rUn / EtF / rSt / FAn / FI / LIL', 'rUn · marcha', false,
          'Borne del selector de marcha. rUn es para control 2 hilos (selector mantenido); Strt para 3 hilos (pulsadores). Regleta real: LI1 LI2 LI3 24V Com.'),
        p('LI3', 'Entrada lógica 3', 'Strt / rUn / EtF / rSt / FAn / FI / LIL', 'rSt · reset'),
        p('LI4', 'Entrada lógica 4', 'ídem', '—'),
        p('LO1', 'Salida lógica 1', '—', '—'),
        p('R1', 'Configuración del relé R1', '—', '—'),
        p('R2', 'Configuración del relé R2', '—', '—'),
        p('PTC', 'PTC1 / PTC2', '—', '—', false,
          'Bornes para el termistor del motor. Si el motor lo tiene, es protección térmica directa — mejor que estimarla por corriente.'),
      ],
      'COP Comunicación avanzada': [
        p('Add', 'Dirección Modbus', '1 a 247', 'oFF', false,
          'El cambio recién se aplica en el siguiente encendido del control.'),
        p('tbr', 'Velocidad Modbus', '4,8 / 9,6 / 19,2 kbps', '19,2 kbps'),
        p('For', 'Formato de comunicación', '—', '—'),
        p('CtrL', 'Canal de control', 'LCL / dbS', 'LCL · bornero', false,
          'LCL = manda el bornero (el selector del tablero). dbS = manda Modbus. Si alguien lo deja en dbS, el selector deja de funcionar y parece que el arrancador está muerto.'),
      ],
      'SUP Supervisión (solo lectura)': [
        p('SICL', 'Intensidad del motor', '0 a 999 A', 'lectura', false,
          'Compararla con In dice si la bomba está forzando, antes de que dispare OLF.'),
        p('dICL', 'Intensidad de fuga a tierra', '—', 'lectura'),
        p('LFt', 'Último fallo', '—', 'lectura'),
        p('rnt', 'Tiempo total de funcionamiento del motor', '—', 'lectura'),
        p('Stnb', 'Número de arranques', '—', 'lectura'),
        p('dEFt', 'Número total de fallos', '—', 'lectura'),
        p('dEF1', 'Histórico de fallos 1', '—', 'lectura', false,
          'Con LAC en oFF solo se ve dEF1. Con LAC en On se ven dEF1 a dEF9 — nueve fallos de historia en vez de uno.'),
      ],
      'UtIL Utilidades': [
        p('FCS', 'Volver a parámetros de fábrica', '—', '—', false,
          'Paso 0 con un arrancador usado: todos los parámetros vuelven a fábrica. En el mismo menú viven el auto-test del arrancador y el reset del histórico de fallos.'),
      ],
    },
    fallas: [
      falla('OLF', 'Sobrecarga motor', ['El motor consumió más de lo permitido durante demasiado tiempo', 'Mecanismo duro o trabado'], ['Revisar el mecanismo: desgaste, juego, lubricación, bloqueos', 'Comprobar el dimensionamiento del motor frente a la necesidad mecánica', 'Verificar tHP (menú SEt) e In (menú ConF)', 'Esperar a que el motor se enfríe antes de rearrancar']),
      falla('OCF', 'Sobrecorriente motor', ['La corriente superó el límite configurado'], ['Comprobar los valores de OId y OIt en el menú PrO']),
      falla('UCF', 'Subintensidad', ['La corriente cayó por debajo del límite: bomba en vacío, acople roto, correa cortada'], ['Comprobar los valores de UId y UIt en el menú PrO', 'Revisar si la bomba está cebada y el acople íntegro']),
      falla('OHF', 'Sobrecalentamiento del arrancador', ['Radiador sucio o sin ventilación', 'Arrancador subdimensionado'], ['Comprobar que el ventilador funcione y que el aire circule libre', 'Verificar que el radiador esté limpio y se respeten las distancias de montaje', 'Esperar a que el Altistart se enfríe']),
      falla('OSF', 'Sobretensión', ['Tensión de red por encima del límite'], ['Comprobar el parámetro ULn en el menú ConF', 'Revisar el circuito y la tensión de alimentación', 'Comprobar OSd y OSt en el menú PrO']),
      falla('DtF', 'Sobretemperatura del motor (PTC)', ['Las sondas PTC del motor detectaron exceso de temperatura'], ['Revisar el mecanismo: desgaste, juego, lubricación, bloqueos', 'Comprobar el dimensionamiento del motor', 'Verificar el ajuste PtC en el menú PrO', 'Esperar a que el motor se enfríe']),
      falla('PHF', 'Pérdida de fase del motor', ['Falta una fase entre el arrancador y el motor'], ['Comprobar la conexión del motor y los contactores o disyuntores intermedios', 'Comprobar el estado del motor']),
      falla('PHbd', 'Desequilibrio de fases', ['Las tres fases no están equilibradas'], ['Comprobar la tensión de red', 'Comprobar Ubd y Ubt en el menú PrO']),
      falla('PIF', 'Frecuencia de línea fuera de tolerancia', ['La frecuencia de red se salió del rango'], ['Comprobar la frecuencia de red', 'Comprobar la configuración del parámetro PHL']),
      falla('StF', 'Tiempo de arranque demasiado largo', ['El arranque superó el tiempo tLS: motor atascado o rampa mal ajustada'], ['Comprobar que el motor no esté atascado', 'Verificar que tLS sea mayor que ACC', 'Revisar la carga en el arranque']),
      falla('SnbF', 'Demasiados arranques', ['Se superó el número de arranques Snb dentro del período SLG'], ['Esperar el período SLG', 'Revisar por qué el equipo arranca tantas veces', 'Ajustar Snb y SLG en el menú AdJ si el uso real lo justifica']),
      falla('GrdF', 'Corriente de fuga a tierra', ['Falla de aislamiento en el motor o el cableado'], ['Comprobar el aislamiento eléctrico del motor', 'Comprobar la instalación', 'Verificar Grdd y Grdt en el menú PrO']),
      falla('bPF', 'Falla del contactor de bypass', ['Falla interna del bypass integrado'], ['Apagar el arrancador y contactar al servicio técnico de Schneider']),
      falla('CFF', 'Configuración no válida', ['La configuración cargada no es compatible'], ['Volver al ajuste de fábrica en el menú UtIL (utilidades — ver manual BBV51332)', 'Volver a configurar el arrancador']),
      falla('EtF', 'Falla externa', ['Lo dispara una señal externa'], ['Eliminar la causa del fallo detectado']),
      falla('InF', 'Falla interna', ['Falla propia del equipo'], ['Desconectar y volver a conectar la alimentación de control', 'Si persiste, contactar al soporte técnico de Schneider']),
      falla('trAP', 'Código Trap', ['Falla interna del procesador'], ['Desconectar y volver a conectar la alimentación de control', 'Si persiste, contactar al soporte técnico de Schneider']),
    ],
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
      'En el tablero de filete hay un variador que mueve DOS cintas a la vez (desperdicio pimponeo + pimponeo), con un solo guardamotor compartido. Ni P-08 ni ese guardamotor distinguen cada motor: ambos protegen la SUMA. Si una sola cinta se traba, el disparo puede llegar tarde — ante olor o recalentamiento de un motor, revisar aunque no haya disparado nada. No sacar el guardamotor: es la única protección aguas abajo del variador.',
    menus: {
      'P-07…P-10 Datos del motor': [
        p('P-07', 'Tensión nominal del motor', '0, 20 a 500 V', '400 V', true,
          'La planta es 380 V. Poner 0 desactiva la compensación de tensión.'),
        p('P-08', 'Corriente nominal del motor', '25 a 100 % de la corriente del variador', 'según motor DR', true,
          'Es también el nivel de protección por sobrecarga. En el variador que mueve dos cintas, este valor cubre la SUMA de ambos motores, no cada uno.'),
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
          'El código es 101 (lo dice el manual). Sin escribirlo, los parámetros P-15 en adelante ni aparecen y parece que el equipo no los tuviera — misma trampa que el LAC del Altistart 22. Se puede cambiar en P-37 para que no lo toque cualquiera.'),
        p('P-13', 'Registro de fallos', 'últimos 4', '—', false,
          'Guarda los 4 últimos disparos, el más reciente primero. Es lo primero que hay que mirar cuando alguien dice «se paró sola y volvió».'),
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
      'P-30…P-39 Arranque y protección': [
        p('P-30', 'Modo de arranque', 'auto / manual tras corte', 'Edge-r', false,
          'Decide si la cinta rearranca sola al volver la luz. El equivalente del tCt del Altivar: mismo peligro.'),
        p('P-31', 'Modo de arranque del teclado', '—', '—'),
        p('P-32', 'Rearranque automático', 'nº de intentos', '0'),
        p('P-35', 'Escalado de la entrada analógica', '0 a 500 %', '100 %'),
        p('P-37', 'Código de acceso del usuario', '0 a 9999', '101', false,
          'Cambiar esto es lo que impide que cualquiera entre al menú extendido con el 101 de fábrica.'),
        p('P-39', 'Offset de la entrada analógica', '−500 a 500 %', '0 %'),
      ],
      'P-40… Monitoreo (solo lectura)': [
        p('P-40', 'Escalado del valor mostrado', '—', '—'),
        p('P-00', 'Parámetros de solo lectura', '—', 'lectura', false,
          'Bloque de monitoreo en tiempo real: corriente, tensión de bus, temperatura y horas. Es diagnóstico sin desarmar nada.'),
      ],
      '↺ Reset a fábrica': [
        p('▲+▼+Stop', 'Reset a fábrica por teclado', 'mantener > 2 s', '—', false,
          'Paso 0 con un variador usado: con el equipo parado, mantener las tres teclas más de 2 s; el display muestra P-deF y se confirma con Stop. Después cargar P-07 a P-10.'),
      ],
    },
    fallas: [
      falla('O-I', 'Sobrecorriente a la salida', ['Carga excesiva en el motor', 'Motor trabado o atascado', 'Error de conexión estrella-triángulo del motor', 'Cable al motor demasiado largo'], ['Si dispara a velocidad constante: buscar sobrecarga o falla mecánica', 'Si dispara al habilitar: revisar que el motor no esté trabado y verificar el conexionado Δ/Y', 'Comprobar que el largo del cable esté dentro de especificación']),
      falla('I.t-trP', 'Sobrecarga del variador', ['El variador entregó más del 100 % de la corriente de P-08 durante demasiado tiempo', 'Rampas demasiado cortas para la carga'], ['Revisar sobrecarga súbita o falla mecánica', 'Posible falla de cable entre variador y motor', 'Aumentar la rampa de aceleración (P-03) o reducir la carga', 'Si P-03 y P-04 no se pueden alargar, hace falta un variador más grande']),
      falla('O.Uolt', 'Sobretensión en el bus DC', ['Tensión de red alta', 'Frenado demasiado brusco: la carga devuelve energía'], ['Comprobar que la tensión de alimentación esté dentro de límites', 'Si dispara al desacelerar, aumentar el tiempo de P-04', 'Si hace falta, conectar resistencia de frenado (y poner P-39 = 1 si ya está instalada)']),
      falla('U.Uolt', 'Subtensión en el bus DC', ['Corte o baja de tensión de alimentación'], ['Es normal que aparezca al apagar el equipo', 'Si aparece en marcha, comprobar la tensión de alimentación']),
      falla('O-t', 'Sobretemperatura del disipador', ['Ventilación insuficiente o ambiente caluroso'], ['Comprobar la refrigeración del variador y las dimensiones del tablero', 'Puede hacer falta más espacio o ventilación forzada']),
      falla('U-t', 'Temperatura demasiado baja', ['Temperatura ambiente por debajo del mínimo'], ['Esperar a que el tablero tome temperatura antes de arrancar']),
      falla('OI-b', 'Sobrecorriente en el circuito de frenado', ['Exceso de corriente en la resistencia de frenado'], ['Comprobar el cableado a la resistencia de frenado', 'Verificar el valor de la resistencia y respetar el mínimo de las tablas']),
      falla('OL-br', 'Sobrecarga de la resistencia de frenado', ['Frenados muy seguidos o inercia alta'], ['Aumentar el tiempo de deceleración', 'Reducir la inercia de la carga o agregar resistencias en paralelo']),
      falla('PS-trP', 'Falla de la etapa de potencia', ['Cortocircuito fase-fase o fase-tierra', 'Error de cableado'], ['Buscar cortocircuito entre fases o a tierra', 'Revisar el cableado antes de volver a energizar']),
      falla('th-Flt', 'Termistor del disipador defectuoso', ['Falla del sensor interno'], ['Requiere servicio técnico']),
      falla('E-triP', 'Disparo externo', ['Señal externa conectada a la entrada digital 3'], ['Revisar qué equipo está dando la señal en la entrada digital 3']),
      falla('SC-trP', 'Pérdida de comunicación', ['Se cortó el enlace de comunicación'], ['Comprobar el bus y el cableado de comunicación']),
      falla('P-dEF', 'Parámetros de fábrica cargados', ['Se restauró la configuración de fábrica'], ['Pulsar la tecla stop; el variador queda listo para configurar', 'Volver a cargar los datos de placa del motor (P-07 a P-10)']),
    ],
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
    codigos: { atv: 'CL1', danfoss: '4-18', v20: null, sew: null, ats22: 'ILt' },
    nota: 'Ojo en el Altivar: el límite es CL1 (0,25 a 1,5 In) — ItH es la protección TÉRMICA, otra cosa. En el SEW no hay parámetro aparte: el propio P-08 hace de nivel de sobrecarga.',
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


// ── Recetas por posición ──────────────────────────────────────────────────────
/**
 * La ficha de familia dice qué parámetros EXISTEN; la receta dice qué VALOR va en
 * ESTA cinta con ESTE motor. Pedido explícito de Orel (2026-08-02): no generalizar
 * los seteos del variador — cada posición con su motor.
 *
 * Estados: `confirmado` = placa leída o regla verificada (red 380 V, código del
 * modelo Sumitomo). `pendiente` = falta la placa o el dato de terreno. `sugerido` =
 * ajuste de fábrica o valor típico — verificar en terreno antes de dejarlo fijo.
 */
export type EstadoValor = 'confirmado' | 'pendiente' | 'sugerido'

export interface ValorReceta {
  codigo: string
  valor: string
  estado: EstadoValor
  nota?: string
}

export interface PosicionReceta {
  id: string
  equipo: string
  zona: string
  /** id de la ficha de familia, para saltar al detalle del parámetro. */
  variadorId: string | null
  /** Cómo identificar la unidad física (posición en el tablero, número de rotulado). */
  variadorEtiqueta?: string
  motor: string
  /**
   * Código SAP del MOTOR. Los de las cintas salen de la columna de códigos de la
   * hoja «Motores nuevos planta» (10 dígitos, empiezan en 33) — ⚠ confirmar con
   * Orel que esa columna sea efectivamente el SAP y no un código interno.
   */
  sapMotor?: string
  /** Código SAP del VARIADOR. Pendiente: aún no se levantaron. */
  sapVariador?: string
  /**
   * Slug de la máquina en el Centro de Aprendizaje, para que su ficha muestre
   * los variadores que la mueven. Solo se asigna cuando la posición pertenece
   * inequívocamente a esa máquina — si hay duda, se deja sin slug.
   */
  maquinaSlug?: string
  valores: ValorReceta[]
  nota?: string
}

const v = (codigo: string, valor: string, estado: EstadoValor, nota?: string): ValorReceta =>
  ({ codigo, valor, estado, nota })

/** 380 V de línea — confirmado por Orel; regla del manual ATV312 (tensión de línea < nominal del motor). */
const V380: EstadoValor = 'confirmado'

export const POSICIONES: PosicionReceta[] = [
  {
    id: 'desangrador', equipo: 'Desangrador', zona: 'Planta principal',
    variadorId: 'atv312', motor: 'SEW KA87R57DRN100L4 · 3 kW · i 2371 (placa 17-10-2024)',
    valores: [
      v('UnS', '380 V', 'confirmado', 'Motor nativo 220Δ/380Y: en red 380 va en estrella.'),
      v('FrS', '50 Hz', 'confirmado'),
      v('nCr', '6,8 A', 'confirmado', 'Corriente en Y según placa (11,7 A sería en Δ).'),
      v('nSP', '1456 rpm', 'confirmado'),
      v('COS', '0,76', 'confirmado'),
      v('ItH', '6,8 A', 'confirmado'),
      v('ACC / dEC', '3 s', 'sugerido', 'Fábrica; el giro de salida es lentísimo (0,61 rpm), no debería necesitar más.'),
    ],
    nota: 'La única receta 100 % confirmada — la placa salió del grupo Levantamiento. Confirmar de pasada que el motor siga siendo este (foto de oct-2024).',
  },
  {
    id: 'baader142-alimentadora', maquinaSlug: 'baader-142', sapMotor: '3300124071', equipo: 'Cinta azul alimentadora Baader 142', zona: 'Salida Marel HG',
    variadorId: 'atv312',
    motor: 'Sumitomo RNYM1-1320A-7 · 0,75 kW · 1:7 → 207 rpm salida',
    valores: [
      v('UnS', '380 V', V380),
      v('FrS', '50 Hz', 'confirmado'),
      v('nCr', '— A', 'pendiente', 'De la placa del RNYM1.'),
      v('nSP', '— rpm', 'pendiente'),
      v('COS', '—', 'pendiente'),
      v('ItH', '= nCr', 'pendiente'),
    ],
  },
  {
    id: 'cuello-cisnes', maquinaSlug: 'marel-hg', sapMotor: '3300124072', equipo: 'Cinta cuello de cisnes', zona: 'Antes del infeed Marel',
    variadorId: 'v20', motor: 'Sumitomo RNYM1-1320A-30 · 0,75 kW · 1:30 → 48,3 rpm salida',
    valores: [
      v('P0304', '380 V', V380),
      v('P0310', '50 Hz', 'confirmado'),
      v('P0307', '0,75 kW', 'confirmado', 'Del código del modelo (catálogo Hyponic verificado).'),
      v('P0305', '— A', 'pendiente', 'De la placa — es el dato que fija la protección.'),
      v('P0311', '— rpm', 'pendiente'),
      v('P0308', '—', 'pendiente'),
      v('P1120 / P1121', '10 s', 'sugerido', 'Fábrica.'),
    ],
  },
  {
    id: 'transversal-baader', maquinaSlug: 'baader-142', sapMotor: '3300124073', equipo: 'Cinta transversal salida Baader 142', zona: 'Salida Baader 142',
    variadorId: 'v20', motor: 'Sumitomo RNYM08-1320B-30 · 0,55 kW · 1:30 → 48,3 rpm salida',
    valores: [
      v('P0304', '380 V', V380),
      v('P0310', '50 Hz', 'confirmado'),
      v('P0307', '0,55 kW', 'confirmado', 'Del código del modelo.'),
      v('P0305', '— A', 'pendiente'),
      v('P0311', '— rpm', 'pendiente'),
      v('P0308', '—', 'pendiente'),
    ],
  },
  {
    id: 'grader-zeta', maquinaSlug: 'grader', equipo: 'Cinta zeta (elevadora 2)', zona: 'Grader',
    variadorId: 'danfoss-ad', variadorEtiqueta: 'confirmar cuál de los 4 es — los rótulos del tablero no son confiables',
    motor: 'por levantar',
    valores: [
      v('1-22', '380 V', V380),
      v('1-23', '50 Hz', 'confirmado'),
      v('1-20', '— kW', 'pendiente'),
      v('1-24', '— A', 'pendiente'),
      v('1-25', '— rpm', 'pendiente'),
      v('3-41 / 3-42', '—', 'sugerido', 'Según carga; correr AMA después de cargar 1-2x.'),
    ],
    nota: 'El tablero tiene 3 AutomationDrive + 1 Midi: identificar qué unidad mueve cada cinta es parte del levantamiento.',
  },
  {
    id: 'grader-acel-1', maquinaSlug: 'grader', equipo: 'Cinta aceleración 1', zona: 'Grader',
    variadorId: 'danfoss-ad', variadorEtiqueta: 'confirmar cuál de los 4 es',
    motor: 'por levantar',
    valores: [
      v('1-22', '380 V', V380), v('1-23', '50 Hz', 'confirmado'),
      v('1-20', '— kW', 'pendiente'), v('1-24', '— A', 'pendiente'), v('1-25', '— rpm', 'pendiente'),
    ],
  },
  {
    id: 'grader-acel-2', maquinaSlug: 'grader', equipo: 'Cinta aceleración 2', zona: 'Grader',
    variadorId: 'danfoss-ad', variadorEtiqueta: 'confirmar cuál de los 4 es',
    motor: 'por levantar',
    valores: [
      v('1-22', '380 V', V380), v('1-23', '50 Hz', 'confirmado'),
      v('1-20', '— kW', 'pendiente'), v('1-24', '— A', 'pendiente'), v('1-25', '— rpm', 'pendiente'),
    ],
  },
  {
    id: 'grader-larga', maquinaSlug: 'grader', equipo: 'Cinta larga Grader', zona: 'Grader',
    variadorId: 'danfoss-midi', variadorEtiqueta: 'confirmar si la larga es la del Midi (la unidad chica)',
    motor: 'por levantar',
    valores: [
      v('1-22', '380 V', V380), v('1-23', '50 Hz', 'confirmado'),
      v('1-20', '— kW', 'pendiente'), v('1-24', '— A', 'pendiente'), v('1-25', '— rpm', 'pendiente'),
    ],
  },
  {
    id: 'filete-cinta', maquinaSlug: 'marel-filete', sapMotor: '3300124073', equipo: 'Cinta filete', zona: 'Tablero de filete',
    variadorId: 'sew', variadorEtiqueta: 'VARIADOR 1…6 — mapear número ↔ cinta',
    motor: 'Sumitomo RNYM08-1320B-30 · 0,55 kW · 1:30',
    valores: [
      v('P-07', '380 V', V380),
      v('P-09', '50 Hz', 'confirmado'),
      v('P-08', '— A', 'pendiente', 'De la placa del RNYM08 — fija la sobrecarga.'),
      v('P-10', '— rpm', 'pendiente'),
      v('P-01', '50 Hz', 'sugerido'),
      v('P-03 / P-04', '5 s', 'sugerido', 'Fábrica.'),
    ],
  },
  {
    id: 'filete-desperdicio', maquinaSlug: 'marel-filete', sapMotor: '3300124073', equipo: 'Cinta desperdicio filete', zona: 'Tablero de filete',
    variadorId: 'sew', motor: 'Sumitomo RNYM08-1320B-30 · 0,55 kW · 1:30',
    valores: [
      v('P-07', '380 V', V380), v('P-09', '50 Hz', 'confirmado'),
      v('P-08', '— A', 'pendiente'), v('P-10', '— rpm', 'pendiente'),
    ],
  },
  {
    id: 'baader200-desperdicio', maquinaSlug: 'baader-200', sapMotor: '3300124073', equipo: 'Cinta desperdicio Baader 200', zona: 'Tablero de filete',
    variadorId: 'sew', motor: 'Sumitomo RNYM08-1320B-30 · 0,55 kW · 1:30',
    valores: [
      v('P-07', '380 V', V380), v('P-09', '50 Hz', 'confirmado'),
      v('P-08', '— A', 'pendiente'), v('P-10', '— rpm', 'pendiente'),
    ],
  },
  {
    id: 'pimponeo', maquinaSlug: 'marel-filete', sapMotor: '3300124073', equipo: 'Cinta pimponeo + desperdicio pimponeo (2 cintas, 1 variador)', zona: 'Tablero de filete',
    variadorId: 'sew', motor: '2 × Sumitomo RNYM08-1320B-30 · 0,55 kW c/u',
    valores: [
      v('P-07', '380 V', V380),
      v('P-09', '50 Hz', 'confirmado'),
      v('P-08', 'Σ 2 motores', 'pendiente', 'Acá P-08 cubre la SUMA de las dos corrientes de placa — y el guardamotor compartido también ve la suma.'),
      v('P-10', '0', 'sugerido', 'Con 2 motores no usar compensación de deslizamiento individual.'),
    ],
    nota: 'La posición más delicada del tablero: ni P-08 ni el guardamotor distinguen cada motor. Si una cinta se traba, el disparo puede llegar tarde.',
  },
  {
    id: 'curva', maquinaSlug: 'marel-filete', sapMotor: '3300124073', equipo: 'Cinta curva', zona: 'Filete',
    variadorId: 'sew', motor: 'Sumitomo RNYM08-1320B-30 ⏳ Orel duda — confirmar modelo',
    valores: [
      v('P-07', '380 V', V380), v('P-09', '50 Hz', 'confirmado'),
      v('P-08', '— A', 'pendiente', 'Primero confirmar QUÉ motor es; después la placa.'),
    ],
  },
  {
    id: 'gea-alimentacion', maquinaSlug: 'termoformadora-gea', equipo: 'Cinta alimentación GEA', zona: 'Filete → GEA',
    variadorId: 'sew', motor: 'Sumitomo RNYMS05-1320C-30 · 0,4 kW ⏳ · 1:30',
    valores: [
      v('P-07', '380 V', V380), v('P-09', '50 Hz', 'confirmado'),
      v('P-08', '— A', 'pendiente'), v('P-10', '— rpm', 'pendiente'),
    ],
  },
  {
    id: 'z-elevadora-hg', maquinaSlug: 'marel-hg', sapMotor: '3300124072', equipo: 'Cinta Z elevadora HG', zona: 'Marel HG',
    variadorId: null, variadorEtiqueta: 'variador por identificar',
    motor: 'Sumitomo RNYM1-1320A-30 · 0,75 kW · 1:30',
    valores: [
      v('tensión', '380 V', V380, 'Cualquiera sea el variador, la tensión de motor va en 380.'),
      v('corriente', '— A', 'pendiente'),
    ],
    nota: 'El motor está en la hoja «Motores nuevos planta» pero no sabemos qué variador la mueve.',
  },
  {
    id: 'sihi-repaso', equipo: 'Bombas SIHI repaso (B1 · B2 · B3)', zona: 'Planta principal',
    variadorId: 'ats22', variadorEtiqueta: 'rotuladas B1/B2/B3 a plumón en el tablero',
    motor: 'SIHI — placa por levantar',
    valores: [
      v('Uln', '380 V', V380, 'Referencia de las protecciones de tensión.'),
      v('In', '— A', 'pendiente', 'De la placa. Conectado en línea va directo; NO dividir por √3 salvo montaje en triángulo.'),
      v('tHP', '10', 'sugerido', 'Clase térmica de fábrica — y recordar que sin ItH=On no actúa.'),
      v('ACC', '10 s', 'sugerido'),
      v('tLS', '15 s', 'sugerido', 'Debe ser mayor que ACC.'),
    ],
  },
  {
    id: 'sopladoras', maquinaSlug: 'baader-142', equipo: 'Sopladoras de vacío (4 = 1 por Baader 142 + respaldo)', zona: 'Baader 142',
    variadorId: 'psr60', motor: 'por levantar — ¿traen termistor? (bornes PTC)',
    valores: [
      v('Start', '— s', 'pendiente', 'Anotar la posición actual de la perilla en las unidades que funcionan bien.'),
      v('Stop', '— s', 'pendiente'),
      v('Uini', '— %', 'pendiente'),
    ],
    nota: 'Acá la receta es la posición de las 3 perillas: fotografiar el frente de una unidad andando y esa ES la receta para el respaldo.',
  },
]

/** Un parámetro encontrado en el catálogo, sabiendo de qué familia y menú es. */
export interface ParametroEncontrado {
  parametro: ParametroVariador
  fichaId: string
  fichaNombre: string
  menu: string
}

/**
 * Busca un parámetro en las 8 familias a la vez, por código o por descripción.
 *
 * El caso real: el técnico sabe QUÉ quiere ajustar («la corriente del motor»)
 * o tiene un código a mano de otra marca, pero no sabe dónde vive en el equipo
 * que tiene enfrente. Antes había que abrir ficha por ficha y menú por menú.
 */
export function buscarParametro(termino: string): ParametroEncontrado[] {
  const t = termino.trim().toLowerCase()
  if (t.length < 2) return []
  const out: ParametroEncontrado[] = []
  for (const f of VARIADORES) {
    for (const [menu, filas] of Object.entries(f.menus ?? {})) {
      for (const parametro of filas) {
        if (
          parametro.codigo.toLowerCase().includes(t) ||
          parametro.descripcion.toLowerCase().includes(t)
        ) {
          out.push({ parametro, fichaId: f.id, fichaNombre: f.nombre, menu })
        }
      }
    }
  }
  // Coincidencia exacta de código primero: es lo que se teclea con el manual
  // de otra marca en la mano.
  return out.sort((a, b) => {
    const ea = a.parametro.codigo.toLowerCase() === t ? 0 : 1
    const eb = b.parametro.codigo.toLowerCase() === t ? 0 : 1
    return ea - eb
  })
}

/**
 * Dado un código, devuelve la fila de equivalencias que lo contiene.
 * Es lo que permite pasar de «tengo nCr» a «en el SEW eso es P-08».
 */
export function equivalenciaDe(codigo: string): EquivalenciaParametro | null {
  const c = codigo.trim().toLowerCase()
  return (
    EQUIVALENCIAS.find((e) =>
      Object.values(e.codigos).some(
        (v) => v && v.toLowerCase().split(/[\s/+]+/).includes(c),
      ),
    ) ?? null
  )
}

/** Una falla encontrada en el catálogo completo, con la familia a la que pertenece. */
export interface FallaEncontrada {
  falla: FallaVariador
  fichaId: string
  fichaNombre: string
}

/**
 * Busca un código de falla en las 8 familias a la vez.
 * El caso real: el display muestra «O-I» y el técnico no tiene por qué saber
 * que ese código es de un SEW. Antes había que abrir ficha por ficha.
 */
export function buscarFalla(termino: string): FallaEncontrada[] {
  const t = termino.trim().toLowerCase()
  if (t.length < 2) return []
  const out: FallaEncontrada[] = []
  for (const f of VARIADORES) {
    for (const falla of f.fallas ?? []) {
      if (
        falla.codigo.toLowerCase().includes(t) ||
        falla.nombre.toLowerCase().includes(t)
      ) {
        out.push({ falla, fichaId: f.id, fichaNombre: f.nombre })
      }
    }
  }
  // Coincidencia exacta de código primero: es lo que se tecleó mirando el display.
  return out.sort((a, b) => {
    const ea = a.falla.codigo.toLowerCase() === t ? 0 : 1
    const eb = b.falla.codigo.toLowerCase() === t ? 0 : 1
    return ea - eb
  })
}

/** Posiciones de una máquina — para la pestaña «Variadores» de su ficha. */
export const posicionesDeMaquina = (slug: string): PosicionReceta[] =>
  POSICIONES.filter((p) => p.maquinaSlug === slug)

/** Conteo para el footer: cuántos valores están confirmados vs el total. */
export const RESUMEN_RECETAS = POSICIONES.reduce(
  (acc, p) => {
    for (const val of p.valores) {
      acc.total += 1
      if (val.estado === 'confirmado') acc.confirmados += 1
    }
    return acc
  },
  { total: 0, confirmados: 0, posiciones: POSICIONES.length },
)

/** Total de parámetros catalogados — para el contador del hub. */
export const TOTAL_PARAMETROS = VARIADORES.reduce(
  (acc, f) => acc + Object.values(f.menus ?? {}).reduce((n, filas) => n + filas.length, 0),
  0,
)

/** Total de códigos de falla catalogados. */
export const TOTAL_FALLAS = VARIADORES.reduce((acc, f) => acc + (f.fallas?.length ?? 0), 0)

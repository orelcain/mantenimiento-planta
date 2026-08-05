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
      'rEF- Referencia de velocidad': [
        p('LFr', 'Referencia de frecuencia por consola', '0 a 500 Hz', '—'),
        p('AIV1', 'Imagen de la entrada AIV1', '0 a 100 %', '—', false,
          'La rueda del variador como potenciómetro.'),
        p('FrH', 'Referencia de frecuencia aplicada', 'de LSP a HSP', 'lectura'),
      ],
      'SEt- Ajustes': [
        p('ACC', 'Rampa aceleración', 'según Inr', '3 s'),
        p('dEC', 'Rampa deceleración', 'según Inr', '3 s'),
        p('LSP', 'Velocidad mínima', '0 a HSP', '0'),
        p('HSP', 'Velocidad máxima', 'LSP a tFr', 'bFr'),
        p('ItH', 'I térmica motor', '0,2 a 1,5 In', 'según calibre', true),
      ],
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
    fallas: [
      falla('OCF', 'Sobreintensidad', ['Parámetros de los menús SEt- y drC- incorrectos', 'Inercia o carga demasiado alta', 'Bloqueo mecánico'], ['Comprobar los parámetros de SEt- y drC-', 'Comprobar el dimensionamiento motor / variador / carga', 'Revisar el estado de la mecánica: la cinta puede estar trabada']),
      falla('OLF', 'Sobrecarga del motor', ['Disparo por corriente del motor demasiado elevada durante demasiado tiempo'], ['Verificar el ajuste de ItH (protección térmica) y la carga del motor', 'Esperar a que el motor se enfríe antes de rearrancar']),
      falla('OHF', 'Sobrecarga del variador', ['Temperatura del variador demasiado elevada'], ['Comprobar la carga del motor, la ventilación del variador y las condiciones ambientales', 'Esperar a que se enfríe antes de rearrancar']),
      falla('OPF', 'Corte de fase del motor', ['Corte de fase a la salida del variador', 'Contactor aguas abajo abierto', 'Motor sin cablear o de potencia demasiado baja', 'Inestabilidades instantáneas de la corriente del motor'], ['Revisar las conexiones del variador al motor', 'Con contactor aguas abajo, poner OPL en OAC — si no, dispara cada vez que abre', 'Probar con un motor de potencia acorde al variador']),
      falla('PHF', 'Corte de fase de la red', ['Variador mal alimentado o fusible fundido', 'Corte de una fase', 'Uso de un ATV31 trifásico en red monofásica'], ['Revisar la acometida y los fusibles', 'Comprobar que las tres fases lleguen al variador']),
      falla('OSF', 'Sobretensión de red', ['Tensión de red demasiado elevada', 'Red perturbada'], ['Verificar la tensión de red']),
      falla('ObF', 'Sobretensión en deceleración', ['Frenado demasiado brusco o carga arrastrante'], ['Aumentar el tiempo de deceleración (dEC)', 'Agregar una resistencia de frenado si hace falta', 'Activar la función brA si la aplicación lo permite']),
      falla('USF', 'Subtensión', ['Red sin potencia suficiente', 'Bajada de tensión transitoria', 'Resistencia de carga defectuosa'], ['Verificar la tensión de red y el parámetro de tensión', 'Si persiste con la red sana, contactar al servicio técnico']),
      falla('SCF', 'Cortocircuito del motor', ['Cortocircuito o puesta a tierra en la salida del variador', 'Corriente de fuga a tierra importante con varios motores en paralelo'], ['Revisar los cables del variador al motor y el aislamiento del motor', 'Medir aislamiento antes de volver a energizar']),
      falla('SOF', 'Sobrevelocidad', ['Inestabilidad', 'Carga de accionamiento muy elevada'], ['Comprobar los parámetros del motor, la ganancia y la estabilidad', 'Agregar una resistencia de frenado', 'Comprobar el dimensionamiento motor / variador / carga']),
      falla('tnF', 'Error de autoajuste', ['Motor especial o de potencia no adaptada al variador', 'Motor no conectado al variador durante el autoajuste'], ['Usar la ley U/f L o P (parámetro UFt) en vez del autoajuste', 'Comprobar que el motor esté conectado al hacer el autoajuste', 'Con contactor aguas abajo, cerrarlo durante el autoajuste']),
      falla('CFF', 'Fallo de configuración', ['La configuración actual es incoherente'], ['Volver al ajuste de fábrica o a la configuración guardada, con FCS']),
      falla('CFI', 'Configuración no válida por enlace serie', ['La configuración cargada por enlace serie no es coherente'], ['Comprobar la configuración cargada previamente']),
      falla('CrF', 'Circuito de carga de condensadores', ['Fallo del relé de carga o resistencia de carga deteriorada'], ['Contactar al servicio técnico: no es reparable en terreno']),
      falla('EEF', 'Fallo EEPROM', ['Fallo de memoria interno'], ['Verificar las condiciones del entorno (compatibilidad electromagnética)', 'Sustituir el variador si se repite']),
      falla('InF', 'Fallo interno', ['Fallo interno del equipo'], ['Verificar las condiciones ambientales (compatibilidad electromagnética)', 'Contactar al servicio técnico']),
    ],
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
      '0-** Func. / Display': [
        p('0-01', 'Idioma', '—', '—'),
        p('0-03', 'Ajustes regionales', 'Internacional / EE.UU.', 'Internacional', false,
          'Internacional deja 1-23 en 50 Hz; EE.UU. lo pone en 60. Cambiarlo por error deja el motor girando 20 % más rápido.'),
        p('0-2x', 'Display del LCP', '—', '—', false,
          'Qué se muestra en las tres líneas de la consola. Poner intensidad y frecuencia ahorra entrar al menú cada vez.'),
      ],
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
      '2-** Frenos': [
        p('2-00', 'Intensidad de mantenimiento CC', '—', 'según calibre'),
        p('2-10', 'Función de freno', 'off / resistencia / CA', 'off', false,
          'Si dispara sobretensión al desacelerar (fallo de bus), acá se habilita la resistencia de frenado.'),
        p('2-2x', 'Freno mecánico', '—', '—'),
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
      '14-2x Reset a fábrica': [
        p('14-22', 'Modo de funcionamiento', '[0] Normal · [2] Inicialización', '[0] Normal', false,
          'Paso 0 con un variador usado: poner [2], cortar la alimentación y volver a energizar — inicializa todo excepto registros de fallos y contadores. Después cargar los datos de esta ficha.'),
      ],
      '15-** / 16-** Información y lecturas': [
        p('15-00', 'Horas de funcionamiento', 'h', 'lectura'),
        p('15-03', 'Arranques', '—', 'lectura'),
        p('15-46', 'Referencia del variador', '—', 'lectura', false,
          'Acá está el código comercial del equipo — el que resuelve todos los «según calibre» de esta ficha.'),
        p('16-1x', 'Estado del motor', 'lectura', 'lectura', false,
          'Frecuencia, intensidad, par y estado térmico en vivo.'),
      ],
    },
    fallas: [
      falla('13', 'Sobrecorriente', ['Se superó el límite de intensidad máxima del inversor (≈200 % de la nominal)', 'Carga brusca o aceleración demasiado rápida', 'Mecánica trabada'], ['Revisar si la cinta o el mecanismo está trabado', 'Aumentar el tiempo de rampa 3-41', 'Verificar que los datos del motor (1-2x) sean los de la placa']),
      falla('14', 'Fallo a tierra', ['Descarga de las fases de salida a tierra', 'Aislamiento del motor o del cable deteriorado'], ['Medir aislamiento del motor y del cable antes de volver a energizar', 'Revisar prensaestopas y humedad: en planta es la causa habitual']),
      falla('16', 'Cortocircuito', ['Cortocircuito en el motor o en sus bornes'], ['Desconectar el motor y medir entre fases', 'Revisar el cable de salida en toda su longitud']),
      falla('7', 'Sobretensión CC', ['La tensión del bus superó el límite', 'Frenado o deceleración demasiado rápidos', 'Carga arrastrante'], ['Aumentar el tiempo de rampa de deceleración 3-42', 'Habilitar la función de freno en 2-10 y conectar resistencia si hace falta', 'Revisar si la carga arrastra al motor']),
      falla('8', 'Baja tensión CC', ['La tensión del bus cayó por debajo del límite', 'Corte o hueco de tensión en la red'], ['Comprobar la tensión de alimentación', 'Revisar fusibles y acometida']),
      falla('4', 'Pérdida de fase de alimentación', ['Falta una fase de la red', 'Desequilibrio de tensión demasiado alto', 'Avería en el rectificador de entrada'], ['Comprobar la tensión y las corrientes de alimentación', 'Revisar fusibles: con uno fundido el equipo puede seguir arrancando y disparar bajo carga']),
      falla('30', 'Falta la fase U del motor', ['Corte en la fase U entre el variador y el motor'], ['Revisar el cable y las conexiones de esa fase', 'Con contactor aguas abajo, revisar sus contactos']),
      falla('31', 'Falta la fase V del motor', ['Corte en la fase V entre el variador y el motor'], ['Revisar el cable y las conexiones de esa fase']),
      falla('32', 'Falta la fase W del motor', ['Corte en la fase W entre el variador y el motor'], ['Revisar el cable y las conexiones de esa fase']),
      falla('9', 'Sobrecarga del inversor', ['Más del 100 % de carga durante demasiado tiempo'], ['Revisar la mecánica y la carga real', 'Comprobar que el variador esté bien dimensionado para el motor']),
      falla('10', 'Sobretemperatura del motor (ETR)', ['El modelo térmico del variador calculó que el motor está demasiado caliente'], ['Revisar la carga y la ventilación del motor', 'Verificar que la corriente nominal 1-24 sea la de la placa: mal cargada, la protección no sirve']),
      falla('11', 'Sobretemperatura por termistor del motor', ['El termistor (PTC) del motor detectó exceso de temperatura', 'Termistor desconectado'], ['Comprobar si el termistor está desconectado', 'Revisar carga y ventilación del motor', 'Esperar a que se enfríe antes de rearrancar']),
      falla('12', 'Límite de par', ['El par superó el límite configurado en 4-16 o 4-17'], ['Revisar la mecánica: es el síntoma típico de una cinta que empieza a trabarse', 'Ajustar el límite solo si se entiende por qué se llegó a él']),
      falla('59', 'Límite de intensidad', ['La corriente superó el límite de 4-18'], ['Revisar la carga', 'Comprobar el dimensionamiento del motor frente al trabajo real']),
      falla('34', 'Fallo de comunicación Fieldbus', ['Se cortó la comunicación con el bus'], ['Revisar el cableado del bus y sus terminaciones', 'Comprobar la configuración del maestro']),
      falla('65', 'Sobretemperatura de la tarjeta de control', ['Temperatura ambiente demasiado alta', 'Ventilación del tablero insuficiente'], ['Revisar la ventilación del tablero y los filtros', 'Medir la temperatura interna del tablero']),
      falla('104', 'Fallo del ventilador', ['El ventilador no gira o gira fuera de rango'], ['Revisar que el ventilador gire y esté limpio', 'Cambiar el ventilador: sin él, el equipo termina disparando por temperatura']),
    ],
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
      '0-** Func. / Display': [
        p('0-01', 'Idioma', '—', '—'),
        p('0-03', 'Ajustes regionales', 'Internacional / EE.UU.', 'Internacional', false,
          'Internacional deja 1-23 en 50 Hz; EE.UU. lo pone en 60. Cambiarlo por error deja el motor girando 20 % más rápido.'),
        p('0-2x', 'Display del LCP', '—', '—', false,
          'Qué se muestra en las tres líneas de la consola. Poner intensidad y frecuencia ahorra entrar al menú cada vez.'),
      ],
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
      '2-** Frenos': [
        p('2-00', 'Intensidad de mantenimiento CC', '—', 'según calibre'),
        p('2-10', 'Función de freno', 'off / resistencia / CA', 'off', false,
          'Si dispara sobretensión al desacelerar (fallo de bus), acá se habilita la resistencia de frenado.'),
        p('2-2x', 'Freno mecánico', '—', '—'),
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
      '14-2x Reset a fábrica': [
        p('14-22', 'Modo de funcionamiento', '[0] Normal · [2] Inicialización', '[0] Normal', false,
          'Paso 0 con un variador usado: poner [2], cortar la alimentación y volver a energizar — inicializa todo excepto registros de fallos y contadores. Después cargar los datos de esta ficha.'),
      ],
      '15-** / 16-** Información y lecturas': [
        p('15-00', 'Horas de funcionamiento', 'h', 'lectura'),
        p('15-03', 'Arranques', '—', 'lectura'),
        p('15-46', 'Referencia del variador', '—', 'lectura', false,
          'Acá está el código comercial del equipo — el que resuelve todos los «según calibre» de esta ficha.'),
        p('16-1x', 'Estado del motor', 'lectura', 'lectura', false,
          'Frecuencia, intensidad, par y estado térmico en vivo.'),
      ],
    },
    fallas: [
      falla('13', 'Sobrecorriente', ['Se superó el límite de intensidad máxima del inversor', 'Carga brusca o rampa demasiado rápida', 'Mecánica trabada'], ['Revisar si el mecanismo está trabado', 'Aumentar el tiempo de rampa 3-41', 'Verificar los datos del motor (1-2x) contra la placa']),
      falla('14', 'Fallo a tierra', ['Descarga de las fases de salida a tierra', 'Aislamiento deteriorado en motor o cable'], ['Medir aislamiento del motor y del cable', 'Revisar humedad y prensaestopas']),
      falla('16', 'Cortocircuito', ['Cortocircuito en el motor o en sus bornes'], ['Desconectar el motor y medir entre fases', 'Revisar el cable de salida']),
      falla('7', 'Sobretensión del bus CC', ['Deceleración demasiado rápida', 'Carga arrastrante', 'Tensión de red alta'], ['Aumentar el tiempo de rampa de deceleración 3-42', 'Evaluar resistencia de frenado']),
      falla('8', 'Baja tensión del bus CC', ['Corte o hueco de tensión en la red'], ['Comprobar la tensión de alimentación y los fusibles']),
      falla('4', 'Pérdida de fase de alimentación', ['Falta una fase de red o desequilibrio alto'], ['Comprobar las tres fases y los fusibles']),
      falla('30', 'Falta la fase U del motor', ['Corte en la fase U de salida'], ['Revisar cable y conexiones de esa fase']),
      falla('31', 'Falta la fase V del motor', ['Corte en la fase V de salida'], ['Revisar cable y conexiones de esa fase']),
      falla('32', 'Falta la fase W del motor', ['Corte en la fase W de salida'], ['Revisar cable y conexiones de esa fase']),
      falla('9', 'Sobrecarga del inversor', ['Más del 100 % de carga durante demasiado tiempo'], ['Revisar la mecánica y la carga real', 'Comprobar el dimensionamiento del equipo']),
      falla('10', 'Sobretemperatura del motor (ETR)', ['El modelo térmico calculó que el motor está demasiado caliente'], ['Revisar carga y ventilación del motor', 'Verificar que 1-24 tenga la corriente de placa']),
      falla('11', 'Sobretemperatura por termistor del motor', ['El PTC del motor detectó exceso de temperatura, o está desconectado'], ['Comprobar el termistor y su cableado', 'Revisar carga y ventilación del motor']),
      falla('12', 'Límite de par', ['El par superó el límite configurado'], ['Revisar la mecánica antes de tocar el límite']),
      falla('59', 'Límite de intensidad', ['La corriente superó el límite configurado'], ['Revisar la carga y el dimensionamiento']),
      falla('68', 'Safe Torque Off (STO)', ['Se activó la entrada de seguridad STO'], ['Revisar el circuito de seguridad y los bornes de STO', 'No puentear jamás: es la función de seguridad del equipo']),
      falla('69', 'Temperatura de la tarjeta de potencia', ['Temperatura ambiente demasiado alta', 'Ventilación insuficiente'], ['Revisar ventilación del tablero y filtros', 'Comprobar que el ventilador del equipo gire']),
      falla('47', 'Alimentación de 24 V baja', ['La fuente interna de 24 V cayó fuera de rango', 'Sobrecarga en los bornes de 24 V'], ['Revisar el consumo conectado a los 24 V', 'Desconectar sensores externos para descartar sobrecarga']),
      falla('34', 'Fallo de comunicación Fieldbus', ['Se cortó la comunicación con el bus'], ['Revisar cableado y terminaciones del bus']),
    ],
  },
  {
    id: 'v20',
    nombre: 'Siemens Sinamics V20',
    tipo: 'VFD con teclado',
    donde: 'Cinta cuello de cisnes · cinta transversal salida Baader 142',
    estado: 'listo',
    fuente:
      'SINAMICS V20 Inverter · Operating Instructions 09/2014 · A5E34559884 (Siemens, 348 págs, en _MANUALES). Rango, valor de fábrica y opciones de TODOS los parámetros de esta ficha verificados contra su capítulo «Parameter list».',
    menus: {
      'P00xx Nivel de acceso': [
        {
          codigo: 'P0003',
          descripcion: 'Nivel de acceso de usuario',
          rango: '0 a 4',
          fabrica: '1 · estándar',
          nota: 'En el nivel 1 no se ve la mayoría de los parámetros. Es la misma trampa que el LAC del Altistart y el P-14 del SEW.',
          opciones: [
            { valor: '0', que: 'Lista de parámetros definida por el usuario' },
            { valor: '1', que: 'Estándar', cuando: 'El de fábrica. Solo los parámetros de uso más frecuente.' },
            { valor: '2', que: 'Extendido', cuando: 'Hace falta para ver P0610, P0640 y casi todo lo de protección.' },
            { valor: '3', que: 'Experto' },
            { valor: '4', que: 'Servicio' },
          ],
        },
        p('P0004', 'Filtro de parámetros', '0 a 24', '0 · todos', false,
          'Filtra la lista por área (motor, comandos, comunicación…). En 0 no filtra nada.'),
      ],
      'P03xx Datos del motor': [
        p('P0304', 'Tensión nominal del motor', '10 a 2000 V', '400 V', true,
          'OJO con el valor de fábrica: viene en 400 V y la planta es 380 V. La etiqueta del V20 también dice «AC 400 V», pero esa es su tensión de diseño, no la de la red. Revisar que P0304 tenga la tensión de línea real.'),
        p('P0305', 'Corriente nominal del motor', '0,01 a 10000,00 A', '1,86 A', true),
        p('P0307', 'Potencia nominal del motor', '0,01 a 2000,00 kW', '0,75 kW', true),
        p('P0308', 'Coseno fi del motor', '0,000 a 1,000', '0,000', true),
        p('P0310', 'Frecuencia nominal del motor', '12,00 a 550,00 Hz', '50,00 Hz', true),
        p('P0311', 'Velocidad nominal del motor', '0 a 40000 rpm', '1395 rpm', true),
      ],
      'P06xx Protección del motor': [
        {
          codigo: 'P0610',
          descripcion: 'Reacción térmica I²t del motor',
          rango: '0 a 6',
          fabrica: '6 · aviso y disparo',
          nota: 'Actúa cuando el modelo térmico llega al umbral de P0604. De fábrica viene en 6, que SÍ dispara: bien así. Cuidado con dejarlo en 0 o en 4, que solo avisan y el motor sigue andando. La diferencia entre 0-2 y 4-6 es si el variador RECUERDA la temperatura del motor al reencender: los 4-6 sí, y por eso son los que sirven tras un corte de luz. En instalación UL508C debe quedar en 6.',
          opciones: [
            { valor: '0', que: 'Solo aviso', cuando: 'No recuerda la temperatura previa. El motor sigue andando.' },
            { valor: '1', que: 'Aviso, reducción de Imax y disparo F11', cuando: 'No recuerda la temperatura previa.' },
            { valor: '2', que: 'Aviso y disparo F11', cuando: 'No recuerda la temperatura previa.' },
            { valor: '4', que: 'Solo aviso', cuando: 'Recuerda la temperatura al reencender, pero el motor sigue andando.' },
            { valor: '5', que: 'Aviso, reducción de Imax y disparo F11', cuando: 'Recuerda la temperatura al reencender.' },
            { valor: '6', que: 'Aviso y disparo F11', cuando: 'El de fábrica, y el que exige UL508C.' },
          ],
        },
        p('P0604', 'Umbral de temperatura del motor', '0,0 a 200,0 °C', '130,0 °C', false,
          'Es el umbral que dispara la reacción de P0610.'),
        p('P0640', 'Factor de sobrecarga del motor', '10,0 a 400,0 %', '150,0 %'),
      ],
      'P07xx + P1000 Mando y consigna': [
        {
          codigo: 'P0700',
          descripcion: 'Fuente de las señales de mando',
          rango: '0 a 5',
          fabrica: '1 · teclado',
          nota: 'De fábrica manda el TECLADO, no el tablero: con el selector cableado y P0700 en 1, el variador no arranca y parece que estuviera malo. Va en 2.',
          opciones: [
            { valor: '0', que: 'Ajuste de fábrica' },
            { valor: '1', que: 'Panel de operador (teclado)', cuando: 'El de fábrica.' },
            { valor: '2', que: 'Bornes', cuando: 'El caso del selector en el tablero.' },
            { valor: '5', que: 'USS / Modbus por RS485' },
          ],
        },
        p('P0701', 'Función de la entrada digital 1', '0 a 99', '0'),
        p('P0702', 'Función de la entrada digital 2', '0 a 99', '0'),
        p('P1000', 'Fuente de la consigna de frecuencia', '0 a 77', '1 · potenciómetro motorizado (MOP)', false,
          'Se carga junto con P0700 y no es lo mismo: P0700 dice de dónde vienen las ÓRDENES, P1000 de dónde viene la VELOCIDAD.'),
      ],
      'P10xx-P11xx Rampas y límites': [
        p('P1080', 'Frecuencia mínima', '0,00 a 550,00 Hz', '0,00 Hz'),
        p('P1082', 'Frecuencia máxima', '0,00 a 550,00 Hz', '50,00 Hz'),
        p('P1120', 'Tiempo de aceleración', '0,00 a 650,00 s', '10,00 s'),
        p('P1121', 'Tiempo de deceleración', '0,00 a 650,00 s', '10,00 s'),
      ],
      'P13xx Modo de control y boost': [
        {
          codigo: 'P1300',
          descripcion: 'Modo de control',
          rango: '0 a 19',
          fabrica: '0 · V/f lineal',
          nota: 'El V20 es un equipo SOLO V/f: no tiene control vectorial, así que no hay que buscarlo. Para una cinta la V/f lineal (0) es lo que corresponde.',
          opciones: [
            { valor: '0', que: 'V/f con característica lineal', cuando: 'El de fábrica y lo normal en una cinta.' },
            { valor: '1', que: 'V/f con FCC', cuando: 'Compensa las pérdidas del estator: mejor par a baja velocidad.' },
            { valor: '2', que: 'V/f con característica cuadrática', cuando: 'Bombas y ventiladores: ahorra porque el par cae con el cuadrado de la velocidad.' },
            { valor: '3', que: 'V/f con característica programable', cuando: 'Es el único caso donde P1320/P1321 hacen algo.' },
            { valor: '4', que: 'V/f lineal con modo Economy', cuando: 'Baja la tensión para consumir menos.' },
            { valor: '5 / 6', que: 'V/f para aplicaciones textiles', cuando: 'Deshabilita la compensación de deslizamiento.' },
            { valor: '7', que: 'V/f cuadrática con modo Economy' },
            { valor: '19', que: 'V/f con consigna de tensión independiente' },
          ],
        },
        p('P1310', 'Elevación de tensión constante (boost)', '0,0 a 250,0 %', '50,0 %', false,
          'Súbelo si la cinta cuesta arrancar con carga.'),
        p('P1320', 'Curva V/f programable · coordenada de frecuencia 1', '0,00 a 550,00 Hz', '0,00 Hz', false,
          'No es un boost: es un punto de la curva V/f, y solo hace algo con P1300 = 3. Va en pareja con P1321, que es la coordenada de TENSIÓN del mismo punto.'),
        p('P1321', 'Curva V/f programable · coordenada de tensión 1', '0,0 a 3000,0 V', '0,0 V'),
      ],
      'r00xx Visualización (solo lectura)': [
        p('r0021', 'Frecuencia de salida filtrada', 'Hz', 'lectura'),
        p('r0025', 'Tensión de salida', 'V', 'lectura'),
        p('r0026', 'Tensión del bus DC filtrada', 'V', 'lectura'),
        p('r0027', 'Corriente de salida', 'A', 'lectura', false,
          'Compararla con P0305 dice si el motor está forzando.'),
        p('r0947', 'Último código de fallo', '—', 'lectura'),
      ],
      'P0010+P0970 Reset a fábrica': [
        p('P0010', 'Parámetro de puesta en marcha', '0 a 30', '0', false,
          'Ponerlo en 30 habilita el restablecimiento.'),
        {
          codigo: 'P0970',
          descripcion: 'Restablecer ajustes',
          rango: '0 a 21',
          fabrica: '0',
          nota: 'Paso 0 con un variador USADO: P0010 = 30 y después P0970 = 21. Con 21 vuelve a FÁBRICA borrando los ajustes de usuario guardados; con 1 vuelve a los ajustes de USUARIO si alguien los guardó, que en un equipo heredado es justo lo que no se quiere. Al terminar, el display muestra «88888» y P0970/P0010 vuelven solos a 0. Ojo: las macros de conexión Cn010/Cn011 NO se restablecen solas.',
          opciones: [
            { valor: '1', que: 'Volver a los ajustes de usuario', cuando: 'Si no hay guardados, va a fábrica igual.' },
            { valor: '21', que: 'Volver a fábrica borrando los ajustes de usuario', cuando: 'Es el que sirve con un equipo heredado.' },
          ],
        },
      ],
    },
    fallas: [
      falla('F1', 'Sobrecorriente', ['La potencia del motor (P0307) no corresponde a la del variador (r0206)', 'Cortocircuito en el cable del motor', 'Fallo a tierra', 'Motor trabado o sobrecargado'], ['Revisar si la cinta está trabada', 'Comprobar que P0307 corresponda a la potencia del variador', 'Medir aislamiento del cable y del motor', 'Aumentar el tiempo de aceleración P1120', 'Bajar el boost de arranque']),
      falla('F2', 'Sobretensión', ['Tensión de red demasiado alta', 'El motor está en modo regenerativo: la carga lo arrastra', 'Deceleración demasiado rápida'], ['Comprobar que la tensión de red esté dentro de límites', 'Aumentar el tiempo de deceleración P1121', 'Si la inercia es alta, evaluar resistencia de frenado']),
      falla('F3', 'Subtensión', ['Falló la red', 'Carga de choque fuera de los límites especificados'], ['Comprobar la tensión de alimentación', 'Revisar fusibles y acometida']),
      falla('F4', 'Sobretemperatura del variador', ['Variador sobrecargado', 'Ventilación insuficiente', 'Frecuencia de conmutación demasiado alta', 'Temperatura ambiente demasiado alta', 'Ventilador detenido'], ['Revisar que el ventilador gire con el equipo en marcha', 'Limpiar el disipador y revisar la ventilación del tablero', 'Comprobar que P0307 coincida con la potencia del variador']),
      falla('F5', 'I²t del variador', ['Variador sobrecargado', 'Ciclo de carga demasiado exigente', 'La potencia del motor supera la capacidad del variador'], ['Revisar el ciclo de trabajo real de la cinta', 'Comprobar el dimensionamiento motor / variador', 'No se puede resetear hasta que la carga acumulada (r0036) baje del umbral P0294']),
      falla('F11', 'Sobretemperatura del motor', ['Motor sobrecargado', 'Escalón de carga demasiado grande'], ['Revisar la carga y la mecánica', 'Verificar el umbral P0604 y la reacción P0610', 'Esperar a que el motor se enfríe']),
      falla('F12', 'Se perdió la señal de temperatura del variador', ['Cable cortado del sensor de temperatura del disipador'], ['Revisar el sensor: no es reparable en terreno, requiere servicio']),
      falla('F20', 'Rizado de CC demasiado alto', ['Habitualmente, la pérdida de una de las fases de entrada'], ['Revisar el cableado de la alimentación y los fusibles: la causa típica es una fase caída']),
      falla('F35', 'Se agotaron los intentos de rearranque', ['Se superó el número de intentos configurado en P1211'], ['IMPORTANTE: no subir P1211 sin buscar la causa. El equipo intentó rearrancar y no pudo — hay algo de fondo', 'Revisar el histórico de fallos con r0947']),
      falla('F41', 'Falló la identificación de datos del motor', ['No hay carga conectada (motor desconectado)', 'Se llegó al límite de corriente durante la identificación', 'La resistencia de estator identificada quedó fuera de rango'], ['Comprobar que el motor esté conectado antes de lanzar la identificación', 'Con contactor aguas abajo, cerrarlo durante el proceso', 'Verificar que los datos de placa cargados sean los correctos']),
      falla('F72', 'Sin consigna por USS / Modbus', ['No llegan valores del maestro dentro del tiempo de telegrama'], ['Revisar el maestro y el cableado del bus']),
      falla('F80', 'Se perdió la señal en la entrada analógica', ['Cable cortado', 'Señal fuera de límites'], ['Revisar el cable de la señal de consigna', 'Con 4-20 mA el corte se detecta; con 0-10 V no — vale la pena migrar si la señal es crítica']),
      falla('F85', 'Fallo externo', ['Lo disparó una señal externa por palabra de control'], ['Revisar qué equipo aguas arriba está pidiendo la parada', 'Comprobar P2106']),
      falla('A503', 'AVISO · Límite de subtensión', ['Falló la red', 'La tensión del bus (r0026) bajó del límite'], ['Comprobar la tensión de red antes de que se convierta en el fallo F3']),
      falla('A505', 'AVISO · I²t del variador', ['Se superó el nivel de aviso; con P0610 = 1 la corriente se reducirá'], ['Revisar que el ciclo de carga esté dentro de lo especificado: es la antesala de F5']),
      falla('A911', 'AVISO · Controlador Vdc_max activo', ['El variador está conteniendo la tensión del bus para no disparar'], ['Aumentar el tiempo de deceleración P1121', 'Es un aviso de que la rampa de parada es demasiado rápida para la inercia']),
      falla('A922', 'AVISO · Sin carga conectada', ['No hay motor conectado al variador'], ['Comprobar la conexión del motor: algunas funciones no trabajan como con carga']),
    ],
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
        p('dLtA', 'Tipo de conexión', 'LInE / dLt', 'LInE', false,
          'Solo el rango ATS22pppQ admite montaje dentro del triángulo, y ahí la red no puede pasar de 440 V.'),
        p('Uln', 'Tensión de alimentación', 'Q: 200 a 440 V · S6: 200 a 600 V', 'Q: 400 V · S6: 480 V', false,
          'Es la referencia de las protecciones de sobre y subtensión. Mal ajustada, dispara sin motivo.'),
        p('In', 'Int. nominal del motor', '0,4·IcL hasta IcL', 'según capacidad', true,
          'Conectado en línea: In = corriente de placa. Dentro del triángulo del motor: In = corriente de placa ÷ √3.'),
        p('Cod', 'Protección de parámetros', 'nLOC / LOC', 'nLOC'),
        p('LAC', 'Modo avanzado', 'oFF / On', 'oFF', false,
          'Va al final del menú ConF. En oFF quedan ocultos PrO, SEt2, IO, COP y la mitad de SUP.'),
      ],
      'SEt Ajustes': [
        p('t90', 'Tensión inicial', '10 a 50 % (incrementos de 5)', '30 %', false,
          'Debe alcanzar para que el motor gire apenas se le aplica tensión.'),
        p('ILt', 'Limitación de intensidad', '200 a 700 % de In (máx. 350 % de IcL)', '350 %', false,
          'Si la aplicación pide más de 350 % de IcL, hay que sobredimensionar el arrancador.'),
        p('tLS', 'Tiempo de arranque máximo', '1 a 250 s', '15 s', false,
          'Tiene que ser mayor que ACC, si no dispara StF en cada partida.'),
        p('ACC', 'Tiempo de aceleración', '1 a 60 s', '10 s'),
        p('dEC', 'Tiempo de deceleración', 'FrEE, 1 a 60 s', 'FrEE'),
        p('EdC', 'Fin de deceleración', '0 a 10', '0', false, 'Inactivo cuando dLtA = dLt.'),
        p('tHP', 'Protección térmica del motor', 'clase IEC 10 / 20 / 30', '10', false,
          'Para que actúe hay que poner ItH en On o ErUn.'),
      ],
      'AdJ Avanzados': [
        p('Snb', 'Número de arranques', 'oFF, 1 a 10', 'oFF', false,
          'Limita arranques y paradas dentro del período SLG. Al superarlo dispara SnbF.'),
        p('SLG', 'Período de conteo', '—', '—'),
        p('bSt', 'Tiempo de boost', '—', '0'),
      ],
      'SEt2 2º juego de ajustes': [
        p('t92', '2ª tensión inicial', '10 a 50 % de Uln (incrementos de 5)', '30 %', false,
          'SEt2 es un segundo conjunto de los 5 parámetros de SEt, con la misma definición. Sirve cuando el mismo arrancador mueve dos motores distintos o una carga con dos regímenes. Se conmuta por Modbus o por una entrada lógica puesta en 2nd.'),
        p('ILt2', '2º límite de intensidad', '200 a 700 % de In2 (máx. 350 % de IcL)', '350 %'),
        p('ACC2', '2º tiempo de aceleración', '1 a 60 s', '10 s'),
        p('dEC2', '2º tiempo de deceleración', 'FrEE, 1 a 60 s', 'FrEE'),
        p('In2', '2ª int. nominal del motor', '0,4·IcL hasta IcL', 'según capacidad', true),
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
      'IO Entradas / Salidas': [
        p('LI2', 'Entrada lógica 2', 'Strt / rUn / 2nd / EtF / rSt / FAn / FI / LIL', 'rUn · marcha', false,
          'Borne del selector de marcha. rUn es para control 2 hilos (selector mantenido); Strt para 3 hilos (pulsadores). 2nd es lo que activa el 2º juego de ajustes (SEt2). Regleta real: LI1 LI2 LI3 24V Com — no hay LI4.'),
        p('LI3', 'Entrada lógica 3', 'Strt / rUn / 2nd / EtF / rSt / FAn / FI / LIL', 'rSt · reset'),
        p('r1', 'Configuración del relé R1', 'trIp / rUn / rdY / ALr / nStP / StPd', 'trIp', false,
          'Para mandar un contactor de línea, el relé debe estar en trIp: así el contactor cae cuando el arrancador falla.'),
        p('r2', 'Configuración del relé R2', 'trIP / rUn / rdY / ALr / nStP / StPd', '—'),
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
      'P-07…P-11 Datos del motor y boost': [
        p('P-07', 'Tensión nominal del motor', '0, 20 a 500 V', '400 V', true,
          'La planta es 380 V. Poner 0 desactiva la compensación de tensión.'),
        p('P-08', 'Corriente nominal del motor', '25 a 100 % de la corriente del variador', 'según motor DR', true,
          'Es también el nivel de protección por sobrecarga. En el variador que mueve dos cintas, este valor cubre la SUMA de ambos motores, no cada uno.'),
        p('P-09', 'Frecuencia nominal del motor', '25 a 500 Hz', '50 Hz', true),
        p('P-10', 'Velocidad nominal del motor', '0 a 30000 rpm', '0', true,
          'Si se carga distinto de 0, todos los parámetros de velocidad pasan a mostrarse en rpm y se activa la compensación de deslizamiento.'),
        p('P-11', 'Refuerzo de tensión (boost)', '0 a 20 % de la tensión máx.', 'Tamaño 1: 20 % · Tamaño 2: 15 %', false,
          'Sube la tensión a baja velocidad para ayudar a partir con carga. Es también el nivel que usa el frenado por inyección de CC de P-32.'),
      ],
      'P-12…P-14 Mando y acceso': [
        p('P-12', 'Fuente de mando', '0 bornes · 1 teclado · 2 teclado con inversión · 3-4 SBus', '0 · bornes', false,
          'Es el equivalente al tCC de Schneider: define si manda el selector del tablero o el teclado.'),
        p('P-13', 'Registro de fallos', 'últimos 4 disparos', '—', false,
          'Guarda los 4 últimos disparos, el más reciente primero. Es lo primero que hay que mirar cuando alguien dice «se paró sola y volvió».'),
        p('P-14', 'Código de acceso al menú extendido', '0 a 9999', '0', false,
          'El código es 101 (lo dice el manual). Sin escribirlo, los parámetros P-15 en adelante ni aparecen y parece que el equipo no los tuviera — misma trampa que el LAC del Altistart 22. Se puede cambiar en P-37 para que no lo toque cualquiera.'),
      ],
      'P-15…P-19 Entradas y salidas': [
        p('P-15', 'Función de las entradas digitales', '0 a 12', '0'),
        p('P-16', 'Formato de la entrada analógica', '0-10 V · 0-20 mA · 4-20 mA (t/r) · 20-4 mA', '0-10 V', false,
          'Con las variantes «t» el variador DISPARA si se pierde la señal; con las «r» sigue andando a la velocidad fija 1. Con 0-10 V no hay forma de distinguir cable cortado de consigna en cero.'),
        p('P-17', 'Frecuencia de conmutación de salida', '2 a 16 kHz', '4 / 8 kHz', false,
          'Más alta = menos ruido audible del motor, más calentamiento del variador.'),
        p('P-18', 'Función del relé de salida', '0 a 7', '1 · variador sano'),
        p('P-19', 'Límite del relé de salida', '0 a 200 %', '100,0 %'),
      ],
      'P-20…P-29 Velocidades fijas y curva V/f': [
        p('P-20', 'Velocidad preseleccionada 1', '−P-01 a P-01', '0,0 Hz'),
        p('P-21', 'Velocidad preseleccionada 2', '−P-01 a P-01', '0,0 Hz'),
        p('P-22', 'Velocidad preseleccionada 3', '−P-01 a P-01', '0,0 Hz'),
        p('P-23', 'Velocidad preseleccionada 4', '−P-01 a P-01', '0,0 Hz'),
        p('P-24', 'Rampa de deceleración 2', '0 a 25 s', '0', false,
          'Se elige por entrada digital, o entra sola al perder la red según P-05.'),
        p('P-25', 'Función de la salida analógica', '0 a 8', '0'),
        p('P-26', 'Banda de histéresis de frecuencia evitada', '0 a P-01', '0'),
        p('P-27', 'Frecuencia evitada', 'P-02 a P-01', '0 Hz'),
        p('P-28', 'Ajuste de la curva V/f · tensión', '—', '—'),
        p('P-29', 'Ajuste de la curva V/f · frecuencia', '0 a P-09', '0 Hz'),
      ],
      'P-30…P-40 Arranque, protección y escalados': [
        p('P-30', 'Función de rearranque en modo bornes', 'Edge-r · Auto-0 a Auto-5', 'Auto-0', false,
          'OJO: de fábrica viene en Auto-0, que arranca en cuanto la señal de marcha está presente — o sea, la cinta PUEDE partir sola al volver la luz si el selector quedó cerrado. Edge-r es el que exige un flanco nuevo. Es el equivalente del tCt del Altivar, pero acá el valor de fábrica NO es el seguro.'),
        p('P-31', 'Función de rearranque en modo teclado', '0 a 3', '1', false,
          'Con 0 o 1 hay que apretar <start>. Con 2 o 3 arranca con la sola señal de habilitación.'),
        p('P-32', 'Frenado por inyección de CC · duración', '0 a 25 s', '0,0 s', false,
          'Con valor > 0 inyecta CC al llegar a velocidad cero con la orden de parada puesta, usando el nivel de P-11. Solo actúa al PARAR, no al arrancar.'),
        p('P-33', 'Arranque al vuelo', '0 desactivado · 1 activado', '0'),
        p('P-34', 'Chopper de frenado', '0 a 3', '0'),
        p('P-35', 'Escalado de la entrada analógica', '0 a 500 %', '100 %'),
        p('P-36', 'Dirección de comunicación', '0 desactiva · 1 a 63', '1'),
        p('P-37', 'Definición del código de acceso', '0 a 9999', '101', false,
          'Cambiar esto es lo que impide que cualquiera entre al menú extendido con el 101 de fábrica.'),
        p('P-38', 'Bloqueo de acceso a parámetros', '0 a 1', '0'),
        p('P-39', 'Offset de la entrada analógica', '−500 a 500 %', '0 %'),
        p('P-40', 'Factor de escala del valor mostrado', '0 a 6', '0,000', false,
          'Multiplica la velocidad mostrada. Sirve para que el display marque m/min de cinta en vez de Hz.'),
      ],
      'P-00 Monitoreo en vivo (solo lectura)': [
        p('P-00', 'Índice de lecturas en tiempo real', 'P00-1 a P00-14', 'lectura', false,
          'No es un parámetro: es un índice. Parado en P-00 se pulsa <navigate> y aparece «P00-z»; ahí se recorren las 14 lecturas (corriente, tensión de bus, temperatura, horas). Es diagnóstico sin desarmar nada.'),
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
    aviso:
      'Este equipo NO tiene códigos de falla: no tiene display. Señaliza con cuatro LED verdes (listo/standby · rampa arriba-abajo · marcha · rampa completada) y un relé de fallo, más la protección de sobrecarga. El diagnóstico se hace midiendo, no leyendo un código. El catálogo no documenta los parpadeos: para eso hace falta el manual de instalación del PSR, que no está en la carpeta.',
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
  /**
   * Sin esto el equipo no queda bien configurado, aunque la cinta ande.
   * Se usa al cambiar de marca: si el repuesto lo pide y la receta original no
   * lo traía, hay que avisarlo — es lo que se olvida y después se paga.
   */
  imprescindible?: boolean
  /**
   * `false` = el concepto es el mismo pero el VALOR no se copia, porque cada
   * marca lo expresa distinto. Ejemplo real: la protección térmica del Altivar
   * (`ItH`) son AMPERE y la del Altistart (`tHP`) es una CLASE 10/20/30 —
   * arrastrar el «10» de una a otra deja el motor sin protección.
   */
  valorTransferible?: boolean
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
    imprescindible: true,
    dePlaca: true,
    codigos: { atv: 'UnS', danfoss: '1-22', v20: 'P0304', sew: 'P-07', ats22: null },
    nota: 'El Altistart no lo pide: no sintetiza tensión, la rampa la hace sobre la red. Su Uln es la tensión de LÍNEA, que es otra cosa. Y ojo en todos: la planta es 380 V, no los 400 V nominales de placa.',
  },
  {
    concepto: 'Corriente nominal del motor',
    imprescindible: true,
    dePlaca: true,
    codigos: { atv: 'nCr', danfoss: '1-24', v20: 'P0305', sew: 'P-08', ats22: 'In' },
    nota: 'El dato más crítico: fija la protección térmica en los cinco. Nunca se estima. En el ATS22 dentro del triángulo va dividido por √3.',
  },
  {
    concepto: 'Frecuencia nominal del motor',
    imprescindible: true,
    dePlaca: true,
    codigos: { atv: 'FrS', danfoss: '1-23', v20: 'P0310', sew: 'P-09', ats22: null },
    nota: 'Un partidor suave no varía la frecuencia, por eso no la pide.',
  },
  {
    concepto: 'Velocidad nominal del motor',
    imprescindible: true,
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
    valorTransferible: false,
    imprescindible: true,
    codigos: { atv: 'ItH', danfoss: '1-90', v20: 'P0610', sew: 'P-08', ats22: 'tHP + ItH' },
    nota: 'Dos trampas distintas. En el Altistart son DOS parámetros: tHP fija la clase y ItH es el interruptor maestro — con ItH apagado, tHP no hace nada. En el Siemens, P0610 = 0 significa «solo aviso, sin reacción»: el variador avisa y sigue andando. Vale revisar cómo quedó cargado.',
  },
  {
    concepto: 'Fuente de mando (selector / botonera)',
    valorTransferible: false,
    imprescindible: true,
    codigos: { atv: 'tCC + tCt', danfoss: '5-10…5-13', v20: 'P0700', sew: 'P-12', ats22: 'LI2' },
    nota: 'El bloque que no está en ninguna placa. En el Altivar, tCt decide si la cinta arranca sola al volver la luz.',
  },
  {
    concepto: 'Rearranque tras un corte de red',
    valorTransferible: false,
    imprescindible: true,
    codigos: {
      atv: 'tCt + Atr',
      danfoss: '14-20 / 14-21',
      v20: 'P1210 + P1211',
      sew: 'P-30',
      ats22: 'LI2 (rUn / Strt)',
    },
    nota: 'El ajuste más peligroso del catálogo: decide si la cinta arranca sola cuando vuelve la luz con el selector cerrado. Y el valor de fábrica NO siempre es el seguro: en el Altivar sí (tCt = trn exige un flanco nuevo), pero en el SEW viene en Auto-0, que arranca solo, y en el V20 el P1210 viene en 1. Al cambiar de marca hay que decidirlo a mano, no heredarlo.',
  },
  {
    concepto: 'Autoajuste al motor',
    valorTransferible: false,
    imprescindible: true,
    codigos: { atv: 'tUn', danfoss: '1-29 (AMA)', v20: null, sew: null, ats22: null },
    nota: 'Correr SIEMPRE después de cargar los datos de placa, nunca antes.',
  },
  {
    concepto: 'Acceso al menú avanzado',
    valorTransferible: false,
    codigos: { atv: null, danfoss: null, v20: null, sew: 'P-14', ats22: 'LAC' },
    nota: 'La trampa compartida de SEW y Altistart: si no se habilita, la mitad de los parámetros ni aparecen y parece que el equipo no los tuviera.',
  },
  {
    concepto: 'Copiar configuración a otro equipo',
    valorTransferible: false,
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

/** Qué fichas del catálogo cubre cada columna de la tabla de equivalencias. */
export const FICHAS_POR_COLUMNA: Record<string, string[]> = {
  atv: ['atv312', 'atv31'],
  danfoss: ['danfoss-ad', 'danfoss-midi'],
  v20: ['v20'],
  sew: ['sew'],
  ats22: ['ats22'],
}

/** Dónde vive un parámetro concreto: ficha + menú, para poder saltar hasta él. */
export interface UbicacionParametro {
  fichaId: string
  fichaNombre: string
  menu: string
  parametro: ParametroVariador
}

/** Una marca dentro de una comparación, con el dato real si está catalogado. */
export interface CeldaComparacion {
  columna: string
  titulo: string
  /** Código en esa marca, o `null` si ese equipo no pide el parámetro. */
  codigo: string | null
  /** Presente solo si el código existe en el catálogo (trae rango y fábrica). */
  ubicacion?: UbicacionParametro
}

/** Busca un código dentro de las fichas indicadas. Exacto primero, luego prefijo. */
export function ubicarParametro(codigo: string, fichaIds?: string[]): UbicacionParametro | null {
  const c = codigo.trim().toLowerCase()
  if (!c) return null
  const fichas = fichaIds ? VARIADORES.filter((f) => fichaIds.includes(f.id)) : VARIADORES
  let aproximado: UbicacionParametro | null = null
  for (const f of fichas) {
    for (const [menu, filas] of Object.entries(f.menus ?? {})) {
      for (const parametro of filas) {
        const cod = parametro.codigo.toLowerCase()
        const hit = { fichaId: f.id, fichaNombre: f.nombre, menu, parametro }
        if (cod === c) return hit
        if (!aproximado && (cod.startsWith(c) || c.startsWith(cod))) aproximado = hit
      }
    }
  }
  return aproximado
}

/**
 * Resuelve una fila de equivalencias contra el catálogo real.
 *
 * La tabla de equivalencias dice que `nCr` es `1-24` en Danfoss, pero no dice
 * en qué menú vive ni con qué rango — que es lo que hace falta para configurar
 * el repuesto. Esto ata cada código a su parámetro de verdad, así se puede
 * comparar rango y valor de fábrica marca por marca, y saltar hasta cualquiera.
 *
 * Un código sin ubicación NO es un error: puede ser un parámetro que la ficha
 * todavía no cataloga (ej. `Uln` del Altistart). La celda lo muestra igual.
 */
export function compararEquivalencia(e: EquivalenciaParametro): CeldaComparacion[] {
  return COLUMNAS_EQUIVALENCIA.map((col) => {
    const codigo = e.codigos[col.id] ?? null
    if (!codigo) return { columna: col.id, titulo: col.titulo, codigo: null }
    // «ACC / dEC» o «1-71 + 1-72»: el primer token es el que se busca.
    const token = codigo.split(/[\s/+]+/)[0] ?? codigo
    return {
      columna: col.id,
      titulo: col.titulo,
      codigo,
      ubicacion: ubicarParametro(token, FICHAS_POR_COLUMNA[col.id]) ?? undefined,
    }
  })
}

/** ¿Es un variador (regula velocidad) o un partidor suave (solo arranca y para)? */
export function esVariador(f: FichaVariador): boolean {
  return f.tipo.startsWith('VFD')
}

/** Columna de la tabla de equivalencias a la que pertenece una ficha. */
export function columnaDeFicha(fichaId: string): string | null {
  for (const [col, ids] of Object.entries(FICHAS_POR_COLUMNA)) {
    if (ids.includes(fichaId)) return col
  }
  return null
}

/** El concepto al que corresponde un código de receta («P1120 / P1121» incluido). */
function conceptoDe(codigo: string): EquivalenciaParametro | null {
  for (const token of codigo.split(/[\s/+]+/)) {
    const e = equivalenciaDe(token)
    if (e) return e
  }
  return null
}

/** Un valor de la receta, ya traducido al dialecto del repuesto. */
export interface FilaTraducida {
  concepto: string
  /** `false` = mismo concepto, pero el valor NO se copia tal cual. */
  valorTransferible: boolean
  codigoOrigen: string
  /** `null` = el repuesto no pide este parámetro. No es un dato que falte. */
  codigoDestino: string | null
  valor: string
  estado: EstadoValor
  nota?: string
}

export interface TraduccionReceta {
  destino: FichaVariador
  /** `false` = el repuesto no puede hacer el trabajo del original. */
  compatible: boolean
  motivo?: string
  filas: FilaTraducida[]
  /** Lo que el repuesto pide y la receta original NO traía. El punto ciego. */
  pideAdemas: {
    codigo: string
    concepto: string
    /** Menú del repuesto donde vive, para saber a dónde ir. */
    menu?: string
    /** Rango y valor de fábrica del repuesto. */
    rango?: string
    fabrica?: string
    nota?: string
  }[]
  /** Valores de la receta sin equivalencia conocida: se muestran sin traducir. */
  sinTraducir: ValorReceta[]
}

/**
 * Traduce la receta de una posición al dialecto de otra familia.
 *
 * Devuelve tres bloques distintos a propósito, porque cambiar de marca no es
 * renombrar códigos: lo que se traduce, lo que el repuesto pide de más (si nadie
 * lo carga la cinta anda igual… hasta que arranca sola o se quema el motor) y lo
 * que el repuesto no pide.
 */
export function traducirReceta(pos: PosicionReceta, destinoId: string): TraduccionReceta | null {
  const destino = VARIADORES.find((f) => f.id === destinoId)
  if (!destino) return null
  const col = columnaDeFicha(destinoId)
  const origen = pos.variadorId ? VARIADORES.find((f) => f.id === pos.variadorId) ?? null : null

  // Un partidor suave arranca y para, pero no regula velocidad: no reemplaza a
  // un variador de cinta. Al revés sí — un variador hace las dos cosas.
  const compatible = !(origen !== null && esVariador(origen) && !esVariador(destino))

  const filas: FilaTraducida[] = []
  const sinTraducir: ValorReceta[] = []
  const cubiertos = new Set<string>()

  for (const val of pos.valores) {
    // Un valor puede traer dos códigos («P1120 / P1121» = las dos rampas). Cada
    // uno es un concepto distinto y se traduce por separado: mostrarlos juntos
    // haría perder la mitad de la traducción.
    const tokens = val.codigo.split(/\s*\/\s*/).filter(Boolean)
    const conceptos = tokens.map((tk) => ({ tk, e: conceptoDe(tk) }))
    if (!col || conceptos.every((c) => c.e === null)) {
      sinTraducir.push(val)
      continue
    }
    for (const { tk, e } of conceptos) {
      if (!e) continue
      cubiertos.add(e.concepto)
      filas.push({
        concepto: e.concepto,
        valorTransferible: e.valorTransferible !== false,
        codigoOrigen: tk,
        codigoDestino: e.codigos[col] ?? null,
        valor: val.valor,
        estado: val.estado,
        nota: val.nota,
      })
    }
  }

  const pideAdemas = col
    ? EQUIVALENCIAS.filter(
        (e) => e.imprescindible && e.codigos[col] && !cubiertos.has(e.concepto),
      ).map((e) => {
        const cod = e.codigos[col] as string
        const u = ubicarParametro(cod.split(/[\s/+(]+/)[0] ?? cod, FICHAS_POR_COLUMNA[col])
        // La nota del repuesto, NO la de la fila de equivalencias: esa habla de
        // las otras marcas y acá confunde («en el Altistart…» traduciendo a un
        // Altivar). Si el parámetro no tiene nota, el menú y el rango bastan.
        return {
          codigo: cod,
          concepto: e.concepto,
          menu: u?.menu,
          rango: u?.parametro.rango,
          fabrica: u?.parametro.fabrica,
          nota: u?.parametro.nota,
        }
      })
    : []

  return { destino, compatible, motivo: compatible ? undefined : `El ${destino.nombre} es un partidor suave: arranca y para, pero no regula velocidad.`, filas, pideAdemas, sinTraducir }
}

/** Las familias a las que se puede traducir una receta (todas menos la puesta). */
export function alternativasPara(pos: PosicionReceta): FichaVariador[] {
  return VARIADORES.filter((f) => f.id !== pos.variadorId && columnaDeFicha(f.id) !== null)
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

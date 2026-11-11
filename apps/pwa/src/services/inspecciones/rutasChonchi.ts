/**
 * Las rutas de inspección de Chonchi, del registro **R-MAN-CH-004** «Registro de inspección
 * diaria · Mantención Planta Chonchi» (revisión 1).
 *
 * Se llenaba en papel y se dejó de hacer porque el imprimible se mojaba en planta (Orel,
 * 26-09-2026): el proceso servía, lo mató el soporte. Al digitalizarlo cambia una cosa a
 * propósito — **no se impone frecuencia**. El papel decía «diaria» en el título y «semanal» en
 * el pie, y con un equipo reducido ninguna de las dos se cumple. La app muestra cuánto hace que
 * no se recorre y ordena por eso: la presión la pone el número, no una alarma.
 *
 * ⚠ En las áreas 1 y 2 el Excel **nunca llenó la columna del equipo** — solo la actividad, con
 * tres celdas donde quedó pegado el texto `#VALUE!`. Ahí el punto ES la actividad, tal como
 * está en el papel, y va con `sinEquipo` para que se vea qué falta. NO se adivina el equipo:
 * ligar un hallazgo al equipo equivocado haría mentir a su tendencia, que es justo lo que esto
 * viene a resolver.
 *
 * Generado desde `Inspeccion diaria.xlsx`. Se edita en Firestore (`rutasInspeccion/{id}`) y esto
 * queda de respaldo, igual que `PAUTA_POST_ASEO`.
 */
import type { RutaInspeccion } from './modeloRuta'

export const RUTAS_CHONCHI: RutaInspeccion[] = [
  {
    id: 'recepcion',
    nombre: 'Recepción cosecha',
    equipos: [
      { id: 'recepcion-revision-y-limpieza-de-aspersores-', nombre: 'Revisión y limpieza de aspersores en salida de chiller,…', actividad: 'Revisión y limpieza de aspersores en salida de chiller, desangrador y tobogán de alimentación, junto con la inspección de válvulas de corte para el suministro de agua', sinEquipo: true },
      { id: 'recepcion-revision-de-la-presion-del-acumula', nombre: 'Revisión de la presión del acumulador Stuner entre 6 y 7 bar', actividad: 'Revisión de la presión del acumulador Stuner entre 6 y 7 bar (incluye verificación de la alimentación de aire y válvulas de corte neumáticas)', sinEquipo: true },
      { id: 'recepcion-revision-de-presion-durante-la-act', nombre: 'Revisión de presión durante la activación del STUNER, el cual…', actividad: 'Revisión de presión durante la activación del STUNER, el cual opera a 5 bar de presión', sinEquipo: true },
      { id: 'recepcion-carga-53-corridas-por-4-espacios-r', nombre: 'Carga: 53 corridas por 4 espacios, resultando en simultaneo 212…', actividad: 'Carga: 53 corridas por 4 espacios, resultando en simultaneo 212 unidades. Recorrido 4 minutos con 54 segundos en 48 hz a 50 hz de trabajo', sinEquipo: true },
      { id: 'recepcion-revision-de-funcionamiento-de-6-eq', nombre: 'Revisión de funcionamiento de 6 equipos de 380 V', actividad: 'Revisión de funcionamiento de 6 equipos de 380 V', sinEquipo: true },
    ],
  },
  {
    id: 'hg-clasificado',
    nombre: 'HG · Clasificado · Emparrillado',
    equipos: [
      { id: 'hg-clasificado-revisar-motoreductor-de-1-5-kw-ver', nombre: 'Revisar motoreductor de 1,5 kW: verificación de ruidos…', actividad: 'Revisar motoreductor de 1,5 kW: verificación de ruidos anormales, correcto funcionamiento, tensión de la cinta y posicionamiento del sprocket', sinEquipo: true },
      { id: 'hg-clasificado-revision-integral-de-la-cinta-tran', nombre: 'Revisión integral de la cinta transportadora, incluyendo…', actividad: 'Revisión integral de la cinta transportadora, incluyendo verificación de tensión y alineación del sprocket, inspección del soporte estructural, evaluación del mototambor de 0,55 kW con consumo de 2,13 A, y comprobación del correcto funcionamiento del variador de frecuencia operando a 50 Hz', sinEquipo: true },
      { id: 'hg-clasificado-revision-integral-de-la-cinta-tran-2', nombre: 'Revisión integral de la cinta transportadora, incluyendo…', actividad: 'Revisión integral de la cinta transportadora, incluyendo verificación de tensión y alineación del sprocket, inspección del soporte estructural, evaluación del mototambor de 0,37 kW y 0,82 A de consumo, junto con su respectivo variador de frecuencia operando a 50 Hz, y calibración del sistema a 5 kg', sinEquipo: true },
      { id: 'hg-clasificado-revision-de-cinta-transportadora-v', nombre: 'Revisión de cinta transportadora, verificación de presión en…', actividad: 'Revisión de cinta transportadora, verificación de presión en cilindros modelo 32x50, revisión de distancia de flapper en 4 unidades, inspección de motoreductor de 0,75 kW (relación 9,23) y del variador de frecuencia', sinEquipo: true },
      { id: 'hg-clasificado-chequeo-de-conmutacion-e-interrupt', nombre: 'Chequeo de conmutacion e interruptor de seguridad, revison de…', actividad: 'chequeo de conmutacion e interruptor de seguridad, revison de cuchillas, funcionamiento de cintas prismas, cheque y regulacion de presion de aire y presion de agua, puesta de contador en cero, comprobar elemento de conmutacion 360°, revision de vacio en vacuometro chequeo de sopladores, comprobar funcionamiento en test 12, comprobar altura de herramientas, funcionamiento de sensores, chequeo de vacio en repaso y Knuro, limpieza sensores de nivel acumuladores, funcionamiento de bba helicoidal, chequeo de correas', sinEquipo: true },
      { id: 'hg-clasificado-limpieza-de-sensores-de-nivel-en-a', nombre: 'Limpieza de sensores de nivel en acumulador, funcionamiento de…', actividad: 'Limpieza de sensores de nivel en acumulador, funcionamiento de bba helicoidal de 0,75KW y 2,72 A', sinEquipo: true },
      { id: 'hg-clasificado-revisar-cinta-tension-guias-teflon', nombre: 'Revisar cinta (tension), guias teflon, sprocket, motoreductor…', actividad: 'Revisar cinta (tension), guias teflon, sprocket, motoreductor de 0,75KW a 33,7HZ y limpieza de aspersores', sinEquipo: true },
      { id: 'hg-clasificado-chequeo-de-funcionamiento-valvula-', nombre: 'Chequeo de funcionamiento valvula mariposa, chequeo de cierre y…', actividad: 'Chequeo de funcionamiento valvula mariposa, chequeo de cierre y apertura, revisar lineas de alimentacion de aire tubin 8, chequeo de bbas de vacio y sistema logo', sinEquipo: true },
      { id: 'hg-clasificado-chequeo-de-presion-de-aire-revisio', nombre: 'Chequeo de presión de aire, revisión del sistema de apertura de…', actividad: 'Chequeo de presión de aire, revisión del sistema de apertura de pocket, verificación de horquillas y resortes, inspección de cilindros interiores y exteriores (vástagos), revision de botoneras led para grados y calibración de celdas modelo AK-300 a 5 kg', sinEquipo: true },
      { id: 'hg-clasificado-revision-de-modulos-de-la-cinta-tr', nombre: 'Revisión de módulos de la cinta transportadora, verificación y…', actividad: 'Revisión de módulos de la cinta transportadora, verificación y ajuste de tensión, chequeo del sensor de ingreso, revision de motoreductor de 1,5KW, inspección del variador de frecuencia, operando a 1.400 RPM y 47,1 Hz, alcanzando una velocidad de 61 ppm (referencias: 1.350 RPM = 60 ppm, 1.440 RPM = 62 ppm, 1.600 RPM = 66 ppm)', sinEquipo: true },
      { id: 'hg-clasificado-revision-de-modulos-de-cintas-tras', nombre: 'Revision de modulos de cintas trasportadora, revision de ruezal…', actividad: 'Revision de modulos de cintas trasportadora, revision de ruezal azules de guia, revision mototambor de 0,25KW a 0,71A y variador de frecuencia en 43.3 HZ', sinEquipo: true },
      { id: 'hg-clasificado-revision-de-modulos-de-cinta-trans', nombre: 'Revisión de módulos de cinta transportadora, inspección de…', actividad: 'Revisión de módulos de cinta transportadora, inspección de rieles guía azules, verificación del mototambor de 0,25 kW con consumo de 0,71 A y variador de frecuencia ajustado a 0,83 Hz (1500 RPM), además del chequeo de sensores emisor y receptor', sinEquipo: true },
      { id: 'hg-clasificado-revision-de-modulos-de-la-cinta-tr-2', nombre: 'Revisión de módulos de la cinta transportadora, verificación de…', actividad: 'Revisión de módulos de la cinta transportadora, verificación de cilindros neumáticos modelo 32x50 y de su sistema de soportación, control de presión de aire, inspección de bloques neumáticos, revisión de señales en tarjetas SMV221 (3 unidades), chequeo de fleppers (12 unidades), inspección del tambor de tracción, verificación de botoneras LED para cierre de compuertas y comprobación del funcionamiento de paradas de emergencia', sinEquipo: true },
      { id: 'hg-clasificado-punto-cero', nombre: 'PUNTO CERO', actividad: 'CHEQUEO BALANZA' },
    ],
  },
  {
    id: 'filete',
    nombre: 'Filete',
    equipos: [
      { id: 'filete-baader-200', nombre: 'BAADER 200', actividad: 'REVISION CUCHILLOS DORSALES, VENTRALE, CORTE DE COLA, ALTURA PUNZONES, RASPADORES, CADENA SILLETAS, CINTAS SALIDA Y PANEL DE CONTROL TOUCH' },
      { id: 'filete-volteador-bins', nombre: 'VOLTEADOR BINS', actividad: 'REVISAR NIVEL DE ACEITE HIDRAULICO, MANGERAS, CILINDRO, MANDO HIDRAULICO Y TABLERO DE CONTRO' },
      { id: 'filete-cinta-pinponeo', nombre: 'CINTA PINPONEO', actividad: 'PUESTA EN MARCHA, REVISAR CINTA, MOTOREDUCTOR, PARADAS DE EMERGECIA Y VARIADOR DE FRECUENCIA' },
      { id: 'filete-cinta-desperdicio-1-y-2', nombre: 'CINTA DESPERDICIO 1 Y 2', actividad: 'PUESTA EN MARCHA, REVISAR CINTA, MOTOREDUCTOR, PARADAS DE EMERGECIA Y VARIADOR DE FRECUENCIA' },
      { id: 'filete-tolva-esquelones', nombre: 'TOLVA ESQUELONES', actividad: 'CHEQUEO DE PRESION VALVULA MARIPOSA Y VACIO DE SISTEMA' },
      { id: 'filete-cinta-curva', nombre: 'CINTA CURVA', actividad: 'PUESTA EN MARCHA, REVISAR CINTA, MOTOREDUCTOR, PARADAS DE EMERGECIA Y VARIADOR DE FRECUENCIA' },
      { id: 'filete-cinta-aceleracion-1', nombre: 'CINTA ACELERACION 1', actividad: 'PUESTA EN MARCHA, REVISAR CINTA, MOTOREDUCTOR, PARADAS DE EMERGECIA Y VARIADOR DE FRECUENCIA' },
      { id: 'filete-balanza-marel', nombre: 'BALANZA MAREL', actividad: 'PUESTA EN MARCHA, CALIBRACION JUNTO A CONSTRASTACION DE EQUIPO, REVISION DE MOTOTAMBOR' },
      { id: 'filete-cinta-alimentacion', nombre: 'CINTA ALIMENTACION', actividad: 'PUESTA EN MARCHA, REVISAR CINTA, MOTOREDUCTOR, PARADAS DE EMERGECIA Y VARIADOR DE FRECUENCIA' },
      { id: 'filete-termoformadora-gea', nombre: 'TERMOFORMADORA GEA', actividad: 'REVISION DE PRESION DE VACIO, CHEQUEO DE GOMA SELLADO, FORMADO, IMPRESORA, CUCHILLOS CIRCULARES, CUCHILLOS TRANSVERSALES Y CADENA' },
      { id: 'filete-bombas-vacio-y-chiller', nombre: 'BOMBAS VACIO Y CHILLER', actividad: 'NIVEL DE ACEITE Y GLICOL EN EQUIPO CHILLER' },
    ],
  },
  {
    id: 'empaque',
    nombre: 'Empaque',
    equipos: [
      { id: 'empaque-empacadora-e-pack', nombre: 'EMPACADORA E-PACK', actividad: 'CALIBRACION, CHUEQUEO DE TARJETAS, BLOCK NEUMATICO, CILINDROS, CINTA Y MOTOREDUCTOR' },
      { id: 'empaque-glaseador-automatico', nombre: 'GLASEADOR AUTOMATICO', actividad: 'REGULACION PALETA, BOTONERAS Y SERVOMOTOR' },
      { id: 'empaque-enzunchadora-1', nombre: 'ENZUNCHADORA 1', actividad: 'LIMPIEZA DEL EQUIPO, CHEQUEO RESISTENCIA Y TENSION DEL ZUNCHO' },
      { id: 'empaque-enzunchadora-2', nombre: 'ENZUNCHADORA 2', actividad: 'LIMPIEZA DEL EQUIPO, CHEQUEO RESISTENCIA Y TENSION DEL ZUNCHO' },
    ],
  },
  {
    id: 'exterior-vacio',
    nombre: 'Exterior · sistema de vacío',
    equipos: [
      { id: 'exterior-vacio-bombas-de-sopladores-evisceradora', nombre: 'BOMBAS DE SOPLADORES (EVISCERADORA)', actividad: 'CHEQUEO PRESION DE VACIO, VALVULAS Y CHEQUEO DE PARTIDORES SUAVES' },
      { id: 'exterior-vacio-bombas-de-vacio-sihi-tolvas-de-vac', nombre: 'BOMBAS DE VACIO SIHI (TOLVAS DE VACIO)', actividad: 'CHEQUEO PRESION DE VACIO, VALVULAS Y CHEQUEO DE PARTIDORES SUAVES' },
      { id: 'exterior-vacio-tolva-acumulador', nombre: 'TOLVA ACUMULADOR', actividad: 'CHEQUEO DE VACIO, TAPA DE TOLVA 1 Y 2, SEÑALES DE APERTURA Y VALVULA MARIPOSA' },
    ],
  },
  {
    id: 'riles',
    nombre: 'Planta de RILES',
    equipos: [
      { id: 'riles-bombas-de-pasillo-agua-sangre-rile', nombre: 'BOMBAS DE PASILLO AGUA SANGRE RILES', actividad: 'CHEQUEO FUNCIONAMIENTO Y NIVEL DE ACEITE' },
      { id: 'riles-bomba-de-saturacion-daf', nombre: 'BOMBA DE SATURACION DAF', actividad: 'CHEQUE FUNCIONAMIENTO' },
      { id: 'riles-compresor-riles', nombre: 'COMPRESOR RILES', actividad: 'CHEQUEO Y PURGA DE ACUMULADOR Y NIVEL DE ACEITE' },
    ],
  },
  {
    id: 'acopio',
    nombre: 'Acopio',
    equipos: [
      { id: 'acopio-bomba-refrigeracion-para-bombas-de', nombre: 'BOMBA REFRIGERACION PARA BOMBAS DE VACIO', actividad: '' },
      { id: 'acopio-bombas-de-vacio', nombre: 'BOMBAS DE VACIO', actividad: '' },
      { id: 'acopio-compresores-de-aire', nombre: 'COMPRESORES DE AIRE', actividad: '' },
      { id: 'acopio-bombas-de-flujo', nombre: 'BOMBAS DE FLUJO', actividad: '' },
      { id: 'acopio-tachos-de-vacio', nombre: 'TACHOS DE VACIO', actividad: '' },
      { id: 'acopio-general', nombre: 'GENERAL', actividad: '' },
      { id: 'acopio-bombas-vacio-y-chiller', nombre: 'BOMBAS VACIO Y CHILLER', actividad: 'NIVEL DE ACEITE Y GLICOL EN EQUIPO CHILLER' },
    ],
  },
]

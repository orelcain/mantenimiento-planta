export interface InspectionArea {
  name: string;
  items: string[];
}

export const DAILY_INSPECTION_AREAS: InspectionArea[] = [
  {
    name: "1. AREA RECEPCION COSECHA, INGRESO MATERIA PRIMA",
    items: [
      "Revisión y limpieza de aspersores en salida de chiller, desangrador y tobogán de alimentación, junto con la inspección de válvulas de corte para el suministro de agua.",
      "Revisión de la presión del acumulador Stuner entre 6 y 7 bar (incluye verificación de la alimentación de aire y válvulas de corte neumáticas).",
      "Revisión de presión durante la activación del STUNER, el cual opera a 5 bar de presión",
      "Carga: 53 corridas por 4 espacios, resultando en simultaneo 212 unidades. Recorrido 4 minutos con 54 segundos en 48 hz a 50 hz de trabajo",
      "Revisión de funcionamiento de 6 equipos de 380 V"
    ]
  },
  {
    name: "2. AREA HG-CLASIFICADO- EMPARRILLADO",
    items: [
      "Revisar motoreductor de 1,5 kW: verificación de ruidos anormales, correcto funcionamiento, tensión de la cinta y posicionamiento del sprocket.",
      "Revisión integral de la cinta transportadora, incluyendo verificación de tensión y alineación del sprocket, inspección del soporte estructural, evaluación del mototambor de 0,55 kW con consumo de 2,13 A, y comprobación del correcto funcionamiento del variador de frecuencia operando a 50 Hz.",
      "Revisión integral de la cinta transportadora, incluyendo verificación de tensión y alineación del sprocket, inspección del soporte estructural, evaluación del mototambor de 0,37 kW y 0,82 A de consumo, junto con su respectivo variador de frecuencia operando a 50 Hz, y calibración del sistema a 5 kg",
      "Revisión de cinta transportadora, verificación de presión en cilindros modelo 32x50, revisión de distancia de flapper en 4 unidades, inspección de motoreductor de 0,75 kW (relación 9,23) y del variador de frecuencia.",
      "Chequeo de conmutacion e interruptor de seguridad, revison de cuchillas, funcionamiento de cintas prismas, cheque y regulacion de presion de aire y presion de agua, puesta de contador en cero, comprobar elemento de conmutacion 360°, revision de vacio en vacuometro chequeo de sopladores, comprobar funcionamiento en test 12, comprobar altura de herramientas, funcionamiento de sensores, chequeo de vacio en repaso y Knuro, limpieza sensores de nivel acumuladores, funcionamiento de bba helicoidal, chequeo de correas.",
      "Limpieza de sensores de nivel en acumulador, funcionamiento de bba helicoidal de 0,75KW y 2,72 A",
      "Revisar cinta (tension), guias teflon , sprocket , motoreductor de 0,75KW a 33,7HZ y limpieza de aspersores",
      "Chequeo de funcionamiento valvula mariposa, chequeo de cierre y apertura, revisar lineas de alimentacion de aire tubin 8 , chequeo de bbas de vacio y sistema logo.",
      "Chequeo de presión de aire, revisión del sistema de apertura de pocket, verificación de horquillas y resortes, inspección de cilindros interiores y exteriores (vástagos), revision de botoneras led para grados y calibración de celdas modelo AK-300 a 5 kg.",
      "Revisión de módulos de la cinta transportadora, verificación y ajuste de tensión, chequeo del sensor de ingreso, revision de motoreductor de 1,5KW, inspección del variador de frecuencia, operando a 1.400 RPM y 47,1 Hz, alcanzando una velocidad de 61 ppm (referencias: 1.350 RPM = 60 ppm, 1.440 RPM = 62 ppm, 1.600 RPM = 66 ppm).",
      "Revision de modulos de cintas trasportadora, revision de ruezal azules de guia, revision mototambor de 0,25KW a 0,71A y variador de frecuencia en 43.3 HZ",
      "Revisión de módulos de cinta transportadora, inspección de rieles guía azules, verificación del mototambor de 0,25 kW con consumo de 0,71 A y variador de frecuencia ajustado a 0,83 Hz (1500 RPM), además del chequeo de sensores emisor y receptor.",
      "Revisión de módulos de la cinta transportadora, verificación de cilindros neumáticos modelo 32x50 y de su sistema de soportación, control de presión de aire, inspección de bloques neumáticos, revisión de señales en tarjetas SMV221 (3 unidades), chequeo de fleppers (12 unidades), inspección del tambor de tracción, verificación de botoneras LED para cierre de compuertas y comprobación del funcionamiento de paradas de emergencia."
    ]
  },
  {
    "name": "3. FILETE",
    "items": [
      "BAADER 200: REVISION CUCHILLOS DORSALES,VENTRALE, CORTE DE COLA, ALTURA PUNZONES, RASPADORES,CADENA SILLETAS , CINTAS SALIDA Y PANEL DE CONTROL TOUCH",
      "VOLTEADOR BINS: REVISAR NIVEL DE ACEITE HIDRAULICO, MANGERAS, CILINDRO , MANDO HIDRAULICO Y TABLERO DE CONTRO.",
      "CINTA PINPONEO: PUESTA EN MARCHA, REVISAR CINTA , MOTOREDUCTOR ,PARADAS DE EMERGECIA  Y VARIADOR DE FRECUENCIA",
      "CINTA DESPERDICIO 1 Y 2: PUESTA EN MARCHA, REVISAR CINTA , MOTOREDUCTOR ,PARADAS DE EMERGECIA  Y VARIADOR DE FRECUENCIA.",
      "TOLVA ESQUELONES: CHEQUEO DE PRESION VALVULA MARIPOSA Y VACIO DE SISTEMA",
      "CINTA CURVA: PUESTA EN MARCHA, REVISAR CINTA , MOTOREDUCTOR ,PARADAS DE EMERGECIA  Y VARIADOR DE FRECUENCIA",
      "CINTA ACELERACION 1: PUESTA EN MARCHA, REVISAR CINTA , MOTOREDUCTOR ,PARADAS DE EMERGECIA  Y VARIADOR DE FRECUENCIA",
      "BALANZA MAREL: PUESTA EN MARCHA,CALIBRACION JUNTO A CONSTRASTACION DE EQUIPO , REVISION DE MOTOTAMBOR",
      "CINTA ALIMENTACION: PUESTA EN MARCHA, REVISAR CINTA , MOTOREDUCTOR ,PARADAS DE EMERGECIA  Y VARIADOR DE FRECUENCIA",
      "TERMOFORMADORA GEA: REVISION DE PRESION DE VACIO, CHEQUEO DE GOMA SELLADO , FORMADO, IMPRESORA, CUCHILLOS CIRCULARES, CUCHILLOS TRANSVERSALES Y CADENA",
      "BOMBAS VACIO Y CHILLER: NIVEL DE ACEITE Y GLICOL EN EQUIPO CHILLER"
    ]
  },
  {
    "name": "4. EMPAQUE",
    "items": [
      "EMPACADORA E-PACK: CALIBRACION, CHUEQUEO DE TARJETAS, BLOCK NEUMATICO, CILINDROS, CINTA Y MOTOREDUCTOR",
      "GLASEADOR AUTOMATICO: REGULACION PALETA, BOTONERAS Y SERVOMOTOR",
      "ENZUNCHADORA 1: LIMPIEZA DEL EQUIPO, CHEQUEO RESISTENCIA Y TENSION DEL ZUNCHO.",
      "ENZUNCHADORA 2: LIMPIEZA DEL EQUIPO, CHEQUEO RESISTENCIA Y TENSION DEL ZUNCHO.",
      "BOMBAS DE SOPLADORES (EVISCERADORA): CHEQUEO PRESION DE  VACIO , VALVULAS Y CHEQUEO DE PARTIDORES SUAVES",
      "BOMBAS DE VACIO SIHI (TOLVAS DE VACIO): CHEQUEO PRESION DE  VACIO , VALVULAS Y CHEQUEO DE PARTIDORES SUAVES",
      "TOLVA ACUMULADOR: CHEQUEO DE VACIO, TAPA DE TOLVA 1 Y 2 , SEÑALES DE APERTURA Y VALVULA MARIPOSA"
    ]
  },
  {
    "name": "5. SALA DE MAQUINAS",
    "items": [
        "Verificación general de sala de máquinas (Pendiente de carga)"
    ]
  },
  {
    "name": "6. PLANTA DE RILES",
    "items": [
      "BOMBAS DE PASILLO AGUA SANGRE RILES: CHEQUEO FUNCIONAMIENTO Y NIVEL DE ACEITE",
      "BOMBA DE SATURACION DAF: CHEQUE FUNCIONAMIENTO",
      "COMPRESOR RILES: CHEQUEO Y PURGA DE ACUMULADOR Y NIVEL DE ACEITE"
    ]
  },
  {
    "name": "7. ACOPIO",
    "items": [
      "BOMBA REFRIGERACION PARA BOMBAS DE VACIO",
      "BOMBAS DE VACIO",
      "COMPRESORES DE AIRE",
      "BOMBAS DE FLUJO",
      "TACHOS DE VACIO",
      "GENERAL"
    ]
  }
];

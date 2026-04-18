/** Glosario oficial de términos Marelec Z2 / planta */
export const GRADER_GLOSSARY: Record<string, {
  label: string
  alts?: string[]
  description: string
}> = {
  pocket:        { label: 'Pocket',        alts: ['balanza', 'celda'],       description: 'Balanza donde se pesa cada pieza individualmente (pockets 1-4)' },
  flipper:       { label: 'Flipper',       alts: ['paleta', 'desviador'],    description: 'Paleta neumática que desvía la pieza al capacho correcto' },
  gate:          { label: 'Gate',          alts: ['compuerta', 'salida'],    description: 'Número de salida asignada a un rango de calibre (gates 1-12 + gate 0)' },
  gate0:         { label: 'Gate 0 / P0',  alts: ['punto cero', 'rechazo'], description: 'Salida de rechazo: piezas que Matrix no pudo clasificar' },
  buchaca:       { label: 'Buchaca',                                         description: 'Cajón físico donde cae cada calibre al salir del grader' },
  capacho:       { label: 'Capacho',                                         description: 'Recipiente de recepción del pez clasificado, bajo cada buchaca' },
  bandejon:      { label: 'Bandejón',                                        description: 'Recipiente grande de recolección al final de la línea' },
  fsWc:          { label: 'fsWc',                                            description: 'Parámetro Z2 de calibración del pocket (Full Scale Weight Calibration). Se edita en Servicio → Cambiar parámetros → Static Grader → ZBelt → Pocket [n]' },
  pesoPatron:    { label: 'Peso patrón',   alts: ['patrón 5kg'],            description: 'Pesa certificada de 5 000 g usada para contrastación de pockets' },
  contrastacion: { label: 'Contrastación', alts: ['calibración balanza'],   description: 'Verificación y ajuste de la balanza del pocket usando el peso patrón. NO confundir con calibración de cinta/sensor.' },
  fotocelula:    { label: 'Fotocélula',    alts: ['sensor óptico'],         description: 'Sensor que detecta el paso de cada pieza y activa la medición del pocket' },
  eyeSync:       { label: 'Eye sync',      alts: ['sincronía sensor'],      description: 'Parámetro de sincronización del sensor óptico de entrada; evita lecturas duplicadas' },
  p0:            { label: 'P0',            alts: ['punto cero', 'gate 0'], description: 'Porcentaje de piezas rechazadas (no clasificadas). Objetivo < 2 %' },
  z2:            { label: 'Z2',            alts: ['controlador'],           description: 'Controlador Marelec Z2: cerebro de la clasificadora. Pantalla táctil en panel lateral' },
  sm221:         { label: 'SM221',                                           description: 'Tarjeta de entradas/salidas del Z2. Fallo → piezas no se clasifican' },
  tambor:        { label: 'Motor tambor',  alts: ['moto tambor'],           description: 'Motor del tambor de la cinta de aceleración. Fallo → cinta parada' },
  cintaAcel:     { label: 'Cinta de aceleración', alts: ['2ª cinta'],      description: 'Cinta que acelera las piezas antes del pesaje para separarlas' },
  botonAzul:     { label: 'Botón azul',                                     description: 'Botón de reset manual en el panel del Z2. Reinicia la clasificación sin apagar el equipo' },
  tachometro:    { label: 'Tacómetro',     alts: ['taco'],                  description: 'Sensor de velocidad de la cinta principal. Drift → throughput mal calculado' },
}

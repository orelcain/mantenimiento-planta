# Marelec Z2 — Mapa de parámetros del HMI

> Extraído 2026-04-17 del DOCX interno `parametros grader.docx` (418 screenshots HMI) + manual oficial MS4/12 (59 pág) + instructivo CH-MT-ME-0002. Barrido de ~25 screenshots representativos cubriendo todas las secciones principales.

---

## 🔑 Identificación del equipo

| Campo | Valor |
|---|---|
| Modelo | Marelec **MS4/12** (static weigher + z-conveyor + 2 acceleration belts + grading belt con 12 outputs) |
| Serial (`sernr`) | **3943** |
| Fecha fabricación | Sept 2012 |
| Fabricante | MFT — Redanweg 15, 8620 Nieuwpoort, Belgium |
| Distribuidor Chile | Marelec (Chile) Ltda. — Av. Austral 1746, Jardín Oriente, Puerto Montt |
| Soporte | support@marelec.com · +32 58 222 111 · fax +32 58 239 280 |
| Computador HMI | Marelec **Z2** |
| IP red | **172.27.12.12** (modo "RC" = Remote Connection) |
| Runtime (al screenshot) | 5,825 horas |
| Password menú servicio | **8620** |

---

## ⚙️ Especificaciones (manual)

| Parámetro | Valor |
|---|---|
| Ancho z-conveyor / acceleration / grading | 1200 / 300 / 300 mm |
| Vel. máx. belt (física) | 1.4 m/s |
| Producto máx | L 1100 × W 290 mm |
| Rango peso | 0–15 kg |
| Precisión | ±20 g (0-5 kg) · ±50 g (5-15 kg) |
| Aire | min 600 L/min @ ≥0.7 MPa |

---

## 🛰️ Canales de comunicación

| Canal | Evidencia | Estado |
|---|---|---|
| **Remote Connection (RC)** | Título ventana "RC 172.27.12.12" | ✅ En uso actualmente (HMI remoto) |
| **Modbus** | Parámetro `modbusId = 0` en HMI | 🟡 Soportado pero deshabilitado |
| **CAN bus** | `canIdIo1-7 = 51-57` · `canId = 11` (pockets) | ✅ En uso (actuadores/loadcells) |
| **FTP Logs** | `ftpLogServer = "ftp.marelec.com"` | 🟡 Potencialmente activo |

---

## 🏗️ Árbol del menú Cambiar parámetros

```
Menú → Servicio → Cambiar parámetros → [8620]
├── System settings
│   ├── StaticGrader
│   │   ├── (velocidades, flipper, eye sync)
│   │   └── sorting / batch / reject
│   ├── Z-Belt
│   │   └── (velocidades, encoder, eye, drops)
│   ├── Acceleration belt 1
│   ├── Acceleration belt 2
│   └── Pocket 1, 2, 3, 4
│       └── (pos, minOpen, delayClose, loadcell, filters)
├── Program buttons (inpProg1-16, outpProg1-9)
├── Signal outputs (outpSignalGreen/Orange/Red/White/Emergency)
├── Drives 1-5
└── Eye sync (global)
```

---

## 📐 Sección: StaticGrader (grading belt = cinta final con 12 flippers)

### Dinámica del grading belt
| Parámetro | Valor | Unidad | Descripción oficial |
|---|---|---|---|
| `minSpeed` | 50 | mm/s | velocidad mínima |
| `maxSpeed` | **700** | mm/s (=0.70 m/s) | **velocidad máxima actual** |
| `initialSpeed` | 0 | mm/s | — |
| `acceleration` | 100 | mm/s² | — |
| `deceleration` | 100 | mm/s² | solo si `bdcMotor`=AMDC |
| `bdcMotor` | 0 | — | tipo de motor |
| `daChannel` | 1 | — | canal analógico salida |
| `reverse` | 0 | — | 0=normal, 1=reverse (motor type 2&5) |
| `inpStartStop` | 0 | — | input start/stop circuit |

### 🎯 Flipper timing (grading belt — push lateral a gates)
| Parámetro | Valor | Unidad | Descripción oficial |
|---|---|---|---|
| `delayFlipperOpen` | **150** | ms | ms delay to open flipper **before** product |
| `delayFlipperClose` | **150** | ms | ms delay to close flipper **after** product |
| `minFlipperOpenTime` | **350** | ms | ms, minimum open flipper time for product |
| `fixedOpenFlipper` | 0 | flag | abrir con tiempo fijo |
| `triggerPointFlipper` | 0 | — | — |

### Gates
| Parámetro | Valor | Descripción |
|---|---|---|
| `numGates` | 12 | número total de gates |
| `posGate1` | 2 | posición gate 1 |
| `nickname` | — | short name |
| `inp1-12` | 133-152 | inputs por gate (mapeo CAN) |

### Eye sync (sensor posicional)
| Parámetro | Valor | Unidad | Descripción |
|---|---|---|---|
| `inpEyeSync` | 3 | — | input sensor 1 |
| `disEyeSync` | **425** | mm | distance from beginning of belt to sync eye |
| `eyeSyncMinLength` | 10 | — | largo mínimo detectado |
| `eyeSyncMaxDender` | 400 | — | — |
| `maxDif` | 1800 | — | — |
| `inpEyeSync2` | 0 | — | sensor 2 (no usado) |
| `inpEyeSync3` | 0 | — | 3rd input of the eye for re-synchronisation, in the middle of the sorting belt |
| `minimumGate2` | 0 | — | — |

### 🔀 Sorting / Reject
| Parámetro | Valor | Descripción |
|---|---|---|
| `rejectNoSync` | **1** | rechaza si no hay sync |
| `rejectOnlyNonWeighed` | 0 | 1=use reject gate only for products not weighed |
| `defaultRejectGate` | 0 | gate de rechazo |
| `minHeadTail` | 0 | — |
| `inpIncomingLotNr` | 0 | — |
| `incomingLotNrDelay` | 0 | — |
| `outgoingLotNrAutoreset` | 0 | — |
| `sortAlgorithm` | 0 | — |
| `fuzzySorting` | 0 | — |
| `outpFlipper1-12` | 133-152 | output por flipper (coincide con inp1-12) |

### 📦 Batch & Gate timing (grading belt)
| Parámetro | Valor | Unidad | Descripción |
|---|---|---|---|
| `delayBeforeGateClose` | **400** | ms | — |
| `delayGateClose` | **500** | ms | — |
| `minGateOpen` | 0 | ms | — |
| `maxBinWeight` | 25000 | g (25 kg) | max weight inside the batch bin |
| `disableFlip12` | 0 | flag | deshabilitar flipper 12 |
| `testMode` | 0 | flag | — |
| `flowRateInterval` | 0 | — | — |
| `flowRateAlgorithm` | 0 | — | — |
| `flipTimeWarning` | 0 | — | — |
| `ftpLogServer` | **"ftp.marelec.com"** | string | servidor FTP para logs |
| `spread` | 1 | — | — |
| `autoOpen` | 0 | — | — |
| `allowManualClose` | 1 | — | — |
| `blockGUIClosing` | 0 | — | — |
| `sendBatch` | 2 | — | — |
| `idleWarning` | 0 | — | — |
| `virtualBatchingWarning` | 100 | — | — |
| `indicateBatchWaiting` | 0 | — | — |

### Weight feedback (calibración dinámica)
| Parámetro | Valor | Descripción |
|---|---|---|
| `wFeedbackMode` | 0 | — |
| `wFeedbackDelay` | 0 | — |
| `wFeedbackMaxStabilizationTime` | 2000 | 2 s |
| `wFeedbackAfterZeroMargin` | 0 | — |
| `wFeedbackSimulOffset` | 0 | — |
| `wFeedbackSimulStdev` | 10 | — |
| `wFeedbackSimulOffsetRate` | 100 | — |
| `wFeedbackUnderLimit` | 0 | — |
| `wFeedbackUpperLimit` | 0 | Relative upper limit for accepting weight correction (10th of percent) |

---

## 📦 Sección: Z-Belt (cinta elevadora entre pocket y acelerador)

| Parámetro | Valor | Descripción |
|---|---|---|
| `olg` | 1500 | — |
| `pg` | 0 | — |
| `ig` | 1000 | — |
| `dg` | 0 | — |
| `mino` | 100 | — |
| `maxo` | 700 | — |
| `inpStartStop` | 0 | — |
| `minSpeed` | **100** | mm/s |
| `maxSpeed` | **420** | mm/s (=0.42 m/s) |
| `bdcMotor` | 0 | — |
| `daChannel` | 1 | — |
| `initialSpeed` | 0 | — |
| `acceleration` | 100 | mm/s² |
| `deceleration` | 100 | mm/s² |
| `reverse` | 0 | — |
| `inpEye` | 1 | input de fotocelda |
| `dropPos` | 0 | — |
| `minCompartment` | 0 | — |
| `skipCompartments` | 0 | — |

**⚠️ La Z-belt corre a 420 mm/s (0.42 m/s), NO a la misma velocidad que el grading belt (700 mm/s).**

---

## ⚡ Sección: Acceleration belt 1 / 2

| Parámetro | Valor | Descripción |
|---|---|---|
| `inpPulse` | 5 | input pulse encoder |
| `inpPulse2` | 5 | — |
| `deltaI` | 52000 | delta encoder por revolución? |
| `deltaIdiv` | 39623 | divisor delta |
| `noEncoderMode` | 0 | — |
| `simulSpeed` | 0 | — |
| `length` | 1000 | largo cinta (mm) |
| `outpFlash` | 0 | output flash light when product arrives |
| `accelerationPoint` | 0 | — |
| `finalBelt` | 0 | — |

---

## 📥 Sección: Pocket 1 (y análogo para 2, 3, 4)

⚠️ **IMPORTANTE: "pocket" y "flipper" son sistemas DIFERENTES**:
- **Pocket** = trampilla de la balanza estática que suelta el pez al z-belt después de pesar
- **Flipper** = empujador lateral en la grading belt que desvía al gate correcto

### Pocket timing
| Parámetro | Valor | Unidad | Descripción |
|---|---|---|---|
| `outp` | 1 | — | output mapping |
| `pos` | **550** | mm | posición en la balanza |
| `minOpen` | **600** | ms | tiempo mínimo abierto (¡diferente de minFlipperOpenTime!) |
| `delayClose` | **700** | ms | delay para cerrar |
| `defaultProduct` | 0 | — | producto default |
| `inpMode` | 0 | — | — |
| `outpMode` | 0 | — | — |
| `inpButton1` | 101 | — | input of product selection button 1 |
| `inpButton2` | 102 | — | — |
| `inpButton3` | 103 | — | — |
| `inpButton4` | 104 | — | — |
| `inpButton5-7` | 0 | — | botones no mapeados |

### Pocket loadcell (balanza)
| Parámetro | Valor | Descripción |
|---|---|---|
| `canId` | 11 | CAN device ID del loadcell |
| `fsIncl1/2` | 8388608 | full scale inclinometer 1/2 |
| `zpIncl1/2` | 0 | zero point inclinometer 1/2 |
| `refTemp` | 40 | temperatura ref (°C) |
| `tempCorFactor1/2` | 10066 | factor corrección temperatura |
| `tempCorOffset1/2` | 0 | "temperature sensitivity on the zero point of inclinometer 1" |
| `canIdIncl` | 0 | — |
| `maxIncl` | 15 | max inclination? |
| `warmUp` | 0 | — |
| `dx` | 0 | distance between gravity point of main and reference loadcell |
| `dy` | 0 | — |
| `dh` | 0 | — |

### Pocket calibration (fsWc — del instructivo CH-MT-ME-0002)
| Parámetro | Valor | Descripción |
|---|---|---|
| `fsWc` | **273947** | fullscale weight correction (calibración con peso patrón) |
| `fsRc` | 0 | — |
| `mWc` | 0 | — |
| `mRc` | 0 | — |
| `zpWc` | 864997 | zero point WC |
| `zpRc` | 0 | — |
| `filter1` | 60 | FIR filter 1 |
| `filter2` | 70 | setting of FIR filter 2 |
| `filter3` | 0 | FIR filter 3 |
| `filter4` | 0 | FIR filter 4 |
| `extraFilter` | 1 | — |
| `fastStepFilter` | 0 | — |
| `motComp` | 0 | motion compensation |
| `maxAcc` | 0 | — |
| `altSteadyTolerance` | 0 | tolerance for alternative steady criterium. 0=default=disabled |

---

## 🔧 Sección: System settings (global)

| Parámetro | Valor | Descripción |
|---|---|---|
| `inpEmergency` | 0 | **input of emergency stop circuit** |
| `inpInvEmergency` | 0 | input inverted emergency |
| `inpAirSupply` | 0 | input aire comprimido |
| `inpGenericWarning` | 0 | — |
| `GenericWarningText` | "" | texto de warning genérico |
| `genericWarningLength` | 0 | — |
| `inpCleaningMode` | 0 | — |
| `invertDriveErrors` | 0 | — |
| `inpDriveError1-5` | 0 | — |
| `driveName1-5` | "Drive N" | nombres motores |
| `inpName1-2` | "Input N" | — |
| `comportLog` | 1 | — |
| `colorScheme` | 0 | — |
| `buzzDuration` | 0 | — |
| `inpOpenCloseGates` | 0 | input for open/close all gates button |
| `outpOpenCloseGates` | 0 | — |
| `showCleaningScreen` | 0 | — |
| `pmsVersion` | 2 | — |
| **`modbusId`** | **0** | ⭐ Modbus slave ID (0 = disabled, set to enable Modbus) |
| `unitProgram` | g | unidad productos |
| `factorProgram` | 1 | — |
| `unitBatch` | kg | unidad lotes |
| `factorBatch` | 0.001 | — |
| `resetOnBarcode` | 0 | — |
| `touchScreen` | 0 | — |
| `keyboardLayout` | 0 | — |
| `outpTouchBeep` | 0 | — |
| `selftestype` | 0 | — |
| `stationAttribute1/2` | 0 | — |
| `beltOverviewInterval` | 0 | Only products put on the belt in this interval (0=disable, range 5-3600 s) |
| `maintenanceAlarm` | 0 | — |
| `loadDefaultProgram` | 0 | — |

### Output signals (torre señales)
| Parámetro | Valor |
|---|---|
| `outpSignalGreen` | 0 |
| `outpSignalOrange` | 0 |
| `outpSignalRed` | 0 |
| `outpSignalWhite` | 0 |
| `outpSignalEmergency` | 0 |
| `outpSignalBatchAboutToClose` | 0 |
| `outpSignalBuzzer` | 0 |

---

## 📊 Sección: Display / resolución

| Parámetro | Valor | Descripción |
|---|---|---|
| `forwardGrading` | 0 | — |
| `reverseGrading` | 0 | — |
| `dispRes` | 10 | display resolution (g) |
| `e1` | 20 | — |
| `max1` | 120000 | (= 120 kg) |
| `e2` | 10 | — |
| `e3` | 20 | — |
| `tSteady` | 300 | tiempo estabilización (ms) |
| `trackZero` | 1 | — |
| `minWeight` | 300 | peso mínimo aceptado (g) |
| `minDeltaw` | 0 | — |
| `unity` | kg | — |
| `factor` | 0.001 | — |

---

## 🎛️ Sección: CAN I/O mapping

| Parámetro | Valor | Descripción |
|---|---|---|
| `canIoType1-20` | 0 | 0=8 output mode (out 245-252), 1=12 output mode (out 245-256) |
| `canIdIo1` | 51 | can id for input/output 205-212 |
| `canIdIo2` | 52 | — |
| `canIdIo3` | 53 | — |
| `canIdIo4` | 54 | — |
| `canIdIo5` | 55 | — |
| `canIdIo6` | 56 | — |
| `canIdIo7` | 57 | — |
| `canIdIo8-14` | 0 | — |

---

## 🚦 Otros menús de Servicio

### Velocidad cintas (reporte)
Muestra speeds reales (min..max 1s / min..max 100ms) de:
- Z-Belt
- Acceleration belt 1
- Acceleration belt 2
- Sorting belt with batching

Botones: `Reset Stats`, `Salir`

### Probar entradas / Probar salidas
Test bench para activar I/Os aisladamente (ideal para cronometrar con slow-mo).

### Monitor CPU
(pendiente revisar contenido específico)

### Explorar CAN bus + Localizar IDs aleatorias
Listado de devices CAN conectados. Permite descubrir nuevos devices.

---

## 🎯 Implicaciones para la app (tab Producto / Cintas)

### Velocidades correctas por cinta
| Cinta | Valor app actual | Valor Z2 real | Cambiar |
|---|---|---|---|
| Z-belt | — | 0.42 m/s | Agregar |
| Acceleration belts | — | ? (medir) | Agregar |
| Grading belt (sorting) | 1.28 m/s | **0.70 m/s** | ⚠️ CORREGIR |

### "Reset flipper" en la app — **semánticas posibles**
1. **Opción A** (ciclo software flipper): `delayFlipperOpen + minFlipperOpenTime + delayFlipperClose = 150+350+150 = 650 ms`
2. **Opción B** (sólo tiempo abierto): `minFlipperOpenTime = 350 ms`
3. **Opción C** (reset mecánico cilindro): medir con slow-mo

Propuesta: usar Opción A en UI como "Ciclo flipper" + botón "Medir reset mecánico" (slow-mo) como complemento.

### Pocket timing (balanza, no grading)
Nuevo dato valioso para analítica:
- `pocket.pos = 550 mm`
- `pocket.minOpen = 600 ms`
- `pocket.delayClose = 700 ms`

---

## 🔮 Oportunidades futuras (big bets)

### 1. Integración Modbus TCP
`modbusId = 0` significa soportado pero deshabilitado. Poner en `1+` y conectar desde la app vía IP 172.27.12.12 permitiría leer parámetros en vivo.

### 2. FTP log sync
`ftpLogServer = ftp.marelec.com` — investigar si Marelec ya guarda logs externamente, podríamos consumir el mismo (con permiso).

### 3. Emulador Remote Connection
El protocolo "RC" de Marelec parece propio. Pedir SDK/doc a soporte Marelec para implementar cliente propio desde la PWA.

---

## 📝 Secciones pendientes de revisar en detalle

Barrido hecho en ~25 screenshots representativos. Para documentación 100% completa faltaría revisar:
- Images 1-30 excepto 5 (menús iniciales, navegación)
- Images 30-80 (menús Velocidad cintas, Mostrar resultados, Servicio, Probar entradas/salidas)
- Images 80-130 excepto 85, 110 (Monitor CPU, Explorar CAN bus, Localizar IDs aleatorias)
- Images 130-200 con más detalle (programas y z-belt intermedio)
- Images 230-320 (acceleration belts + inicio pocket)
- Images 380-418 detalle completo pockets 3 y 4 (análogos a pocket 1)

Total estimado: ~25 imágenes ya parseadas + 393 pendientes para cobertura total.

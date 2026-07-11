# Árbol de navegación — HMI Marelec Z2 (Fase 1, inventario de pantallazos)

> Generado 2026-07-10 · Sonnet 5 · Entregable de la **Fase 1** de `docs/SPEC_HMI_GRADER_PANTALLAS.md`
> (ÍTEM A del spec). **Checkpoint con Orel antes de codear pantallas (Fase 2+).**

## Metodología

Los 418 pantallazos en `docs/hmi-grader/pantallas/` (`p001.png`…`p418.png`) NO son 418 pantallas
únicas: la gran mayoría son capturas de **scroll** dentro de listas largas de parámetros. El
manifiesto (`MANIFIESTO.md`) solo tiene caption en 17 de 418 filas, así que no alcanza para
mapear el árbol — hubo que **mirar los pantallazos**.

Se repartió la lectura en **6 agentes en paralelo**, cada uno cubriendo un tramo del rango
1–418 (alineados a los gaps entre anclas conocidas del manifiesto), con instrucción de leer
denso en los bordes de cada tramo y muestrear (cada 3-5 imágenes) en el interior de tramos
largos sin caption, profundizando donde detectaran un cambio de pantalla. En total se
inspeccionaron ~150 de los 418 pantallazos (36%), con cobertura completa en todos los puntos
de transición detectados. Se cruzó además con `docs/marelec-z2/parameters.md` (barrido previo
de 2026-04-17, ~25 pantallazos) — coincide en general y esta pasada más profunda **corrige dos
imprecisiones** de esa versión anterior (ver [Correcciones](#correcciones-a-parametersmd)).

**Resultado: ~24 pantallas únicas** (dentro del rango 20-40 estimado por el spec), la mayoría
concentradas en el editor de parámetros (una sola pantalla de tipo árbol+lista con múltiples
"zonas" temáticas, no pantallas separadas).

---

## Árbol de navegación

```
🏠 Home / StaticGrader (operación)                                    p001          [P1]
│  12 pockets, log de eventos, indicadores de peso, F1-F4
│
└─ [Menu] ──────────────────────────────────────────────────────────  p002-p004     [P1]
   │  (lista con scroll — 15 ítems visibles)
   │
   ├─ Mostrar velocidad cintas                                        p005          [P1]
   ├─ Mostrar resultados de clasificación                             p006          [P1]
   ├─ Estado                                                          (sin pantallazo) [P1]
   │
   ├─ Servicio ─────────────────────────────────────────────────────  p007-p009     [P1 (padre)]
   │  │  (submenú, lista con scroll — 15 ítems)
   │  │
   │  ├─ Probar Entradas                                              p010          [P1]
   │  ├─ Probar Salidas (wizard 5 páginas, "Next")                    p011-p015     [P1]
   │  ├─ Monitor CPU (+ toggle "Habilitar vistas")                    p016-p017     [P1]
   │  ├─ Explorar CAN bus (+ "Localizar ID's aleatorias")             p018-p021     [P2]
   │  ├─ Cambiar Parametros (clave 8620) ───────────────────────────  p022-p418     [mixto, ver abajo]
   │  │  │
   │  │  ├─ Popup "Ir a Id" (atajo numérico)                          p022          [P2]
   │  │  ├─ Login (Introducir Clave 8620)                             p023          [P2]
   │  │  │
   │  │  └─ Editor árbol+lista "System settings › StaticGrader"       p024-p418     (1 sola pantalla,
   │  │     │  (panel izq: árbol de nodos · panel centro: lista        varias "zonas")
   │  │     │   de parámetros · panel der: ayuda del campo)
   │  │     │
   │  │     ├─ Zona: StaticGrader (params raíz)                       p024-p132 +   [P2]
   │  │     │  IO/CAN, botones de programa, señales/torre,             cola p308-341
   │  │     │  compuertas, versión PMS, unidades, teclado,
   │  │     │  arranque, alarma mantención, emergencias
   │  │     │
   │  │     ├─ Zona: Z-Belt (velocidad/motor/encoder)                 p133-p159     [P1] ⭐ ancla spec
   │  │     │   ├─ Zona: Pocket 1 (peso/loadcell/inclinómetro)        p342-p401     [P1] ⭐ ancla spec
   │  │     │   ├─ Zona: Pocket 2 (ídem, template)                    p402-p406     [P1] ⭐ ancla spec
   │  │     │   ├─ Zona: Pocket 3 (ídem, template)                    p407-p411     [P1] ⭐ ancla spec
   │  │     │   └─ Zona: Pocket 4 (ídem, template)                    p412-p418*    [P1] ⭐ ancla spec
   │  │     │       (*p418 es la última página del PDF — Pocket 4/Z-Belt truncados, ver Gaps)
   │  │     │
   │  │     ├─ Zona: Acceleration belt 1                              p159-p172     [pendiente decisión]
   │  │     ├─ Zona: Acceleration belt 2                              p173-p174     [pendiente decisión]
   │  │     └─ Zona: Sorting belt with batching (grading belt +       p175-~p330    [pendiente decisión
   │  │         flippers/gates + eye sync + reject + batch timing)                   — ver hallazgo]
   │  │
   │  └─ (sin explorar, vistos en la lista pero sin pantallazo propio):
   │     Optimizar filtro · Ajustar unidad de peso · Traceability Settings ·
   │     Show EyeSync Differences · Show Statistics · autochange BLDC ·
   │     Status memory · Version Software · Activar Software ·
   │     Estado Certificación                                          (sin pantallazo) [P2]
   │
   └─ (sin explorar, vistos en el menú principal pero sin pantallazo propio):
      Printers · Cambiar Claves · Edit Species · Ajustar datos ·
      Enable/Disable Stations · Maintenance counters · Idioma ·
      Ajustes Red · Mostrar eventos de sistema · Ajustar Fecha y hora   (sin pantallazo) [P2]
```

**F1-F4**: el simulador actual (`hmi-grader-embed.html`) ya implementa F1-F4 en el home, pero
**no se identificó con certeza su mapeo dentro de las pantallas de Servicio/Parámetros** — ahí
los botones inferiores vistos son contextuales por pantalla ("Cancelar/Abajo/Arriba/OK" en el
editor de parámetros, "Anterior/Next/Salir" en el wizard de Probar Salidas, "Reset Stats/Salir"
en Velocidad cintas). Pendiente confirmar si esos botones contextuales SON F1-F4 remapeados o
botones de pantalla aparte — revisar en Fase 2 contra el HTML real o preguntar a Orel si tiene
fotos del teclado físico en uso.

---

## Tabla pantalla → pantallazos → campos/valores → prioridad

| Pantalla | Pantallazos fuente | Campos/valores clave vistos | Prioridad |
|---|---|---|---|
| Home / StaticGrader (operación) | p001 | 12 pockets, "7: CONTRASTACION (17:36:17)", "Grader runtime is 5825 hours", botones "Cambiar programa"/"Modo presentación"/"Menu" | **P1** |
| Menu (principal) | p002-p004 | 15 ítems (Printers, Servicio, Mostrar velocidad cintas, Mostrar resultados clasificación, Estado, Idioma, Ajustes Red, etc.) | **P1** |
| Mostrar velocidad cintas | p005 | Z-Belt / Accel 1 / Accel 2 / Sorting belt with batching, cada uno con min..max(1s) y min..max(100ms); botón "Reset Stats" | **P1** |
| Mostrar resultados de clasificación | p006 | "Fuera de límites", "No leído por fotocélula", "Too close or too long", "Puerta no preparada", "Peso total clasificado: 0.00kg", "Cajas totales: 0" | **P1** |
| Servicio (submenú) | p007-p009 | 15 ítems (Probar Entradas, Probar Salidas, Cambiar Parametros, Monitor CPU, Explorar CAN bus, etc.) | **P1** (padre) |
| Probar Entradas | p010 | checkboxes In1–In16 | **P1** |
| Probar Salidas (wizard 5 páginas) | p011-p015 | O1-O24, O101-116, O117-132, O133-148, O149-164; campo "Activ Sal."; botones Anterior/Next/Salir | **P1** |
| Monitor CPU | p016-p017 | "Carga procesador: 14%", "Avail. Process Memory: 24896 kb", tabla de carga por proceso tras "Habilitar vistas" (OpcServer 190, Sorting belt with batching 175, Z-Belt 90…) | **P1** |
| Explorar CAN bus | p018-p021 | tabla Id/RealId/Label/Version/CRC; botón "Localizar ID's aleatorias" | P2 |
| Popup "Ir a Id" | p022 | campo numérico "Id: 28" — atajo para saltar a un submenú por número (28 = Cambiar Parametros) | P2 |
| Cambiar Parametros — Login | p023 | "Introducir Clave" (clave real = 8620, no se ve tecleada) | P2 |
| Editor de parámetros — zona StaticGrader (raíz) | p024-p132 + p308-p341 | `inpEmergency`, `driveName1-5`, `sernr=3943`, `canIoType1-20`, `canIdIo1-20`, `inpProg1-16`, `outpSignalGreen/Orange/Red/White`, `pmsVersion=2`, `unitProgram=g`, `keyboardLayout`, `maintenanceAlarm`, `loadDefaultProgram` | P2 |
| Editor de parámetros — zona Z-Belt | p133-p159 | `minSpeed=100`, `maxSpeed=420` mm/s (=0.42 m/s, confirma `parameters.md`), `pg/ig/dg` (PID), `inpEye=1`, `dropPos`, `minCompartment` | **P1** ⭐ |
| Editor de parámetros — zona Acceleration belt 1 | p159-p172 | `inpPulse=5`, `deltaI=52000`, `deltaIdiv=39623`, `length=1000`, `accelerationPoint` | pendiente |
| Editor de parámetros — zona Acceleration belt 2 | p173-p174 | `inpPulse=6`, `deltaI=52000`, `deltaIdiv=31219`, `length=3190`, `outpFlash=16` | pendiente |
| Editor de parámetros — zona Sorting belt with batching | p175-~p330 | `maxSpeed=700` mm/s (=0.70 m/s, confirma `parameters.md`), `numGates=12`, `delayFlipperOpen=150`, `delayFlipperClose=150`, `minFlipperOpenTime=350`, `disEyeSync=425`, `dis1-12` (distancia a cada flipper), `delayBeforeGateClose=400`, `delayGateClose=500`, `maxBinWeight=25000`, `outpGate1-12` | pendiente — **recomendado P1** |
| Editor de parámetros — zona Pocket N (1-4, template) | Pocket1 p342-p401 (documentado fila a fila) · Pocket2 p402-p406 · Pocket3 p407-p411 · Pocket4 p412-p418 (muestreados, calco estructural confirmado) | `outp`, `pos=550/970/1390/1820` (posición mm por pocket), `minOpen`, `delayClose`, `tWeighing=1000/1000/1000/900`, `fsWc`/`zpWc` (calibración celda de carga), `canId=11/12/13/14`, inclinómetro (`fsIncl1/2`, `maxIncl=15`) | **P1** ⭐ |

⭐ = ancla explícita del spec original (§ Insumo visual).

---

## Hallazgo que excede el spec original — decisión pendiente de Orel

El spec (`SPEC_HMI_GRADER_PANTALLAS.md`, Fase 3) solo anticipaba **Static grader → Z belt →
Pockets 1-4** como P1 y dejaba **"parámetros clave 8620"** entero como P2 en el Lote 4. La
lectura real de los pantallazos muestra que el editor de parámetros bajo clave 8620 tiene
**dos secciones adicionales no contempladas en los lotes**, y una de ellas es operacionalmente
importante:

- **Acceleration belt 1 / 2** — parámetros de encoder/largo de cinta, bajo impacto operativo
  directo, poca variación esperada. Propuesta: **P2**.
- **Sorting belt with batching** — es la cinta de clasificación final con los **12
  flippers/gates** (`delayFlipperOpen`, `delayFlipperClose`, `minFlipperOpenTime`,
  `delayBeforeGateClose`, `delayGateClose`, `maxBinWeight`, `numGates`, distancia a cada
  flipper). Estos son EXACTAMENTE los campos que el handoff previo (`HANDOFF-SONNET.md`,
  sesión 2026-04-17) ya modeló como `GraderPhysicalConfig` en `apps/pwa/src/services/grader/types.ts`
  para la FASE 2 del tab Producto — es decir, ya hay código en la app que depende de estos
  parámetros. Propuesta: **P1**, al mismo nivel que Z-Belt y Pockets.

**Pregunta para Orel**: ¿confirmas subir "Sorting belt with batching" a P1 (se implementaría en
el mismo Lote 3 que Z-Belt/Pockets en la Fase 3) y dejar "Acceleration belt 1/2" en P2 (Lote 4)?

---

## Correcciones a `parameters.md`

El barrido anterior (`docs/marelec-z2/parameters.md`, 2026-04-17, ~25 pantallazos) tiene un
árbol de menú aproximado que esta pasada más profunda (150 pantallazos, con lectura de
breadcrumb real en pantalla) permite precisar:

1. **Pocket 1-4 son hijos de Z-Belt, no hermanos.** El breadcrumb visto literalmente en
   pantalla es `System settings › StaticGrader › Z-Belt › Pocket 1` (confirmado en p342 y
   consistente en p402/p407/p412). El árbol ASCII de `parameters.md` los dibuja como
   hermanos de Z-Belt al mismo nivel — es un detalle menor para la doc pero importa para
   armar el árbol de navegación real del simulador en Fase 2.
2. **La sección que `parameters.md` llama "StaticGrader (grading belt = cinta final con 12
   flippers)" es, por el breadcrumb, el nodo hijo "Sorting belt with batching"** — no los
   parámetros propios del nodo raíz `StaticGrader` (que son otro grupo: IO/CAN, botones de
   programa, señales, unidades, teclado — ver zona "StaticGrader (raíz)" en la tabla arriba).
   Los valores (`maxSpeed=700`, `delayFlipperOpen=150`, etc.) siguen siendo correctos, solo
   cambia a qué nodo del árbol pertenecen.

No se modifica `parameters.md` en este PR (fuera de alcance de la Fase 1) — queda como
follow-up sugerido, no bloqueante.

---

## Gaps / pendientes

- **Ítems de menú sin pantallazo explorado**: del Menu principal — Printers, Cambiar Claves,
  Edit Species, Ajustar datos, Enable/Disable Stations, Maintenance counters, Idioma, Ajustes
  Red, Mostrar eventos de sistema, Ajustar Fecha y hora, Estado. De Servicio — Optimizar
  filtro, Ajustar unidad de peso, Traceability Settings, Show EyeSync Differences, Show
  Statistics, autochange BLDC, Status memory, Version Software, Activar Software, Estado
  Certificación. El PDF fuente (`parametros grader.pdf`) nunca los abrió — no hay pantallazo
  que clonar. Quedan fuera del alcance de Fase 3 (no hay fidelidad visual posible sin fuente).
- **Pocket 4 / Z-Belt truncados al final del PDF**: p418 es la última página y corta la lista
  de Z-Belt a mitad de un parámetro (`deltaIdiv=1444`). Pocket 4 se documentó por muestreo
  (calco confirmado de Pocket 1-3), pero no hay captura de cierre de esa pantalla.
  No bloqueante — la Fase 3 puede clonar Pocket 4 con los mismos campos que Pocket 1-3
  (confirmado calco estructural) y datos de `parameters.md`/`parameters.md` donde falten.
  Nota: los valores calibración de Pocket 4 SÍ se leyeron (`tWeighing=900`, `pos=1820`, etc.)
  — el truncamiento es solo al final del recorrido de Z-Belt post-pockets, no de Pocket 4 en sí.
- **F1-F4 sin mapeo confirmado** dentro de Servicio/Cambiar Parametros — ver nota en el árbol.
- **Popup "Ir a Id" (p022)** — comportamiento exacto ambiguo (accesible desde dónde, para qué
  sirve exactamente). Dos lecturas posibles de los agentes coinciden en que es un atajo
  numérico de navegación, pero ninguno vio el resultado de usarlo. Bajo impacto — no bloquea
  Fase 2/3 (no es una pantalla que Mantención necesite clonar).

---

## Decisión de arquitectura (checkpoint resuelto con Orel, 2026-07-10)

**El clon del HMI es documentación/entrenamiento, NO un store de configuración paralelo.**

Auditoría del código vivo mostró que gran parte de "guardar los parámetros reales de la Z2
para nutrir el análisis del turno" **ya existe y está en producción** bajo
`/analisis-grader/turno/:shiftId` → "Configuración de este turno" → tab "Análisis" → "Config
Física":

- **`GraderPhysicalConfig`** (`apps/pwa/src/services/grader/types.ts:350`, Firestore
  `graderModuleConfigs/{plantLineId}.physicalConfig`) — ya modela timing de flipper
  (`flipperDelayOpenMs`, `flipperMinOpenTimeMs`, `flipperDelayCloseMs`,
  `flipperMechanicalResetS`), velocidad de las 4 cintas (`belts[]` con `speedMps` +
  `calibrationStatus: 'estimated'|'verified'`) y posición de los 12 flippers/pockets
  (`flipperPositions[].distanceFromSensorMeters`). Poblado con `DEFAULT_PHYSICAL_CONFIG`
  (`graderAnalyticsThroughput.ts:111`), valores reales medidos en terreno el 2026-04-11.
- **Motor de sugerencias** (`SuggestionsPanel`/`useSuggestionEngine`) ya lee datos reales del
  turno y escribe de vuelta a `physicalConfig`.
- **Medición en terreno** (`SlowMoMeasurementModal`, `TachMeasurementModal`) ya guarda a
  Firestore (`flipperTimingMeasurements`, `beltSpeedMeasurements`) y sube el
  `calibrationStatus` de `'estimated'` a `'verified'`.
- **Historial de cambios** (`graderConfigChangeLog.service.ts`) y un diccionario bilingüe
  parcial (`labelForField()` + `graderGlossary.ts`) también existen.

Es decir: si el clon del HMI guardara su propia copia editable de estos mismos parámetros,
en 3 meses habría **tres lugares** con datos de config que pueden divergir (la máquina real,
`GraderPhysicalConfig`, y el clon). Decisión:

1. **El clon es para aprender qué hace cada pantalla y para qué**, y para tener a mano los
   valores REALES de la máquina (leídos de los pantallazos / `parameters.md`) al hacer
   cálculos — pero es de **solo lectura** respecto a la config operativa.
2. **Cada campo del clon que tenga contraparte en `GraderPhysicalConfig` enlaza a esa
   contraparte** (ej. un link "Ver en Config Física") en vez de duplicar el dato o inventar
   un segundo formulario editable.
3. **Diccionario bilingüe único**: unificar `labelForField()` + `graderGlossary.ts` en un
   solo diccionario (nombre real del parámetro Z2 en inglés → label en español → "qué hace"
   cuando esté confirmado, `"sin verificar"` cuando no) — lo usan tanto el clon como Config
   Física. Se construye de a poco, con cada pantalla que se clone en Fase 3.
4. **Nunca escritura remota a la máquina real.** El patrón ya existente (sugerencia →
   aplicación manual del técnico en el Z2 físico → registro en `graderConfigChangeLog`) se
   mantiene: la app recomienda, la persona actúa físicamente.

### Pendientes de medición en terreno

Mecanismo acordado: al clonar cada pantalla P1 en Fase 3, si el parámetro ya existe en
`GraderPhysicalConfig` con `calibrationStatus: 'estimated'` (o no existe pero alimentaría un
cálculo que la app ya hace — ej. cadencia, gap, timing de gates), se agrega aquí como
candidato, con qué cálculo mejoraría si se verifica. Si no hay conexión a ningún cálculo
existente, queda solo como documentación (no entra a esta cola) — no medir por medir.

| Parámetro Z2 | Estado hoy | Herramienta | Mejora qué cálculo |
|---|---|---|---|
| `belts[main].speedMps` (Sorting belt with batching, `maxSpeed`) | `estimated` en `GraderPhysicalConfig`, valor de pantallazo = 700 mm/s | Tacómetro SKF | Techo teórico de cadencia usado en el markLine "máx sostenida" (PR #185) — hoy comparamos contra la cadencia demostrada, no contra la velocidad real de línea |
| `belts[zeta].speedMps` (Z-Belt, `maxSpeed`) | `estimated`, valor de pantallazo = 420 mm/s | Tacómetro SKF | Mismo techo teórico; Z-belt es el cuello previo a la grading belt |
| `flipperMechanicalResetS` | Sin default — "debe medirse con slow-mo" (ya documentado así en el código) | Cámara lenta | Ciclo real del flipper vs. el ciclo software (`delayFlipperOpen+minFlipperOpenTime+delayFlipperClose=650ms`) — hoy no sabemos cuánto se aleja el mecanismo real del ciclo software |
| RPM variadores Danfoss (Accel belt 1/2) | Solo lectura manual hoy (`BeltRpmModal`, sin verificar contra velocidad lineal real) | Tacómetro SKF + lectura display Danfoss | Confirma si `belts[accel1/accel2].vfd.effectiveMpsPerRpm` calculado es correcto |

(Se irá completando en Fase 3, lote a lote — no es exhaustiva todavía.)

---

## Checkpoint — RESUELTO 2026-07-10

1. ✅ Árbol y prioridades P1/P2 confirmados por Orel.
2. ✅ "Sorting belt with batching" → **P1** (confirmado — además ya está parcialmente
   modelada en `GraderPhysicalConfig.belts[main]` y `flipperPositions[]`, lo que refuerza la
   decisión). "Acceleration belt 1/2" → **P2**.
3. Ítems sin pantallazo explorado: quedan fuera de alcance por ahora (sin bloquear Fase 2/3).
4. ✅ Arquitectura clon=documentación enlazada a `GraderPhysicalConfig` (ver sección arriba).

**Sigue: Fase 2 (motor de navegación) y Fase 3 lote a lote**, en PR(s) de código separados de
este (doc-only). Este archivo se actualiza a medida que Fase 3 avanza (diccionario bilingüe +
cola de medición en terreno).

## Progreso Fase 2 / Fase 3 (actualizado 2026-07-10)

- ✅ **Fase 2 — motor de navegación**: [PR #187](https://github.com/orelcain/mantenimiento-planta/pull/187) (`feat/hmi-grader-nav-engine`). Stack push/pop real + breadcrumb (reusa el tab `.title-bar`, no un header inventado) + F-keys contextuales + `hmi:log-event` por navegación.
- ✅ **Fase 3 — Lote 1** (Menu + Velocidad cintas + Resultados Clasificación + Estado): [PR #188](https://github.com/orelcain/mantenimiento-planta/pull/188) (`feat/hmi-grader-lote1-menu-cintas`, apilado sobre #187). Clonadas contra `p002.png`–`p006.png` reales.
  - **Fix de fidelidad encontrado**: el header (fecha/hora + indicadores de peso) queda visible SIEMPRE en la Z2 real, incluso dentro de sub-pantallas — el motor de Fase 2 lo tapaba. Corregido con `#home-body` (ver PR #188).
  - Arranca `GLOSSARY_EN_ES` (tooltips bilingües inline en `hmi-grader-embed.html`) — **pendiente reconciliar con `labelForField()`/`graderGlossary.ts`** del lado React en un lote posterior (no bloqueante, pero hay que evitar 3 diccionarios paralelos).
  - "Servicio" (Lote 2), "Estado" (sin pantallazo fuente) y el resto de ítems del Menu dan feedback honesto "no clonada todavía" en vez de contenido inventado.
- ✅ **Fase 3 — Lote 2** (Servicio + Probar Entradas + Probar Salidas + Monitor CPU): [PR #189](https://github.com/orelcain/mantenimiento-planta/pull/189) (`feat/hmi-grader-lote2-servicio`, apilado sobre #188). Clonadas contra `p007.png`–`p017.png` reales.
  - `MENU_ITEMS`/`buildMenuList` (Lote 1) generalizado a `SERVICIO_ITEMS`/`buildScrollList` — Menu y Servicio comparten la misma UX de lista.
  - Probar Salidas es un wizard real de 5 páginas (O1-24, O101-116, O117-132, O133-148, O149-164) con campo "Activ Sal." funcional (togglea por número).
  - "Cambiar Parametros" (el editor gigante bajo clave 8620, ~24 pantallas) queda explícitamente para un lote propio — no es parte de Lote 2 ni 3.
- ✅ **Cambiar Parametros — editor árbol+lista**: [PR #190](https://github.com/orelcain/mantenimiento-planta/pull/190) (`feat/hmi-grader-cambiar-parametros`, apilado sobre #189). Login (clave 8620) + editor con 9 zonas: System settings (P2, abreviada), Z-Belt (P1, completa), Pocket 1-4 (P1, template), Acceleration belt 1/2 (P2, completas), Sorting belt with batching (P1, completa, ~55 campos). Reemplaza los lotes 3/4 originales del spec para esta pantalla específica — cubre de una vez todas las zonas P1 que estaban repartidas en "Lote 3".
  - **⚠️ Hallazgo de integridad**: el anchor "p342 = Pocket 1" heredado del `MANIFIESTO.md` original (y por lo tanto del árbol de arriba) resultó ser IMPRECISO — al leer `p342.png` directo, la imagen muestra la cola de parámetros de StaticGrader raíz, no campos de pocket. Un sub-agente de la Fase 1 había transcrito lo contrario para ese mismo archivo (posible confusión con un archivo vecino). Se resolvió usando `docs/marelec-z2/parameters.md` (ya cruzado contra Z-Belt vía pantallazo propio) como fuente de valores en vez de la posición exacta de scroll. **No cambia el árbol ni las prioridades P1/P2 de este documento** — la jerarquía Z-Belt→Pocket1-4 sigue confirmada por el breadcrumb real de `p133.png` (leído directo, no por agente). Solo queda como advertencia: los anchors de página exactos del MANIFIESTO original no son 100% confiables para ubicar contenido preciso, mejor usar `parameters.md` o lectura directa para valores.
  - Diccionario bilingüe sigue sin centralizar (deuda ya documentada arriba).
- ✅ **Explorador CAN**: [PR #191](https://github.com/orelcain/mantenimiento-planta/pull/191) (`feat/hmi-grader-explorar-canbus`, apilado sobre #190). Tabla de 10 dispositivos CAN + "Localizar ID's aleatorias" (replay estático del resultado real de `p021.png`, no randomiza en vivo). **Última pantalla de Servicio con fuente visual real** — Idioma, Ajustes Red, Mostrar eventos de sistema y Ajustar Fecha y hora NO tienen pantallazo (el PDF nunca los abrió), quedan confirmados fuera de alcance.

## Iteración de UX en vivo sobre Cambiar Parametros — PR #192, #193, #194

Orel corrió el preview él mismo (algo que la herramienta de captura de la sesión no pudo hacer) y pidió 4 ajustes en cadena sobre la misma pantalla:
1. **[PR #192]** el teclado global interceptaba lo tipeado en el campo de clave (escribía en el indicador de peso) → fix: ignorar el listener global cuando el foco está en un `<input>` real.
2. **[PR #192]** el árbol no se contraía/expandía de verdad (chips horizontales) → rediseñado a árbol vertical con `parent` real (Pocket 1-4 como hijos de Z-Belt).
3. **[PR #193]** el contenido de una zona aparecía en un panel separado, no debajo del nodo → rediseñado a acordeón de una sola caja (fusiona árbol+lista, contenido inline, varios nodos abiertos a la vez).
4. **[PR #194]** el nodo "System settings" decía "lista abreviada" (P2) → completado de 28 a **133 parámetros reales** (todo lo que `parameters.md` documenta de esa zona: emergencia, drives, buzzer/torre de señales, botones de programa, display/resolución, CAN I/O mapping — cero valores inventados).

## Auditoría del árbol de Cambiar Parametros (2026-07-10, PR #195)

Orel detectó inconsistencias en el árbol → auditoría multi-agente contra los 418 pantallazos
(4 lectores en paralelo midiendo la **indentación en píxeles** con script, valores dudosos
verificados con zoom, cruce contra el modelo del clon extraído por eval del código real).
**El árbol real del Z2 tiene 4 niveles**, no los 2 que tenía el clon:

```
System settings                          ← raíz: emergencia, drives, CAN I/O (canIdIo hasta 20), UDP/syslog
└─ StaticGrader                          ← botones de programa (inpProg1-16, outpProg1-16), señales,
   │                                       unidades, touchscreen, atributos, arranque, modbusId=0
   ├─ Z-Belt (29 campos propios)
   │   └─ Pocket 1..4                    ← cada pocket es una báscula COMPLETA: 73 campos c/u,
   │                                       incl. SU PROPIO bloque display/peso con valores por
   │                                       pocket (tSteady=500/400/300/500, tWeighing=1000/1000/1000/900)
   │                                       + inpButton1-8 Y outpButton1-8 (101-108/109-116/117-124/125-132)
   ├─ Acceleration belt 1 (10 campos, inpPulse2=0)
   ├─ Acceleration belt 2 (10 campos, inpPulse2=0)
   └─ Sorting belt with batching         ← 200 campos: única cinta SIN length; modbusId=1 PROPIO;
                                           dis1-12 = 1250/2200/3800/5200/6550/7850/9150/10400/
                                           11700/13175/14800/15850 mm (cf. GraderPhysicalConfig.
                                           flipperPositions); inp/outpFlipper/outpGate con saltos
                                           reales de módulos I/O de 8 canales
```

Además: en el Z2 real los **nodos hijos aparecen antes** que los campos propios del padre
(p024/p096/p133), y max2/minDeltaw muestran columna de valor VACÍA (no 0).

### ⚠️ Correcciones a `parameters.md` que destapó la auditoría (el pantallazo manda)

| Parámetro | parameters.md decía | Real (verificado con zoom) |
|---|---|---|
| `minGateOpen` (Sorting) | 0 | **5000** |
| `inpPulse2` (Accel 1 y 2) | 5 | **0** |
| `inp1-12` (Sorting) | "133-152" ambiguo | **133,134,135,136,141,142,143,144,149,150,151,152** |
| `outpProg` | 1-9 | **1-16** |
| `tSteady` | 300 global | **por pocket: 500/400/300/500** (vive en cada Pocket, no global) |
| `outpButton1-8` por pocket | no documentado | **existen** (105-108/113-116/121-124/129-132) |
| jerarquía | Pockets/cintas ambiguo | **System settings > StaticGrader > Z-Belt > Pocket 1-4** |

`parameters.md` NO se modifica (histórico); esta tabla es la fe de erratas. El tramo
p033-p089 del PDF nunca fotografió esa parte de System settings — esos campos (sernr,
canIoType, canIdIo1-2, comportLog, colorScheme, inpName1-2) se mantienen del doc curado
con marca "(del doc curado — sin pantallazo)" en el clon.

## Segunda pasada de auditoría: ORDEN fila a fila verificado (2026-07-11)

Orel pidió otra vuelta para comparar visualmente el orden de los parámetros. Cuatro
transcriptores releyeron ~150 imágenes encadenando el orden por SOLAPAMIENTO entre capturas
consecutivas (~17 filas visibles, avance de ~3-4 filas por captura; regla dura: nunca
adivinar en un hueco, marcarlo como gap). El diff posicional (LCS) contra la secuencia
renderizada del clon (extraída por eval del código real, incluyendo la regla nodos-antes-
que-campos) dio **ORDEN IDÉNTICO en todas las zonas verificables**:

| Zona | Posiciones comparadas | Resultado |
|---|---|---|
| System settings (inpEmergency→driveName4) | 16 | ✅ idéntico |
| System settings (canIdIo2→loglevel) | 23 | ✅ idéntico |
| Z-Belt (4 nodos Pocket + 29 campos) | 33 | ✅ idéntico |
| Acceleration belt 1 / 2 | 10 + 10 | ✅ idéntico |
| Sorting belt with batching | 200 | ✅ idéntico |
| Cola StaticGrader (inpProg1→loadDefaultProgram) | 66 | ✅ idéntico |
| Pocket 1-4 (vs transcripción fila a fila p343-p418) | 73 × 4 | ✅ idéntico |

El empalme entre los dos transcriptores de Sorting se validó con 17 campos de solapamiento
idénticos; el tramo completo de Sorting belt se encadenó SIN gaps. Confirmación extra: las
series inpProg y outpProg llegan ambas a 16 (dos lectores independientes coinciden, p098 y
p306-p310).

Límites honestos que quedan (sin cambio posible sin nueva fuente visual):
- El gap p033-p089 (entre driveName4 y canIdIo2 de System settings) sigue sin fotografiar —
  el orden de los campos marcados "(del doc curado)" en ese tramo es el de parameters.md.
- El borde loglevel→(fin de System settings) no se pudo encadenar por solapamiento (p095→
  p096 salta al tope del árbol): si existe algo después de loglevel, no está capturado.

## Estado del clon: TODO lo con fuente visual, cubierto e ÍNTEGRO (no abreviado)

Con PR #194, el clon cubre: Home, Menu, Servicio, Velocidad cintas, Resultados Clasificación, Probar Entradas, Probar Salidas, Monitor CPU, Explorador CAN, y el editor completo de Cambiar Parametros (9 zonas, ~416 parámetros totales entre las 9 — ninguna zona queda abreviada). Lo único que falta tiene una razón concreta:
- **Sin pantallazo fuente** (no clonable): Estado, Idioma, Ajustes Red, Mostrar eventos de sistema, Ajustar Fecha y hora, Optimizar filtro, Ajustar unidad de peso, Traceability Settings, Show EyeSync/Statistics, autochange BLDC, Status memory, Version Software, Activar Software, Estado Certificación, Printers, Cambiar Claves, Edit Species, Ajustar datos, Enable/Disable Stations, Maintenance counters.
- **Deuda técnica, no pantalla nueva**: reconciliar `GLOSSARY_EN_ES` (inline en el HTML) con `labelForField()`/`graderGlossary.ts` (lado React) en un único diccionario.

⏳ **Siguiente si Orel quiere seguir**: la deuda del diccionario bilingüe (única pieza de trabajo real que queda; todo lo demás sin pantallazo no es clonable sin volver a grabar en la máquina física).

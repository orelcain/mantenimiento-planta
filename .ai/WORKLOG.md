## 2026-08-16 · Tendencia del Pareto muestra % y ≈pz de cada turno (PR #600)

La tira «Cómo viene turno a turno» era lo único del bloque de Pareto que
seguía hablando solo en minutos/%. Ahora cada barra muestra su % arriba y
sus ≈pz debajo (`fmtPzCorto` abrevia sobre mil a `1,1k`), con el cpm andando
del turno que usa el ranking. El `≈` se declara una sola vez en el
encabezado en vez de repetirse por columna (desbordaba a 375 px); la tira
sube de 104 a 120 px de alto.

Verificado: 438 tests verdes, tsc/eslint limpios, audit-piel OK; medido en
navegador a 375 px con los turnos reales (0 columnas desbordadas, antes 1)
en ambos temas. Merge commit `684a5d5e` en main, deploy confirmado en
GitHub Pages (`orelcain.github.io/mantenimiento-planta/version.json`
→ `buildSha: 684a5d5`).

## 2026-08-16 · Pareto "Qué se repite" valorizado en piezas (PR #598)

El bloque de causas repetidas del monitor público de Filete pasa de hablar
en minutos a hablar en PIEZAS (opción 2 del mockup aprobado por Orel):
`buildPareto` valoriza cada causa al cpm andando de SU PROPIO turno
(`total/producingMin`), no al promedio de la muestra — reordena ranking y
corte 80/20 por piezas reales. Héroe en centena + equivalencia en turnos,
filas en decena con barra proporcional a piezas, frase de dueños y caja de
cierre también en piezas, panel "cómo se calcula" con el rango real de cpm
de la muestra (9,1–12,4 pz/min en los 11 turnos actuales).

Verificado: 438 tests verdes, tsc/eslint limpios, audit-piel OK, y en
navegador contra el monitor real de Filete (:5189, 11 turnos) — héroe
≈7.800 pz ≈ 2 turnos, dueños suman exacto el héroe, ambos temas a 375 px.
Merge commit `52b9459a` en main.

## 2026-08-15 · La rejilla del desglose recortaba la cola del turno (fix #562)

Perseguir un descuadre chico —la fila decía «Micro 23×» y `stopEvents` traía
28— destapó un bug grande: la rejilla del `timeBreakdown` se dimensionaba con
los minutos de OPERACIÓN (huecos >30 min descontados, correcto para la
cadencia) pero se indexa por hora REAL. Con la colación de 43 min del 14-08,
la rejilla terminaba a las 14:35 y el turno corrió hasta las 15:25: los
últimos 50 minutos no existían para el desglose.

Lo que estaba mal por esto: el ritmo andando del 14-08 decía 13,5 (real ~11,6
— las piezas de la cola contaban y sus minutos produciendo no; el «récord» de
ese día era un artefacto); una Detencion de 6 min a las 15:24 no salía en
ninguna fila; y **el 13-08 tenía una falla de máquina invisible en la cola**
(CUCHILLERIA DORSAL 15 min·3×) — el «✓ ninguna parada por falla de máquina»
pudo haber sido falso otros días.

Fix: rejilla por lapso real (`effectiveStart→effectiveEnd`); `windowMin` pasa
a ser ese lapso — la MISMA medida que el «de turno» del comparador, ahora
comparten palabra a propósito. `windowHours`/cadencia pz-h no cambian.
`resumirParaForecast` publica `tbv: 2` y la caché de `forecastHistory`
invalida lo medido con la vara vieja: mezclar las dos haría récords y bandas
incomparables. El detalle de causas además funde eventos pegados (≤10 s, la
celda de la rejilla) en EPISODIOS, con test del caso real de las 14:44.

Verificado reconstruyendo el 13 y el 14 de agosto con el código nuevo;
1.412 tests, tsc limpio, eslint 28/30, audit-graficos 0.

## 2026-08-15 · Monitor listo para el turno noche (set point con fuente + estados honestos + watchdog)

Regla de Orel: **Shoplogix manda** — cero horarios hardcodeados (se descartó
cargar la entrada del turno noche en la config), y el nombre del turno no se
asume: el verificador diario ganó el chequeo de NOMBRE NUEVO (avisa por
Telegram con el nombre exacto; `scripts/.turnos-vistos.json` se puebla solo y
está gitignoreado — estado por máquina, no del repo).

**Set point con fuente.** `graderModuleConfigs.monitorSetPoint` →
`loadPlannedShift` → payload `live.setPoint` → leyenda del gráfico con ⓘ
(fecha+método) y editor inline para supervisores (patrón del «Cambiar» del
cierre; `setMonitorSetPoint` en `pinShiftEnd.ts` guarda historial de cambios).
⚠ El set point se resuelve ANTES de buscar la entrada de horario en la config:
la primera noche —sin entrada— no pierde también la referencia de máquina.
Sembrado el valor real: 18 pz/min, cronómetro en mano, 15-08, Orel. El máximo
funcional (21) no se edita: sale del manual. `llenadoDeSilletas` acepta
`setCpmOverride` y NO hereda el Hz viejo.

**Primera noche honesta.** Sin historia del mismo nombre el monitor se
degrada BIEN (no inventa referencias) pero se degradaba MUDO. Ahora: «Para
llegar a la meta» sin horario explica y dice cuándo se activa (2 turnos);
aviso agrupado con el plan (ayer 2º · pronóstico 4º · banda/récords 5º); la
tarjeta de ritmo sin banda ofrece el set point como única referencia
demostrable. Los avisos usan señales que el payload YA trae.

**Verificado:** 1.411 tests, tsc limpio, eslint 28/30, audit-graficos 0, y el
monitor en navegador con el turno real (vivo del 15 + cerrado del 14 vía
«Anterior») sin regresiones. Los estados de primera noche quedan cubiertos
por condiciones simples verificadas en código — se verán en vivo la primera
noche real.

## 2026-08-15 · Deuda de gráficos saldada + guardia de CI

Los 9 fixes del inventario contra las guías de visualización (destilado en
ANTARFOOD/_GUIAS/_DESTILADO_VISUALIZACION.md), implementados por el
implementador-patrón y revisados en el diff: ejes de barras a cero, calibres
en orden físico (comparador compartido `utils/calibres.ts` + 4 tests — el bug
estaba DUPLICADO en Pivote y en el timeline del Grader), compuertas con dos
ejes rotulados, eje de ProductionBarsEC con números, leyenda del timeline sin
series técnicas (`_target`/`_shadow`), tooltip del pie con %, y el recorte
p95 declarado en pantalla. El fix 6 (GraderPeriodView) no se tocó: ya cumplía
con leyenda HTML propia.

**Guardia nueva: `scripts/audit-graficos.mjs` en CI** (deploy.yml, tras el
lint). Línea base POR ARCHIVO con la justificación de cada excepción al lado;
falla solo con deuda nueva. En su primera corrida ya cazó 8 `.sort()` pelados
que el grep manual no vio — 2 eran el bug de calibres duplicado; los otros 6
eran legítimos (claves de fecha, listas nominales) y quedaron en la base.

Pendiente visual (no bloqueante): leyenda nueva del GraderTimelineChart en
pantallas angostas, y los dos ejes de compuertas en ambos temas.

## 2026-08-15 · Monitor público · la capa de contexto (guías de visualización)

**Qué cambió.** Aplicación de las guías de Kevin Cáceres (destiladas en
`ANTARFOOD/_GUIAS/_DESTILADO_VISUALIZACION.md`) al monitor: cada tarjeta grande
contesta sola «¿esto está bien?». Tres piezas, todas de la guía numero-contexto:

1. **Ritmo andando con sparkline + banda normal**: miniatura de los últimos
   turnos con el rango normal de fondo (mín-máx de los turnos VÁLIDOS
   anteriores) y la lectura escrita («▲ arriba de su rango normal (10,3–13,2)»).
2. **«Últimos 30 min» con referencia**: contra el ritmo del propio turno, con
   umbrales anchos (▲ ≥110%, ▼ ≤75%) para que el ruido de un tramo no titile.
3. **La meta como bullet**: banda de cierres habituales detrás de la barra. Con
   los datos reales destapó el hallazgo del día: la meta (5.000) está POR ENCIMA
   de todo lo que la línea cerró en su historia (3.168–4.915) — el 78% no es
   «el turno falló», es «la meta no la alcanzó nadie todavía».

**Archivos.** `monitorVsAyer.ts` (+`bandaNormal`, 4 tests),
`PublicShiftMonitorPage.tsx` (Kpi con `spark`/`lectura`, `Chispa`, bullet).

**Decisiones y trampas:**

- ⚠⚠ **BUG cazado en la verificación: el turno visto se colaba en su propia
  banda.** Los memos usaban `data.dateKey` (turno VIGENTE) pero `live` es el
  turno que se MIRA — al navegar con «Anterior» al 14-08 desde el 15, el filtro
  `< hoy` dejaba pasar al propio 14 y la banda decía «en su rango normal
  (10,3–13,5)»: el techo era él mismo y el récord desaparecía. Es la violación
  exacta del «fijado a priori» de la guía. Fix: `vista.dateKey`.
  **Regla general: en el monitor, todo lo que dependa de "hoy" usa `vista`, no
  `data`** — data es el doc, vista es lo que está en pantalla.
- **La banda se fija a priori** (solo turnos anteriores, nunca el de hoy — hay
  test que lo clava) y **con <5 turnos válidos no hay banda**: al arrancar el
  turno noche, esas tarjetas quedan sin contexto hasta juntar historia.
- El sparkline va en su PROPIA fila: al lado del valor desbordaba la tarjeta a
  390 px (las KPI van de a dos, ~160 px cada una; el mockup era de 250).
- Banda `fill-muted` era invisible sobre la tarjeta oscura → `fill-muted-foreground/20`.
- **El deploy automático de functions del PR #555 ya repobló `forecastHistory`**:
  los récords pasaron de 7 a 10 turnos y el «84% (vie 7)» torcido de la caché
  vieja quedó en 82% (sáb 8) recalculado fresco. La fusión history/forecastHistory
  funcionó como estaba prevista.

**Verificado:** 1.405 tests, tsc limpio, eslint 28/30, y el monitor leído en el
navegador con el turno real del 14-08 (navegado con «Anterior» desde el vivo del
15) a 390 px en claro y oscuro.

## 2026-08-14 · Monitor público · ritmo con denominador + «Qué cambió contra ayer» + récords

**Qué cambió.** Tres piezas: (1) la tarjeta de ritmo ahora manda el ANDANDO
(13,5 = piezas ÷ min produciendo) con el de reloj como segunda línea y su
denominador escrito; (2) bloque nuevo «Qué cambió contra ayer»: la diferencia
de piezas contra el último turno del mismo nombre, repartida entre duración /
convenio / paradas / velocidad, con la suma cuadrando y el residuo visible;
(3) «Contra lo mejor que ya hicimos»: récords POR COMPONENTE (ritmo, paradas,
% andando) — no «el mejor turno», que por piezas era solo el más largo.

**El hallazgo que lo motivó (Orel):** la pantalla decía 9,7 «promedio del
turno» arriba y 13,5 abajo. Los dos eran ciertos (405 min de reloj vs 291
andando) pero el de reloj daba 9,7 IGUAL el 13 y el 14 — el día que la línea
fue la más rápida de los últimos 8 turnos e hizo 788 pz menos solo por tiempo.
La descomposición: −1.001 duración, −213 convenio, +88 paradas, +276 ritmo,
+63 residuo = −788 ✓.

**Archivos.** `services/shoplogix/monitorVsAyer.ts` (nuevo, 11 tests),
`pages/monitor/MonitorVsAyer.tsx` (nuevo), `functions/publicMonitor.js`
(forecastHistory ahora publica windowMin/plannedMin/recoverableMin),
`publicShiftMonitor.service.ts`, `PublicShiftMonitorPage.tsx` (Kpi + memos).

**Decisiones y trampas:**

- ⚠⚠ **El `history` cacheado del espejo trae números de la metodología VIEJA**:
  para el 07-08 dice 397 min produciendo y reconstruirlo fresco da 351 (84% vs
  75% andando). Un récord calculado con otras reglas es una vara torcida. Por
  eso manda `forecastHistory` (que el fix de functions reconstruye una vez con
  el código vigente) y `history` queda de relleno hasta que el backend repueble.
  **Hasta ese deploy el bloque muestra el récord viejo de 84%** — se corrige
  solo con el merge (functions se despliega automático) + el próximo sync.
- **El bloque solo aparece con el turno CERRADO**: a mitad de turno el término
  «duración» compararía una ventana a medio crecer y todo daría en contra. En
  vivo esa pregunta la contesta el comparador.
- **Récords solo de lo que el turno controla** (ritmo, paradas, % andando); la
  brecha se traduce a piezas solo en paradas — convertir también el % andando
  contaría dos veces lo mismo. Mínimo 3 turnos válidos o no hay récords.
- **Turnos rotos no comparan**: 12 de 23 en Firestore vienen sin piezas o sin
  desglose. `vsAyer` los salta y busca el anterior válido; si no hay, no hay
  bloque. Con residuo > 35% el bloque dice «datos incompletos» y no reparte.
- Identidad de la descomposición: Δpz = r₀·Δandando + Δr·andando₁, con
  Δandando = Δventana − Δconvenio − Δparadas − Δotros (otros → residuo).
- El término de ritmo dio 276 y no 282: el redondeo de 12,52 a 12,5 en la
  estimación de cabeza. Los tests fijan los valores EXACTOS del turno real.

**Verificado:** 1.401 tests, tsc limpio, eslint 28/30, bloque y tarjeta leídos
en el navegador con el turno real del 14-08 en claro y oscuro.

## 2026-08-14 · Monitor público · un solo apartado, con los tipos del CURSO

**Qué cambió.** «Por qué no llegamos» pasó a «Qué pasó en el turno»: un solo
apartado con los eventos agrupados por **dueño de la pérdida** —Mantención,
Externo, Sin imputar, Programado— cada causa con su categoría oficial y con sus
paradas adentro, a un toque.

**De dónde salen los tipos.** Del árbol OFICIAL (`imputacionTaxonomy.ts`, la
«Capacitación de Imputación de Fallas V12»), no de nuestro criterio. Orel lo
preguntó —«¿los tipos los estás tomando del curso?»— y la respuesta era NO: yo
había inventado «flujo de línea». Cruzadas las 21 causas reales de Filete contra
el árbol: **14 matchean, 7 no**.

**Por qué importa la separación.** «Evitable» ≠ «de Mantención». El 14-08 los
662 pz evitables fueron 410 externos (operación, agua, MMPP) y 252 sin imputar,
y **cero de máquina** — y el bloque ahora lo dice con esas palabras. Sin eso, la
cifra se lee como si Mantención hubiera fallado.

**Extensión del árbol (decisión de Orel).** El curso se escribió para la Baader
142 de Yal; Filete tiene una 200 y sus cuchillerías caían en «sin imputar»: 140
min de fallas mecánicas invisibles en 12 turnos. Se agregaron 5 hojas marcadas
`extension: 'filete-baader200'` (CUCHILLERIA DORSAL / RASCADOR / PUNZON, una
genérica de cuchillería, y GEA). **No cuentan como del curso**: `TOTAL_HOJAS_CURSO`
sigue diciendo 46 y el árbol dibujable no las muestra.

**Archivos.** `services/shoplogix/monitorEventos.ts` (nuevo, +9 tests),
`imputacionTaxonomy.ts` (+6 tests), `pages/monitor/notasOperador.ts` (nuevo,
+5 tests), `MonitorShiftParts.tsx`, `PublicShiftMonitorPage.tsx`.

**Decisiones y trampas:**

- ⚠ **Dos números para lo mismo, otra vez.** La fila decía «23×» (de
  `timeBreakdown`) y el detalle contaba 28 eventos (de `stopEvents`). El resumen
  ahora se calcula con el `count` de la fila; la lista de abajo son ejemplos.
  **Queda pendiente entender por qué difieren** — 5 eventos de diferencia en el
  mismo turno.
- **Tocar una causa ya NO salta al gráfico**: saltaba y dejaba fuera de pantalla
  el detalle recién abierto. Se marca igual en la serie, y el salto es un botón
  explícito («ver en el gráfico») dentro del detalle.
- **Las microparadas no se listan**: 23 filas de 12 s tapan las cuatro paradas
  que costaron piezas. Se resumen («23 paradas de 26 s en promedio») + las 3 más
  largas. Es la cronología de la opción B sin su ruido.
- **Se rescataron los comentarios de turno completo** (`notasDelTurno`): los que
  Shoplogix marca 07:45→15:30 no cuelgan de ninguna parada y se descartaban en
  silencio. El 07-08 uno era «Se abren guías de bronce baader 200» — una falla
  mecánica que no leía nadie.
- **`notasPorCausa` y `notasDelTurno` se mudaron a `notasOperador.ts`**: son
  datos, no componentes, y el archivo de componentes ya llevaba 3 warnings de
  `react-refresh`. El repo bajó de 30 (el límite exacto de CI) a 28.
- ⚠ **Lo que sigue sin poderse hacer**: el Pareto eléctrica vs mecánica del
  curso. Shoplogix aplana el árbol y «MOTORES» vive en las dos categorías.

**Verificado:** 1.390 tests, tsc limpio, eslint 28/30, y los dos turnos reales
en el navegador a 390 px en claro y oscuro — el 14-08 (sin fallas de máquina) y
el 07-08 (Mantención 11 min / 115 pz por PERNOS/RESORTES, con su nota de turno
completo recuperada).

## 2026-08-14 · Monitor público · fuera dos bloques (bitácora y diagnóstico)

Orel los sacó mirando la pantalla: **«Comentarios del operador»** repetía lo que
ya sale en las filas de causa, y **«Dónde se gana en esta línea»** «no aporta
datos certeros». Borrados junto con su código muerto: `MonitorDiagnostico.tsx`,
`services/shoplogix/monitorDiagnostico.ts` y sus tests, el componente
`BitacoraOperador` y el memo `diagnostico` de la página.

⚠ **Lo que se pierde, medido antes de borrar** (8 turnos de Filete): 4
anotaciones vivían SOLO en la bitácora — las de causas que no tienen fila
(«Bajada de Información», DETENCION PROGRAMADA, 12-08), las de más de 2 h de
duración («retraso ingreso personal», 07-08), una mecánica sin fila propia («Se
abren guías de bronce baader 200», 07-08) y las que pasan el tope de 2 notas por
causa que aplica `notasPorCausa` (13-08 y 14-08). Si algún día falta contexto
del piso, el tope de 2 y el filtro de causas son los dos lugares donde mirar.

## 2026-08-14 · Monitor público · cada parada al ritmo que la línea traía

**Qué cambió.** Las piezas que costó cada detención ya no se calculan con el
promedio del turno, sino con el ritmo que la línea traía JUSTO ANTES de esa
parada (mediana de los tramos limpios de los 30 min previos).

**Por qué.** Lo vio Orel mirando el turno de Filete del 14-08: el bloque decía
13,5 pz/min, pero antes del corte de agua la línea venía a 12,1, con tramos de
8,5 y 10,9. Valorizar todo al promedio SOBREESTIMA lo que se le imputa a
Mantención — "se perdieron X piezas por esa detención" es exactamente la frase
que después se usa para echar culpas, y tiene que aguantar que la revisen.

**Cuánto cambia (turno real 14-08, verificado con `buildMonitorLive`):**

| causa | min | al promedio | al ritmo real |
|---|---|---|---|
| FALLA OPERACIONAL | 14 | 189 | 183 |
| Micro Detencion | 10 | 148 | 135 |
| AGUA | 11 | 146 | 131 |
| ACUMULACION | 9 | 125 | 117 |
| ATASCAMIENTO | 8 | 111 | 96 |
| **total** | **52** | **719** | **662** (−8%) |

El reparto de la brecha pasó de 65/35 a 61/39.

**Archivos.** `services/shoplogix/monitorPerdidas.ts` (nuevo, + 9 tests),
`pages/monitor/MonitorShiftParts.tsx`, `pages/PublicShiftMonitorPage.tsx`.

**Decisiones y trampas:**

- **Ventana de 30 min hacia atrás, con mediana.** Un solo tramo de 5 min es
  ruido (el previo al agua marcaba 8,5); la ventana da 12,1. Solo hacia atrás:
  lo de después ya está contaminado por el arranque post-parada.
- **El ritmo de un tramo se mide sobre su tiempo ANDANDO**, no sobre los 5 min:
  un tramo con 2 min parado produce menos sin ser más lento.
- ⚠ **Los tramos con parada NO entran en la referencia**, y **los que están en
  cero sin parada registrada tampoco** (rampa del arranque). Un test lo pilló:
  el tramo 0 metía un ritmo de 0 y una parada habría costado 0 piezas —
  subestimar es el error opuesto y también miente.
- ⚠ **El titular se suma de las mismas filas de abajo.** Calcularlo aparte
  (recoverableMin x promedio) daba un número que no cuadraba con su detalle.
  Excepción: los minutos recuperables que todavía no tienen fila —la parada EN
  CURSO— van al promedio, o el titular se queda corto justo con la línea parada.
- Las filas se ordenan por lo que COSTARON, no por minutos: la más larga ya no
  es siempre la más cara (Micro Detencion, 10 min, cuesta más que AGUA, 11).
- 4 de los 40 eventos (los del arranque) no tienen 30 min hacia atrás y usan el
  promedio; `sinLocal` lo reporta.

**Verificado:** 1.383 tests, tsc limpio, eslint 29/30 warnings (ninguna nueva),
y el bloque leído en el navegador con el turno real del 14-08 a 390 px en tema
claro y oscuro.

# WORKLOG — bitácora de agentes (append-only)

Una entrada por bloque de trabajo. La más reciente arriba. Formato:

```
## YYYY-MM-DD · <agente> · <tarea>
- Hecho: ...
- Archivos: ...
- Verificación: tsc/eslint/preview ...
- Estado: HECHO | EN REVISIÓN | PENDIENTE
- Sigue: ...
```


## 2026-08-14 - claude - El gráfico de velocidad: alto, ejes, series a elección y zoom por gesto

- Pedido de Orel mirando la pantalla: *"que se vea mejor, quizás más grande, que se noten mejor las
  líneas de velocidad frente a las barras, poder seleccionar ver una u otra, zoom in/zoom out y
  paneo en vez de botones 1×/2×/4×/8×, y que los dos ejes muestren información"*. Mockup con los 96
  tramos reales del turno: https://claude.ai/code/artifact/115ffa5f-c34e-4ddf-a00f-0899e80cf153
- **Eje Y, que no existía.** La altura de una barra no se traducía a ningún número: había que
  tocarla. Peor: el gráfico se autoescalaba al máximo del turno, así que **cada turno se dibujaba
  contra sí mismo y todos parecían igual de llenos**. Ahora la escala llega hasta la velocidad de la
  MÁQUINA (18 pz/min de la Baader 200, redondeado a múltiplo de 5) y **el hueco entre la curva y esa
  línea es, dibujado, el llenado de silletas que falta**. Una sola unidad para barras y línea:
  pz/min (las barras son las piezas del tramo ÷ 5). Dos ejes para el mismo dato es la receta clásica
  para leer mal un gráfico.
- **Alto de 80 → 170 px** (en px explícitos: el root corre al 85% y los rem encogen).
- **Peso invertido**: barras al 35% de opacidad, línea de la media de 15 min al doble de grosor y
  con su propio tono. Antes competían —mismo azul, línea de 1 px— y la tendencia se perdía.
- **Chips `ambas / solo barras / solo línea`**, con la elección recordada en localStorage: el
  monitor se refresca solo cada 30 s y sin memoria habría que reelegir cada vez.
- **Zoom por gesto** en lugar de los botones: pellizco de dos dedos, ctrl/⌘+rueda (que es como llega
  el pellizco del trackpad), arrastre con el mouse para panear —en el celular ya paneaba solo, es el
  scroll nativo— y doble clic para volver. Queda el botón **"ver todo · N×"**: un zoom sin salida
  visible es peor que ninguno.
- ⚠⚠ Los listeners de `wheel` y `touchmove` van **nativos con `passive: false`**. React los registra
  como pasivos y ahí `preventDefault()` no hace nada: la rueda seguiría desplazando la página y el
  pellizco haría zoom del navegador entero por encima del gráfico.
- ⚠⚠ **El pellizco tenía que cortar la propagación del touch**: la página entera escucha swipe para
  cambiar de turno con un umbral de 60 px, y un pellizco mueve los dedos mucho más que eso —
  acercarse al detalle habría abierto el turno anterior. Lo mismo con el arrastre de un dedo cuando
  el gráfico está acercado.
- ⚠ Sin modificador la rueda NO hace zoom: secuestrar el scroll de un bloque de 170 px hace que la
  pantalla se sienta rota al bajar por la página.
- El zoom conserva el punto que se está mirando: se guarda la razón del contenido bajo el puntero y
  se reposiciona el scroll en `useLayoutEffect`, después de que el ancho cambió.
- Archivos: PublicShiftMonitorPage.tsx (Sparkbars).
- Verificación: tsc limpio, 1.369 tests. En el navegador, claro y oscuro, con el turno de Filete:
  eje 0-20 con la línea de 18 dibujada, alto 170 px medido, ctrl+rueda llevando de 333 a 416 px de
  contenido con el scroll anclado en el punto del cursor (63 px, el valor exacto que predice la
  fórmula), los tres chips cambiando las series (97 rects / 1 polyline → 1 / 1 → 97 / 0) y la
  elección persistida.
- Estado: EN REVISIÓN (PR nuevo)
- Sigue: el pellizco de dos dedos no se pudo probar sin un dispositivo táctil — mirarlo en el
  celular. Y con el turno cerrado no se ve la referencia "necesitás" en el gráfico.

---

## 2026-08-14 - claude - Velocidad × llenado de silletas: el límite no es la máquina

- Orel explicó el mecanismo de la **Baader 200 de Filete**: 5 silletas que pasan a velocidad fija
  (máximo funcional 22 pz/min, se opera por debajo, p.ej. 18), y el operador pone una pieza por
  silleta — o no: cansancio, un salmón que sacar, atochamiento aguas abajo (decorado, pimponeo).
  Su punto, textual: *"no sirve poner velocidades irreales sobre eso ya que no se logrará"* y
  *"no es un problema de máquina sino de abastecimiento o de atascamiento, pero no de velocidad"*.
  ⚠ **Las silletas son de la Baader 200. Las Baader 142 son otras máquinas** — la config va por
  MODELO y las 142 no tienen entrada, así que el bloque no aparece para ellas.
- **Los datos confirman el modelo.** 614 tramos de 5 min con producción en los últimos 7 turnos de
  Filete: máximo observado **16,6 pz/min** (92% de 18), p99 15,6, p95 14,0, mediana 10,2.
  **NINGÚN tramo llegó al 90% de llenado**; solo el 3% pasó el 80%. Andando, el ritmo es 11,6 hoy y
  11,0 de mediana → **se llenan 61-64 de cada 100 silletas**. De los 18 pz/min que la máquina
  ofrece, ~6,5 se pierden en silletas vacías MIENTRAS la máquina anda.
- `monitorMaquina.ts`: spec por modelo (silletas, setCpm, maxCpm) + `llenadoDeSilletas`. La
  pantalla dice: *"Con la máquina a 18 pz/min, venís llenando 64 de cada 100 silletas · para la
  meta harían falta 69"* y abajo, chico: *"No es velocidad de máquina: es cuántas silletas van con
  pieza"*. Cuando lo que falta no entra ni con todo lleno: *"No entra ni con las 5 silletas llenas:
  faltan N pz y el máximo de la máquina son 22 pz/min"* — antes decía "Pide 224 pz/min".
- ⚠ `imposible` se mide contra el **máximo funcional** (22), no contra el set point (18): subir la
  velocidad es una decisión posible; llenar más del 100% de las silletas, no.
- ⚠⚠ **El set point NO viaja en los datos** (Shoplogix manda piezas y estados, no velocidad
  configurada). Vive en `SPECS` hasta que haya config por línea, y por eso **la pantalla siempre lo
  dice**: si el 18 está mal, el número está a la vista para que alguien en planta lo desmienta. Un
  supuesto escondido sería mucho peor.
- Archivos: monitorMaquina.ts (+10 tests), PublicShiftMonitorPage.tsx.
- Verificación: tsc limpio, 1.365 tests. En vivo, rama de HORA EXTRA: *"Con la máquina a 18 pz/min,
  van 64 de cada 100 silletas con pieza"*. ⚠ La línea con el llenado NECESARIO ("harían falta 69")
  no se pudo ver en pantalla: el turno ya había pasado su horario cuando quedó lista. Queda cubierta
  por test y hay que mirarla mañana con el turno en su ventana normal.
- Estado: EN REVISIÓN (PR #552)
- Sigue: confirmar con Orel si 18/22 son fijos para la Baader 200 de Filete o cambian por producto
  o calibre; si cambian, mover `SPECS` a config por línea.

## 2026-08-14 - claude - Tarjeta "Ahora" unificada: una sola respuesta a "¿llegamos?"

- Cierra el último punto del mockup de arquitectura. La respuesta a "¿vamos a llegar?" estaba
  repartida en tres tarjetas: la meta (veredicto + proyección al horario), el pronóstico (cierre
  estimado, tres bloques abajo) y el comparador (contra ayer, otro bloque más). Ahora la tarjeta de
  arriba lo dice completo en cuatro líneas: veredicto, cierre al horario, cierre si el turno se
  estira, y el día anterior a la misma altura con su diferencia.
- El resto —ritmo requerido, techo, "lo normal", hora extra y de dónde sale la hora de cierre—
  pasa a un **"ver qué hace falta"**; cerrado deja una línea con lo único que se mira de reojo
  ("Faltan 1.120 pz · quedan 5 min"). Eran doce líneas siempre abiertas arriba de todo.
- `PronosticoCierre` queda plegado: su titular ya está en la tarjeta y con el bloque cerrado el
  número se sigue viendo en la cabecera. Adentro queda lo auditable (banda, método, cuántos turnos
  llegaron desde esta altura).
- ⚠ **Un requerido MUY por encima del techo no se dice como número.** Visto a las 15:25 con 6 min
  de turno: *"Pide 186,7 pz/min y la línea, andando, va a 11,6"*. Es cierto y es inútil — se lee
  como que la pantalla se rompió. Desde 2× el mejor turno: *"Ya no da el tiempo: faltan 1.120 pz y
  quedan 5 min"*. El número exacto sigue en el detalle.
- ⚠ Al plegar `PronosticoCierre` los 11 tests de su bloque empezaron a fallar por leer un cuerpo
  que ya no se renderiza. Se abren por el BOTÓN (`aria-expanded="false"`), como lo haría alguien en
  planta, en vez de tocar el `localStorage` que usa `Bloque`.
- Archivos: PublicShiftMonitorPage.tsx, MonitorShiftParts.tsx, PronosticoCierre.test.tsx.
- Verificación: tsc limpio, 1.355 tests. En vivo, claro y oscuro, con el turno de Filete a punto de
  cerrar. La pantalla quedó en **1.420 px** contra los 2.766 px del inicio del día: **−49%**.
- Estado: EN REVISIÓN (PR #552)

## 2026-08-14 - claude - Menos ruido en el monitor: 4 preguntas, un gráfico, y el Pareto de paradas

- Orel: "siento que aún tenemos mucho ruido para ser un monitor que necesita entregar información
  rápido... por qué la velocidad, se detuvo por algo, por qué, e ir analizando turno a turno si se
  repiten los patrones de detenciones para encontrar causa raíz". Mockup con el inventario real de
  la pantalla (11 bloques, 2.766 px ≈ 4 pantallas de celular) mostrando que **tres bloques
  contestaban "¿llegamos?"**, **cuatro "¿va rápido?"** —dos de ellos dibujando la MISMA serie de 5
  min— y que **"¿se repite?" no existía**.
- **Pareto de paradas (`monitorPareto.ts` + `MonitorPareto.tsx`)**. Sale del historial que ya viaja
  en el doc: cero lecturas extra. Dos decisiones que lo hacen útil:
  · **Dos ejes.** Ordenado solo por minutos, `ACUMULACION` entra cuarta con 45 min y ocurrió en 2
    de 7 turnos: un incidente disfrazado de causa crónica. Cada fila lleva en cuántos turnos
    aparece, y las que no llegan a la mitad de la muestra se dibujan en gris.
  · **Agrupado por equipo.** Shoplogix etiqueta `Equipo/Parte`; las tres causas de la Baader
    (cuchillería dorsal, rascador, pernos/resortes) sueltas no pasan de 47 min y ninguna llama la
    atención, juntas son el 22% y el 2º lugar del Pareto. Regla genérica (lo que va antes de la
    primera barra), sin mapa que mantener, sirve igual en Yal.
  Corte estándar del 80% acumulado. Con 7 turnos de Filete: Micro Detencion 2 h 14 (35%, 7/7, 304
  paradas), Baader 200 1 h 26 (22%, 4/7), ATASCAMIENTO 58 min (15%, 6/7), ACUMULACION 45 min (12%,
  2/7) → **4 causas = 84%**.
- **El comentario del operador, pegado a su causa** (`notasPorCausa`). "FALLA OPERACIONAL 14 min" y
  «Ajuste erroneo de operador nuevo» estaban en bloques distintos separados por dos pantallas.
- **UN solo gráfico de la serie de 5 min.** "Velocidad de la línea" y "Piezas por tramo" dibujaban
  lo mismo (uno en pz/min, otro en piezas). Se fusionaron en el de tramos —el que sabe ubicar las
  detenciones y tiene zoom 8×— con la media móvil de 15 min encima y las referencias de ritmo
  convertidas a piezas/tramo. **`VelocidadDeLinea` borrado (247 líneas).**
  ⚠ Las referencias solo se dibujan si CABEN (≤1,3× el máximo): con la meta pidiendo 53 pz/min y el
  mejor tramo en 14,6, la línea estiraba la escala al cuádruple y aplastaba el turno contra el
  piso. Fuera de escala, el número se dice en la leyenda.
- **Comparador de días y Hora por hora quedan plegados por defecto.** No se borra nada: la
  respuesta corta viaja en el `extra` del bloque cerrado y `Bloque` recuerda la elección.
- **Resultado medido: 2.766 px → 1.726 px, −38%** (de ~4 pantallas de celular a ~2,5).
- Archivos: monitorPareto.ts (+test con los 6 turnos reales como fixture), MonitorPareto.tsx,
  MonitorShiftParts.tsx, PublicShiftMonitorPage.tsx.
- Verificación: tsc limpio, 1.355 tests. En vivo con el turno de Filete, claro y oscuro: Pareto con
  sus 4 filas y el corte del 84%, comentarios bajo FALLA OPERACIONAL y AGUA, gráfico único con la
  media de 15 min y "necesitás 53,0 pz/min (fuera del gráfico)".
- Estado: EN REVISIÓN (PR nuevo, encima de #551)
- Sigue: (a) la tarjeta "Ahora" del mockup —una sola respuesta a "¿llegamos?"— todavía son dos
  tarjetas (meta y cierre estimado); (b) con el turno por terminar el requerido se dispara ("60,2
  pz/min · 4,6× el mejor turno"): por encima de ~2× el techo conviene decirlo en palabras en vez
  de un número.

## 2026-08-14 - claude - El ritmo se mide ANDANDO: una sola base para toda la tarjeta

- Orel, viendo la tarjeta con el descuento de convenio ya puesto: "pero igual le pones 39 pz/min...
  me imagino que se está contando el tiempo de colación como detención en tiempo perdido; la
  colación es tiempo en el que no se puede producir pero es normal no producir". Tenía razón, y
  el problema era MÍO: al pasar el requerido a tiempo productivo dejé el resto en tiempo de reloj.
  La pantalla decía "Necesitás 39,4 y vas a 9,7" cuando la línea, andando, iba a 11,7 — y hasta
  anunciaba un récord falso ("por encima del mejor turno reciente, 9,7") comparando andando contra
  reloj. `monitorPace.js` documentaba esa invariante y la rompí sin verla.
- ⚠⚠ REGLA: **un ritmo requerido sobre tiempo productivo SOLO se puede comparar contra ritmos
  productivos.** Medido en los 10 turnos de Filete: andando la mediana es 11,0 pz/min y el mejor
  turno 13,2; de reloj, 8,1 y 9,7. La diferencia entre las dos medidas ES el tiempo parado.
- Hecho: `ritmoAndando` (piezas ÷ minutos de uptime) sale de `forecastHistory` —`total` y
  `producingMin` ya viajan— y de `live.uptimeSec` para hoy. Alimenta `currentPerHour`,
  `maxPerHour` (techo) y las referencias "lo normal / mejor turno". `recentPerHour` va en null: el
  de los últimos 30 min es de reloj y durante una colación cae a cero. Las filas dicen "andando", y
  cuando el requerido pasa el techo se agrega "· 1,8× el mejor turno" en vez de un número desnudo.
- Y el KPI **"Tiempo produciendo" ya no mete la colación en el denominador**: va sobre el tiempo
  DISPONIBLE (ventana − planificado). Hoy 68% → 84% con los mismos 4 h 08. Castigar a la línea por
  una parada de convenio era exactamente lo que Orel señalaba.
- La leyenda del gráfico de velocidad pasó de "lo normal" a "promedio de turno": esa mediana es de
  reloj y con la tarjeta hablando de andando, dos números distintos con la misma etiqueta se leen
  como un error.
- Efecto de lectura, que es lo que importa: la pantalla ya no dice "la línea va lenta" (9,7 vs 8,1)
  sino **la línea anda a 11,8, por encima de la mediana de 11,0; lo que falta es tiempo**. Eso es
  el argumento de Mantención, no el de producción.
- Archivos: PublicShiftMonitorPage.tsx, MonitorShiftParts.tsx.
- Verificación: tsc limpio, 1.342 tests. En vivo (14:10, Filete, claro y oscuro): "Pide 23,4 pz/min
  y la línea, andando, va a 11,8", "Necesitás 23,4 andando · 1,8× el mejor turno", techo 13,2,
  "Andando, lo normal 11,0 · mejor turno 13,2", "Tiempo produciendo 84% · sin contar convenio".
- Estado: EN REVISIÓN (PR #551)

## 2026-08-14 - claude - La colación entra en el ritmo necesario (pregunta de Orel en vivo)

- Pregunta de Orel mirando el turno: "veo que no estamos considerando la colación en los
  cálculos, ¿o sí?". No se estaba. La cuota se aplana en las paradas de convenio desde #493 y
  el pronóstico las hereda del historial, pero el RITMO NECESARIO se repartía sobre tiempo de
  reloj: a las 12:50 pedía 13,1 pz/min para 2.089 pz en 2 h 40, con ~55 min de colación
  adentro de esa ventana.
- Hecho: `computePaceToTarget` recibe `pendingBreakMin` y calcula sobre `workMin` = reloj menos
  convenio por delante — el ritmo necesario, la proyección al cierre y la hora extra (que ahora
  agrega una hora de LÍNEA ANDANDO, no de reloj). Piso de 5 min para no dividir por ~0. La
  tarjeta lo dice: "Queda 1 h 43 · 53 min produciendo" + "Descontando 50 min de paradas de
  convenio que faltan".
- ⚠⚠ Dos cosas que hacían que la colación EN CURSO no contara, y que solo se ven con un turno
  vivo (las dos aparecieron mirando la pantalla a las 13:41 y 13:44):
  1. `mergeBreaks` pronosticaba las de días anteriores por `fromMin > currentMinute`: la
     colación dejaba de contar apenas el turno pasaba su hora de arranque, o sea justo cuando
     está ocurriendo. Ahora por `toMin > currentMinute`.
  2. Una parada EN CURSO no está en `stopEvents` —Shoplogix publica intervalos cerrados— y la
     que sí está llega con los minutos que LLEVA, no con los que va a durar. Se arma desde
     `currentReason`/`currentSinceAt` (causa de convenio si lo es hoy o lo fue antes) y
     `extendOngoingBreaks` la estira a la mediana de esa misma parada en los turnos anteriores.
     Sin esto el descuento era de 6 min con 50 por delante.
- Además: `breaksTurno` es ahora UNA sola fuente para las cuatro cosas que dependen de las
  paradas (curva de cuota, fondo de los gráficos, ritmo necesario, aviso de la próxima).
  `breakMinutesBetween` y `extendOngoingBreaks` viven en `monitorCompare` para poder probarlas.
- Archivos: monitorPace.ts, monitorCompare.ts, PublicShiftMonitorPage.tsx, +tests en
  monitorPace.test.ts y monitorCompare.test.ts.
- Verificación: tsc limpio, 1.342 tests. En vivo con la colación ocurriendo (13:46, Filete):
  "Queda 1 h 43 min · 53 min produciendo", "Necesitás 39,4 pz/min", cierre al horario 3.430 pz
  (69%) — antes decía 19,3 pz/min repartiendo sobre el reloj. Banda de convenio del gráfico de
  tramos correcta (x=84,9% ancho 13,7% = 13:35 al último tramo).
- Estado: EN REVISIÓN (PR #551)
- Sigue: turno NOCHE de Filete la otra semana. El monitor de línea ya sigue al turno vigente
  (Yal es el caso probado), pero para "Turno Noche" nuevo: `inferShiftEndFromHistory` exige 2
  turnos con producción, así que las 2 primeras noches el cierre sale de la config — si no hay
  config cargada, `pace` devuelve null y la tarjeta "Para llegar a la meta" no aparece.
  Conviene fijar el horario del turno noche ANTES del primero. Pronóstico y diagnóstico piden
  4 turnos del mismo nombre (MIN_SAMPLES), y la colación de la noche no se pronostica hasta
  tener 1-2 noches de historial.

## 2026-08-14 - claude - Un solo cierre con su horizonte, fondo de convenio y aviso de colación

- Hecho: (1) La pantalla daba DOS cierres que se contradecían. A las 12:50, en el turno vivo de
  Filete: la tarjeta de la meta decía "No se alcanza… cierra en 4.501 pz (90%)" y el pronóstico
  "5.011 pz — la meta entra". No era un error de cuenta: son dos horizontes y ninguno lo decía.
  `pace` proyecta a `plannedEnd` (15:30, 460 min) y el pronóstico a la mediana de lo que
  DURARON los turnos anteriores (8 h 45). La diferencia es la hora extra que esta línea hace
  casi todos los días: el 13-08 produjo 505 pz después de las 15:30, el 12-08 311 y el 11-08
  413. Ahora cada número lleva su hora escrita y el bloque del pronóstico agrega "Si corta a
  las 15:30 del horario serían N pz". `ForecastResult` expone `horizonMin`. (2) Fondo gris de
  las paradas de convenio en "Piezas por tramo": el pendiente del 13-08. (3) El aviso de la
  próxima parada de convenio ya no se apaga con la primera parada planificada.
- Por qué salían 23 bandas (lo que quedó sin explicar el 13-08): `stopEvents` trae TODAS las
  detenciones (56 el 13-08, 28 el 14-08) y su campo `r` es un ÍNDICE a `stopReasons`, no el
  nombre. La fuente correcta es `comparacion.breaks` (`plannedBreaks()` filtra por las causas
  de `timeBreakdown.planned`), la misma que ya usan el comparador y la curva de velocidad: 3
  eventos el 13-08 y 2 el 14-08. Con el piso de 15 min queda UNA banda, la colación. Se dibuja
  solo el pasado: `breaks` incluye el pronóstico de las que faltan y una banda futura quedaría
  clavada contra el borde derecho, sobre producción real.
- También: el aviso de la próxima parada se contaba desde `scheduledStart` y `plannedBreaks`
  cuenta desde el PRIMER TRAMO CON DATO — salía 5 min tarde. Y "Con 1 hora extra… la meta
  entra" pasó a "alcanzaría, pero apurando": chocaba con el "no entra" del pronóstico a la
  misma hora.
- Archivos: monitorForecast.ts, MonitorShiftParts.tsx, PublicShiftMonitorPage.tsx,
  __tests__/PronosticoCierre.test.tsx, __tests__/TiempoDelTurno.test.tsx (nuevo).
- Verificación: tsc limpio; 1.327 tests (97 archivos). Navegador a 390 px, claro y oscuro:
  turno VIVO de Filete —los dos bloques dicen 4.105 pz hasta las 15:30 y 4.386 al cierre
  típico— y turno del 13-08 —UNA banda gris en x=52,5% ancho 6,8% = 12:50-13:30, la colación,
  alineada con la del gráfico de velocidad—.
- Estado: EN REVISIÓN (PR abierto)
- Sigue: el aviso con `plannedMin > 0` quedó cubierto por test pero no visto en pantalla (a las
  13:20 ya no había próxima parada por delante); mirarlo en un turno temprano.

## 2026-08-14 - claude - Tres roles de color en vez de siete, y el desenlace junto (PR pendiente de merge)

- Hecho: `monitorColors.ts` era 7 hex crudos de Tailwind; 6 muertos y los 2 usados (hoy/cuota)
  daban 1,9:1 sobre `--card` en claro (WCAG pide 3:1 para un trazo). Reemplazado por 3 roles
  con nombre (hoy/cuota/referencia) por OKLCH del hue de marca, variables `--mon-*` por tema.
  Además: tarjeta de cuota muestra rango de días comparables en vez de repetir el mismo
  número 3 veces; chip "Planificado 0 min" se oculta; "Comparado con otros días" sube junto
  a "Cierre estimado".
- Archivos: index.css, monitorColors.ts, MonitorCompareChart.tsx, MonitorShiftParts.tsx,
  PublicShiftMonitorPage.tsx, monitorCompare.ts (+test).
- Gotchas: (a) los colores van por `style={{ stroke }}`, no por atributo `stroke=` — los
  atributos de presentación SVG no resuelven `var()`; (b) los hex de gráficos NO pasan por
  `tailwind.config.js`, hay que medirles el contraste a mano en LOS DOS temas.
- Verificación: tsc limpio, 290 tests, navegador a 390px en claro/oscuro sobre turno vivo.
- Estado: EN REVISIÓN (PR abierto, merge lo decide Orel)
- Sigue: nada de código. Nota: este archivo pasó ~166 KB, sigue pendiente compactar.

---

## 2026-08-14 - claude - La curva de la cuota se reparte sobre el turno completo (#548)

- Hecho: visto en vivo con el turno de Filete en curso a las 11:25, `timeBreakdown.windowMin`
  son los minutos de operación HASTA AHORA (215), no la duración del turno (465). Repartir
  5.000 piezas sobre 215 min hacía que la línea de la cuota trepara hasta la meta en la hora 4
  y siguiera plana, el área roja se comiera el gráfico y "dónde se abrió la brecha" marcara el
  turno entero en un solo tramo. Ahora la ventana sale de scheduledStart→plannedEnd y el
  convenio descontado es el PREVISTO (breaks, no `plannedMin` que a media mañana es 0). Con
  el turno cerrado no se veía: transcurrido = duración ahí.
- Archivos: apps/pwa/src/pages/PublicShiftMonitorPage.tsx
- Verificación: tsc/eslint limpios, vitest 288/288, verificado en vivo contra el turno de
  Filete en curso (preview :5175): la diferencia contra cuota pasó de −2.995 a −929, y la
  brecha de un tramo de 3,5 h a dos tramos concretos de 40-65 min. Deploy a GitHub Pages en
  success.
- Estado: HECHO
- Sigue: nada. Nota: este archivo pasó los ~165 KB — sigue pendiente compactar.

---

## 2026-08-14 - claude - "1 de 10 turnos" no es que la meta entre — tres grados (#546)

- Hecho: visto en vivo con el turno de Filete a media mañana, el pronóstico decía "La meta
  de 5.000 entra: 1 de 10 turnos la superaron desde acá" mientras la tarjeta del ritmo, dos
  bloques arriba, decía "No se alcanza con el tiempo que queda" — ambas correctas pero
  leídas juntas como contradicción. El umbral era `hitsTarget > 0`; ahora hay tres grados:
  ninguno → "no entra", menos de un tercio → "es difícil: solo N de M lo superó", un tercio
  o más → "entra".
- Archivos: apps/pwa/src/pages/monitor/MonitorShiftParts.tsx, .../__tests__/PronosticoCierre.test.tsx
- Verificación: tsc limpio, vitest 20/20 en src/pages/monitor, verificado en vivo en preview
  (:5175) contra el turno de Filete en curso. Deploy a GitHub Pages en success.
- Estado: HECHO
- Sigue: nada. Nota: este archivo pasó 163 KB — sigue pendiente compactar (cortar narración
  PR-por-PR vieja, conservar gotchas).

---

## 2026-08-14 - claude - Gráfico de tramos ocultaba dos horas de turno, y la curva mentía (#544)

- Hecho: 2 fixes medidos sobre el turno del 13-08 en Filete. (1) "Piezas por tramo de 5 min"
  tenía un piso de ancho de barra (`max(0.5, W/n - gap)`) que con 118 tramos dejaba las
  últimas 15 barras fuera del viewBox (borde en x=129 vs 100) — casi dos horas de producción
  invisibles. Ahora el paso es `W / n`, barra al 70%. (2) La curva de velocidad cortaba la
  cola de ceros del final (turno terminado ≠ turno cayéndose) y la escala pasa a marcas
  redondas cada 5 en vez de máximo/mitad ilegibles.
- Archivos: apps/pwa/src/pages/monitor/MonitorShiftParts.tsx, apps/pwa/src/pages/PublicShiftMonitorPage.tsx
- Verificación: 96 → 118 barras visibles, escala 20/15/10/5, verificado en pantalla contra
  el monitor real de Filete con el dev server reiniciado (preview :5175). tsc, eslint y
  vitest 286/286 limpios. Deploy a GitHub Pages en success (run 31764396081).
- Estado: HECHO
- Sigue: nada pendiente de este fix. Este archivo pasó ~160 KB — sigue pendiente compactar
  (cortar narración PR-por-PR vieja, conservar gotchas).

---

## 2026-08-14 - claude - HOTFIX: monitor dejó de refrescarse — Firestore rechaza arrays anidados (#542)

- Hecho: el #540 mandaba la curva de `forecastHistory` como pares `[m, p]`; Firestore no
  admite arrays dentro de arrays y el write del patch fallaba ENTERO ("Property array
  contains an invalid nested entity"). El doc público quedó congelado ~40 min (ni
  `forecastHistory` ni `live` se actualizaban). Fix: la curva ahora son objetos `{m, p}`.
- Lección: el #540 se había probado COMPUTANDO el resumen contra datos reales, nunca
  ESCRIBIÉNDOLO. Un cálculo correcto que Firestore rechaza al guardar es indistinguible de
  uno roto — la verificación tiene que incluir el write real, no solo el cómputo.
- Archivos: functions/publicMonitor.js, apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts,
  apps/pwa/src/pages/PublicShiftMonitorPage.tsx
- Verificación: tsc/eslint/vitest 286/286 limpios; write real a Firestore (9 turnos de
  Filete) antes de mergear. Post-deploy: logs de Cloud Functions confirman que
  `onShoplogixShiftWrittenPublicMonitor` pasó de error en cada invocación a "refrescados"
  sin error tras el rollout; `live.updatedAt` de Filete y Yal avanzó y `forecastHistory`
  quedó poblado con curvas `{m,p}`.
- Estado: HECHO
- Sigue: nada pendiente de este fix. Nota: este archivo pasó ~160 KB — conviene compactar
  (cortar narración PR-por-PR vieja, conservar gotchas).

---

## 2026-08-13 - claude - Historial del MISMO turno para pronosticar el cierre (#540)

- Hecho: el doc del monitor público ahora publica también `forecastHistory` — hasta 10
  turnos DEL MISMO nombre (no los 6 cronológicos de `history`), resumidos a 5 KB. El
  pronóstico y el diagnóstico lo usan con fallback a `history` para docs viejos.
- Archivos: functions/publicMonitor.js, apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts,
  apps/pwa/src/pages/PublicShiftMonitorPage.tsx
- Verificación: tsc/eslint/vitest 286/286 limpios; probado contra Firestore real con Filete
  (9 turnos útiles, descarta un turno basura del 1-ago de 180 pz en 16 min, 5 KB). CI y
  ambos deploys (hosting + functions) en success.
- Estado: HECHO
- Sigue: verificación humana del pronóstico/diagnóstico con forecastHistory en pantalla.

---

## 2026-08-13 - claude - "Donde se gana en esta línea": velocidad o tiempo andando (#538)

- Hecho: bloque nuevo en el monitor que dice, por línea, cuál de los dos factores del total
  (tiempo andando x velocidad) manda: en Filete varía más la velocidad, en Yal el tiempo
  andando. Usa DISPERSIÓN sobre los últimos 6 turnos, no correlación (con 6 turnos un
  coeficiente es ruido); micro-detenciones se parean con piezas solo si en esa muestra la
  relación va en el sentido correcto, si no se muestra solo el rango.
- Archivos: monitorDiagnostico.ts, MonitorDiagnostico.tsx, PublicShiftMonitorPage.tsx, +tests
  (16 nuevos).
- Verificación: vitest 286/286, tsc y eslint limpios. Verificado en pantalla contra el monitor
  real de Filete. Deploy en success.
- Estado: HECHO
- Sigue: nada pendiente conocido.

---

## 2026-08-13 - claude - El gráfico prolonga la curva en un cono de proyección (#536)

- Hecho: dibujo del pronóstico del #534 sobre `MonitorCompareChart`: banda que nace en la punta
  de la curva de hoy y llega hasta el cierre, con mediana punteada; si la cuota queda por encima
  de todo el cono se ve sin leer un número. Número y dibujo salen de la MISMA función `proyectar`
  (evitado el "dos verdades en pantalla"); el cierre entra siempre en el cono aunque no caiga en
  el paso de 15 min.
- Archivos: monitorForecast.ts (tipo `ConePoint` + `cone`), MonitorCompareChart.tsx,
  MonitorShiftParts.tsx, PublicShiftMonitorPage.tsx, +tests (7 nuevos, 4 de render).
- Verificación: vitest 270/270, tsc y eslint limpios. Deploy en success.
- Estado: HECHO
- Sigue: ver en pantalla con turno vivo con muestra (mañana en Filete, mismo pendiente que #534).

---

## 2026-08-13 - claude - Pronóstico del cierre auto-calibrado, con su error medido (#534)

- Hecho: motor `monitorForecast.ts` que predice el cierre del turno desde el minuto 240 usando
  el history que ya viaja en el doc (cero lecturas extra). El método (proporcional/aditivo/ritmo)
  no se elige a mano: se mide por backtesting leave-one-out contra los turnos comparables
  (mismo nombre, cerrados) y se queda con el de menor error; ese error viaja con el pronóstico.
  Backtesting sobre 34 turnos reales: Filete acierta mejor con proporcional (5,2% vs 11,3% del
  ritmo actual), Yal con aditivo (8,8%, proporcional erra 12-24%) — la causa es física (Filete:
  total explicado por velocidad; Yal: por tiempo andando + paradas). Por encima de 15% de error
  el bloque se calla.
- Archivos: apps/pwa/src/services/shoplogix/monitorForecast.ts (+test),
  apps/pwa/src/pages/monitor/MonitorShiftParts.tsx, apps/pwa/src/pages/PublicShiftMonitorPage.tsx
  (+test de render).
- Verificación: vitest 263/263 (17 nuevos, con datos reales de Shoplogix como fixture: estima
  4.257 contra un cierre real de 4.294). tsc y eslint limpios. Deploy en success.
- Estado: HECHO
- Sigue: pendiente ver el bloque en pantalla con un turno vivo (requiere >=4 turnos comparables
  del mismo nombre; Yal solo trae 2 "Turno 2" — se verá mañana en Filete). Siguiente paso
  previsto: publicar historial del mismo turno desde el backend para que Yal también alcance
  muestra. Nota: WORKLOG.md pasó los ~150 KB — conviene compactarlo.

---

## 2026-08-13 - claude - No exponer el contador vivo del monitor cuando quedó en cero (#531)

- Hecho: los turnos que ya pasaron su cierre quedaron con `officialLive.totalCycles: 0`
  del bug corregido en #529 (el rollup devolvía la plantilla del día siguiente y se
  guardaba su cero antes del guard). El guard nuevo evita que se vuelva a pisar, pero
  el payload seguía publicando ese 0 congelado. Ahora `shoplogixLive` se expone solo
  con `totalCycles > 0`; si no, `null`.
- Archivos: functions/publicMonitor.js
- Verificación: `buildMonitorLive` contra el turno real de Filete de hoy: `live` pasa de
  `{totalCycles: 0}` a `null`, resto intacto (4.707 total, 4.202 dentro, 505 fuera).
  Solo backend, sin UI que verificar. Deploy de Firebase Functions y PWA en success.
- Estado: HECHO
- Sigue: nada pendiente.

---

## 2026-08-13 - claude - La hora extra se ve desde el primer minuto, y sigue guiando (#529)

- Hecho: "fuera del horario" se decidia por el DOC de origen del tramo, no por su hora real,
  y con la linea pasada de las 15:30 los tramos quedaban del lado "dentro del turno" hasta
  que Shoplogix cortaba (chip aparecia tarde, sin doble conteo real). Ahora la hora real
  manda, en union con el rescate de Unscheduled. `officialLive` ahora se escribe dentro del
  guard `isOfficialScheduleSane` (ya no se pisa con 0 cuando Shoplogix devuelve la plantilla
  del dia siguiente). Verdict nuevo 'hora-extra' en la tarjeta de ritmo: sin ventana que
  medir pero con cuanto falta y cuanto tardaria al ritmo actual.
- Archivos: functions/publicMonitor.js, functions/shoplogix/sync.js,
  apps/pwa/src/services/shoplogix/monitorPace.ts (+tests),
  apps/pwa/src/pages/PublicShiftMonitorPage.tsx
- Verificación: vitest shoplogix 246/246, tsc y eslint limpios; backend probado contra datos
  reales de Filete (turno de hoy con hora extra: 0 → 136 pz fuera, 15:30-15:44; turno de ayer
  con el mismo total 4.486, sin doble conteo); tarjeta de hora extra verificada en preview
  contra el turno vivo.
- Estado: HECHO. Merge squash a main `b0c2c748` (#529). Deploy hosting y Functions ambos
  success.
- Sigue: verificación humana en producción durante una hora extra real.

---

## 2026-08-13 - claude - Monitor muestra el contador VIVO de la pantalla de planta (#526)

- Hecho: el rollup que el sync ya consulta cada ciclo (mismo endpoint que el whiteboard en
  vivo) trae el acumulado real del turno en el estado Produciendo. El sync lo guarda como
  `officialLive` dentro del write del padre que ya existia (cero escrituras/requests extra).
  El monitor lo muestra junto al corte de datos: "datos hasta las 14:25 · Shoplogix marcaba
  3.850 a las 14:52". Pedido de Orel: "necesito que se sincronice Shoplogix con el monitor".
- Archivos: functions/shoplogix/sync.js, functions/publicMonitor.js,
  apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts,
  apps/pwa/src/pages/PublicShiftMonitorPage.tsx
- Verificación: tsc/eslint limpios; functions cargan sin error; extracción validada DOS
  veces contra el endpoint real cuadrando con la pantalla de planta (3.850=3.850 a las
  14:52; 3.932 a las 15:15). Degradación sin el campo verificada en preview (queda como hoy).
- Estado: HECHO. Merge squash a main `d33d4505`. Deploy hosting y Functions ambos success.
- Sigue: E2E con `officialLive` poblado por un turno vivo real (Yal esta noche / Filete manana).

---

## 2026-08-13 - claude - Tope de apuro: pedir mas de +30% del ritmo real es "no se alcanza" (#525)

- Hecho: segunda vuelta del veredicto (Orel) — "se alcanza pero con 36 pz/min" en una linea
  que viene a 10 seguia siendo irreal. Por encima de +30% del ritmo real el veredicto es
  NO SE ALCANZA aunque no haya techo historico de por medio; "solo apurando" queda acotado
  al rango 1,05x-1,3x. La hora extra tambien respeta el tope.
- Archivos: apps/pwa/src/services/shoplogix/monitorPace.ts (+tests, 28 recalibrados),
  apps/pwa/src/pages/PublicShiftMonitorPage.tsx
- Verificación: vitest monitorPace 28/28, tsc y eslint limpios; preview :5189 contra el
  turno VIVO de Filete (pide 40,1 pz/min, viene a 9,9 → No se alcanza).
- Estado: HECHO. Merge squash a main `7f8253db`.
- Sigue: nada pendiente de este cambio.

---

## 2026-08-13 - claude - El veredicto distingue "se alcanza" de "solo apurando" (#521)

- Hecho: "se alcanza pidiendo 26 pz/min" en una linea que viene a 10 comparaba contra el
  techo HISTORICO, no contra el ritmo real del turno. Verdict nuevo 'exigente': cabe bajo
  el techo pero pide mas que el mayor entre el promedio del turno y la ultima media hora
  (margen 5%). La hora extra se ofrece desde ese escalon; si baja al ritmo que la linea YA
  trae, la pantalla lo dice ("bastaria con X"). Tres titulares: "se alcanza al ritmo que
  traes" / "se alcanza, pero solo apurando" / "no se alcanza".
- Archivos: apps/pwa/src/services/shoplogix/monitorPace.ts (+tests, 28→32),
  apps/pwa/src/pages/PublicShiftMonitorPage.tsx
- Verificación: vitest shoplogix 244/244; tsc y eslint limpios; preview :5189 contra el
  turno VIVO de Filete, caso real (pide 26,8 pz/min, va a 9,8).
- Estado: HECHO. Merge squash a main `e8499bfe`.
- Sigue: nada pendiente de este cambio.

---

## 2026-08-13 - claude - "Datos hasta las HH:MM" junto a las piezas del turno vivo (#519)

- Hecho: el monitor es un espejo que copia Shoplogix cada ~5 min; sin el corte, la
  diferencia de un ciclo de sync (63 pz, ~6 min a 10,9 pz/min) parecia descuadre de
  conteo. Se muestra el FIN del ultimo tramo con dato (t + 5 min), no lastSyncAt. Solo
  con turno vivo.
- Archivos: apps/pwa/src/pages/PublicShiftMonitorPage.tsx
- Verificación: preview :5175 contra turno VIVO de Filete (390px, "3.488 piezas · datos
  hasta las 14:25"); tsc y eslint limpios.
- Estado: HECHO. Merge squash a main `7501ddae`.
- Sigue: nada pendiente de este cambio.

---

## 2026-08-13 - claude - Curva de velocidad: horas reales, zoom y paneo (#517)

- Hecho: eje de la curva pasa de "h+1" a horas reales del reloj (08:00, 09:00...); zoom
  1x/2x/4x con paneo y recentrado en el final (mismo mecanismo del comparador); bloque
  movido ARRIBA de "Piezas por tramo de 5 min".
- Archivos: apps/pwa/src/pages/monitor/MonitorShiftParts.tsx, PublicShiftMonitorPage.tsx
- Verificación: preview :5175 contra turno VIVO de Filete (390px); tsc y eslint limpios.
- Estado: HECHO
- Sigue: nada pendiente de este cambio.

---

## 2026-08-13 - claude - Curva de velocidad de linea (pz/min) a lo largo del turno (#515)

- Hecho: el KPI "Ultimos 30 min" da la velocidad de AHORA; nueva curva da la historia del
  turno (rampa, baches, crucero). Cruda de 5 min (tenue, piso del dato de Shoplogix) + media
  movil de 15 min (protagonista); 2 lineas de referencia punteadas ("necesitas" y "lo normal")
  y bandas de convenio de fondo para que la colacion no parezca falla. Bloque plegable entre
  el grafico de tramos y "A donde se va el tiempo".
- Archivos: `pages/monitor/MonitorShiftParts.tsx` (componente `VelocidadDeLinea`),
  `pages/PublicShiftMonitorPage.tsx`.
- Verificación: preview contra el turno VIVO de Filete (8,5 pz/min, necesitas 12,7, lo normal
  7,5), 390px sin overflow. tsc y eslint limpios. Diseño elegido por Orel en mockup.
- Estado: HECHO. Merge squash a main `386d0a6f`.

---

## 2026-08-13 - claude - Bitacora del turno: todos los comentarios del operador (#513)

- Hecho: los comentarios del operador (unico texto en castellano que sube del piso) solo se leian
  si coincidian con un tramo de brecha. Bloque plegado "Comentarios del operador" bajo Hora por
  hora: hora + causa (salta al grafico) + texto; fusiona tramos contiguos del mismo comentario
  (el sensor lo corta al cambiar de estado) y descarta los que cubren horas enteras (regla de 2 h
  de las brechas). Si no hay comentarios, el bloque no aparece.
- Archivos: `pages/monitor/MonitorShiftParts.tsx` (componente `BitacoraOperador`),
  `pages/PublicShiftMonitorPage.tsx`.
- Verificación: preview contra el monitor real de Filete (fusion incluida), 390px sin overflow,
  claro y oscuro. tsc y eslint limpios.
- Estado: HECHO. Merge squash a main `5a48a793`.

---

## 2026-08-13 - claude - Boton para abrir el monitor en vivo sin pasar por compartir (#511)

- Hecho: generar link/QR es para COMPARTIR; para mirar el monitor uno mismo faltaba un boton de
  un click. `handleAbrirMonitor` reusa el token de linea via `createPublicShiftMonitor`
  (invariante: no crea token nuevo, solo extiende vigencia) y abre `/monitor/{token}` en pestana
  nueva; la pestana se abre ANTES del await para que el bloqueador de popups no la mate.
- Archivos: `pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificación: tsc y eslint limpios (1 warning preexistente ajeno). Pendiente de verificación
  humana: el click con sesion de supervisor (no probado en navegador, sin login).
- Estado: HECHO. Merge squash a main `14564470`.

---

## 2026-08-13 - claude - Fix: la brecha se calcula contra la MISMA referencia que el grafico (#509)

- Hecho: el v3 (#505) dejo el grafico comparando contra la referencia del chip pero la lista
  "Donde se abrio la brecha" seguia clavada al mejor dia: dos rivales distintos a 20 px de
  distancia. La referencia elegida ahora vive en ComparadorDias y alimenta a ambos (grafico y
  BrechaDelDia recibe `contra` por prop); el titulo la sigue ("con la cuota" / "con lun 10").
- Archivos: `pages/monitor/MonitorCompareChart.tsx`, `pages/monitor/MonitorShiftParts.tsx`.
- Verificación: preview contra el monitor real de Filete con los tres chips (cuota, lun 10, mar
  11); tsc, eslint y vitest de monitorCompare (51/51) limpios.
- Estado: HECHO. Merge squash a main `f9089e91`.

---

## 2026-08-13 - claude - Compactacion del WORKLOG (195 KB -> ~146 KB)

- Hecho: segunda compactacion del historial (la primera fue el 2026-07-30). Las entradas del 2026-07-19 al 2026-07-30 (~57 KB de narracion PR-por-PR, todo mergeado) se condensaron en 3 bloques tematicos dentro de "Historial resumido", conservando gotchas, decisiones y pendientes. Agosto queda intacto (proyecto monitor activo). Respaldo completo pre-compactacion en `.ai/backups/WORKLOG-2026-08-13-pre-compactacion.md`; el detalle entrada por entrada vive en git.
- Archivos: `.ai/WORKLOG.md`, `.ai/backups/WORKLOG-2026-08-13-pre-compactacion.md` (nuevo).
- Verificacion: tamano final bajo el techo de ~150 KB; estructura de encabezados intacta.
- Estado: HECHO.
- Sigue: proxima compactacion cuando vuelva a acercarse a 190 KB (cortar por fecha, conservar gotchas, respaldar antes).

---

## 2026-08-13 - claude - Monitor ronda 2: pie sin alarma nocturna, estado por maquina y record (#507)

- Hecho: con el turno cerrado el pie dice "Turno cerrado - ultimo dato de las HH:MM" en tono
  neutro (antes alarmaba de noche con "la sincronizacion puede estar detenida"; la alerta ambar
  queda solo con turno vivo). "Por maquina" ahora dice el estado de AHORA ("· produciendo" o
  "parada · causa (hace X)") usando currentReason/currentSinceAt, sin puntos con turno cerrado.
  Linea de record bajo "Vas a" cuando el ritmo de hoy supera al mejor turno reciente.
- Archivos: `PublicShiftMonitorPage.tsx`.
- Verificación: tsc y eslint limpios; preview contra Filete cerrado (pie neutro, sin puntos rojos)
  y turno vivo de Yal (record real: 44,9 vs 41,8 pz/min). Rama "parada · causa" por maquina no
  se pudo ver en vivo (las 3 Baader producian) — replica el patron ya probado del "Ahora mismo".
- Estado: HECHO. Merge squash a main `371310d6`.

---

## 2026-08-13 - claude - Comparador v3: hoy contra UNA referencia con la brecha pintada (#505)

- Hecho: el modo diferencia dibujaba hasta 6 deltas contra el cero y la cuota "caia" aunque el
  turno fuera bien. Ahora hoy y la referencia elegida por chip (cuota o un dia anterior) SUBEN
  las dos, con la brecha sombreada (rojo abajo, verde arriba, cruce interpolado) y la cuota
  aplanandose en las paradas de convenio. El dia que mas llevaba a esta altura lleva "· mejor"
  en su chip. La tabla de dias queda solo informativa (la seleccion vive en los chips).
- Archivos: `pages/monitor/MonitorCompareChart.tsx` (reescrito), `pages/monitor/MonitorShiftParts.tsx`.
- Verificación: tsc, eslint y vitest de monitorCompare (51/51) limpios; preview contra el turno
  real de Filete (cuota y mar 11), 390px, claro y oscuro.
- Estado: HECHO. Merge squash a main `d0338c51`.

---

## 2026-08-12 - claude - Sin "Ahora mismo" con turno cerrado y produccion real en el veredicto (#503)

- Hecho: con el turno cerrado, el bloque "Ahora mismo — Linea detenida" pintaba alarmante una
  noche normal (esperable tras el cierre); ahora solo aparece con el turno en curso. Ademas el
  veredicto del comparador dice cuanto de la altura del turno fue produccion real, ej. "Se
  lograron 4.486 pz en 8 h 20 de turno, de las que 5 h 40 fueron de produccion real" (solo cuando
  produccion < altura del turno).
- Archivos: `PublicShiftMonitorPage.tsx`, `pages/monitor/MonitorShiftParts.tsx`.
- Verificación: tsc y eslint limpios; preview contra Filete cerrado y turno vivo de Yal.
- Estado: HECHO. Merge squash a main `2764cd5e`.

---

## 2026-08-12 - claude - La cabecera del turno vivo mostraba el ultimo sync, no el cierre previsto (#501)

- Hecho: en el monitor publico, con el turno en curso la cabecera mostraba el ultimo intervalo
  sincronizado como hora de termino ("15:00-21:52" con la linea aun produciendo); ahora muestra
  el cierre previsto ("15:00 -> 23:57") con marca "est." (sin marca si esta fijado a mano). Turno
  cerrado sigue mostrando el rango real. De paso, "A donde se va el tiempo" pasa a decir "de
  operacion" en vez de "de turno" para no repetir la palabra que usa el comparador de tiempo corrido.
- Archivos: `PublicShiftMonitorPage.tsx`, `pages/monitor/MonitorShiftParts.tsx`.
- Verificación: tsc y eslint limpios; preview contra turno vivo de Yal y Filete cerrado, 390px,
  ambos temas.
- Estado: HECHO.

---

## 2026-08-12 - claude - El header de movil montaba los botones sobre el titulo (#478)

Orel, con captura: *"mira se ven todos montados los botones ojo con el orden en el modo movil"*.

- **No era truncado feo, era DESBORDE.** El header sticky es UNA fila: titulo en `flex-1 min-w-0`
  y acciones en `shrink-0`. Los 7 botones ocupan ~290 de los 351 px utiles, asi que al titulo le
  quedaban ~60 — y como sus etiquetas (turno, horario) tambien son `shrink-0`, **no se recortaban:
  se salian del contenedor**, y los botones, que se pintan despues, quedaban ENCIMA.
  ⚠ Patron transferible: `min-w-0` en el contenedor no alcanza si los hijos son `shrink-0`. O se
  les saca el `shrink-0`, o el contenedor lleva `overflow-hidden`, o se cambia el layout.
- **Arreglo**: en movil dos filas (`basis-full sm:basis-auto` en los dos grupos) — arriba QUE TURNO
  estas mirando, abajo QUE PODES HACER con el, pegado al borde derecho. Dentro de la 2a fila:
  primero las acciones sobre ESTE turno (clasificar, compartir, exportar) y al final
  Anterior/Siguiente, que es irse a otro. `overflow-hidden` en el grupo del titulo como cinturon.
- **Desktop no cambia**: los dos grupos siguen en una fila de 46 px (medido antes y despues).
- Archivos: `pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx` (solo clases).
- Verificacion en prod (`buildSha` = `02f1637`), 375px, claro y oscuro: **0 elementos fuera del
  header** medidos con `getBoundingClientRect` sobre TODOS sus descendientes, y sin scroll
  horizontal (`scrollWidth === clientWidth === 375`). Caso peor probado inyectando por DOM un
  titulo largo ("Turno 1 Lunes — Madrugada extendida") mas un badge extra: sigue sin desbordar.
  ⚠ Medir el desborde con el DOM y no a ojo fue lo que dio la certeza: a ojo "se ve bien" no
  distingue entre recortado y tapado.
  tsc 0, eslint 0 nuevos, 1.162 tests OK.
- Estado: HECHO.

## 2026-08-12 - claude - Corte de control a mitad de turno + las 12 compuertas directas (#476)

Orel: *"dale con el corte de control a mitad de turno y en gates debemos poder setear directo las
12 gates ... sin ir a la configuracion de grader"*.

- **Corte de control** (`MidShiftCheckCard` + `graderMidShiftCheck.ts`): con el turno EN CURSO y un
  Excel cargado —aunque cubra un tramo— dice qué calibre viene apretado, cuántas piezas de ese
  calibre quedan al ritmo medido, y qué gate mover. Si el Excel quedó viejo (>90 min) eso se dice
  PRIMERO: todo lo demás describe un turno de hace horas. El Resumen lleva un aviso de una línea
  que abre Gates — la tarjeta vive donde se actúa, pero enterrada ahí Control de Producción no la ve.
  Reusa `compareGatesVsHistory`/`suggestGateMoves` de #474 a propósito: los umbrales tienen que ser
  los mismos en las tres vistas (post-turno, pre-turno, mitad de turno). NO promete "piezas mejor
  clasificadas" — a dónde caen las que desbordan no lo dice el Excel.
- **Las 12 compuertas directas**: la tabla ya estaba en Gates pero detrás de un acordeón cerrado Y
  una sub-pestaña. Ahora abre por defecto y en "12 Gates" (prop `defaultTab`).

### ⚠ Dos cosas para no repetir

1. **CORRECCIÓN a #474.** Ahí escribí que "la mayoría de los turnos no tiene `configHistory`, la
   config vive en plantillas". **Es falso.** Lo medí con `collection('graderShifts').get()`, que
   devuelve 2 turnos — y en Firestore **una subcolección puede vivir bajo un documento padre que NO
   existe**, así que esa consulta no la ve. Con `collectionGroup('configHistory')` son **386
   turnos**. Regla general: para contar subcolecciones usar `collectionGroup`, nunca
   `collection(padre).get()`. El fallback a plantilla sigue siendo necesario (un turno nuevo empieza
   sin snapshot) pero por esa razón, no por la que escribí.
2. **Snapshots fantasma de "0 cambios".** El editor de gates publica con debounce apenas monta —es
   "esto es lo que muestro", no "el usuario cambió algo"— y `saveConfigSnapshot` NO puede
   distinguirlo: sin snapshot previo el diff es `[]` por construcción, así que su guarda de "sin
   cambios" no aplica y escribe igual. Al abrir el panel por defecto, CADA visita a Gates dejaba un
   snapshot firmado por quien pasó. Cortado con una huella de la última emisión (la primera tras
   montar nunca se guarda). En prod hay **125 de 659** snapshots así, de antes.
   ⚠ Dos de esos 125 los generé YO en esta sesión antes de detectarlo: `2026-08-11__Turno 2`
   (2026-08-12T00:49Z) y `2026-08-07__Turno día` (2026-08-12T00:01Z). No los borré —borrar datos
   de producción es decisión de Orel—; quedan anotados acá.

- Archivos: `services/grader/graderMidShiftCheck.ts` (nuevo, puro),
  `components/grader/MidShiftCheckCard.tsx` (nuevo), `AnalisisGraderGatesConfigPage.tsx`
  (prop `defaultTab`), `AnalisisGraderTurnoPage.tsx`, `GateChangeModal.tsx`,
  `GatesHistoryHintCard.tsx` (comentarios corregidos).
- Verificación: 15 tests nuevos sobre el reparto REAL del `2026-08-11 Turno 2`. En el navegador,
  forzando el turno a "en curso": estima ≈5.907 piezas por pasar y ≈3.484 del calibre apretado, y
  los dos movimientos llevan el ratio de 2,4× a 1,4×. El aviso del Resumen abre Gates. Con el turno
  cerrado no aparece ninguno. Pruebas revertidas. Confirmado que ya no se escriben snapshots al
  abrir Gates. Claro, oscuro y 375px. tsc 0, eslint 0 nuevos, 1.162 tests OK.
- Estado: HECHO (`3899d2a` en prod).
- Sigue: el camino C de la propuesta — aviso por Telegram al detectar saturación, que ahora sí
  tiene de dónde salir (reusa el canal de los briefs de turno).

## 2026-08-11 - claude - Gates: setear sin Excel, imputaciones a "¿Que hacer?", aviso por historial (#473, #474)

Orel: *"dale con las dos y pensemos como podriamos ayudar a control de produccion a corregir los
gates segun lo q vaya pasando por la grader"*.

### #473 - dos mudanzas
- **Gates ya no exige el Excel**. Estaba DESHABILITADA sin el archivo: configurar las compuertas,
  que es trabajo de ANTES del turno, pedia el Excel que recien existe al CERRARLO. Los 4 campos
  que pedia Orel (calibre, calidad, conservacion, producto) YA existian, tapados detras de eso.
- **Las imputaciones se mudaron de "Linea" a "¿Que hacer?"** y suman al badge. Eran lo unico de
  Linea donde el tecnico ESCRIBE, enterrado bajo tres graficos. "¿Que hacer?" tambien se habilita
  sin Excel si hay datos del sensor: Filete y Eviscerado llegan con el turno entero sin causa.
- ⚠ El panel se monta SIEMPRE y se oculta por CSS: es el quien carga las anotaciones y publica el
  pendiente, asi que con render condicional el badge marcaria 0 hasta entrar a la pestaña.

### #474 - "¿Esta config aguanta lo que suele venir?"
Analisis de saturacion corrido al ANTES: compara las gates asignadas contra el reparto de
calibres de los turnos anteriores. Acusa el caso REAL de Chonchi: el 8-10 lb es el 55% de la
produccion y la config le deja 3 de 12 gates (2,2x), mientras el 2-4 lb tiene 2 gates para el 1,3%.

**Tres cosas que sin mirar los datos reales habrian salido mal** (valen para cualquier feature
que agregue turnos historicos):
1. **El calibre viene SIN NORMALIZAR de Matrix**: "8-10 lb" en agosto y "8 - 10 LB" el 3 de
   agosto. Agrupando por el string crudo el historico ve 10 calibres en vez de 5 y TODOS los
   porcentajes salen mal. Normalizar con `calibreKey()` (lowercase + sin espacios).
2. **La config de gates NO vive en el turno**: la mayoria de los turnos no tiene `configHistory`
   — se guarda como PLANTILLA (`graderGatesTemplates`) y se reusa. Leyendo solo el snapshot, la
   tarjeta no aparecia nunca. Regla de fallback: "Plantilla 1" o la primera, igual que el editor.
3. **`GateChangeModal` tenia el mismo agujero**: sin snapshot abria con el selector de gates y
   NINGUN campo abajo. Arreglado en la raiz -> ademas revive el boton "Cambiar gate" del
   historial, que estaba muerto justo en los turnos donde todavia se podia cambiar algo.

Decisiones de criterio: compara por CALIBRE y no por calibre x calidad (`calibreDistribution`
guarda solo el calibre); NO filtra por lote (`lotsInShift` esta vacio en 36 de 37 turnos reales)
y por eso DICE que turnos y fechas miro; nunca deja un calibre en 0 gates aunque el ratio lo
justifique; deshace un movimiento que satura al donante; excluye el propio turno del historico.

- Archivos: `services/grader/graderCalibreHistory.ts` (nuevo, puro),
  `components/grader/GatesHistoryHintCard.tsx` (nuevo),
  `components/grader/modals/GateChangeModal.tsx`, `pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificacion: 22 tests nuevos sobre los NUMEROS REALES de produccion (6 turnos de Chonchi + la
  plantilla vigente), no datos inventados. En prod (`buildSha` = `fd67a19`) la tarjeta acusa el
  8-10 lb y el modal abre pre-rellenado. En Yal no aparece. No se registro ningun cambio de gate:
  eso es decision de Orel. Claro, oscuro y 375px. tsc 0, eslint 0 nuevos, 1.147 tests OK.
- Estado: HECHO (#473 en `8cb1427`, #474 en `fd67a19`).
- Sigue: los otros dos caminos de la propuesta, sin construir — (B) corte de control a mitad de
  turno con Excel parcial (la app YA entiende cobertura parcial), y (C) aviso por Telegram al
  detectar saturacion, que depende de B. Propuesta visual completa:
  https://claude.ai/code/artifact/046435ab-b88f-4f0c-9c8a-eef62b0302d9

## 2026-08-11 - claude - Resumen a ancho completo y Calidad+Timeline juntas (#471)

Orel, mirando el resultado de #469: *"el resumen deberia ocupar toda la pagina verdad no estar
recortado"* y *"calidad y timeline deberian estar en la misma pestaña para al seleccionar la
calidad las muestre en el timeline"*. Las dos observaciones eran correctas — dos regresiones
que introdujo #467/#469.

- **El Resumen se veia recortado**: al mudar "¿Que hacer?" a su pestaña quedo vivo el grid de 3
  columnas. El contenido seguia en `col-span-2` y la tercera columna quedaba VACIA → media
  pantalla de aire al lado de la tarjeta. Ahora es una sola columna a ancho completo (medido:
  1189 de 1189 px utiles).
- **Calidad y Timeline vuelven a ser UNA pestaña**. ⚠ La leccion, para no repetirla: `selectedCauses`
  es estado COMPARTIDO entre `P0CausesPanel` y `ShiftTimelineView`. Separar dos bloques que
  comparten estado no los separa: mata la interaccion, porque el efecto queda en una pestaña
  que no estas mirando. **Antes de mover un bloque a otra pestaña, revisar que estado comparte
  con lo que deja atras.** Queda comentado en el JSX de la vista `calidad`.
- **Efecto lateral que casi se escapa**: `handleExportPdf` saltaba a `setActiveView('timeline')`
  para montar el grafico. Con la pestaña borrada el PDF habria salido SIN grafico y en silencio
  (el codigo ya tiene un `logger.warn` para ese caso, no un error). Ahora salta a `calidad`.
- Archivos: `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx` (unico).
- Verificacion: turno `2026-08-03__Turno 1` con Excel del Grader, local contra Firestore de prod.
  Pestañas = `Resumen · Calidad · Gates · Linea · ¿Que hacer?`. Al marcar "Fuera de limites" el
  timeline muestra `Fuera de limites 347 · 347 pzas con peso` con el scatter pintado. Claro,
  oscuro y 375px. tsc 0, 1.125 tests OK. Desplegado y confirmado: `buildSha` = `70374cd`.
- Estado: HECHO.
- Sigue: dos preguntas de Orel sin construir todavia — (a) setear gates: el editor YA existe
  (`ShiftConfigPanel` → `GateChangeModal`, con calidad/calibre/conservacion/producto), pero solo
  aparece si `configSnapshots.length > 0` y con el turno `live`; el hueco real es el turno SIN
  config, que es justo cuando querrias setearla. (b) separar "Linea": son 4 tarjetas y una de
  ellas (`SensorStopsCausePanel`, las imputaciones) es CARGA DE DATOS mezclada con analisis.
- Pendiente menor visto de paso (no tocado, fuera de alcance): a 375px en `P0CausesPanel` el
  chip `paraguas · 6 sub` se superpone con `89.7% del P0`.

## 2026-08-11 - claude - Pestaña "Calidad" y herramientas fuera del Resumen (#469)

Orel: *"si datos grader deberiamos tambien tener en las pestañas lo ordenado o no? como la linea"*.

- **El diagnostico**: "Linea" se lee ordenada porque contiene UNA sola cosa (todo Shoplogix junto).
  El Resumen mezclaba TRES: el titular del turno, el analisis del Grader (P0, calibres, calidad,
  lotes) y herramientas (compartir, QR, IA).
- **Regla del modulo, ya explicita en el codigo**: una pestaña = una pregunta.
    resumen ¿como fue? · calidad ¿por que se rechazo? · timeline ¿cuando paso? ·
    gates ¿como estaban las compuertas? · linea ¿como estuvieron las maquinas? · accion ¿que hago?
- **Calidad** es el espejo de Linea: se lleva `P0CausesPanel`, `ShiftBreakdownsCard` y el analisis
  IA. Sin Excel queda deshabilitada con su motivo, como Timeline y Gates.
- **Las herramientas salen de las pestañas**: compartir turno y link/QR del monitor se abren con un
  boton en la barra superior (junto a exportar). ⚠ Los paneles siguen renderizandose abajo —estan
  en ramas distintas del JSX y unificarlos en un modal movia ~150 lineas—, asi que el toggle hace
  **scrollIntoView**: un panel que aparece fuera de la vista se lee como un boton que no responde
  (lo mismo que paso en #467 con las pestañas debajo del contenido).
- El aviso de config desalineada se QUEDA en el Resumen: afecta a como leer todo el turno.
- Verificacion: en el navegador con datos de prod — 6 pestañas; el Resumen ya no trae
  P0/compartir/monitor/IA; Calidad muestra las causas; el boton despliega las herramientas desde
  cualquier pestaña. 1.125 tests, tsc limpio. Bundle `94f045e`.
- Estado: HECHO — mergeado y desplegado.

---

## 2026-08-11 - claude - Pestañas siempre presentes + "¿Que hacer?" como pestaña (#467)

Orel: *"deberiamos establecer un estandar"* y *"veamos como ocultar o agregarlo como una pestaña
mas el que hacer"*. Cierra el estandar que empezo la tarjeta de #465.

- ⚠⚠ **Las pestañas vivian DENTRO de `{summary && shiftWindow && (...)}`**: un turno sin Excel no
  mostraba ninguna. Dos navegaciones distintas para la misma pantalla, y sin forma de saber que
  esas vistas existen. **Tercera aparicion del mismo patron hoy** (#438 la tarjeta invisible en
  Filete, #455 la navegacion): envolver estructura en el gate de un dato la hace desaparecer.
- Ahora la barra va fuera del gate y ANTES del contenido. Las vistas que necesitan Excel salen
  DESHABILITADAS con el motivo (`title`): Timeline/Gates "Necesita el Excel del Grader"; ¿Que
  hacer? "Las acciones se calculan con el Excel". Resumen y Linea quedan usables — sin Excel las
  dos muestran el estado de las maquinas, asi que en vez de dejar Linea muerta se la deja abrir.
- **"¿Que hacer?" pasa de tercera columna permanente a pestaña propia**: gana ancho para leerse y
  el Resumen recupera el ancho completo. El tab lleva el CONTADOR de acciones para que no se
  pierda de vista (sin eso, mover el panel a una pestaña lo volveria invisible).
- ⚠ Los modales del panel se quedan montados en el Resumen: `handleActionTrigger` puede
  dispararlos desde cualquier vista.
- ⚠ Al mover el bloque quedo DESPUES del contenido en el JSX y las pestañas aparecian debajo de la
  tarjeta. Se veia solo mirando: el DOM las tenia y el test de existencia pasaba igual.
- Verificacion: en pantalla con datos de prod — con Excel 5 pestañas y "¿Que hacer? 5"; sin Excel
  la misma barra con 3 en gris. 1.125 tests, tsc limpio. Bundle `9139cdf`, confirmado en prod.
- Estado: HECHO — mergeado y desplegado.

---

## 2026-08-11 - claude - La tarjeta de turno se agrupa por PREGUNTA, no por fuente (#465)

Orel: *"el de grader esta todo como desordenado, no se como explicarlo"*. Rediseño elegido por el
en un mockup de 3 opciones (opcion B, "Dos preguntas"); la directora-creativa lo produjo con los
dos estados lado a lado y medicion de contraste.

- **El diagnostico**: la tarjeta agrupaba por PROCEDENCIA (columnas "Shoplogix" y "Grader") — 12
  numeros ordenados por algo que no sirve para decidir. Y los dos estados eran disenos distintos,
  asi que cargar el Excel se sentia cambiar de pantalla.
- Ahora: izquierda *cuanto salio*, derecha *donde estuvo la limitacion*. La mitad derecha es el
  MISMO componente en ambos estados (`ShiftMachinesHalf`) — es lo que da el parentesco.
- Jerarquia: el numero grande pasa a ser el del turno (13.366 pz; antes el `text-5xl` se lo llevaba
  el P0 2,3%). El uptime sube al nivel de la produccion: es el argumento de Mantencion. La
  composicion Baader vs linea manual sube del pie (explica por que piezas ≠ ciclos).
- Fuera: fondo tintado de toda la tarjeta y borde de 2 px de color (el estado va en el chip),
  encabezados por fuente (al pie como procedencia), ciclos/hr suelto y "maq. con datos".
- ⚠ Los tokens `--ink-*` YA EXISTIAN (derivados contra el peor fondo, con variante oscura). Empece
  a crear `--ok-ink/--warn-ink/--bad-ink` y lo revertí al encontrarlos: habria sido la misma regla
  en dos lugares (el error de #453). **Buscar el token antes de crearlo.**
- ⚠ La barra de uptime usa el color del UPTIME, no el del veredicto combinado: con 82% de uptime y
  ritmo bajo salia ambar con el numero verde al lado. Se detecto MIRANDO la pantalla.
- Verificacion: en pantalla con datos de prod — oscuro, claro y 375 px, en los dos estados (11-ago
  con Grader / 10-ago solo Shoplogix). 1.125 tests, tsc y eslint limpios. Bundle `31547dc`.
- Estado: HECHO — mergeado y desplegado.
- Sigue: **estandarizar las pestañas** (Resumen/Timeline/Gates/Linea aparecen y desaparecen segun
  haya Excel; deberian estar SIEMPRE, con las que dependen del Excel deshabilitadas y el motivo).
  Es la otra mitad del "estandar" que pidio Orel.

---

## 2026-08-11 - claude - El chip decia "Turno dia" para un turno llamado "Turno 2" (#463)

Orel: *"el mismo turno se ve de dos formas... el de grader esta todo como desordenado"*.

- **Cadena del bug** (el "desorden" tenia una causa de datos, no solo estetica):
  1. El chip de turno vigente cae a un FALLBACK por schedule cuando ningun doc de Shoplogix
     contiene la hora actual.
  2. Ese fallback filtraba por una lista fija elegida con `isClassificationPlant` — que mide OTRA
     cosa — y para Chonchi daba `['Turno dia','Turno noche']`: nombres que la planta DEJO DE EMITIR
     en 2026-05 y que sobreviven en el schedule solo como ventanas anchas para Excels viejos.
  3. "Turno dia" es 07:00-19:00 → a las 16:00, con el Turno 2 real ya cerrado (07:15-15:00), el chip
     anunciaba "En curso · Turno dia".
  4. Al tocarlo iba a `2026-08-11__Turno dia`: la MISMA jornada sin el Excel (guardado bajo
     "Turno 2"), con el cartel "Solo Shoplogix · Sin Excel del Grader" ofreciendo cargar uno ya
     cargado.
- Fix: `bySpecificity()` — el fallback recorre el schedule ordenado por ventana MAS CORTA primero.
  A las 16:00 gana "Turno 2" (8h15) sobre "Turno dia" (12h). Sin listas de nombres que mantener.
- ⚠⚠ **Tercera vez en el dia que `isClassificationPlant` decide algo que no le corresponde** (#455
  la navegacion, #463 el nombre del turno). Si aparece en un `if`, sospechar: solo significa "esta
  linea clasifica por calibre/calidad".
- Verificacion: 1.125 tests (4 nuevos con el schedule real de Chonchi, comparando el antes/despues
  a las 16:00) + navegador. Bundle `71d48e1`.
- Estado: HECHO — mergeado y desplegado.
- Sigue: **rediseño de la tarjeta de turno**. Orel eligio la opcion B del mockup ("Dos preguntas":
  izquierda cuanto salio, derecha donde estuvo la limitacion; la mitad derecha IGUAL con o sin
  Grader). Mockup: `scratchpad/tarjeta-resumen-turno.html` + artifact. Incluye estandarizar las
  pestañas (que existan siempre, deshabilitadas con el motivo cuando falta el Excel) y la
  correccion de contraste de los semanticos en tema claro (miden 2,7-3,1:1 como texto).

---

## 2026-08-11 - claude - La linea de "No aplicable" estaba en la tarjeta equivocada (#461)

Orel abrio el turno del 11-ago y la linea que agregue en #459 NO estaba.

- Causa: la puse en `GraderTurnoDetailView` ("Piezas totales"), pero la vista de turno CON Grader
  pinta el `HeroScorecard` — el bloque "13.366 piezas · Marelec". Dos tarjetas distintas para el
  mismo dato, y elegi la que esa vista no muestra.
- ⚠⚠ La leccion, otra vez la misma: **di por bueno #459 sin mirar la pantalla**. tsc, 1.121 tests y
  el deploy en verde, y el cambio publicado donde nadie lo veia. Es el mismo patron de #438 (la
  tarjeta invisible en Filete). Cuando el entregable es algo que se VE, no esta hecho hasta verlo.
- Ahora sale bajo el total: "+ 163 no aplicables · Matrix: 13.529", con el detalle en el tooltip.
- Verificado EN PRODUCCION con screenshot (bundle `7773690`, con la sesion de Orel en el navegador).
- Estado: HECHO — mergeado y desplegado.

---

## 2026-08-11 - claude - Los registros "No aplicable" del Grader (#459)

Orel cargo el Excel del 11-ago y no le cuadraba: el Matrix decia *"se han recuperado 13.529
registros"* y la app mostraba 13.366 piezas.

- **Diagnostico**: las 163 de diferencia son filas con `Cantidad de piezas` en 0 y `Peso de las
  piezas` en "No aplicable" — eventos que el grader registra SIN pieza detras. El parser las
  descartaba en silencio (`if (pieces <= 0) continue`), asi que la diferencia parecia produccion
  perdida. **El letrero del Matrix cuenta REGISTROS; la app cuenta PIEZAS.**
    13.529 registros = 13.366 piezas + 163 no aplicables
- Hecho: se separan en `notApplicableRecords` **con su timestamp** (no entran a `pieceRecords`:
  valen 0 piezas y los arrastrarian a cada calculo), se **reparten por turno** con la misma regla
  que las piezas, el summary guarda el conteo y la tarjeta "Piezas totales" lo muestra con el
  numero del Matrix al lado. El wizard avisa al cargar.
- Verificacion: 1.121 tests (7 nuevos — 4 del parser con la cabecera REAL de Chonchi, incluido uno
  que comprueba que piezas + no aplicables reconstruye el numero del letrero). Bundle `ac1b96e`.
  El doc del turno ya cargado se completo a mano con los 163 para que cuadre sin recargar el Excel.
- ⚠ Como se consiguio el dato: los Excel llegaron por correo y **el conector M365 trunca a 200.000
  caracteres** (del pieza-a-pieza solo llego el 17,6%). Sirvio igual porque el patron aparece en
  cualquier tramo, pero para contar el total hay que bajar el archivo. Un SUBAGENTE hizo esa lectura
  para no gastar el contexto principal — patron a repetir con adjuntos grandes.
- ⚠ Cabecera real del pieza-a-pieza de Chonchi (distinta del P0):
  `Fecha | Hora | Peso de las piezas | Cantidad de piezas | Lote | Gate | Calidad | Conservacion |
  Calibre | Producto | Turno`. El parser mapea por NOMBRE, no por posicion, asi que no le afecta.
- Estado: HECHO — mergeado y desplegado.
- Sigue: **Orel confirma en pantalla** que la tarjeta muestra "+163 no aplicables (Matrix: 13.529)";
  no se pudo ver en el navegador de pruebas.

---

## 2026-08-11 - claude - Fuera el bucket Unscheduled del carrusel de turnos (#457)

Pedido de Orel tras ver que en Filete el "turno anterior" que ofrecian las flechas era el bucket.

- `Unscheduled` NO es un turno: es donde Shoplogix deja lo que cae fuera de las ventanas
  configuradas. Desde #451/#453 esa produccion se atribuye al turno CONTIGUO, asi que ofrecerlo como
  destino llevaba a una pantalla con piezas que YA estan contadas en el turno de al lado.
- Se conserva UNA excepcion: si es el que se esta mirando (si no, la vista abierta no se encontraria
  en la cadena y las flechas saldrian de posicion).
- Lo que quede sin atribuir (un dia entero sin turnos configurados) se sigue viendo en la MATRIZ,
  que es donde el bloque suelto SIRVE: es la señal de que falta configurar ese turno en Shoplogix.
- Verificacion (local, datos de prod): filete 10-ago Anterior pasa de "mismo dia · Unscheduled" a
  "2026-08-08 · Turno Dia" (el 09 es domingo sin proceso); eviscerado sin cambios. Bundle `1b77b44`.
- ⚠ Leer los botones por su `title`, no por `innerText`: el texto va con `hidden md:inline` y en
  pantalla angosta el boton no tiene texto.
- Estado: HECHO — mergeado y desplegado.

---

## 2026-08-11 - claude - Anterior/Siguiente no funcionaban en Filete ni Eviscerado (#455)

Orel: *"los botones de anterior y siguiente (turno) no funcionan en filete ni eviscerado; debo poder
cambiar de turno tanto en el de monitoreo como en el analisis de turno"*.

- **Causa en Analisis de Turno** (verificada leyendo `disabled`/`title`, sin depender de clics): los
  dos botones estaban DESHABILITADOS. `setAdjacentShifts(idx === -1 ? {prev:null,next:null} : ...)`
  anulaba la navegacion entera si el turno abierto no figuraba en la cadena. Y no figuraba:
  · EVISCERADO — la cadena solo consultaba Shoplogix con `isClassificationPlant === false`, que mide
    OTRA cosa (si la linea clasifica por calibre/calidad). Eviscerado SI clasifica → navegaba solo
    entre dias con Excel del Grader, y los 5 Excel que hay ni tienen `plantLineId`. Cadena vacia.
    Ahora usa `shoplogixEnabled`, que es justo "esta linea tiene datos de Shoplogix".
  · FILETE — basta que la etiqueta de la URL no calce exacto con la de Shoplogix ("Turno dia" del
    Grader vs "Turno Dia"). Ahora, si el turno abierto no esta en la cadena, **se lo INYECTA** en su
    lugar cronologico: no ubicarse a uno mismo no es motivo para encerrar al usuario en un turno.
- **Monitor publico**: el turno mirado pasa de `useState`+refs a la URL (`?turno=<shiftDocId>`) y el
  indice se DERIVA. Desaparece el efecto que restauraba la posicion y peleaba con la navegacion; la
  eleccion sobrevive a recargas y el turno queda **compartible**.
- Verificado (local, datos de prod): filete Anterior "mismo dia · Unscheduled" / Siguiente
  "2026-08-11 · Turno Dia"; eviscerado Anterior "mismo dia · Turno 2" / Siguiente "2026-08-11 ·
  Turno 2" — antes los cuatro deshabilitados. Monitor con `?turno=2026-08-10_Turno Dia` abre ese
  turno (4.915 pz). Bundle publicado `b1cbea4`.
- ⚠⚠ **GOTCHA DE VERIFICACION que costo una hora**: la pestaña de prueba corre en SEGUNDO PLANO y
  React difiere el flush de los updates. Sintoma engañoso: la URL cambia, `console.log` del handler
  aparece, y la vista NO se actualiza — parece un bug de la app y es del entorno. Se detecta porque
  al RECARGAR con el estado en la URL sí se ve. Verificar por `disabled`/`title`/atributos (que se
  leen del DOM ya renderizado) en vez de por el efecto de un clic.
- Estado: HECHO — mergeado y desplegado.
- Sigue: **Orel confirma en uso real** el sintoma "toco el boton y no pasa nada" del monitor, que no
  se pudo reproducir de forma fiable. Menor: en Filete el turno "anterior" que ofrece es el bucket
  `Unscheduled`; ahora que su produccion se atribuye al turno, quiza convenga sacarlo del carrusel.

---

## 2026-08-11 - claude - La matriz alineada con la regla de continuidad (#453)

Orel: *"alinea la matriz tambien con la regla nueva"*. Con esto las CUATRO superficies (monitor
publico, brief de Telegram, vista de turno y matriz) deciden igual de quien es un bloque fuera de
horario.

- Hecho: la matriz atribuye por BLOQUE y reusa `esColaDeEsteTurno`. `MAX_ADJACENCY_MIN` (Infinity)
  ELIMINADO — la distancia la fija `MAX_CONTINUIDAD_MS`, una sola constante compartida. Los
  candidatos pasan a ser los turnos del mismo dia Y los ADYACENTES (la continuidad cruza medianoche:
  las 23:30 son el arranque del turno de las 00:00, no la cola de uno que cerro a las 15:00); con eso
  sobra la rama especial de "dia sin turnos".
- ⚠⚠ Dos correcciones al umbral que salieron de tests reales que iban a romperse:
  1. **ENCADENAR los tramos antes de decidir**: la produccion real viene con huecos. Yal 10-jul son
     2.296 pz a las 14:05, 14:40 y 15:00 antes de un turno de las 15:15; tramo a tramo, la primera
     quedaba a 65 min y se perdia entera.
  2. **60 -> 90 min**: con 1 h ese mismo bloque quedaba fuera POR CINCO MINUTOS. Lo que la regla debe
     excluir esta a otra escala (14 h el caso Chonchi, 10 h el 02-ago). Se cambio en los DOS lados.
- ⚠ Cambio de comportamiento: un dia SIN turnos configurados ya no se cuelga del turno de otro dia
  (Chonchi 02-ago, 293 cic a 10 h) — el bloque queda VISIBLE. Revierte en parte la decision del
  03-ago pero solo para lo de FUERA: lo que cae DENTRO de una ventana se sigue atribuyendo.
- ⚠ El test del caso Yal 03-ago fijaba un escenario RECORTADO (un solo turno 00:06-07:18). Contra
  Firestore ese dia hubo 3 turnos y la produccion de 08:00-12:12 cae DENTRO del Turno 1: no se
  afecta. Se reescribio el test con los turnos reales.
- Verificacion: 219 tests functions + 23 matriz, tsc/eslint limpios. **Impacto medido sobre agosto
  completo contra Firestore: 0 piezas dejan de atribuirse** (chonchi 4.258, yal 3.395, filete 2.661
  siguen igual) — no mueve totales, corrige a QUIEN se asignan. Bundle publicado `dc288c3`.
- Estado: HECHO — mergeado y desplegado.
- Sigue: nada de esta feature. Queda de la sesion anterior ver un cierre de turno REAL de Filete
  (que el brief espere la cola y anuncie el total completo).

---

## 2026-08-11 - claude - La cola fuera de horario se la llevaba cualquier turno del dia (#451)

Orel lo vio en Eviscerado: *"para el turno noche de ayer conto unos minutos de las 7 y tanto am y
despues de las 9 y tanto de la noche... los mostro en el grafico tambien y conto piezas demas"*.

- Causa: para decidir si un tramo del `Unscheduled` era la cola del turno bastaba con que NO cayera
  dentro de la ventana de NINGUN turno. Como esos bloques no caen en ninguna, **cualquier turno del
  dia se los quedaba**. El turno noche (21:15→05:00) sumaba 1.317 pz ajenas —1.048 de las 07:15,
  cola del turno que cerro a esa hora, y 269 de las 17:00— y mostraba **13.487 en vez de 12.170**.
  La barra de las 7 AM en el grafico venia de `operacionReal`, que extiende la ventana con esos
  rangos y corre haya Grader o no (por eso se veia en Eviscerado, que no usa el scorecard).
- Regla nueva de Orel: la cola cuenta **solo si es continua al turno**, no piezas de horas despues.
  CONTINUIDAD (≤1 h) + CERCANIA (ningun otro turno mas cerca). Un tramo va a UN turno, nunca a dos
  ni a ninguno: el empate se desempata a favor del que ya CERRO en vez de descartarse.
- ⚠ La distancia se mide del **BORDE del tramo**, no de cada intervalo suelto: un bloque 07:00→07:30
  antes de un turno de las 08:00 esta a 30 min, no a 60. Medirlo mal descartaba arranques
  anticipados legitimos — lo destapo el test que los fija (habria sido una regresion silenciosa).
- Archivos: `functions/publicMonitor.js` (monitor + brief) y `apps/pwa/src/hooks/useShiftOutsidePieces.ts`
  (que ademas ni miraba los otros turnos) + `graderUnscheduledLoad.loadDayShiftWindows` (1 lectura).
- Verificacion: 219 tests functions + 23 front (7 nuevos). Contra Firestore REAL del 10-ago:
  noche 12.170+0, Turno 1 Lunes 9.543+689 (07:25-07:50), Turno 2 9.902+56 (17:10-17:20),
  Filete 4.410+505 (sin cambios). En pantalla (local, datos de prod): 12.170, rango 21:15–05:00,
  operacion real 21:30–04:50, sin rastro de las 7 AM.
- Estado: HECHO — mergeado (`d114da2`) y desplegado.
- Sigue: **decision de Orel** — la MATRIZ quedo con la regla vieja (`MAX_ADJACENCY_MIN = Infinity`,
  decision suya del 03-ago). Alinearla moveria solo 65 pz en todo agosto, pero choca con el caso
  Yal 03-ago de los 1.835 cic que el decidio atribuir. No se toco por eso.

---

## 2026-08-11 - claude - Avisos de turno de Filete por Telegram + el brief anunciaba menos piezas (#449)

Orel pregunto si se podian mandar los avisos por WhatsApp. Respuesta: se puede, pero el costo es
el TRAMITE con Meta (cuenta business verificada, numero dedicado que se quema, plantillas
pre-aprobadas, opt-in por persona, cobro por mensaje) — 1-2 semanas casi sin programar. Eligio
encender Telegram, que da lo mismo hoy y gratis.

**El hallazgo**: encender el canal NO bastaba. `componerBriefFinTurno` ya existia y estaba
configurado para Filete (umbral 200 pz), pero:

- se disparaba con el horario oficial (15:30 + 10 min) **con la linea todavia produciendo**;
- sumaba **solo el doc del turno**. Evidencia dura: el brief de hoy ya salio por push a las 15:40
  anunciando **4.338 piezas** cuando la jornada termino en **4.915** — 12% menos.

- Hecho:
  - `sumarColaAMaquinas` (publicMonitor.js): suma la cola fuera de horario a cada maquina y
    devuelve el desglose. Reusa `loadOutsideShiftProduction` con su dedupe por (maquina, timestamp).
  - El brief **espera a que la linea deje de producir**; tope de 2 h por si el sensor queda colgado.
  - Mensaje: desglose "4.410 dentro del horario + 505 despues (15:40-16:30)" y horario hasta la
    ultima pieza real (decia "hasta 15:30" con produccion hasta las 16:30).
  - ⚠ `endBriefSnapshot` guarda el total SIN cola: `checkShiftReconciliation` lo compara contra el
    doc padre y habria avisado una "correccion Shoplogix" falsa de -505 **cada dia**.
  - ⚠ `resumenParos` ignora states de duracion CERO y repetidos: eran **27 de 85** "micro" — Telegram
    decia 85 y el monitor 58 **del mismo turno**. Misma clase de bug que el listado vs el grafico
    de #447: dos superficies contando distinto el mismo dato.
  - Config `notificationConfig/filete`: telegram ON (dest `bot` = DM del admin, igual que chonchi y
    yal), inicio + fin ON, **paros y primera pieza OFF** (Filete pidio el avance, no el ruido).
- Archivos: `functions/publicMonitor.js`, `functions/shoplogix/turnoBrief.js`, `functions/index.js`,
  + 2 archivos de test.
- Verificacion: 220 tests en verde (211 + 9 nuevos). **Dry-run con los datos reales de Filete del
  10-ago** (sin enviar nada): 4.915 pz, horario 07:45→16:30, 58 micro — coincide con el monitor
  publico. Sin cola el mensaje queda byte a byte igual (Chonchi/Yal no cambian, con test).
  Funcion desplegada y ACTIVE (revision 00044, updateTime 02:34).
- Estado: HECHO — mergeado (`da650be`) y desplegado; canal encendido.
- Sigue: **falta ver un turno real** — el proximo cierre de Filete es la primera prueba de fuego
  (que el brief espere la cola y anuncie el total completo). Si Orel quiere que llegue al GRUPO y
  no a su DM, es cambiar `telegramDest` a `grupo` desde el panel admin.

---

## 2026-08-10 - claude - Grafico del monitor: ubicar las detenciones y marcar el mejor ritmo (#447)

Orel: *"poder seleccionar del listado el tipo de detencion y q las ubique en el grafico"* +
*"deja el mejor ritmo real 83"*.

- Hecho: al tocar una causa del listado, el grafico marca donde ocurrio cada parada de esa causa.
  Ademas eje de horas (4 marcas) y linea de referencia punteada con el mejor tramo REAL del turno
  (83 pz), que es contra lo que se compara cada barra.
- **Los dos bugs que solo aparecieron al MIRAR** (todo verde antes):
  1. El listado decia "85x" y el grafico pintaba 55 bandas. Venian de DOS calculos distintos
     (estados duplicados + estados de duracion cero). Ahora el backend publica `stopReasons` +
     `stopEvents` y listado y grafico salen de la MISMA fuente deduplicada.
  2. Las bandas quedaban corridas a la derecha y 3 caian fuera del area: se ubicaban por
     aritmetica de tiempo, pero **la serie NO es continua** (solo trae los tramos que el sensor
     registro). Se corrigio buscando el INDICE del tramo en la serie.
- Archivos: `functions/publicMonitor.js`, `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`. Payload +3 KB (tope 300 eventos).
- Verificacion: 202 tests functions + 1107 PWA, tsc 0, eslint 0. **En PRODUCCION con clic real de
  mouse** sobre el turno de Filete del 10-ago: COLACION 4x -> 4 bandas en 13:40/13:55/14:10/14:35
  (escalonadas por grupo), REUNION INICIO TURNO 1x -> 1 banda en x=1,1 de 100 (al comienzo),
  Micro Detencion 58x -> 58 bandas, y la "x" del chip limpia el filtro.
- Gotcha de tooling: en el tab de claude-in-chrome el `.click()` programatico NO tomaba y el
  screenshot fallaba por `document_idle` perpetuo (la suscripcion de Firestore deja la pagina
  "cargando"). Se verifico con el navegador interno + clic real por `ref`.
- Estado: HECHO — mergeado (`3c2b8b0`) y desplegado.
- Sigue: sin pendientes de esta feature.

---

## 2026-08-10 - claude - Apodos de aparatos: resolver con lo que sabe el usuario, no con huellas

Orel: *"los aparatos tipo celular han sido los mismos, solo yo lo he probado... debemos poder
identificar si es el mismo o va a contar uno nuevo cada vez"*.

**El diagnostico primero**: los 5 "aparatos" que veia eran en su mayoria MIS pings de prueba con
viewerIds inventados. Borrados. El mecanismo si distingue: el mismo navegador cuenta como UNO
porque el id vive en su localStorage.

**El limite real que Orel intuyo bien**: el mismo celular figura dos veces si el link se abre con
navegadores distintos — y el caso frecuente es abrirlo desde WhatsApp/Telegram, que usan su webview
propio con storage aparte. Resolverlo por medios tecnicos exigiria **fingerprinting** (UA +
resolucion + huso + idioma), que es exactamente lo que esta pantalla prometio NO hacer.

**La salida sin cruzar esa linea**: usar lo que el usuario SI sabe. Se le puede poner nombre a cada
aparato ("celular de Control") y **dos filas con el mismo nombre se fusionan** — se suman sus
aperturas y su tiempo, y el contador de arriba pasa a contar aparatos fusionados, no navegadores
sueltos. La fila avisa "(2 navegadores)" para que la fusion sea visible y no magia.

Los apodos viven en **`publicShiftMonitorLabels/{token}`**, coleccion aparte con `write: if
isSupervisor()`. NUNCA se copian al doc publico: son notas internas y quien abre el link no tiene
por que ver como lo llamaron del otro lado.

⚠ **Bug propio detectado probando**: el guardado del nombre fallaba y el editor se cerraba igual, o
sea que el usuario creia haber guardado. Ahora el editor se queda abierto, el borde se pone rojo y
dice "no se pudo guardar". (El fallo era la regla sin desplegar, pero el silencio era mio.)

De paso: la etiqueta "nuevo" solo aparece si el link YA lleva mas de un dia en uso — recien creado,
todos los aparatos son nuevos por definicion y la etiqueta no distingue nada. Y `fmtDuracion` dice
"<1 min" en vez de "0 min".

- Archivos: `firestore.rules`, `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`,
  `apps/pwa/src/components/grader/MonitorUsagePanel.tsx`,
  `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificacion: 1.107 tests del PWA en verde; tsc y eslint limpios. La lista se vio con datos reales
  distinguiendo un aparato con 2 aperturas de otros con 1. **El guardado del nombre NO se pudo
  probar todavia**: la regla se despliega con el merge.
- Estado: HECHO (mergeado)
- Sigue: probar el guardado del apodo end-to-end una vez desplegada la regla.

## 2026-08-10 - claude - La vista de turno tambien cuenta la cola + umbral unificado + UX

Orel revisando la app en el celular. Cinco cosas:

1. **El scorecard seguia mostrando 4.410.** El monitor y la matriz ya contaban la produccion de
   fuera del horario, pero la vista de turno no: era la tercera superficie con el mismo dato y un
   numero distinto. Nuevo hook `useShiftOutsidePieces` con el MISMO umbral y el MISMO dedupe →
   ahora **4.915** con el desglose "4.410 en el turno + 505 fuera del horario (15:40–16:30)".
   Cuesta 1 lectura: los intervals del turno ya estan en el snapshot cargado.
2. **El horario decia 15:30** cuando la linea siguio hasta las 16:30. Sin Grader el "Produjo" iba
   vacio y solo quedaba el programado; ahora cae a la ventana REAL del sensor (cola incluida):
   *Programado 07:45–15:30 · Produjo 07:55–16:30*.
3. **Umbral unificado en la matriz.** ⚠ Al aplicarlo tal cual, dos tests reales fallaron: castigaba
   ciclos sueltos DENTRO del horario del turno, que son del turno sin discusion. El umbral solo
   aplica FUERA de las ventanas. Y hubo que **actualizar un test que fijaba la decision anterior**
   ("ningun ciclo sin turno", 03-ago): el caso Yal pasa de 1.836 a 1.835 cic porque 1 ciclo suelto
   a las 09:30 es ruido. Queda escrito en el test por que cambio.
4. **Boton "Abrir"** junto a Copiar/Revocar: se podia compartir el monitor pero no entrar a mirarlo.
5. **Detalle por aparato en la telemetria**: "5 aperturas · 5 aparatos" no distinguia *una persona
   que abrio 5 veces* de *5 personas que abrieron una vez*, que es justo lo que hay que saber. Ahora
   lista los 5 aparatos mas recientes con sus aperturas, su tiempo y cuando fue la ultima.

- Archivos: `apps/pwa/src/hooks/useShiftOutsidePieces.ts` (nuevo),
  `apps/pwa/src/components/grader/ShoplogixOnlyScorecard.tsx`,
  `apps/pwa/src/components/grader/MonitorUsagePanel.tsx`,
  `apps/pwa/src/components/grader/LossCascadeCard.tsx`,
  `apps/pwa/src/services/grader/graderUnscheduledAttribution.ts`,
  `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx` y su test.
- Verificacion: 1.107 tests del PWA y 202 de functions en verde; tsc y eslint limpios. En el
  navegador con sesion real: hero 4.915, desglose correcto, "Produjo 07:55–16:30", boton Abrir.
- Estado: HECHO (mergeado)
- ⚠ **SIN VERIFICAR**: el arreglo de los textos que se salian por el borde en el celular (filas de
  "Piezas perdidas por causal", que llevaban 6 elementos `shrink-0` sin poder envolver). El fix es
  `flex-wrap` + anchos fijos solo en desktop, pero **no se pudo mirar en un viewport movil real**:
  `resize_window` no cambia el viewport de la pestaña del Chrome del usuario, y el navegador de la
  herramienta —que si emula movil— no tiene su sesion. Pedido spot-check a Orel.

## 2026-08-10 - claude - El monitor publico pasa a ser theme-aware (claro/oscuro)

Pedido de Orel. La pantalla nacio dark-only por decision explicita ("un tablero de planta se mira
mejor asi") pero se abre tambien de dia y en oficina. Ahora usa los tokens de la app y tiene su
propio boton sol/luna; el tema se guarda en el MISMO `app-theme` que el resto, asi que quien tenga
la PWA en claro abre el link en claro.

57 hardcodes convertidos siguiendo el playbook `/tema-claro-oscuro`: `bg-gray-950`→`bg-background`,
`bg-white/[0.04]`→`bg-card`, `border-white/10`→`border-border`, la escala de `text-white/NN` a
`text-foreground` / `text-muted-foreground`, y los acentos con el patron `-700/-800 dark:-300/-400`
(un -300 sobre fondo claro queda lavado). Los tintes de estado subieron de `/10` a `/20` (patron C:
en claro un /10 colapsa contra la superficie).

⚠ **Dos cosas que solo aparecieron MIRANDO la pantalla en claro**:

1. **El "% produciendo" se habia hundido de 72% a 58%** — y no era del tema. Al rescatar la cola de
   despues del cierre entraban tambien los states `Planned Downtime`, que es el relleno de las horas
   en que la planta NO estaba operando (la memoria del proyecto ya decia que se EXCLUYE del
   denominador). Ademas encabezaba el ranking de detenciones: el primer lugar era "no estabamos
   trabajando". Excluido de las dos partes → vuelve a **76,5%**.
2. **El aviso de linea detenida desaparecia**: `bg-red-500/15` con borde `/25` sobre superficie
   clara no se ve. Borde a `/40` en claro, oscuro intacto.

**Contraste medido, no mirado** (regla 4d del playbook). Primera medicion dio 2,48:1 y 1,94:1 —
falsos: el script no componia el alfa de los tintes. Con el alfa compuesto: chip "Detenida" 4,25:1,
**bajo el 4,5 de AA** → `-700`→`-800` y quedo en **5,46:1**. Resto en claro: numero grande 12,34,
KPI 5,17, secundario 7,18, chip ambar 4,78. En oscuro: 15,47 / 9,49 / 7,33 / 7,25 y fondo
`rgb(13,23,34)`, el de siempre.

- Archivos: `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`, `functions/publicMonitor.js`.
- Verificacion: 202 tests functions y 1.107 del PWA en verde; tsc y eslint limpios; build OK.
  Screenshot en CLARO y en OSCURO con datos reales, toggle probado en ambos sentidos, y el fondo
  oscuro verificado byte a byte contra el valor del playbook.
- Estado: HECHO (mergeado)

## 2026-08-10 - claude - La MATRIZ contaba dos veces las piezas del borde del turno

Mismo bug que se corrigio en el monitor (#434), ahora en la matriz de turnos, que es donde se mira
el mes completo. Shoplogix reporta algunos minutos en el doc del turno Y dentro de `Unscheduled`;
la atribucion los sumaba igual. Caso real 10-ago Filete: 15:30=47 y 15:35=65 identicos en los dos
docs → **112 piezas contadas dos veces**. La celda decia 5.033 y ahora dice **4.921**.

`attributeUnscheduledCycles` acepta ahora las claves `machineid|epochMs` que los turnos del dia YA
tienen contadas y descarta esos tramos (`duplicated` queda en el resultado, auditable). Las claves
las carga `loadCountedKeysForDate` **solo de los dias que tienen Unscheduled** — 1-3 docs por dia,
no los ~80 turnos del mes, respetando la nota de costo que ya tenia el modulo.

⚠ **Bug propio que costo una vuelta**: para armar la ruta del doc use `s.key.slice(11)`, pero la
key es `${dateKey}__${shiftId}` con DOS guiones bajos y el doc de Firestore lleva UNO. Resultado:
la ruta no existia, el `catch` devolvia un set vacio y el dedupe no hacia nada — con todo en verde.
Se detecto **mirando la matriz en el navegador**: seguia diciendo 5.033. Ahora usa `s.shiftId`.

**Diferencia intencional con el monitor**: la matriz marca 4.921 y el monitor 4.915. Son las 6
piezas de higiene de las 06:10. El monitor descarta tramos <20 piezas (decision de Orel de hoy); la
matriz atribuye todo (decision de Orel del 03-ago: *ningun ciclo queda sin turno*). Las dos reglas
conviven a proposito; si algun dia se quieren iguales, es el mismo umbral en los dos lados.

- Archivos: `apps/pwa/src/services/grader/graderUnscheduledAttribution.ts`,
  `apps/pwa/src/services/grader/graderUnscheduledLoad.ts`, `apps/pwa/src/hooks/useGraderShiftPeriod.ts`,
  `apps/pwa/src/services/grader/__tests__/graderUnscheduledAttribution.test.ts`.
- Verificacion: **1.107 tests del PWA** (3 nuevos, incluido uno que fija el comportamiento ANTERIOR
  para dejar el bug documentado) y 202 de functions en verde; tsc y eslint limpios. En el navegador
  con datos reales: la celda del 10-ago bajo de 5.033 a 4.921.
- Estado: HECHO (mergeado)

## 2026-08-10 - claude - Tres arreglos de la pantalla publica vistos por Orel

Los tres los detecto Orel mirando la pantalla, no los tests:

1. **El grafico mentia por recorte.** El eje decia "12:30–16:25" para un turno que arranco a las
   07:55: `SERIES_MAX_POINTS` estaba en 48 tramos (4 h) y cortaba la mañana entera. Subido a 192
   (16 h) — el turno del 10-ago pasa de 48 a **106 tramos** y el eje ahora dice 07:40–16:25. Un
   grafico que se come la mitad del turno no es un grafico incompleto: es uno que engaña.
2. **Chip "Sigue el turno vigente" fuera.** Redundante: el encabezado ya dice el turno y la barra de
   navegacion ya dice "Turno actual". El pie sigue explicando que el link no caduca con el turno,
   que es lo unico que no se deduce mirando.
3. **Navegacion en los dos sentidos.** Habia "Turno anterior" y "Volver al actual", pero no se podia
   avanzar de a uno. Ahora `‹ Anterior` / `Siguiente ›` (deshabilitados en los extremos) y el atajo
   "Ir al actual" aparece solo cuando hay mas de un turno que saltar.

- Archivos: `functions/publicMonitor.js`, `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`.
- Verificacion: 202 tests functions y 1.104 del PWA en verde; tsc y eslint limpios. En el navegador
  con datos reales: 106 barras, eje 07:40–16:25, "Siguiente" se habilita al retroceder y "Ir al
  actual" aparece recien a 2 turnos atras.
- Estado: HECHO (mergeado)
- Sigue: el mismo doble conteo del monitor existe en la MATRIZ (`graderUnscheduledAttribution`) —
  Orel pidio arreglarlo tambien; va en su propio PR porque toca una vista central.

## 2026-08-10 - claude - Telemetria anonima del monitor publico

Orel: *"¿se puede mostrar quienes usan el QR?"*. Identidad no —quien abre el link no tiene sesion,
no dio consentimiento y muchas veces ni trabaja en la empresa— pero el USO si se puede medir, y es
justo lo que permite defender la herramienta con datos: aperturas, aparatos distintos, tiempo
mirado, ultima vez, celular vs PC, distribucion por hora, aperturas por dia y cuantas vistas fueron
a turnos anteriores (mide si el deslizamiento sirve).

**Lo que NO se guarda, a proposito**: IP, geolocalizacion, user-agent crudo, nombres, correos. Lo
unico que distingue a un aparato de otro es un `viewerId` ALEATORIO que genera su propio navegador
y vive en su localStorage — no se deriva de nada del aparato ni de la persona, y borrar los datos
del navegador lo reinicia. Del user-agent solo se deriva "movil" u "escritorio". La pantalla
publica lo dice en el pie: *"Se cuentan las aperturas de forma anonima... No se registra quien la
abre"*.

**Donde viven los contadores**: coleccion APARTE, `publicShiftMonitorStats/{token}`, con
`read: if isNotAnonymous()` y `write: if false`. NO en el doc del monitor: ese es de lectura
publica, asi que ahi la telemetria quedaria expuesta a los propios visitantes y engordaria lo que
se descarga en cada refresco.

**Endpoint abierto, defensas explicitas** (`publicMonitorPing`): solo acepta tokens de monitores
VIGENTES, el `viewerId` se valida contra un formato fijo (`danilo@empresa.cl` NO entra), el tiempo
que suma un latido esta topeado, una apertura del mismo aparato no vuelve a contar antes de 10 min
(recargar la pestaña no son visitas), y el doc se poda a 60 aparatos y 14 dias. Un abusador con el
link solo puede inflar sus propios contadores: no lee nada ni toca los datos del turno.

Los latidos van cada 2 min y **solo con la pestaña visible** — el tiempo en segundo plano no es
tiempo mirado.

⚠ **Un test destapo un bug real**: `applyEvent` mutaba el objeto del dia del estado previo
(`{...s.byDay}` es copia superficial y el objeto del dia se modificaba in situ) — dentro de una
transaccion Firestore eso es exactamente la clase de cosa que produce numeros irreproducibles. El
test "no muta el estado que recibe" lo encontro antes de que llegara a produccion.

- Archivos: `functions/publicMonitorStats.js` (nuevo), `functions/index.js`,
  `functions/__tests__/publicMonitorStats.test.js` (nuevo), `firestore.rules`,
  `apps/pwa/src/components/grader/MonitorUsagePanel.tsx` (nuevo),
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`,
  `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificacion: **202 tests functions** (9 nuevos) y 1.104 del PWA en verde; tsc y eslint limpios;
  build OK. La agregacion se corrio contra el doc REAL del monitor de Filete con 6 visitas
  simuladas: 3 aperturas (la recarga se deduplico), 3 aparatos, 7 min mirados, 2 moviles + 1 PC,
  1 vista a turno anterior. La pantalla publica se abrio en el navegador: genera su `viewerId`,
  muestra la nota del pie y **sigue funcionando con el endpoint caido** (el fetch falla y se traga
  en silencio, que es la unica conducta aceptable para telemetria).
- Estado: HECHO (mergeado)
- Sigue: el ping real end-to-end solo se puede confirmar con la funcion desplegada.

## 2026-08-10 - claude - La tarjeta del monitor NO aparecia en Filete (el caso de uso principal)

Orel: *"no lo veo"*. Tenia razon. La tarjeta "Monitor en vivo (link / QR)" estaba anidada dentro de
`{summary && shiftWindow && (...)}` — y ese `summary` es **el del Excel del Grader**. Filete no
tiene Grader, asi que en Filete el bloque entero no se renderizaba: la tarjeta no existia justo en
la linea para la que se construyo la feature. Movida fuera de ese gate.

**Por que no se detecto antes**: tsc, eslint, 1.104 tests, el build y la vista publica estaban todos
en verde, y la vista publica se verifico a fondo. Lo que nunca se hizo fue **abrir la pagina de la
app y mirar la tarjeta**, porque requiere sesion y el navegador de la herramienta no la tiene. Se
declaro como "pendiente: falta apretar Generar link" cuando la conclusion honesta era "no se sabe si
la tarjeta aparece". *Un pendiente de verificacion no es un detalle: es exactamente donde estaba el
bug.*

**Como se verifico ahora**: con `claude-in-chrome` sobre el Chrome REAL de Orel, que ya tiene la
sesion iniciada, contra un `vite` en el puerto 5173 (el autorizado por Firebase). Recorrido
completo: Analisis de Turno → Filete → matriz de turnos → Ver turno → la tarjeta aparece al final →
**Generar link** crea el link y el QR → **Revocar** lo borra (verificado en Firestore: vuelve a
quedar un solo monitor de linea). Con eso queda cerrado el ultimo pendiente del circuito.

De paso, el callable en modo linea pasa a ser **idempotente**: si la linea ya tiene un link vigente
devuelve ESE (y solo refresca sus etiquetas), en vez de crear un segundo link. Sin esto, el QR
pegado en la pared y el que acaba de copiar el supervisor serian distintos.

- Archivos: `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`, `functions/index.js`,
  `functions/publicMonitor.js`, `functions/__tests__/publicMonitor.test.js`.
- Verificacion: 193 tests functions (1 nuevo) y 1.104 del PWA en verde; tsc limpio; build OK; y el
  recorrido completo hecho a mano en el navegador con sesion real.
- Estado: HECHO (mergeado)
- Sigue: Orel pregunta si se puede saber quien usa el QR — sin sesion no hay identidad; lo que si se
  puede medir es cuantas aperturas y desde cuantos dispositivos, de forma anonima.

## 2026-08-10 - claude - `Unscheduled` ganaba como turno vigente del monitor

Encontrado **verificando en produccion** justo despues del deploy anterior: el monitor de linea de
Filete estaba mostrando `2026-08-10_Unscheduled` con **623 pz** como si fuera el turno, mientras el
`Turno Dia` real llevaba **4.915**. Ganaba por horario (su ventana arranca antes y termina despues)
y pasaba el filtro porque tenia mas de 50 ciclos.

El umbral de 50 venia de la PWA, pero **desde que el monitor rescata las piezas fuera de horario ya
no aplica**: esas 623 piezas YA se suman al turno real, asi que elegir el bucket como turno las
mostraba dos veces y con la etiqueta equivocada. Ahora `Unscheduled` no puede ser el turno vigente
nunca; solo se acepta si la linea no tiene NINGUN turno con nombre en hoy/ayer y aun asi hubo
proceso (mejor produccion mal etiquetada que una pantalla vacia teniendo datos).

Vale como recordatorio de la regla que ya estaba escrita para la PWA —*nunca caer a `Unscheduled`
como fallback de un turno nombrado*— y de que **un cambio puede invalidar un umbral que llevaba
meses siendo correcto**.

- Archivos: `functions/publicMonitor.js`, `functions/__tests__/publicMonitor.test.js`.
- Verificacion: 192 tests functions (2 nuevos con el escenario exacto) en verde. Tras el fix,
  `resolveCurrentShiftDocId` contra prod devuelve chonchi → `Turno 2`, yal → `Turno 2`,
  filete → `Turno Dia`.
- Estado: HECHO (mergeado)

## 2026-08-10 - claude - Deslizar a turnos anteriores desde el link publico

Pedido de Orel. El link mostraba solo el turno vigente; ahora publica ademas los **6 turnos
anteriores** con proceso y se navega con flechas o **swipe** (que es la interaccion natural: el QR
se abre en el celular).

**Lo que evita que sea caro**: un turno cerrado ya no cambia, asi que el historial se REUSA del doc
anterior en vez de recomponerse cada 5 min. Solo se recompone el turno inmediatamente anterior,
que todavia se mueve por el re-sync movil (reescribe ayer cada hora y hace 2-3 dias una vez al
dia). Sin ese reuso serian ~40 lecturas por refresco por monitor.

⚠ **Ordenar por el id NO sirve**: en Chonchi "Turno 1" arranca 21:30 y "Turno 2" a las 09:00, asi
que alfabeticamente el historial sale al reves. Se ordena por `scheduledStart` real. Se descartan
los `Unscheduled` y los turnos con <50 piezas (no hubo proceso).

⚠ **Bug de React que costo una vuelta**: el efecto que reubica la vista cuando arranca un turno
nuevo dependia tambien de `idx`, asi que se disparaba en la navegacion del propio usuario y lo
devolvia al turno actual — **el boton parecia no responder**. El efecto debe depender SOLO de
`vistas`; quien navega actualiza el ref a mano. Detectado clickeando el boton en el navegador, no
por tsc ni por los tests.

- Archivos: `functions/publicMonitor.js` (`buildMonitorHistory`), `functions/index.js`,
  `functions/__tests__/publicMonitor.test.js`,
  `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`, `scripts/public-monitor-probe.js`.
- Verificacion: **190 tests functions** (3 nuevos, incluido el del orden cronologico y el del
  reuso) y 1.104 del PWA en verde; tsc y eslint limpios; build OK (chunk publico 15 kB / 4,7 gzip).
  En el navegador con datos REALES: recorridos los 6 turnos de Filete (3.454 → 4.364 → 3.754 →
  3.398 → 3.168 → 2.410), el boton se deshabilita en el ultimo, "Volver al actual" funciona, el
  swipe sintetico navega, y a 375px no hay scroll horizontal ni texto bajo 11px. Al mirar un turno
  pasado el rotulo cambia a "Piezas de ese turno" y desaparece el bloque "Ahora mismo", que no
  aplica.
- Estado: HECHO (mergeado)
- Sigue: el historial se llena en el primer refresco del trigger (o al crear el link). Un link
  creado antes de este cambio no tiene `history` hasta que el sync lo toque.

## 2026-08-10 - claude - El monitor cuenta las piezas que Shoplogix deja fuera del turno

Reporte de Orel: "hoy termino filete pero Shoplogix conto hasta las 15:30 y siguieron pasando
piezas hasta las 17:00". Confirmado en los datos del 10-ago: el turno estaba definido 07:45→15:30
con 4.410 pz, y el doc `Unscheduled` del mismo dia tenia otras 623 pz — produccion real que el
monitor no mostraba. **La jornada eran ~4.900 piezas y el link decia 4.410.**

Ahora `buildMonitorLive` rescata los intervals/states de los docs `Unscheduled` del mismo dia que
no caen dentro de la ventana de NINGUN turno con nombre, los fusiona en la serie/cadencia/estado, y
publica el desglose: `shiftPieces` + `outsidePieces` + `outsideRanges` (con `kind` antes/despues).
La pantalla lo muestra como "4.410 dentro del turno + 505 fuera del horario (15:40–16:30)".

⚠⚠ **El bug que casi se cuela: DOBLE CONTEO.** El doc del turno guarda intervals MAS ALLA de su
propio `scheduledEnd` (15:30 y 15:35) y Shoplogix repite esos mismos minutos en `Unscheduled` —
**identicos, 112 piezas**. Filtrar por la ventana declarada no los atrapa. Se detecto **mirando la
pantalla**: el "maximo del tramo" del grafico salto de 83 a 130 pz, que es justo 65+65. Fix: dedupe
por (maquina, timestamp del interval) contra lo que el turno ya tiene, no por ventana. En esta
pantalla el doble conteo es el peor error posible — quien mira el link no tiene con que contrastar.

**Dos numeros mas que hubo que arreglar por efecto domino:**
- La CADENCIA se diluia: al estirar la ventana hasta la ultima pieza del dia, un hueco de 1,5 h en
  la manana convertia 557 pz/h en 487. Ahora el denominador son las horas de OPERACION (se
  descuentan los huecos ≥30 min sin una sola pieza).
- El % PRODUCIENDO pasa a calcularse sobre el tiempo RASTREADO (uptime/(uptime+down+break)) en vez
  del `shiftRuntime` de Shoplogix, que solo conoce el turno. Con la cola vacia da el mismo numero
  que antes (18.105/24.705 = 73,3% vs su 73,28%), asi que no rompe lo ya verificado.

**Umbral de ruido**: un tramo fuera de turno cuenta solo si tiene ≥20 piezas. Nace de un dato real
—6 piezas sueltas a las 06:10, hora y media antes del turno, probablemente higiene— pero se dejo
como UMBRAL y no como regla "ignorar todo lo anterior al turno", porque el arranque anticipado real
existe y ya costo un fix entero (ver [[continuity-ventana-turno-inicio-anticipado]]).

- Archivos: `functions/publicMonitor.js`, `functions/__tests__/publicMonitor.test.js`,
  `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`.
- Verificacion: **187 tests functions** (6 nuevos, incluido el del doble conteo — comprobado que
  falla al revertir el dedupe) y 1.104 del PWA en verde; tsc limpio; build OK. Contra los datos
  REALES del 10-ago: 4.915 pz = 4.410 + 505, tramo 15:40→16:30, 573 pz/h, 72% produciendo, meta al
  98% (antes marcaba 88% con 4.410). Revisado en el navegador con un monitor real.
- Estado: HECHO (mergeado)
- Sigue: pedido de Orel — poder **deslizar a turnos anteriores** desde la misma pantalla.

## 2026-08-10 - claude - El link del monitor llega por Telegram al arrancar el turno

Tercera parte. El link ya seguia el turno vigente, pero habia que ir a buscarlo a la app. Ahora
llega solo: al crearse el doc de un turno (`onShoplogixShiftStarted`), el aviso de arranque incluye
el link del monitor listo para reenviar a Control de Produccion.

**La invariante que manda: el TOKEN NO CAMBIA.** `ensureLineMonitor` reusa siempre el link de linea
vigente y solo le extiende la vigencia cuando le quedan <7 dias (a 30). Crear uno nuevo en cada
arranque habria pasado cualquier test de contenido y aun asi habria roto lo unico que hace util al
link: que el QR impreso y el mensaje de Telegram de ayer sigan abriendo la misma pantalla. Hay 4
tests sobre eso, y se comprobo que fallan mutando el codigo.

⚠ **Hallazgo que cambio el diseno: Filete NO tenia el canal Telegram abierto** (`notificationConfig`
solo existe para chonchi y yal; filete heredaba `telegram:false`). O sea, la linea donde mas se pide
el monitor era justo la que no iba a recibir nada. Se resolvio con un flag propio,
`monitorLink.enabled` (default true, `ttlDays` 30), independiente de `channels.telegram`:
  - Chonchi/Yal (canal abierto): el link va DENTRO del brief de inicio de siempre, sin mensajes nuevos.
  - Filete (canal cerrado): un aviso corto y aparte, solo con el link. **No se le abrio el canal de
    alertas**: activar `telegram:true` habria traido tambien detenciones y fin de turno de Filete,
    que nadie pidio.

El envio por Telegram salio ademas de dentro del gate `eligibleIds.length > 0`: ese gate son las
preferencias de push de los usuarios de la app, y el mensaje va al chat del admin o al grupo. Que
alguien apague su push no puede dejar sin link a Control de Produccion.

- Hecho: `monitorLink` en la config de notificaciones (3 capas, ajustable por planta desde
  Firestore), `ensureLineMonitor` (reusa/renueva/crea), `resolveMonitorUrlForPlant` (nunca tumba el
  aviso: ante error devuelve null y el mensaje sale sin la linea), linea del link en
  `componerBriefInicioTurno` + `componerAvisoMonitor` para el caso sin canal. De paso, dedupe de
  `lineLabel`/`areaLabel` en la cabecera publica ("Filete · Filete").
- Archivos: `functions/index.js`, `functions/publicMonitor.js`, `functions/shoplogix/notifConfig.js`,
  `functions/shoplogix/turnoBrief.js`, `functions/__tests__/publicMonitor.test.js`,
  `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`.
- Verificacion: **181 tests functions** (5 nuevos) y 1.104 del PWA en verde; `tsc` limpio; el modulo
  `index.js` carga sin TDZ. Contra PRODUCCION: dos corridas seguidas de `ensureLineMonitor` sobre
  filete devolvieron **el mismo token** (`created:true` y luego `false`), el monitor quedo con datos
  reales (4.408 pz) y vigencia al 9-sep, y la pagina se abrio sin sesion. Los dos mensajes se
  renderizaron con el composer real antes de tocar nada.
- Estado: HECHO (mergeado)
- Sigue: **el envio real solo se puede confirmar en el proximo arranque de turno** — no se disparo
  ningun Telegram de prueba a proposito (mandar mensajes es del usuario, no mio). Si el primer aviso
  no llega, mirar `monitorLink.enabled` en `notificationConfig/{planta}` y los logs
  `[publicShiftMonitor] link de linea ...`.

## 2026-08-10 - claude - El link del monitor sigue el turno vigente (no se regenera)

Continuacion de la entrada de abajo. El link nacia atado a UN turno, asi que al dia siguiente
habia que generar otro: inservible para un QR pegado en la pared. Ahora el modo por defecto es
**`line`**: el mismo link sigue el turno que este corriendo.

**Como se resuelve el turno vigente** (`resolveCurrentShiftDocId`): entre los padres de HOY y AYER
en wall-clock (un turno noche que arranca 21:30 queda archivado bajo el dia en que arranco), gana
el que contiene el reloj de planta con 30 min de gracia; si no hay ninguno —estamos entre turnos—
gana el ultimo que YA empezo, porque quien abre el QR a las 20:00 quiere ver como termino el
turno, no una pantalla vacia. `Unscheduled` con <50 ciclos se descarta (mismo umbral que la PWA).
Se leen 2-6 docs padre, ningun `machines/`, y sin indices nuevos (`listDocuments` + filtro por
prefijo de fecha).

⚠ **Lo que NO se hace, y es el punto entero:** el monitor de linea **nunca adopta el turno que
disparo el trigger**. El re-sync movil reescribe padres de ayer y de hace 2-3 dias; adoptarlos
haria saltar el link a un turno viejo justo cuando alguien lo esta mirando. Siempre se re-resuelve.

El trigger atiende las dos audiencias con **una sola query** (`where scope in [plant|shiftDoc,
line|plant]`, dos igualdades, sin indice compuesto) y resuelve el turno vigente **una vez por
planta** aunque haya varios links de esa linea.

Tres estados en la pantalla publica, los tres verificados: turno corriendo (chip "Sigue el turno
vigente"), link vencido/revocado, y **"Esperando el proximo turno"** — un link de linea puede
nacer un domingo y no esta roto, esta esperando; decirle "no disponible" mandaria a pedir otro
link que tampoco mostraria nada.

- Hecho: modo `line` en el callable (permite crear fuera de turno, pero no sobre una linea que
  nunca sincronizo), `buildMonitorPatch` que ademas reapunta dateKey/shiftId, trigger que cubre
  ambos scopes, vigencia nueva de **30 dias** (default del modo linea), selector "Que sigue" en la
  tarjeta de generacion, chip + nota al pie en la vista publica, y `--current` en el probe para
  contrastar que turno se considera vigente en cada planta.
- Archivos: `functions/publicMonitor.js`, `functions/index.js`,
  `functions/__tests__/publicMonitor.test.js`, `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`,
  `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`,
  `scripts/public-monitor-probe.js`.
- Verificacion: `tsc` limpio, eslint sin errores nuevos, **176 tests functions** (6 nuevos del modo
  linea) y **1.104 del PWA** en verde, build OK. **Contrastado contra las 3 lineas reales a las
  15:11**: chonchi → `Turno 2` 09:15→15:05 (6.751 pz), yal → `Turno 2` recien arrancado 15:00,
  filete → `Turno Dia` 07:45→15:05 (4.010 pz). Los tres estados de la pantalla vistos en el
  navegador con docs reales de Firestore.
- Estado: HECHO (mergeado)
- Sigue: sigue faltando ejercitar el boton "Generar link" con sesion de supervisor (el callable
  necesita usuario). Los links de linea se refrescan solo cuando el sync escribe algun padre de esa
  planta — si una planta deja de sincronizar, el link conserva el ultimo turno y lo dice con la
  frescura, que es lo correcto.

## 2026-08-10 - claude - Monitor publico de turno en vivo (link/QR sin sesion)

Control de Produccion necesitaba seguir el avance de piezas de la Baader 200 de Filete sin entrar
a Shoplogix ni tener cuenta en la PWA. Se agrega un link/QR **de solo lectura** que se actualiza
solo: `/monitor/{token}`.

**Que muestra:** piezas acumuladas del turno (con avance vs la meta de 5.000 pz de Filete),
**pz/min y pz/hora**, cadencia de los ultimos 30 min, % de tiempo produciendo, **turno + dia +
horario programado**, ventana real de produccion (primera->ultima pieza), estado actual
(produciendo/detenida con la razon y desde cuando), barras de piezas por tramo de 5 min y el
top de detenciones del turno. Sin comentarios de operador (texto libre que puede traer nombres).

**Arquitectura — por que un espejo y no lectura directa:** `shoplogix/**` exige `isNotAnonymous()`
y abrirla expondria todos los turnos de todas las plantas. En cambio se publica un doc espejo
`publicShiftMonitors/{token}` que escribe SIEMPRE el Admin SDK (`write: if false` en rules) y que
lee cualquiera **solo mientras no venza** (`timestamp.value(expiresAt) > request.time`, reloj del
servidor). Lo refresca un trigger enganchado al **doc padre** del turno — no a `machines/{id}` —
porque el padre se escribe una vez por ciclo de sync y la subcoleccion dispara un evento por
maquina (3 en Eviscerado) que compondrian el mismo payload. Frescura efectiva: ~5 min.

**Bug encontrado y corregido con datos reales (turno del 10-ago EN CURSO):** el turno vivo se
anunciaba como **"Turno cerrado"**. Causa: en Filete el `scheduledEnd` se DERIVA del ultimo
intervalo sincronizado, o sea que siempre queda unos minutos en el pasado (fin derivado 14:36 con
la linea produciendo a las 14:40). Fix: margen de 30 min **y** exigir que ninguna maquina este en
uptime. Hay test que falla si se revierte cualquiera de las dos condiciones (verificado mutando el
codigo, no asumido).

**Gotcha de UI reusable:** el root de la app corre a 85% (13,6px), asi que **`text-xs` renderiza a
10,2px reales** — por debajo del piso de 11px de la piel nueva. En esta pantalla los tamanos van en
px explicitos. `capitalize` de Tailwind ademas capitaliza CADA palabra ("Lunes, 10 De Agosto"):
usar `first-letter:uppercase`.

- Hecho: `functions/publicMonitor.js` (composicion del payload) + callables
  `createPublicShiftMonitor`/`revokePublicShiftMonitor` + trigger
  `onShoplogixShiftWrittenPublicMonitor`; regla `publicShiftMonitors`; pagina publica
  `/monitor/:token`; bloque "Monitor en vivo (link/QR)" en Analisis de Turno (visible para
  supervisor/admin en cualquier linea con Shoplogix, **no depende del Grader** — por eso sirve en
  Filete); vigencia elegible 12 h / 1 d / 3 d / 7 d y revocacion; `scripts/public-monitor-probe.js`
  para inspeccionar el payload antes de exponerlo.
- Archivos: `functions/publicMonitor.js`, `functions/index.js`,
  `functions/__tests__/publicMonitor.test.js`, `firestore.rules`,
  `apps/pwa/src/pages/PublicShiftMonitorPage.tsx`,
  `apps/pwa/src/services/shoplogix/publicShiftMonitor.service.ts`, `apps/pwa/src/App.tsx`,
  `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`,
  `scripts/public-monitor-probe.js`.
- Verificacion: `tsc --noEmit` limpio; eslint sin errores nuevos; **1.104 tests PWA** y **170 tests
  functions** en verde (6 nuevos); build de produccion OK (chunk publico 11,6 kB / 3,7 kB gzip, sin
  echarts); payload contrastado contra el turno REAL de Filete del 10-ago (3.727 pz, 9,3 pz/min,
  557 pz/h, 73% produciendo, 350 pz en los ultimos 30 min = 11,7 pz/min); vista revisada en el
  preview a 375px y 1280px, sin scroll horizontal, y la pantalla de "link no disponible" probada
  contra Firestore real (permission-denied => mensaje claro, no pantalla en blanco).
- Estado: HECHO (mergeado)
- Sigue: **falta el unico tramo que no se puede probar sin sesion de usuario**: apretar "Generar
  link" desde la app como supervisor (el callable). Verificado en cambio el resto del circuito en
  produccion tras el deploy. Idea futura: link "de linea" que siga el turno vigente en vez de uno
  fijo, para no regenerarlo cada dia.

## 2026-08-09 - claude - El aviso del protocolo NUNCA llegaba: topic de Telegram roto

Verificación end-to-end del circuito recién desplegado, contra producción. Encontró un bug que
tsc, eslint, los 18 tests y el deploy en verde no podían ver.

**Lo que ya estaba bien (verificado, no asumido):** la colección tenía **1 lectura, escrita por
Danilo** desde la app el 08-08 a las 13:38 — o sea la **regla de Firestore y el índice compuesto
ya estaban probados con uso real**, que era justo lo que quedaba pendiente. Pero ese doc es
ANTERIOR al despliegue de las functions (09-08 16:57), así que el trigger nunca había corrido.

**Cómo se probó el trigger sin ensuciar el grupo:** crear una lectura **sana** (todos los
contadores en 0). El trigger corre, evalúa, no encuentra nada y no manda mensaje; el log
`protocolo baader142: baader-n3 sin alertas` es la prueba de que está enganchado. Después, una
con alerta (`fecha: '1999-01-01'` para que sea inconfundiblemente una prueba) para probar el
envío. **Ese segundo caso destapó el bug.**

**El bug:** Telegram devolvía `400 "Bad Request: message thread not found"` — el topic `equipos`
apunta a un hilo que ya no existe en el grupo. Y como `sendTelegramMessage` **loguea sin lanzar**,
la función terminaba en verde (`1 alerta(s) en baader-n3`) con el mensaje perdido. Todos los
viernes habría fallado en silencio.

**Dos arreglos (#412):**
1. `sendTelegramMessage` reintenta **sin topic** (hilo principal del grupo) cuando el error es
   "thread not found". Arregla de raíz el problema para cualquier función cuyo topic alguien
   borre — la línea ~2649 también usa `equipos` y muy probablemente venía fallando igual.
2. Las dos funciones del protocolo pasan a `getTopicId('general')`, que tiene uso diario
   verificado (Grader y Shoplogix mandan ahí). **Topics sanos: general, incidencias, repuestos.**

**Evidencia del antes y después**, misma prueba, mismo doc:
- 17:50:36 → `E ... 400 message thread not found` + `1 alerta(s) en baader-n3` (mensaje perdido)
- 18:02:04 → `1 alerta(s) en baader-n3`, **sin error** (mensaje enviado)

Los docs de prueba se borraron; la colección queda con la lectura real de Danilo, intacta.

- Estado: HECHO — #412 mergeado y desplegado.
- Sigue: confirmar visualmente en el grupo que llegó el aviso de prueba (fecha 1999) y avisar al
  equipo que era una prueba técnica.

## 2026-08-09 - claude - El protocolo de las Baader 142 ahora sale a buscar a la persona

El módulo Perilla 5 ya dejaba registrar los 13 contadores y ver la tendencia, pero había que
acordarse de ir a mirarla. Sin esto, la promesa de "intervenir ANTES de que pare" dependía de
la memoria de alguien. Dos funciones nuevas, con criterios deliberadamente distintos:

- **`recordatorioProtocoloBaader142`** (`onSchedule '30 16 * * 5'`, America/Santiago): viernes
  16:30, antes de que termine el turno. **Solo manda mensaje si falta registrar alguna de las
  tres máquinas**; si están todas, calla — un aviso que llega siempre se deja de leer (mismo
  criterio que el verificador de arranque de turno). Lista las que faltan con la fecha de su
  última lectura y repite la regla de no resetear.
- **`onProtocoloBaader142Created`** (trigger `onDocumentCreated`): al guardar una lectura la
  evalúa contra las dos anteriores de ESA máquina y avisa solo si hay algo que mirar.
- Ambas al grupo de mantención, topic `equipos`.

**Los tres criterios de alerta, y por qué cada uno:**
1. `umbral` — la tasa llegó a intervenir (30) o crítico (100). Es el ESTADO, no el movimiento:
   aunque no haya subido esta semana, sigue sin arreglarse (el mensaje lo dice: "Igual que la
   lectura anterior: sigue sin corregirse").
2. `tendencia` — subió en las dos últimas lecturas seguidas. **Se exige además llegar a
   "vigilar" (5)**, porque 0 → 1 → 2 por mil es ruido, no una tendencia; sin ese piso, el aviso
   se volvería ruido y nadie lo leería a la tercera semana.
3. `falla-dura` — paró con las correcciones en cero. No es desgaste: es inductivo, cable o
   bloqueo, y el mensaje manda a mirar el inductivo (B1…B5), no la correa. Avisa aunque la tasa
   sea baja, porque la máquina ya se detuvo.

- **La lógica vive aparte y con tests**: `functions/baader142/protocoloAlertas.js` (funciones
  puras sobre datos ya leídos) + `__tests__/protocoloAlertas.test.js`, **18 tests, todos verdes**
  con `node --test`. Se sigue el patrón de `functions/shoplogix/`, no el index monolítico.
  ⚠ **Esos tests NO corren en CI**: el vitest de `apps/pwa` solo incluye `src/**`, así que los
  12 tests de shoplogix tampoco corren. Deuda preexistente del repo, no la introduce este PR;
  se corrieron a mano y queda anotado.
- **Verificación mirando, no solo asserts**: `__tests__/previewMensajes.js` imprime los 7
  mensajes renderizados (sin HTML) para revisar la redacción antes de soltarla al grupo. Ahí se
  confirmó que el caso "más pescados con las mismas correcciones" NO dispara alerta, porque
  compara tasas y no totales — un test que solo mirara el total habría dado un falso positivo.
- **Sin índice nuevo**: el trigger y el recordatorio reusan
  `(plantId, maquina, fecha desc, createdAt desc)` que ya existe. El recordatorio hace 3 queries
  de `limit 1` en vez de una con `where fecha >=`, justamente para no pedir un índice más.
- **El primer deploy quedó en ROJO y hay que saber por qué (aplica a toda function nueva):** un
  `onDocumentCreated('col/{id}', fn)` **sin `region` explícita** lo crea firebase-functions v7 en
  la región de la BASE DE DATOS (`southamerica-west1`), no en us-central1. Las dos funciones
  quedaron desplegadas y operativas, pero el paso final del deploy falló con *"could not set up
  cleanup policy in location southamerica-west1"* → **exit 1**. O sea: CI en rojo con las
  funciones andando, que es la peor combinación porque esconde el próximo fallo de verdad.
  Fix (#410): forma con objeto `{ document, region: 'us-central1' }`, igual que
  `onShoplogixShiftStarted`. Y **hubo que borrar la función de la región vieja a mano**
  (`firebase functions:delete onProtocoloBaader142Created --region southamerica-west1 --force`)
  porque cambiar de región implica borrar+crear y el CI corre `--non-interactive` sin `--force`.
  Verificado después: `functions:list` no deja nada en southamerica-west1 y las dos funciones
  figuran en us-central1; deploy en verde.
- Estado: HECHO — #409 y #410 mergeados y desplegados.
- Sigue: la primera alerta real se verá cuando se guarde una lectura. Para probar el trigger sin
  esperar al viernes, basta guardar una lectura con `E82x-C` sobre 30 y ver si llega el mensaje.

## 2026-08-08 - claude - Perilla 5: notas compartidas, tema claro/oscuro y menos cascarón

Segunda tanda de feedback de Orel sobre el módulo.

- **Notas compartidas (era el pedido principal)**: hasta ahora vivían en el localStorage de
  cada teléfono, así que lo que anotaba un técnico no lo veía el del turno siguiente. Ahora
  van a **`baader142Notas`** vía PUENTE postMessage (el iframe no hereda la sesión de Firebase
  — mismo patrón que `PlanosAguasPage`). **La foto NO va en el documento**: se sube a Storage
  (`baader142Notas/{figura}/`) y en Firestore queda su URL, porque con la imagen en base64
  traer las notas de todas las figuras costaría decenas de MB; así cada doc pesa ~½ KB.
  Contenido vivo, no evidencia: cada uno edita y borra lo suyo, los admin cualquiera
  (regla como `planoNotas`, no como `variadoresCambios`). Abierto suelto desde OneDrive sigue
  usando localStorage + export/import, y el menú dice en cuál de los dos modos está.
- **Tema claro/oscuro**: el embed era una isla clara dentro de la app en oscuro. Se tokenizaron
  los ~26 colores fijos que quedaban (`--flag-*`, `--row-alt`, `--field`, `--map-*`…) y se agregó
  `:root[data-theme="dark"]` alineado con los tokens `--lc-*` del Centro de Aprendizaje. El tema
  entra por `?theme=` al montar (evita el parpadeo) y después por postMessage, porque recargar
  el iframe perdería el zoom y la figura abierta. **Las figuras conservan fondo blanco a
  propósito**: un dibujo técnico en negativo no se lee.
- **Cabecera**: ocupaba ~200 px con un título gigante y un párrafo de tres líneas, y dentro de la
  PWA además repetía el título que ya pone la página. Ahora es **una sola línea**, y embebida se
  oculta entera (`body.embed`).
- **"Mapa" → "Piezas"**, y su SVG de 660 px fijos (scroll horizontal obligado en el teléfono, y lo
  que Orel señaló como "metido a la fuerza") se rehízo como **tarjetas responsivas**: columna en
  móvil, grilla en pantalla ancha. Se conserva lo que valía —el orden de las estaciones y el
  "se revisa de la primera a la última"— y se gana legibilidad.
- **Ancho en PC**: la herramienta pasa de `max-w-5xl` a `max-w-[1400px]` y el `.wrap` del embed de
  820 a 1180 px. La vista de protocolo se queda angosta: es un formulario.
- **"Vacío" NO se quita** (Orel preguntó): es la causa raíz de "esófago demasiado largo" y
  "vísceras mal chupadas", que son los defectos de corte que más reporta el operador. Sin esa
  sección el técnico busca en el motor lo que está en el ciclón. Es §21 del manual, verificable.
- ⚠ **Bug de encoding que casi se publica**: ensamblar `part5.html` con
  `Get-Content | Set-Content -Encoding UTF8` en PowerShell 5.1 dejó BOM + **284 caracteres en
  mojibake** (`alcanzÃ³`, `SOLUCIÃ³N`) — visible en pantalla, invisible para tsc/eslint/tests.
  Reparado línea a línea (el archivo había quedado mixto: lo ensamblado roto, lo editado después
  sano). **Regla para el futuro: ensamblar SIEMPRE con Python `io.open(encoding='utf-8')`,
  nunca con `Get-Content | Set-Content`.**
- Verificación: tsc 0 · eslint 0 · **1038 tests verdes** · en 402×874 y en 1325 px de ancho:
  tema claro y oscuro, cabecera oculta al embeber, tarjetas de estaciones sin scroll horizontal,
  **paneo probado con arrastre sintético** (se mueve y frena en el borde: tras arrastrar 1500 px
  el clamp deja `tx=0`), y el flujo de nota **sin sesión** avisa y no pierde lo escrito.
- **NO verificado**: guardar/editar/borrar una nota CON sesión — necesita el login de Orel y la
  regla desplegada. Probar con una nota de prueba tras el merge.
- Estado: EN REVISIÓN — PR abierto. Rama `claude/perilla5-notas-compartidas`.

## 2026-08-08 - claude - Perilla 5: figuras anotables, zoom real y ajuste a iPhone

Feedback de Orel sobre el módulo recién desplegado: figuras repetidas, faltaba zoom/paneo,
quería anotar sobre las figuras, y el layout no cuadraba en su iPhone 16 Pro.

- **Duplicados: eran muchos más de los que se veían.** Un chequeo por hash perceptual
  (dHash 12×12, umbral Hamming ≤12) sobre las 55 figuras encontró que **9 de las 12 "fotos de
  campo" de Telegram eran capturas de páginas del manual** que ya estaban extraídas en mejor
  calidad (`foto-aj-centrador` = dib. 20, `foto-aj-expulsador` = dib. 63, etc.), y que
  **dib. 64 es la MISMA foto que dib. 35** — BAADER la publica dos veces (pág. 41 y 85).
  Se borraron 10 archivos, se dejó `ALIAS={'dib-64':'dib-35'}` para que el enlace del texto
  siga funcionando con un solo recurso, y sobrevivieron las 2 fotos realmente únicas (la
  disposición real de prismas y la nota manuscrita de medidas). De paso aparecieron **dib. 16
  y 17 (§12.3.1), que faltaban**: el grep textual no los encuentra porque su rótulo es solo el
  número dentro del cajón. Neto: 55 → **46 figuras**, y el HTML bajó de 2,5 a 2,07 MB.
- **Visor reescrito**: pinch-zoom, doble toque (acerca al punto / vuelve a encuadrar), paneo con
  clamp a los bordes, rueda en escritorio, botones ±/ajustar. Los pins se **contra-escalan**
  (`scale(1/s)`) para no crecer con el zoom — verificado: 28 px a 100% y a 225%.
- **Anotaciones sobre la figura**: pin en coordenadas relativas (0-1) para que quede en el mismo
  punto del dibujo con cualquier zoom o pantalla. Tres tipos: *nota* (círculo numerado, texto al
  tocar), *cota* (la medida se escribe sobre el dibujo, estilo LCD) y *foto* (se abre en el
  propio visor con su zoom). Hover en escritorio, hoja inferior en táctil. Persisten en
  localStorage con export/import JSON; las fotos del celular se comprimen a WebP ≤1100 px
  (una foto de iPhone de ~4 MB queda en ~100 KB) porque sin eso dos fotos llenaban la cuota.
  Las miniaturas con notas se marcan con borde naranja y contador.
- **iPhone 16 Pro (402×874)**: safe-areas (Dynamic Island y home indicator), breakpoint ≤460 px
  que cubre iPhone 16/16 Pro/Pro Max, **todos los inputs a 16 px** (bajo eso Safari hace zoom
  solo al enfocar), tocables ≥46 px, y en la PWA la descripción larga se oculta en móvil para
  que el iframe pase de 65% a **83% del alto** (el visor es `position:fixed` dentro del iframe,
  así que su pantalla completa ES ese alto).
- **Bug encontrado al verificar, no en el código**: el stage centraba por flex Y por transform a
  la vez, así que la figura terminaba fuera de pantalla (translate sumado al centrado del flex).
  Se ve solo mirando: los tests de estado daban todos verdes. Fix: canvas `position:absolute` en
  0,0 y el encuadre lo hace únicamente `fit()`.
- Verificación: tsc 0 · eslint 0 (1 warning preexistente) · **1038 tests verdes** · emulación
  402×874: sin scroll horizontal, flujo completo de nota/cota/foto probado punta a punta
  (crear → pin → tocar → ver foto ampliada → borrar), badges y export.
- Estado: EN REVISIÓN — PR abierto. Rama `claude/perilla5-visor-movil`.
- Sigue: si se quiere que las notas se compartan entre técnicos (hoy viven en cada teléfono),
  el paso es el puente postMessage → Firestore, como hace PlanosAguasPage.

## 2026-08-08 - claude - Perilla 5 · Diagnóstico BAADER 142 → módulo de Aprendizaje

- Origen: handoff de Claude mobile (sesión de terreno con Danilo, 08-08). La herramienta HTML de
  diagnóstico del selector 5 (S24) ya venía validada en planta; acá se integró a la PWA y se le dio
  la parte cuantificable: registro persistente del protocolo del Upgrade Kit + tendencia.
- **Módulo especial `/aprendizaje/perilla-5`** (patrón Variadores): entrada en SPECIAL_MODULES,
  ruta lazy en App.tsx, página `Perilla5Page.tsx` con dos vistas por `?vista=`:
  - `herramienta` (default): embed del HTML standalone (`public/perilla5-baader142-embed.html`,
    2.5 MB: 14 secciones, interpretador, 46 códigos con solución didáctica resumen/completo con
    porqués, 43 figuras del manual 1420000804 + 12 fotos de planta incrustadas como WebP).
    Acepta deep-links `?t=<sección>&q=<búsqueda>`.
  - `protocolo`: formulario de los 13 contadores (tasas /1000 en vivo con umbrales), guardado en
    **`baader142Protocolo`** (plantId 'chonchi' desde nacimiento, evidencia histórica: solo
    create+read) + tendencia Chart.js de las 5 tasas E82x-C por herramienta + historial con
    dominante. Máquinas: **baader-n1 (antigua) / n2 / n3** (orden confirmado por Orel).
- **Modo práctica runbook→herramienta**: `perilla5Practice.ts` (26 targets) + dispatcher por slug
  en `HmiPracticeButton` (antes hard-coded a grader). Los diagnosis E8xx de la ficha 142 ahora
  tienen botón "Abrir en Perilla 5" que abre el buscador con el código precargado.
- **firestore.rules**: bloque `baader142Protocolo` con validación campo a campo (estilo
  variadoresCambios: enum de máquina, fecha regex, 17 contadores int acotados, creadoPor==uid).
  ⚠ REQUIERE OK DE OREL (regla nueva). **firestore.indexes.json**: índice compuesto
  (plantId, maquina, fecha desc) — sin él la query de lecturas devolvería [] en silencio.
- Umbrales 5/30/100 etiquetados "criterio interno de Mantención ANTARFOOD" (sin respaldo de manual,
  regla del PR #310); todo lo demás citado a §22.4 / runbook E8xx.
- Verificación: tsc 0 · eslint 0 (1 warning preexistente de main en LearningHubPage) · **1038
  tests verdes (78 archivos)** · preview en wt (5174): herramienta carga con figuras y deep-link
  `?t=px&q=825` funciona, formulario precarga base 08-08 con tasas correctas (373 crítico rojo),
  tema claro Y oscuro OK, 375px sin scroll horizontal. NO verificado: escritura real a Firestore
  (la regla no está desplegada hasta el merge) — probar con UNA lectura tras el deploy.
- Gotcha de verificación que costó 10 min: un service worker viejo de otra sesión en :5174 servía
  un bundle sin la ruta nueva → redirect a /login. Desregistrar SW + borrar caches antes de
  verificar en un puerto reciclado.
- **Revisión cruzada** (subagente, protocolo de equipo): 5 hallazgos reales, todos corregidos en el
  2º commit — (1) staleness guard al cambiar de máquina (la respuesta lenta de N1 pisaba la lista
  de N2); (2) fecha por defecto LOCAL, no UTC (a las 20:00 de Chile el default caía en mañana —
  justo la ventana "fin de turno" del caso de uso); (3) orderBy secundario `createdAt` + índice
  de 4 campos (semanal + pre-reset el mismo día es el caso esperado); (4) tope de `fish` bajado a
  1M para calzar con los contadores (una lectura legítima con fish>2,7M era rechazada); (5) los
  mensajes guardado/error se limpian al cambiar de máquina.
- Estado: EN REVISIÓN — PR #402 abierto, CI build verde. Rama `claude/perilla5-baader142` (worktree wt-perilla5).
- Sigue: OK de Orel a la regla; tras merge+deploy: guardar 1 lectura real de prueba, después las
  base del 08-08; pedir a Danilo los datos pendientes del handoff (SM1/SM2 en pos.5, código del
  excavador A de la N1, test de persistencia de contadores, kit de N2/N3).

## 2026-08-05 - claude - Checklist de escalabilidad SaaS (docs, no toca la app)

- Hecho: auditoría de preparación de este repo para 100+ usuarios concurrentes (a raíz de
  una consulta del usuario, no de una tarea de TASKS.md). Diagnóstico real con evidencia:
  índices Firestore parcial, listeners `onSnapshot` sin `limit()` en incidents/photoEvidence,
  caché client-side solo puntual, 0 try/catch en `incidents.ts`, sin monitoreo de producción,
  Cloud Functions sin `minInstances`, sin rate limiting en rules. Conclusión: esta PWA (uso
  interno, una planta) no lo necesita hoy, pero se documentó como checklist reutilizable para
  proyectos futuros con más usuarios (ej. app NFPA/NEC).
- Archivos: `.ai/CHECKLIST_ESCALABILIDAD_SAAS.md` (nuevo), `CLAUDE.md` (sección Cambios recientes).
- Verificación: N/A — cambio 100% documental, sin tsc/eslint/preview.
- Estado: HECHO — PR #254 mergeado a `main`.
- Sigue: nada pendiente de esta sesión. El checklist queda para consultarlo cuando arranque
  un proyecto SaaS/multi-usuario nuevo.

## 2026-08-05 - claude - El sync captura el arranque anticipado del turno (FASE 2)

- Cierra lo que la fase 1 (#373) solo podia AVISAR: ahora los ciclos de antes de las 08:00 entran en el turno que les corresponde.
- **Tres cambios en `functions/shoplogix/sync.js`:**
  1. `fullDayWindow` empieza a las **06:00** en vez de las 08:00 (`WINDOW_START_HOUR`). El turno de dia arranca antes de las 08:00 de forma habitual — Chonchi 07:15, Filete 07:30, Yal 07:45 — y esos minutos caian en la consulta del dia ANTERIOR. **06:00 y no antes**: el nocturno de Chonchi termina 05:00, y arrancar antes metia su cola en el dia siguiente (el mismo problema con el signo cambiado).
  2. `deriveShiftGroups` separa por **continuidad temporal** ademas de por nombre: un hueco > 8 h entre intervals del mismo turno significa que son turnos de dias distintos. Sin esto, con la ventana ensanchada el "Turno 2" de ayer y el de hoy colapsaban en un grupo de 24 h — que es exactamente el bug que se veia en produccion. La clave del grupo pasa a ser `nombre + dia de inicio`.
  3. **`isTruncatedHeadOfPrevWindow`**, espejo del guard de cola del PR #354. Hace falta PORQUE la ventana se ensancho: ahora la consulta de un dia ve la cola del nocturno del dia anterior (Yal `Turno 3` iba 00:00->08:00) y ese fragmento apunta al mismo doc que la ventana anterior ya escribio entero. Mismas dos condiciones que el de cola, y por la misma razon: solo una de las dos romperia un turno legitimo.
- `shoplogixProbe` ahora llama a `fullDayWindow` en vez de replicar la ventana a mano. La copia desfasada ya habia hecho que el debug concluyera "no hay datos" en falso.
- **Tests: de 104 a 138.** Las cuatro funciones del corazon del sync (`fullDayWindow`, `deriveShiftGroups`, `shiftDateKeyFromStart`, `currentDateKey`) **no tenian ninguno** — se escribieron ANTES de tocar nada, y de los 14 iniciales 12 pasaban (red de seguridad) y 2 fallaban a proposito (los dos cambios). Uno de mis tests estaba mal, no el codigo: `currentDateKey` a las 06:30 de Chile SI devuelve el dia anterior.
- **Verificacion con la serie REAL** (`serieRealArranqueAnticipado.test.js`): reconstruida a partir de la respuesta del probe, reproduce sus tres conteos exactos (93 Turno 2 / 102 Unscheduled / 93 Turno 1), lo que confirma que representa el dia de verdad. Con ella: el Turno 2 se separa en dos, el de ayer termina 15:00 y deja de absorber, el de hoy arranca 07:15, el nocturno no se parte y el Unscheduled sale como UN bloque 15:00->07:15 igual que en Shoplogix.
- Mutation test: volver la ventana a 08:00, quitar la separacion por hueco y ponerla en 1 h hacen fallar sus tests respectivos.
- Estado: EN REVISION - PR abierto. **El deploy de functions es automatico al mergear.**
- **Sigue, y hay que hacerlo con cuidado:** despues del deploy, correr `shoplogixBackfillRange` de UN dia (05-ago), verificar los docs con la lectura de Firestore, y recien entonces backfillear el resto de los dias contaminados (Filete 12, Yal 6, Chonchi 2). Antes del backfill masivo, snapshot.

## 2026-08-05 - claude - La ventana del turno la manda Shoplogix, no una tabla del codigo (FASE 1)

- Orel reporto que el turno de hoy corrio desde las 7:15 pero el Analisis lo tomaba desde las 8:00. Investigado contra PRODUCCION (probe de Shoplogix + lectura de Firestore), y result?? ser mas grave: **las piezas no se pierden, se le suman al dia anterior**.
- `2026-08-04_Turno 2` esta guardado como 04-ago 08:00 -> **05-ago 08:00** (24 h) con 16.398 ciclos: incluye los 45 min de arranque de HOY. Y el doc de hoy nace a las 08:00 sin ellos.
- Causa: `fullDayWindow` consulta 08:00 -> 08:00, asi que lo producido antes del ancla cae en la consulta del dia anterior. **No es un evento raro: es sistematico** — Filete 12 de 31 docs (arranca 07:30 todos los dias), Yal 6 (07:45), Chonchi 2 (07:15).
- **El dato correcto YA estaba guardado**: `officialSchedule` (rollup del whiteboard) dice 07:15->15:00 en los dos docs. El pipeline lo ignoraba.
- Y el "Programado 09:00-17:15" que mostraba la app **no venia de Shoplogix**: es un literal de `plantLines.ts:144` que en turno EN CURSO le ganaba a Shoplogix. Llevaba dias desactualizado.
- **Esta fase NO toca el sync ni los datos.** Arregla lo que se AFIRMA sobre ellos: `graderShiftWindow.resolveShiftWindow` resuelve la ventana real y expone `missingHeadMin` (minutos de arranque sin datos) y `earlyStartMin` (arranque anticipado real). Nuevo componente `TurnoVentanaAviso` lo dice en pantalla en vez de dibujar un turno que empieza a las 08:00 como si fuera la realidad.
- **Dos reglas que costaron una iteracion cada una**, ambas encontradas por tests existentes:
  1. NO se puede preferir siempre el oficial: en `yal 2026-08-02` el turno produjo desde las 14:00 con el whiteboard declarando 16:15 — arranque anticipado real de 2 h 15 que solo lo observado ve.
  2. NO se pueden UNIR siempre las dos ventanas: un turno declarado 09:00-17:15 que produjo 09:05-17:02 corrio 09:05-17:02; unir infla la ventana con tiempo muerto y empeora la disponibilidad. La regla final es **manda lo observado salvo que venga contaminado por el borde**, detectado por evidencia contra lo declarado (cabeza en el ancla / cola desbordada), nunca por duracion — un `Unscheduled` real dura 16 h 48 y es legitimo.
- La matriz de periodo usaba `effective`, que viene CLIPEADO a la ventana de consulta y por eso heredaba el recorte (24 h en el doc de ayer). Ahora las dos superficies usan la MISMA funcion.
- Verificacion: tsc y eslint limpios (1 warning preexistente, verificado con stash) - **801 tests** (20 nuevos) - mutation test: mover el ancla de 8 a 9 hace caer 2 tests - los 5 casos reales de produccion comprobados en el navegador con los modulos reales - la matriz sobre el fixture de julio no cambia (44 turnos, ninguno sobre 20 h).
- **NO verificado**: la vista de turno renderizada (pide sesion). Por eso el aviso se extrajo a componente propio, que si tiene test de render.
- Estado: EN REVISION - PR abierto.
- **Sigue (FASE 2, el backend)**: ensanchar `fullDayWindow` hacia atras y separar los grupos por dia para que los ciclos de 07:15-08:00 entren en el turno correcto. Toca el CF que corre cada hora, no tiene NINGUN test (`fullDayWindow`, `deriveShiftGroups`, `shiftDateKeyFromStart` y `syncDay` estan sin cubrir) y hay 9 lugares acoplados al ancla 08:00, incluido el guard del PR #354. Ademas queda backfillear los dias ya contaminados.

## 2026-08-05 - claude - Comparativo de periodo (formato C): la hoja que contesta "vamos mejor?"

- Cierra los tres formatos del mockup aprobado. A (#359) y B (#364/#366) explican UN turno; un turno aislado nunca puede demostrar mejora continua. Este toma el mes.
- **La decision que ordena todo el texto**: separar lo que Mantencion controla (MTTR, averias resueltas, micro absorbidas) de lo que no (cuantas maquinas arrancan el turno). Mezclarlos produce el reporte de siempre — "el mes estuvo malo" — que no dice a quien le toca hacer que.
- **No inventar tendencias.** Con menos de 4 turnos la hoja dice que no hay tendencia en vez de dibujar una flecha. Las mitades se comparan por MEDIANA, no por media: un solo turno catastrofico al final arrastraba la media y daba "sin tendencia" en un mes que subio de 45% a 80%.
- **Tabla adaptativa**: hasta 12 turnos va uno por fila; sobre eso agrupa por tipo de turno (que contesta "hay un turno que anda peor?") y DICE que esta agrupando. Nunca se recorta en silencio.
- **Primitivas de dibujo compartidas** (`graderExecutiveCanvas`): encabezado, veredicto, KPIs, cierre y pie ahora viven una sola vez, y las usan el PNG del turno y el del periodo. El refactor del PNG de turno se probo comparando el canvas fila por fila contra el original: **2.094 filas identicas, 0 diferencias**; la unica variacion es que la hoja crecio 40 px de margen inferior, porque la medicion de los KPIs decia 108 y el dibujo avanzaba 128 (desfase preexistente, ahora corregido).
- Las pausas NO vienen en el hook del periodo (viven en una subcoleccion y encareceran la matriz, que se abre muchas veces al dia): `graderPeriodReliability` las carga recien cuando alguien pide el comparativo, y saca el conteo por turno llamando a `computeMaintenanceReliability` turno a turno en vez de reimplementar el criterio de que pausa cuenta como averia.
- **Mirar la hoja encontro 4 bugs que ningun test habria pillado**: el cierre declaraba "disponibilidad resuelta" con 58% de uptime; se rankeaba "mas disponible" un 59% contra un 58%; el titulo decia "Agosto de 2026"; el rango repetia el mes ("1 ago - 5 ago"). Con datos reales de julio de Yal aparecio un quinto: un tipo de turno con UN solo registro al 0% se llevaba la etiqueta "menos disponible" del mes. Todos con test.
- Banco de pruebas nuevo en **`/dev/resumen-periodo`** (6 casos, una por rama del veredicto) y los botones enchufados tambien a `/dev/matriz-turnos`, para poder verlos sin sesion.
- Verificacion: tsc y eslint limpios - **781 tests** (27 nuevos) - mutation test: subir `ROW_H` y bajar `HEALTHY_UPTIME_PCT` hacen fallar sus tests. Con **jsPDF real** en el navegador: 1 sola pagina. Los botones se probaron con clic real en `/dev/matriz-turnos`: disparan `resumen-periodo_fixture.png`. **NO verificado**: la carga de pausas desde Firestore, que necesita sesion.
- Estado: EN REVISION - PR abierto.
- Sigue: que Orel baje el comparativo de agosto real y confirme que se entiende.

## 2026-08-05 - claude - Boton del resumen ejecutivo (PNG) en la vista de turno

- Cierra el enganche que quedaba de los formatos A y B: el PNG solo existia en el banco de pruebas. Ahora hay un boton propio junto al de PDF en la barra del detalle de turno.
- Usa el MISMO modelo que la pagina 1 del PDF (`buildExecutiveSummary`), asi que ambos cuentan lo mismo del turno. A diferencia del PDF **no necesita el grafico de ECharts**: se dibuja entero en canvas, asi que no hay que esperar a que ninguna pestana renderice — el PDF si tiene ese sondeo desde que el detalle paso a pestanas (#361).
- La ventana del turno sale de `shiftWindow` (la real de Shoplogix) con fallback al `startAt/endAt` del Excel. `shiftWindow` trae ISO strings y el resumen espera `Date`: helper `toDateOrNull` para no repetir la conversion.
- El nombre del archivo usa `displayShiftName`, asi que sale `resumen-turno_2026-08-03_Turno-1.png` y no "Turno 1 Lunes" con espacios.
- Verificacion: tsc limpio; el warning de eslint en esa pagina es PREEXISTENTE (verificado con stash). En el navegador se ejecuto la **replica exacta del handler** con los modulos reales: `Turno 1 Lunes` -> titulo "Turno 1", veredicto "Baader 2 no produjo un solo ciclo", KPI de disponibilidad 39% desde `lineAvailability`, canvas 2480x1930 dibujado. **NO se vio el boton en pantalla**: la vista de turno pide sesion.
- Estado: EN REVISION - PR abierto.
- Sigue: que Orel confirme el boton y el PNG resultante. Queda el **formato C** (comparativo de periodo), que necesita decidir que periodo compara por defecto.

## 2026-08-05 - claude - PDF de turno con el resumen ejecutivo como pagina 1 (formato B)

- Cierra el formato B del mockup. El PDF abria con el timeline minuto a minuto: habia que leer tres paginas para saber si el turno estuvo bien o mal. Ahora la pagina 1 es el resumen ejecutivo (mismo modelo que el PNG del #359) y el detalle arranca en hoja nueva.
- **graderExecutivePdfPage.ts** - renderiza el ExecutiveSummary en jsPDF. Comparte modelo con el PNG a proposito: si el PNG dice que el turno se perdio por la Baader 2, el PDF no puede decir otra cosa. Se tipa contra una interfaz PdfDoc minima (solo lo que se usa) en vez de contra jsPDF entero.
- El resumen se arma DENTRO de exportTurnToPDF con lo que ya recibia (summary + pauses + upstreamSnapshot): computeMaintenanceReliability se llama ahi, asi que **no hubo que tocar el llamador**. Se agregaron shiftStart/shiftEnd opcionales para la ventana real.
- **Secciones vacias**: las 4-7 ya tenian guardas. La que faltaba era la tabla de KPIs, que con totalPieces=0 imprimia "0 pz / 0,00% P0" - eso se lee como "no hubo piezas malas" cuando en realidad NO SE MIDIO. Ahora sin Excel dice "Datos del Grader: sin Excel cargado".
- **Rompi los tests existentes de graderTurnToPDF** (16): su mock de jsPDF no tenia setLineWidth/setFillColor/rect/splitTextToSize, que la pagina ejecutiva si usa. Arreglado el mock - un mock que no refleja la API usada da verde falso.
- Verificacion: tsc y eslint limpios; **556 tests** en la suite grader (7 nuevos de la pagina PDF, con doble de jsPDF que registra lo dibujado). **Comprobado que los tests pueden fallar**: rompiendo contentW cae el de "nada se sale del ancho". Con jsPDF REAL en el navegador: la pagina ejecutiva termina en y=203,9 de 297 mm (93 mm libres, 1 sola pagina, 10,7 kB) y el flujo completo corre sin errores de consola.
- Banco de pruebas: /dev/resumen-turno ahora tiene "Descargar PDF completo" ademas del PNG.
- Estado: EN REVISION - PR abierto.
- Sigue: **formato C** (comparativo de periodo) - necesita decidir que periodo compara por defecto. Falta enganchar el boton del PNG en la vista de turno real (el PDF ya usa el boton existente).

## 2026-08-04 - claude - Resumen ejecutivo del turno (PNG) - formato A del mockup

- La exportacion anterior apilaba todo (timeline, KPIs, pausas, gates, causas, upstream) sin jerarquia ni conclusion: sirve de registro tecnico, no de entregable. Mockup con 3 formatos aprobado por Orel; se construye el A (ejecutivo) y despues el B (PDF completo con este como pagina 1).
- **graderExecutiveSummary.ts** - logica PURA que responde 4 preguntas EN ORDEN: como fue (verdict), por que (cause+machines), que hizo Mantencion (maintenance), que se necesita (ask). Los dos renderers consumen el mismo modelo, asi que PNG y PDF no pueden contar historias distintas del mismo turno.
- Decisiones de redaccion que importan: el veredicto NOMBRA la maquina parada (no solo "turno malo"); los KPIs traen su contexto ("39% de 7 h 09 de turno" en vez de "39%"); MTTR bajo se marca OK - es el unico KPI donde menos es mejor, y sin eso un turno malo con buena respuesta se lee como todo malo; sin Excel del Grader lo DICE en vez de imprimir ceros que se leen como "no hubo".
- **Bug que cazo un test**: el lossDriver no tenia opcion "ninguna" y caia a 'ritmo' por defecto, asi que un turno sano al 95% afirmaba haber corrido bajo el objetivo. Un reporte que inventa una perdida inexistente es peor que uno que no dice nada. Se agrego 'ninguna' + umbrales explicitos.
- **graderExecutiveSummaryPng.ts** - canvas nativo, NO html2canvas: el DOM real depende del tema, del CSS que soporte el parser y de que el nodo este visible; para algo que se manda a gerencia es demasiada superficie de falla. Dibujo determinista, siempre en claro (se imprime).
- **pages/dev/ResumenTurnoDevPage** (solo dev, /dev/resumen-turno): dibuja el PNG real con 3 turnos conocidos, sin login. El entregable hay que MIRARLO antes de que salga.
- Verificacion: tsc y eslint limpios; 15 tests con el turno REAL del 3-ago (Baader 2 en cero). En el navegador: canvas 2480x2094 dibujado, veredicto y pedido correctos, y barrido de pixeles del margen - la unica tinta cerca del borde son los bordes de los recuadros con su antialiasing (3 franjas, a 4-7 px), no texto desbordado.
- Estado: EN REVISION - PR abierto.
- Sigue: **formato B** (PDF con este resumen como pagina 1 y el detalle detras) y despues el C (comparativo de periodo, que necesita decidir que periodo compara). Falta enganchar el boton en la vista de turno real.

## 2026-08-04 - claude - Leyenda del grafico de ritmo: dejaba de estar tapada por las lineas

- Orel: "los puntos de baader 1... baader 2... quedan ocultos". Causa exacta en `ProductionRateLineEC`: `legend.top: 0` con `grid.top: 6` — ECharts NO reserva el alto de la leyenda solo, asi que la leyenda se dibujaba ENCIMA del area del grafico y las lineas (incluidas las punteadas de Promedio y Objetivo) pasaban por detras del texto, que se leia tachado. Con un canvas de 120 px el solape era total.
- Hecho: `grid.top` 6 → 22 (reserva la banda de la leyenda), alto del contenedor 120 → 142 para devolverle al plot lo que la leyenda ahora ocupa, texto de leyenda 9 → 10 px y de `#64748b` a `#94a3b8` (es la clave de lectura del grafico, no chrome secundario), `itemGap: 12`.
- Geometria verificable sin navegador: area de datos 114 px → 120 px. El grafico NO se achica — gana 6 px Y deja de estar tapado.
- Revisado si el patron se repetia: `UpstreamMachinesPanel` ya tenia `grid.top: 30` con `legend.top: 0` (correcto) y `StateTimelineEC` no tiene leyenda. El bug era solo de este componente.
- Archivos: `components/grader/ProductionRateLineEC.tsx`.
- Verificacion: tsc limpio; los 6 warnings de eslint son PREEXISTENTES (verificado con stash: 6 con y sin el cambio). NO verificado visualmente: el grafico vive en el detalle de turno, que pide sesion.
- Estado: EN REVISION — PR abierto.
- Sigue: que Orel confirme que ya se leen. Pendiente mayor: exportacion PNG/PDF del analisis de turno (resumen ejecutivo + 2 formatos de gerencia).

## 2026-08-03 - claude - La card de cuota del turno se ve siempre

- Orel: "recuerdo q antes podiamos asignarle a cada turno la cuota... ahora no veo la opcion". No era una regresion: `ShiftQuotaCard` seguia montada en el detalle del turno, pero hacia `return null` cuando NO habia cuota definida Y el usuario no tenia permiso (`allowEdit={isAdmin || isSupervisor}`). Resultado practico: la funcion entera parecia no existir — nadie sabia que habia cuota por turno.
- Hecho: sin cuota la card SIEMPRE se renderiza. Con permiso, el CTA "Definir cuota" de siempre. Sin permiso, el mismo estado + "La define un supervisor" — se dice que falta y quien puede hacerlo, en vez de ofrecer un boton que seria un callejon sin salida.
- Regla que deja el caso: **un `return null` por permisos esconde la FUNCIONALIDAD, no solo el control**. Si el usuario no puede actuar, mostrar el estado y quien puede.
- Archivos: `components/grader/ShiftQuotaCard.tsx` (+ doc de cabecera, que describia el comportamiento viejo), `components/grader/__tests__/ShiftQuotaCard.visibility.test.tsx` (nuevo).
- Verificacion: tsc y eslint limpios; 4 tests que renderizan el componente real. **Comprobado que los tests pueden fallar**: restaurando el `return null` caen 2 de 4. NO verificado en la app viva — el detalle de turno pide sesion y la del preview se perdio al reiniciar el server.
- Estado: EN REVISION — PR abierto.
- Sigue: que Orel confirme que ahora la ve. Pendientes de la sesion: exportacion PNG/PDF del analisis de turno (resumen ejecutivo + 2 formatos de gerencia) y leyenda ilegible del grafico de Baaders.

## 2026-08-03 - claude - Afinado de la matriz de turnos: 4 fixes de uso real

- Orel probo la vista en prod y reporto 4 cosas. Todas verificadas en el navegador, no solo compiladas.
- **"Ver turno" no hacia nada** (bug real): navegaba a `/analisis-grader?date=…&shift=…&autoload=1`, pero ya estabamos EN esa ruta → React Router no remontaba nada. Existe una ruta CANONICA de detalle, `/analisis-grader/turno/:dateKey__:shiftId`, que es a donde apunta ahora. Verificado: navega a `/analisis-grader/turno/2026-08-03__Turno%201%20Lunes`.
- **"Turno 1 Lunes"**: Shoplogix pega el dia de la semana a algunos shiftId. El dia ya se ve en la columna de la matriz, asi que repetirlo confunde ("¿por que Lunes? quitalo"). Nuevo `displayShiftName()` quita SOLO el sufijo de dia; el shiftId crudo se conserva intacto (es la clave de Firestore y lo que se manda a la ruta de detalle). Tambien en el aria-label, que decia una cosa distinta a la pantalla.
- **Vista Lista retirada** ("no la entiendo... mejor quitemosla y solo con la vista matriz"). Se borro el componente y el toggle. En pantalla angosta la matriz hace scroll horizontal — se ve menos mes, pero lo que se ve es cierto.
- **Salto de layout al seleccionar un turno**: el panel de abajo pasaba de una linea de placeholder a una fila de datos (que ademas envuelve a 2 en pantallas medianas) y la pagina daba un tironazo. Alto reservado con `min-h`. Medido en el navegador: delta 0 en el panel, en `scrollHeight` y en la posicion de las celdas.
- Archivos: `services/grader/graderShiftDisplay.ts` (+`displayShiftName`), `components/grader/GraderShiftPeriodMatrix.tsx`, `GraderShiftPeriodView.tsx`, borrado `GraderShiftPeriodList.tsx`, `pages/AnalisisGrader/AnalisisGraderWizardPage.tsx`.
- Verificacion: tsc y eslint limpios; 534 tests verdes (4 nuevos de `displayShiftName`, incluido "solo el SUFIJO" y "nunca devuelve vacio"); los 4 fixes comprobados en el navegador con datos reales.
- Estado: EN REVISION — PR abierto.
- Sigue: Orel pidio mejorar la exportacion PNG/PDF del analisis de turno (resumen ejecutivo + 2 formatos tipicos de gerencia) — trabajo aparte, no entra aca.

## 2026-08-03 - claude - Retirado GraderHistoricalCalendar (5.756 lineas) del bundle

- Cierra el pendiente que dejo #349: el calendario ya no se montaba en el Wizard, pero seguia entrando al bundle por imports estaticos. Ahora se borro el archivo.
- Hallazgo al revisar antes de borrar: `AnalisisGraderUploadPage` SI lo montaba (`<GraderHistoricalCalendar />`, linea 446), pero en una rama inalcanzable — el Wizard es su unico consumidor y siempre pasa `compact`, que retorna antes en la linea 386. Codigo muerto en runtime, peso vivo en el bundle.
- Lo que exportaba y habia que mudar antes de borrar: `fmtSecPanoramic` y el tipo `SlxMonthlyStats` (los usan `GraderMonthlyStatsPanel` y el Wizard) → pasan a `graderPeriodMonthlyStats.ts`, su nuevo dueno, con `SlxMonthlyStats` como alias del tipo nuevo para no tocar consumidores. Se agregaron los contadores `t1/t2/t3ShiftsWithData` que el panel usa y que mi tipo no tenia.
- Efecto colateral detectado y cubierto: el calendario era el UNICO emisor de `graderSelectionStore.setSelectedHistorical`, que consume `AnalisisGraderGatesConfigPage` para calibrar el peso medio. Sin reemplazo esa pagina caia siempre a su fallback (summary mas reciente de 60 dias) en silencio → ahora lo emite `GraderShiftPeriodContainer` al seleccionar un turno.
- Medicion: el chunk `AnalisisGraderWizardPage` pasa de **481 kB** (lo que sirve prod hoy, medido por curl al bundle publicado) a **344 kB** — **-137 kB, -28%**.
- Archivos: borrado `components/grader/GraderHistoricalCalendar.tsx`; tocados `services/grader/graderPeriodMonthlyStats.ts`, `components/grader/{GraderMonthlyStatsPanel,GraderShiftPeriodContainer}.tsx`, `pages/AnalisisGrader/{AnalisisGraderUploadPage,AnalisisGraderWizardPage}.tsx`.
- Verificacion: tsc y eslint limpios (el warning de `lineId` en UploadPage es PREEXISTENTE — verificado con stash contra main); 530 tests verdes en la suite grader; `vite build` OK.
- Estado: EN REVISION — PR abierto.
- Sigue: uso real en prod. `graderSelectionStore` quedo con un solo emisor nuevo — si la matriz cambia de forma, revisar que GatesConfigPage siga recibiendo la seleccion.

## 2026-08-03 - claude - Matriz de turnos reemplaza al calendario mensual del Analisis Grader

- Problema raiz (planteado por Orel): el calendario usa el DIA como contenedor, asi que un turno que cruza medianoche se partia en dos fragmentos (`salida` + `madrugada`), con 4 `CardKind` solo para tapar el corte. El contenedor pasa a ser el TURNO: una fila por shiftId presente, una columna por dia, cada turno UNA celda anclada al dia en que arranca. Toggle Matriz/Lista (nunca ambas; bajo 700 px fuerza Lista), tooltip flotante al hover, panel del turno seleccionado con boton "Ver turno" (mismo destino que el "Cargar" del calendario), navegacion de mes y stats mensuales portadas (`computePeriodMonthlyStats`).
- **Unscheduled**: investigado contra Firestore crudo — NO es un turno, es la ventana 00:00-24:00 donde Shoplogix reporta lo que cae fuera de las ventanas configuradas, pero su subcoleccion trae `intervals[]` con timestamps. Decision de Orel (reafirmada 3 veces): CERO ciclos sin asignar → se atribuyen al turno mas cercano (mismo dia primero; si el dia no tiene turnos, cruza de dia). Auditable en `attributedCycles` → "(+N)" ambar en tooltip/panel; chip informativo "fuera de ventana N %". Verificado en vivo: la madrugada huerfana del 02-ago (293 cic) fue al Turno 1 Lunes del 03 (3.720+293=4.013 exacto). Diagnostico completo y correcciones de Shoplogix en `ARIA_MANTENIMIENTO_PLANTA/docs/INFORME_UNSCHEDULED_SHOPLOGIX.md` (hallazgo gordo: Yal dejo ~126k ciclos fuera de ventana en mayo).
- Datos: 2 queries/mes (padres con agregados + summaries) + 1 query por bloque Unscheduled (2-3/mes). Un padre = una entrada → el doble conteo por alias (`Turno dia`→`Turno 2`) es imposible por construccion, no mitigado. Rampa secuencial de 4 pasos derivada del azul de marca en OKLCH y validada por script (tokens `--shift-ramp-*` en index.css, claro y oscuro por separado).
- Bug que solo aparecio validando contra prod: `2026-07-31_Turno 1` de Chonchi tiene dateKey 31-jul pero su produccion real fue 01:34-05:11 del 1-ago — medir el cruce start-vs-end no lo detectaba; ahora los offsets se miden contra el dia de anclaje (`startDayOffset`/`endDayOffset`, marcador ⁺¹ siempre). Ademas: terminar 00:00 en punto NO es cruce (4 de 5 "cruces" de Yal-julio eran eso).
- Archivos: `services/grader/{graderShiftPeriod,graderShiftMatrixKpi,graderPeriodMonthlyStats,graderUnscheduledAttribution,graderUnscheduledLoad}.ts`, `hooks/useGraderShiftPeriod.ts`, `components/grader/GraderShiftPeriod{Matrix,List,View,Container}.tsx`, `pages/dev/MatrizTurnosDevPage.tsx` (banco de pruebas con fixture real, solo dev), `__tests__/` (4 suites + fixture `shiftPeriod.real.json` con datos de prod), `scripts/{validate-shift-period,export-shift-period-fixture}.js` (solo lectura), `App.tsx`, `index.css`, `AnalisisGraderWizardPage.tsx` (calendario retirado).
- Verificacion: tsc y eslint limpios; 56 tests de la vista (21 casos escritos + regresion contra 165 turnos reales exportados de Firestore, con test de conservacion: ni un ciclo perdido ni duplicado); grader suite completa 462 verdes (falla preexistente de `graderShoplogixWindows` por .env, tambien en main); verificado EN VIVO en la pagina real con sesion de Orel (tooltip a 8 px de la celda, atribucion 3.720+293, fila "Sin turno" desaparecida).
- Estado: EN REVISION — PR abierto.
- Sigue: correcciones de configuracion en Shoplogix segun el informe (ventana T2 de Yal, madrugadas de Chonchi); despues de corregir, `backfill-shoplogix-history.js` para limpiar en origen. `SlxMonthlyStats.perMachineMonth.maintMacro/Micro` depende de que los padres traigan `stateAggregates` (los viejos no). Retirar `GraderHistoricalCalendar` del bundle cuando la matriz se asiente (hoy quedo sin montar pero el archivo sigue).

## 2026-08-02 - claude - Primer turno real de Filete revisado + 2 textos que asumian eviscerado

- Revision del turno del sabado 01-08 (el primero real de Filete) con datos de Firestore y la vista en el navegador. Resultado del TURNO: 180 pz en "Turno Dia" + 60 en Unscheduled = 240 de las 5.000 planificadas (4%), 22 min de uptime sobre una ventana efectiva de 12:57→14:45, velocidad real maxima 7,2 pz/min contra un objetivo de 20, y 16 paros (11 micro). Fue arranque, no produccion.
- Dato importante para el modelo: **Shoplogix YA acota el turno de Filete** (08:00→14:45, no las 24 h de la semana pasada), asi que el "Turno Dia" dejo de ser un bucket de 24 h. El encuadre automatico igual se activa porque la operacion real ocupa el 26% del turno.
- **`scrapReasons` volvio VACIO** con produccion real → se descarta la Calidad automatica en Filete. Su OEE se queda en A×R (ya rotulado).
- 0 de 16 paros trajeron causa del sensor → confirma que el panel de causas dictadas es la unica via. Nadie lo uso todavia (0 anotaciones).
- Bugs de copy encontrados al revisar (mismo patron de siempre: texto que asume eviscerado): (1) `shortMachineName` renombraba a "Baader N" cualquier maquina terminada en numero, asi que la Baader 200 —que Shoplogix llama "Linea 1"— aparecia como "Baader 1" en la cascada de perdidas, confundiendola con las 142; ahora solo traduce evisceradoras y el resto se muestra tal cual. (2) `DayTimeSummaryBar` decia "las 3 Baader" tambien en Filete; ahora el texto sale de las maquinas de la linea ("la Baader 200" / "las 3 Baader 142").
- Nota: `endBriefSentAt` se estampa en el claim ANTES de evaluar el umbral de piezas, asi que marca "procesado", no "enviado". El turno de 180 pz quedo marcado pero NO se mando brief (180 < 200) — comportamiento correcto, nombre de campo enganoso.
- Archivos: `apps/pwa/src/services/grader/{graderMachineNames.ts,__tests__/graderMachineNames.test.ts}`, `apps/pwa/src/components/grader/DayTimeSummaryBar.tsx`.
- Verificacion: 864 tests verdes (2 nuevos de regresion), tsc y eslint limpios. En el navegador con el turno real: Filete dice "la Baader 200" y "Linea 1"; Yal sigue diciendo "las 3 Baader 142" y "Baader 1/2/3".
- Estado: EN REVISION — PR abierto.
- Sigue: cuando haya un turno de verdad (~5.000 pz) revisar el grafico de barras con la maquina corriendo, y que alguien dicte la primera causa en planta.

## 2026-08-01 - claude - El encuadre del eje ahora funciona en TODAS las lineas (y en turno en curso)

- Orel: "ahora si funciona en filete... podemos ponerlo en las demas?". El chip YA aparecia en Yal y Chonchi, pero ahi no hacia nada: el estado era un booleano "ver turno completo" y el encuadre pasaba SIEMPRE por la heuristica, que en esas lineas dice que no hace falta acotar (su turno si esta acotado). O sea el boton era de una sola via.
- Hecho: el estado pasa a override de 3 valores — `auto` (heuristica) / `produccion` / `turno` — y los explicitos MANDAN. Regla extraida a `resolveFraming` (pura, testeada) y usada por el TurnoPage.
- Verificado con datos reales en las 3 lineas, leyendo `data-axis-*` (el rango EFECTIVO, no la etiqueta): Yal 15:15–23:00 → 15:30–22:05 · Chonchi arranca acotado 09:00–12:50 · Filete 09:45–16:25 ↔ 08:00–08:00. Y **en el turno EN CURSO de Yal** (17.872 ciclos, sync hace 5 min): 15:15–23:16 ↔ 16:00–23:19, con el borde derecho avanzando con la ultima pieza.
- Bug adicional encontrado en el camino: el chip mostraba el rango del PROP y el eje dibujaba otro (en turno en curso decia "14:45–00:00" mientras el eje era 15:15–23:09, los bounds del snapshot que crecen con cada sync). Ahora la etiqueta sale de la ventana RESUELTA — un chip que anuncia un rango distinto al dibujado es peor que no tener chip.
- Archivos: `apps/pwa/src/components/grader/{UpstreamMachinesPanel.tsx,shiftTimelineHelpers.ts,__tests__/resolvePanelWindow.test.ts}`, `apps/pwa/src/pages/AnalisisGrader/AnalisisGraderTurnoPage.tsx`.
- Verificacion: 789 tests verdes (4 nuevos de `resolveFraming`, incluido "el usuario puede forzar el encuadre donde la heuristica dice que no"), tsc y eslint limpios.
- Estado: EN REVISION — PR abierto.
- Sigue: hoy sabado arranca el proceso normal de Filete (5.000 pz/turno, 2 turnos).
## 2026-08-01 - claude - Barrido de worktrees y ramas locales: 141 ramas -> 11, 6 worktrees -> 3 (+ PR #324)

- Contexto: el repo habia acumulado 141 ramas locales y 6 worktrees de trabajo ya cerrado. Se barrio en tandas, verificando cada una antes de borrar. Ningun cambio de codigo salvo el PR #324.
- **Criterio que se uso (y por que el obvio NO sirve):** "el PR esta MERGED" es insuficiente. Como el repo mergea con SQUASH, los commits de la rama no quedan como ancestros de main (`git merge-base --is-ancestor` da falso, y `git cherry` marca todo como ausente por patch-id distinto). El criterio correcto resulto ser: comparar el **SHA local de la rama contra `headRefOid` del PR** (la punta que tenia al mergear, se saca en UNA llamada: `gh pr list --state merged --json headRefName,headRefOid`). Si coinciden, todo su trabajo entro. Si el local es distinto, la rama AVANZO despues del merge y hay commits sin publicar.
- **Ese criterio evito borrar trabajo en curso:** 4 ramas habian avanzado tras su merge, entre ellas `fix/b142-diagnosis-overrides`, cuyo commit posterior (`3fa043be`, el fix que hace que la 142 lea los diagnosticos del admin) todavia no estaba en main. Con el criterio ingenuo se habria borrado el trabajo en curso de otra sesion.
- Hecho: (1) 121 ramas con PR mergeado y punta identica a la mergeada; (2) 11 de las 12 que NO tenian PR — 9 del HMI Grader (main tiene `hmi-grader-embed.html` en 2578 lineas vs 1071-2360 de las ramas; sus lineas propias son andamiaje de fases intermedias), `feat/levantamiento-tableros-v1` (0 commits propios) y `feat/analisis-confiabilidad-mantencion` (sus simbolos `MachineKPI`/`PlantKPIs`/`computeMachineKPI`/`aggregateShifts` SI estan en main, hubo refactor a `plantKpiCompute.ts`); (3) worktrees `wt-filete`, `wt-brief-timescale`, `wt-powerbi-button`, `wt-shoplogix-freeze`.
- **La rama 12 no se borro a ciegas:** `fix/grader-shift-window-tz` (sin PR) tenia 3 casos de test ausentes en main. Se verificaron contra main, PASABAN, y cubrian logica viva (`graderShiftStatus.ts:123`, fallback a la ventana del dia de produccion 08:00→08:00 cuando el shiftId no esta en el schedule). Los tests que main ya tenia para ese branch solo verificaban `closed` con "margen amplio para no depender del huso del runner": nunca fijaban la ventana ni el estado `live`. Se rescataron en el **PR #324 (MERGED)** y recien ahi se borro la rama.
- Gotchas anotados para la proxima: (a) `git worktree remove` deja atras los archivos no versionados (cache de Vite) y falla si un dev server tiene la carpeta tomada — hubo que matar un Vite en :5173 que seguia vivo 12 h despues del merge; (b) para correr los tests en un worktree hace falta `.env.local` (no esta en git) o 7 archivos fallan al importar con `auth/invalid-api-key` — parece un fallo del cambio y no lo es; (c) si se enlaza `node_modules` al worktree con un junction, **quitar el junction ANTES** del `rm -rf` o se borra el `node_modules` real a traves del enlace.
- Archivos: solo `.ai/WORKLOG.md`. El PR #324 toco `apps/pwa/src/services/grader/__tests__/graderShiftStatus.test.ts` (+32/-0).
- Verificacion: PR #324 con tsc y eslint limpios, 788 tests verdes (5 skipped), CI `build pass`. Estado final: 11 ramas locales (4 con trabajo sin publicar, el resto de worktrees activos) y 3 worktrees.
- Estado: HECHO. Sigue: quedan 4 ramas con trabajo nunca publicado que hay que mirar una por una — `chore/ai-coordination` (docs de cierre de Fase 5), `wip/ctd-oee-2026-06-29`, `feat/enzunchadora-tp6000-aprendizaje` y `feature/aprendizaje-baader142-refuerzo` (estas dos avanzaron tras su merge). No se tocaron.

## 2026-08-01 - claude - El boton de encuadre del eje no hacia nada (bug propio)

- Reporte de Orel: "no hace nada el boton". Tenia razon y el bug era mio.
- Causa raiz: el panel resuelve su ventana temporal con una prioridad — (1) zoom, (2) bounds del snapshot Shoplogix, (3) prop `shiftWindow`. El encuadre "solo con proceso" viaja por el PROP, o sea la fuente #3, asi que los bounds del snapshot (08:00→08:00, las 24 h de Filete) le ganaban siempre. El chip cambiaba de estado (lo alimenta el prop) y el eje seguia clavado.
- Por que no lo detecte antes: verifique el TEXTO del chip y el prop, no el eje que realmente dibuja el chart. Como ECharts pinta en canvas, no habia forma de leer el eje desde fuera → ahora el contenedor expone `data-axis-start/end` con el rango EFECTIVO, y con eso la verificacion es real (y automatizable).
- Fix: la prioridad se extrae a `resolvePanelWindow` (pura y testeada) con el encuadre explicito en el puesto 1b, sobre los bounds del snapshot. El panel la usa, asi que los tests protegen el codigo real y no una copia.
- Archivos: `apps/pwa/src/components/grader/{UpstreamMachinesPanel.tsx,shiftTimelineHelpers.ts,__tests__/resolvePanelWindow.test.ts (nuevo)}`.
- Verificacion: 785 tests verdes (5 nuevos de prioridad, incluido "con encuadre activo la ventana acotada GANA a los bounds del snapshot"), tsc y eslint limpios. En el navegador, leyendo `data-axis-*`: el eje pasa de 09:45–16:25 a 08:00–08:00 al togglear — antes se quedaba en 08:00–08:00 siempre.
- Estado: EN REVISION — PR abierto.
- Sigue: Orel confirma en pantalla. El sabado, Filete con 5.000 pz reales.

> **Compactado el 2026-07-30 y el 2026-08-13.** Las entradas anteriores al 2026-08-01 están
> resumidas en bloques temáticos al final de este archivo. El detalle completo de cada una vive
> en git (`git log -p .ai/WORKLOG.md`, y en los commits de cada PR) y en `.ai/backups/`.
> Los pendientes que seguían abiertos se consolidaron abajo — no se perdió ninguno.

---

# Historial resumido (anterior al 2026-08-01)

Bloques temáticos. Cada uno resume varias entradas; el detalle está en git
(y en `.ai/backups/WORKLOG-2026-08-13-pre-compactacion.md` para julio 19–30).

## 2026-07-29 → 2026-07-30 · Filete en vivo: conexión Shoplogix, gráficos pz/min y OEE de área

- **Filete conectado a Shoplogix** (PR #286): nuevo `plantSlug` `filete` con la única máquina
  instrumentada del área (Baader 200 de Línea 1); sin Grader aguas abajo → OEE queda en A·P.
  Copy parametrizado por `machineKind`/`kpiScopeNote` de `plantLines.ts`. Primer dato real:
  2026-07-28 "Turno Dia" = 59 ciclos. **Gotcha**: Filete nombra su turno **"Turno Dia"** (sin
  tilde), distinto de Chonchi (T1/T2) y Yal (T1/T2/T3); el calendario y el resumen del mes
  dejaron de comparar contra listas fijas y ahora descubren los turnos reales desde los docs.
- **Causa de los paros del sensor** (dictado por voz): las causas van a `paros` con
  `origen:'shoplogix'` y doc id determinístico `sensorStopKey(...)` (re-anotar corrige, no
  duplica). **Gotcha doble conteo**: `LineOeeCard` filtra `origen !== 'shoplogix'` porque esos
  minutos ya los descuenta la Disponibilidad del sensor. El sync además guarda lo que antes se
  descartaba: `targetRate` por intervalo, `uptimeCycles`/`scheduledCycles`, `scrapByReason`.
- **Gráfico pz/min real vs objetivo**: objetivo NOMINAL = máximo por bucket (el primer bucket
  con expected>0 es parcial y miente: daba 5 cuando el real era 20). Separa "no da el ritmo"
  de "estuvo parada".
- **Encuadre y encoding del gráfico**: eje acotado a la operación real
  (`effectiveProductionWindow`/`shouldFrameOnProduction`) a nivel de PANEL porque el Gantt y el
  gráfico comparten eje; barras por tramo con huecos donde no hay dato; agrupación a 15 min si
  el rango >4 h. `rateChartMode(machineCount)`: **1 máquina → barras, 2+ → líneas** (3 series
  en barras son una reja ilegible). **Gotcha ECharts**: `setOption` MERGEA por defecto — para
  apagar una serie no se saca del array (no la borra), se dejan sus DATOS en null
  (`gapSeriesData`) y el `stack` queda fijo.
- **OEE del ÁREA** (`areaOeeCompute.ts`): máquina instrumentada + etapas sin sensor (la GEA).
  **Regla anti doble conteo**: un paro de etapa solo suma tiempo si NO detuvo la máquina (si la
  detuvo ya está en el downtime del sensor y va como causa). Sin Grader, el OEE se muestra como
  A×R con chip rotulado, no fingiendo calidad 100%.
- **Target de planificación de Filete**: 5.000 pz/turno en `shiftTargetPieces` (`plantLines.ts`)
  con espejo `PLANT_SHIFT_TARGET_PIECES` en functions; si llega target oficial del rollup, ese
  GANA. `machineShortLabel` sale del MODELO (B200/B142/HG/KN), no "Ev 1".
- **Alertas/brief de Filete**: `notifConfig.js` en 3 capas (DEFAULTS → overrides por planta →
  Firestore); `shiftEnd.minPieces` 200 en Filete (un lote de prueba de 59 pz disparaba brief).
  El brief muestra "Operación real: HH:MM → HH:MM" cuando la ventana del turno es ≥25% más ancha,
  y cruza paros del sensor sin causa anotada vía `sensorStopKey`.
- **Crones arreglados** (PR #292): `main` protegido (check "build" + `enforce_admins`) rechaza
  toda escritura directa — `Daily Sync` perdió el `schedule` (`version.ts` se sincroniza vía
  `prebuild` y `dev`), NanoBanana sube a la rama sin protección `nanobanana-assets`.
- **Enzunchadora TP-6000 poblada** (PR #296): 9/9 máquinas del Centro de Aprendizaje. El manual
  SÍ existía en OneDrive (la búsqueda vieja fallaba por buscar "N2" en vez de "TP-6000").
  `seed-quiz-maquinas.js` ganó `--only=<slug>` para no pisar quizzes editados desde admin.

## 2026-07-30 · Auditoría de contenido: 9 críticos + 43/43 medios cerrados (PRs #301–#320)

Workflow `verificar-contenido-fichas` (26 agentes) auditó las fichas contra los manuales fuente;
se cerró TODO: 9 críticos (PR #301, uno de seguridad: LOTO antes de activar flippers en Marel HG)
y 43/43 medios en 8 tandas (#305 Enzunchadora, #306 Marel HG, #308 Fishken, #310 Grader,
#312 Baader 142, #314 Detector de Metales, #317 Marel Filete, #320 Baader 200). Cada corrección
cita página del manual. Gotchas y decisiones que sobreviven al arco:

- **Criterio de fuentes**: choque planta vs OEM → se conserva el valor de planta como valor de la
  medida y la cota del OEM va como nota con página. Umbrales sin respaldo documental → se retiran
  o se etiquetan "criterio de planta" (no se inventan).
- **Baader 200 lee su contenido de Firestore** (`baader200-sections`, 23 docs) en producción; el
  `.ts` es solo fallback → toda corrección va a AMBOS, con snapshot previo y verificación de
  paridad por script.
- **Superficies duplicadas**: el verificador-web encontró repetidamente contenido corregido en el
  JSON pero viejo en tagline / Consulta rápida / quiz / `*Learning.ts` → al corregir una ficha,
  sincronizar TODAS sus superficies.
- **Identidades confirmadas en planta**: Detector de Metales es **Vistus** (no IQ4, manual
  `845_BA_Vistus`); el equipo de Filete es **M-Weigher WTR (GR8251)** con indicador M6410, NO una
  línea SmartLine — se eliminó hardware inexistente (descarga, brazos, lotes).
- **`learningContent/baader-142/diagnosis` NO se borró**: los 10 docs venían etiquetados como
  "muertos" pero al LEER el contenido antes de borrar resultó conocimiento de planta escrito a
  mano (ids `diag_<timestamp>_<random>` de `saveDiagnosis()`, datos que el seed no tiene: bomba
  SB 1100D0, E777 desglosado esporádico vs recurrente, agrupación por síntoma del operador).
  Decisión de Orel: enfoque overrides (rama `fix/b142-diagnosis-overrides`), no migrar-y-borrar.
  **Lección**: leer el contenido antes de borrar; ids de editor admin + datos ausentes del seed =
  contenido humano, no basura.
- **Marel HG sí tenía huérfanos peligrosos**: 2 procedimientos en Firestore que la app nunca
  despacha (el dispatch devuelve seed puro), uno era la versión PRE-LOTO de activar flippers →
  borrado REAL (no `_deleted:true`, esa convención es solo para tapar docs que el seed publica)
  + 6 imágenes duplicadas en Storage. Snapshots en `_snapshots/` antes de todo.
- **Hallazgos de contenido con impacto operativo**: mapeo X de "E 8 N X" de la B142 estaba
  invertido (1=SM1 Centraje, 2=SM2 Cuchilla, afecta E801–E865); E770–E775 solo existen con
  Upgrade Kit (CONDICIONAL, confirmar en planta); ±20 g del Grader es desviación estándar, no
  tolerancia; comandos de capacho/flipper del Grader eran rangos solapados (tipear 141 activaba
  el flipper 5 en vez del capacho).

## 2026-07-19 → 2026-07-26 · Power BI, fix congelamiento Shoplogix, sistema agéntico, cascada de pérdidas

- **PR #251 (URGENTE) — turnos EN CURSO se congelaban** tras la 1ª escritura: `isShiftAlreadyFrozen`
  comparaba `scheduledEnd` (wall-clock-as-UTC) contra `now` (UTC real) → `closedForMs` inflado +4 h
  → todo turno con una escritura se congelaba. Fix: convertir con `chileUtcOffsetHours()` antes del
  freeze check. Self-healing al desplegar. **Gotcha recurrente**: cualquier comparación de tiempos
  Shoplogix debe convertir wall-clock-as-UTC antes de mezclar con relojes reales.
- **Power BI**: export Grader (`fact_grader_turnos`/`p0_causas`/`calibres`) + fix `plantId`
  hardcodeado; botón admin `/admin/powerbi-export` con doc de control `powerbiExport/chonchi` y
  agente del PC (`agente_powerbi.py`, tarea programada c/15 min) que exporta CSVs y dispara el
  refresh del dataset (PRs #250, #252). Ciclo E2E verificado en Power BI Service.
- **Cascada de pérdidas + ventana efectiva** (fase 1 y 2): `syncDay` guarda
  `effectiveStart/effectiveEnd` en el doc padre; `lossBuckets.ts` clasifica causales por dueño
  (planificado/externo/mantención/sin-clasificar), calcado de los reasons reales de julio;
  "Cascada del mes" como pestaña default de la Vista panorámica (0 reads extra, desde
  `stateAggregates`). Motivo: `shiftRuntime` incluía colación en el denominador → uptime injusto.
- **`checkShiftReconciliation`** (CF, cron 30 min): re-verifica el turno +3 h y +24 h después del
  brief; si el total cambió >20 pz o >3% → alerta Telegram "🔄 Corrección Shoplogix" + badge en
  el calendario.
- **Sistema agéntico** (2026-07-26): 3 subagentes globales model=sonnet (`verificador-web`,
  `implementador-patron`, `cerrador-pr`), skill `mockup-antes-de-construir`,
  `scripts/firestore-snapshot.js` (list/dump/restore, dry-run por defecto) como red de seguridad
  antes de escrituras masivas, y el workflow `verificar-contenido-fichas.js` (el que después
  produjo la auditoría de arriba).
- **Componentes del equipo con fotos reales** (PRs #278–#283): 10 fotos con hotspots numerados
  clicables + zoom/paneo, migradas a Firestore con editor admin clic-para-agregar. **Gotcha**:
  `object-fit:cover` con altura fija recortaba la foto y desposicionaba los hotspots → usar
  `aspectRatio` real de cada imagen.
- **Calendario Grader**: tooltips tap+hover (los `title=` nativos son invisibles en móvil),
  footer "Σ 24h" por celda sin doble conteo.

### Sueltos que quedaron abiertos al compactar (2026-08-13)

- Marel Filete: 5 secciones de manual en Firestore (`learningContent/marel-filete/manual`, ids
  100–104) mezclan contenido WTR con SmartLine viejo — requiere decisión; la pregunta 1 del quiz
  en producción sigue vieja hasta re-sembrar.
- B142: al mergear `fix/b142-diagnosis-overrides`, revisar solapes de los 10 docs con el seed;
  confirmar en planta si esta 142 tiene el Upgrade Kit (E770–E775).
- Grader: capacho 3 transcrito "130" tal cual (probable errata) — verificar en máquina.
- Extender "Componentes del equipo" (fotos + hotspots) a las otras 8 máquinas.

## 2026-07-04 → 2026-07-18 · ARIA, seguridad, turnos y sync de Telegram

- **ARIA Telegram nació casi completa en una sola tanda (04-jul)**: chat natural con voz, 6 fuentes
  de datos nuevas, brief matinal 7AM + a demanda, crear incidencias con confirmación, whitelist +
  memoria + cerrar incidencias + alertas DM, voz de respuesta + visión + gráficos, respuestas
  formateadas (markdown→HTML de Telegram), "ARIA aprende" (hechos globales + lagunas + fallback de
  modelos) y ARIA como pivote de la app (mapa de módulos con conciencia de rol).
- **ARIA + repuestos por foto (06 al 07-jul)**: visión con OCR, adjuntar foto a un repuesto del
  maestro, crear/vincular repuesto desde foto (match SAP + criterio LLM), modo lote de fotos, y
  memoria de contexto para entender "ese mismo repuesto".
- **ARIA chat de la PWA (08-jul)**: primera capacidad de ESCRITURA — crear/vincular repuesto y
  editar código de fabricante desde el chat in-app.
- **Modelos**: actualización por deprecaciones de Groq + un 3er proveedor de respaldo.
- **Seguridad**: cierre de lecturas anónimas (PR #146) y proveedor anónimo apagado; parche de
  echarts por CVE-2026-45249 (XSS).
- **Turnos**: Shoplogix pasa a ser la fuente de verdad de horarios (PWA + manejo de DST en functions).
- **Repuestos**: "Solicitar a bodega" cierra el círculo (entregar descuenta stock real) y los nombres
  comunes se editan desde el panel de detalle.
- **PWA**: recuperación robusta ante "Failed to fetch dynamically imported module" post-deploy, y fix
  del visor de imágenes que no se podía cerrar en móvil.
- **Sync Telegram→OneDrive**: controlado desde el panel admin (PWA ↔ agente del PC), con historial de
  corridas, multi-grupo y layout responsive.
- **Barrido autónomo (18-jul, Sonnet 5 en loop)**: 13 PRs de pendientes + diagnósticos + limpieza.

## 2026-06-17 → 2026-06-21 · Centro Técnico Documental, tableros y cierre de la normalización

- **CTD en 5 pasos**: expediente autosuficiente (#92+#93) → "programa vivo" (#94) → traer de Equipos
  y repasada de flujo (#95+#96) → gestión de activos v1 (#97) → órdenes de trabajo, Camino B (#98).
- **Tableros / Unifilares (NFPA 70B)**: levantamiento con Excel + formulario en la PWA, realineado de
  "módulo suelto" a parte del expediente del equipo, y reconciliación en PR #91.
- **Dependabot**: las 23 alertas resueltas (bumps + overrides).
- **Fase 5 de limpieza — CERRADA el 2026-06-20**: retirada de features legacy (`machines` /
  `plantAssets`) con sus scripts de borrado, barrido de código muerto, chatbot ARIA in-app apuntando
  al maestro unificado, y retiro de `/insumos` y de la pestaña Mapas. El borrado **se ejecutó**:
  `11-delete-legacy.js --write` borró 9.303 docs (backup en `backups/fase5-2026-06-20T17-25-56/`) y
  se verificó en vivo que `insumos`/`machines`/`plantAssets`/`repuestosBaader200`/`hierarchy/*/repuestos`
  quedaran en **0**, con maestro (7657) / bodega (2170) / hierarchy (702) intactos.
  Pendiente menor que quedó suelto: `EquipoPlacementTool` en `PlantaLeafletEditable.tsx` quedó inerte
  (su trigger se fue con el panel "Equipos SAP") → limpiar como código muerto junto con los campos
  `equipoToPlaceId` del store.
- **Repuestos**: pulido (ubicación en la fila, composición por clase), mejoras de sidebar/buscador/
  favoritos (#78), rediseño de las tarjetas KPI de stock, carga rápida de stock+ubicación, cotejo
  Excel↔app con import único a bodega, y foco SAP por defecto en la pestaña Áreas.
- **Deploy a producción** (#77).

## 2026-06-12 · Arranque

Normalización del maestro de repuestos (Fases 0-6) + rework de UI + coordinación multi-agente.
Desde acá el flujo pasó a ser estricto: **todo por rama + PR**.

---

# Pendientes que vienen de atrás

Estos seguían abiertos cuando se compactó el historial (2026-07-30):

- **Tablero piloto sin levantar**: CCM motor `720004608` / bomba `720004607` — falta cargar su placa
  real. Viene arrastrándose desde el 20-jun.
- **~45 equipos sin `tipo`** asignado en el CTD.
- **`useAppVersion.reload()` duplica a mano** la limpieza de caches y service workers → candidato a
  usar `clearCachesAndServiceWorkers()` en vez de repetir la lógica.
- Opcional: revisar si la alerta de secret-scanning #1 de GitHub se puede cerrar, ahora que la key
  quedó restringida.
- Opcional: botones Confirmar/Cancelar dedicados para repuestos en el chat ARIA de la PWA (hoy es
  solo texto plano) + soporte de fotos.

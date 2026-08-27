> **Compactado el 2026-08-18.** Se colapsó la narración PR-por-PR de las entradas del
> **2026-08-01 al 2026-08-10** en la sección «Historial resumido · 2026-08-01 → 2026-08-10» del
> final, conservando ÍNTEGROS los gotchas, las causas raíz, las decisiones con su porqué y las
> cifras medidas. **Las entradas del 2026-08-11 en adelante quedaron intactas.** El detalle
> completo de lo colapsado vive en git (`git log -p .ai/WORKLOG.md` y los commits de cada PR).
> Respaldo del archivo previo (223.820 B) en:
> `C:\Users\orelc\AppData\Local\Temp\claude\C--Users-orelc-OneDrive-ANTARFOOD\5ad9a95f-9b15-492a-a04c-1ceb7a6cc3ca\scratchpad\WORKLOG-backup-2026-08-18.md`

## 2026-08-26 · Fix: la tinta de marca `--brand-ink` reprobaba AA en oscuro Y en claro (PR #820)

El bloque `.dark` de la piel ACTUAL nunca redefinió `--brand-ink` y heredaba
el valor claro de `:root` (#2a6aa6): **2,75:1** sobre el card oscuro (#16242f)
y **2,40:1** sobre el tinte de Pill (`bg-primary/[0.15]`). Afectaba los 31 usos
de `text-brand-ink` — chip «hoy» del monitor público, links «ver ›» del
monitor, Pill `info`, admin del Centro de Aprendizaje. Corregido a **#71ade1**
(el mismo valor que ya usaba la piel Apple oscura): 6,60:1 y 5,66:1.

🔑 **El hallazgo real vino de instrumentar el check, no del bug reportado.** Al
agregar el par a `check-contrast.mjs` apareció que el valor CLARO tampoco
pasaba: el #2a6aa6 se había derivado contra el card BLANCO de la piel Apple,
pero en la piel actual el card es azulado (#e9f0f8) y el tinte puede apoyarse
en el fondo de la app (#d7e5f2), que es más oscuro → **3,71:1 en el peor caso**.
Es exactamente la lección ya pagada con las tintas categóricas: *el peor fondo
no es la tarjeta, es el fondo de la app*. Ahora `:root` usa el **primary-700
(#245a8c)**, que ya existía en el sistema: 4,72:1 en el peor caso y 6,27:1
sobre card. La piel Apple clara hereda el valor y su par sube de 4,50 a 5,91:1.

📌 **Un token heredado entre pieles necesita un par por PIEL, no uno global.**
`--brand-ink` se definió pensando en un solo fondo; sirve a dos pieles × dos
temas = 4 fondos distintos. Los 4 pares quedaron vigilados en
`scripts/check-contrast.mjs` (98 pares en total, única falla la pre-existente
conocida `border/background` oscuro).

Verificación: `tsc` limpio · `eslint --max-warnings 30` → 0 errores / 28
warnings · `audit-piel` OK (baseline −1, ya venía de main) · en preview, valor
COMPUTADO de `--brand-ink` en las 4 combinaciones tema×piel y color RENDERIZADO
de la Pill `info` en `/dev/piel?fixture=1` (claro `rgb(36,90,140)`, oscuro
`rgb(113,173,225)`). Sin screenshot: el panel de browser no componía frames en
esta sesión — la evidencia es por valores computados sobre elementos reales.

⚠️ **Fuera de alcance, detectado al levantar el worktree**: `pnpm install` en un
árbol limpio modifica `pnpm-lock.yaml` (agrega `jspdf`/`jspdf-autotable` a un
importer). Hay un `package.json` en main cuyo lockfile quedó desactualizado.
No se tocó en este PR.

## 2026-08-23 · Feat: plano de partes BAADER 142 (254 figuras) + puente eléctrico→pieza (PR #699)

Noveno plano del Centro de Aprendizaje: catálogo de piezas de fábrica
1420000821 ed. 2006 (254 figuras, 3.664 filas) navegable en modo
`despiece` (assets en Firebase Storage, `planos/baader-142-despiece/`),
con ficha de pieza y puente bidireccional B14↔pieza física en los planos
eléctricos 888/860 (`partes.json` nuevo + bloque "Pieza física" +
telemetría `planoUsos`). Verificado: tsc/eslint limpios, 8/8 checks de
navegador, auditoría de datos OK (254 hojas, 2.527 posiciones ancladas,
14 sensores B mapeados en 888 y 860, assets HTTP 200 en Storage).
**Pendiente:** el OCR fino por teselas sigue corriendo — al terminar se
re-suben los JSON de hojas con más anclas y se bumpea `vAssets`
(micro-PR data-only, sin código).

⚠️ Este archivo pasa los 173 KB — compactar en la próxima sesión que lo toque.

## 2026-08-18 · Feat: botón «actualizar ahora» + cronómetro de la próxima lectura del pulso (PR #641)

Pedido de Orel para no depender solo del ciclo automático: se agregó el
endpoint HTTP `publicMonitorRefrescar` (lee el contador vivo, 1 request
~1 s — no dispara el sync completo del día) y en el monitor público el
bloque del pulso ahora muestra cuántas piezas marca Shoplogix, a qué hora
las leyó, cuánto falta para la próxima lectura útil (2 min, no 1) y el
botón. Throttle de 20 s es del servidor (no del navegador); si el pulso
ya es fresco responde 200 con `yaFresco: true`. Se eliminó la duplicación
del sync que repetía el mismo dato viejo cada 5 min. Merge commit
`82325f92` en main (squash, PR #641). Deploy de Cloud Functions en
success — log confirma `functions[publicMonitorRefrescar(us-central1)]
Successful create operation` y `Deploy complete!` sin errores. Deploy PWA
en success, `version.json` sirve `buildSha: 82325f9` (coincide con el
merge commit). 1522 tests verdes antes del merge.
**Pendiente de verificación humana:** el endpoint y el bloque con
acumulado > 0 en producción con un turno vivo (el turno de la noche había
cerrado a las 05:00 mientras se construía esto).

⚠️ Este archivo pasa los 172 KB — compactar en la próxima sesión que lo toque.

## 2026-08-18 · Fix: el ritmo del pulso se mide sobre la ventana, no entre lecturas consecutivas (PR #639)

Las primeras lecturas reales en producción destaparon que el contador de
Shoplogix se refresca cada 2 minutos aunque se pregunte cada 1: el ritmo
calculado entre lecturas consecutivas alternaba 23, 0, 19, 0 pz/min — el
0 no era la línea parada, era el número sin cambiar todavía. Se cambió el
cálculo a ventana de las últimas 5 lecturas (piezas ganadas entre la más
vieja y la más nueva / minutos entre ellas); con esa misma serie da 10,5
pz/min real. 11 tests en verde, incluido uno con la serie exacta de
producción para que no se vuelva a romper. Merge commit `f69ca42c` en
main (squash, PR #639). Deploy de Cloud Functions en success. Verificado
en logs (`functions:log --only shoplogixPulseWakeup`): `[pulse][filete]
N pz` corriendo cada minuto sin error nuevo; el único error en logs sigue
siendo el ROPC de `yal` en backoff (conocido, ajeno a este cambio).

⚠️ Este archivo pasó los 170 KB — corresponde compactar de nuevo pronto.

## 2026-08-18 · Fix: `shoplogixPulseWakeup` reventaba en cada corrida por `admin.firestore()` sin definir (PR #637)

El scheduler del pulso (PR #635) desplegó con éxito pero fallaba una vez por
minuto con `Error: admin is not defined`: `functions/index.js` importa
`firebase-admin/firestore` por piezas (`getFirestore`, `FieldValue`,
`FieldPath`) y no tiene `admin` en scope, y la función nueva llamaba
`admin.firestore()`. Síntoma único: el campo `pulse` nunca aparecía en el
monitor. Lección: «deploy con éxito» no significa que la función corra —
hay que mirar los logs de la primera ejecución. Se agregaron 2 tests que
verifican que las piezas de scope existen y que `leerPulso` devuelve
`null` sin reventar si Shoplogix falla (9 tests del pulso en verde).
Merge commit `e9ede075` en main (squash). Deploy de Cloud Functions en
success. Verificado en logs (`functions:log --only shoplogixPulseWakeup`):
`[pulse][filete] N pz` en cada corrida, sin ningún `admin is not defined`.
Nota aparte, no corregida acá: hay un error de auth ROPC en backoff para
`yal` en los mismos logs (ya conocido, fuera de alcance de este fix).

## 2026-08-18 · Monitor: la marca de la regla es la velocidad que exige la meta, y el pulso lee el contador vivo cada minuto (PR #635)

Dos cambios. (1) La marca de la regla de ritmo deja de ser el set point y
pasa a ser el ritmo requerido para cumplir la meta del turno, convertido a
base «andando» con el uptime real (14,2 pz/min de reloj con 82 % de uptime
= 17,4 andando); con menos de 15 min producidos no se extrapola. Verificado
con turno real: relleno 40 % vs marca 96,5 %, estado pasó de «va lento» a
«muy por debajo». (2) Nuevo scheduler `shoplogixPulseWakeup` (cada 1 min)
que lee el acumulado instantáneo de Shoplogix (mismo endpoint del
whiteboard) sin tocar los buckets de 5 min ni el sync completo; con dos
lecturas seguidas publica el ritmo instantáneo. No reemplaza al sync (los
buckets siguen siendo la fuente de curva/paradas/historial); descarta
acumulados que bajan entre lecturas (cambio de turno) y solo escribe en
monitores vigentes no expirados. Falta la UI del pulso (cronómetro +
refrescar) para el próximo PR. 1522 tests verdes (7 nuevos del pulso en
backend), tsc/eslint limpios, `audit-piel.mjs` sin crecer deuda. Merge
commit `d1c55dfe` en main (squash), deploy confirmado en GitHub Pages
(`buildSha: d1c55df`) y deploy de Cloud Functions en success (creó
`shoplogixPulseWakeup(us-central1)` sin error).

## 2026-08-18 · Monitor: el ritmo dice en qué base está, y las tres cifras de la regla usan la misma (PR #633)

Orel, mirando la tarjeta con la línea andando: «¿este ritmo es de producción
o de reloj? pongamos cuál es para no confundir». La barra comparaba tres
cifras con dos denominadores: el número grande (piezas de los últimos 15 min
÷ 15 min) era **de reloj**, pero la marca del turno (`totalPieces /
producingMin`) y el techo (set point) eran **andando** — el relleno
subestimaba siempre porque el techo estaba en otra base, y la marca del
turno quedaba a la derecha del relleno por construcción, no porque la línea
fuera más lenta. Fix: el número grande pasa a ser el ritmo andando de los
últimos 15 min (descuenta tramos parados, contados por tramo igual que la
curva) y lleva su base escrita («pz/min andando»); el de reloj no se
esconde, aparece como línea aparte cuando difiere. Test que fija la
diferencia: con un paro en medio de la ventana, la misma serie da 12
andando contra 8 de reloj. Con el turno noche produciendo en vivo la
tarjeta pasó de «7,5 pz/min» a «9,6 pz/min andando», marca del turno 12,0 y
techo 18 — todo en la misma escala. 1518 tests verdes en 106 archivos,
tsc/eslint limpios, `audit-piel.mjs` sin crecer deuda. Merge commit
`acc75170` en main (squash), deploy confirmado en GitHub Pages (`buildSha:
acc7517`).

## 2026-08-17 · Monitor: el nombre del turno dejó de significar lo mismo — la comparación la elige la persona (PR #628)

Revierte el criterio del PR #626 de ayer mismo: filtrar el comparador por
nombre de turno resultó exactamente al revés de lo que sirve, porque Filete
movió su turno grande de «Turno Dia» a «Turno Noche L» (00:20–07:51, 4.398
pz) y dejó un «Turno Dia» residual de 4 h y 604 pz el 17-ago. Filtrando por
nombre, al turno chico se le ponía la vara del grande y al grande no le
quedaba nada con qué compararse. Fix: se ofrecen todos los turnos como
chips (etiquetados «vie 14 dia», «hoy noche l», mismo nombre primero) y la
persona elige contra cuál comparar; la frase del rango declara su muestra
(«los 5 turnos iguales anteriores fueron de…») y avisa cuando son de otro
horario. Se conserva el filtro por nombre en banda/récords/vsAyer/Pareto,
donde la comparación sigue siendo automática. Verificado con datos reales
(desde el turno de día ahora se puede comparar contra el nocturno). 1514
tests verdes (2 nuevos, caso Filete), tsc/eslint limpios, `audit-piel.mjs`
sin crecer deuda. Merge commit `f033e738` en main (squash), deploy
confirmado en GitHub Pages (`buildSha: f033e73`).

## 2026-08-17 · Monitor: comparar mismo turno con mismo turno, ahora que Filete tiene día y noche (PR #626)

Shoplogix normalizó los turnos de Filete: de «Turno Dia» único pasó a «Turno
Dia» + «Turno Noche L» (00:20→08:00, 4.398 pz). Con eso, tres partes del
monitor mezclaban diurno y nocturno sin avisarlo: el gráfico comparador
tomaba los 6 turnos anteriores por fecha sin mirar el nombre (filtro en la
página, no en `buildDayComparison`, porque Yal compara sus 3 turnos del
mismo día a propósito); la etiqueta solo distinguía turno cuando compartían
`dateKey` (el nocturno tiene su propio día y no se notaba); el techo de
ritmo salía de `forecastHistory` sin filtrar (que además el backend publica
solo para el turno vigente); y la banda de «rango normal» sumaba
`shiftStats` como tercera fuente porque es la única que trae todos los
nombres (si no, el turno no vigente se quedaba con <5 muestras y la banda
desaparecía). Verificado con datos reales: el comparador del diurno lista
solo diurnos (vie 14 a lun 10), el nocturno del 17 ya no se cuela. 1512
tests verdes (1 nuevo, caso Filete), tsc/eslint limpios, `audit-piel.mjs`
sin crecer deuda. Merge commit `bfccc182` en main (squash), deploy
confirmado en GitHub Pages (`buildSha: bfccc18`).

## 2026-08-17 · Monitor: una sola regla de ritmo en vez de seis cifras sueltas (PR #624)

Convivían 6 cifras de ritmo (acumulado del turno, de reloj, pz/h, últimos
30 min, «N pz/min ahora» dentro del gráfico, media de 15) sin jerarquía, y a
veces discrepaban entre sí (tarjeta 4,6 vs gráfico 2,1 en el mismo instante).
El bug era de parentesco: la media móvil se calculaba dentro del componente
del gráfico. Fix: nuevo `monitorRitmo.ts` como única fuente de la media
móvil; una sola tarjeta con el ritmo de ahora como protagonista, mostrado
como regla (relleno = ritmo, marca = promedio del turno, borde = techo de la
máquina) en vez de aritmética mental; estado también en palabra («va
lento»/«a ritmo»/«casi parada»), no solo color. Salieron de pantalla: tarjeta
«Últimos N min», delta «▼ por debajo del ritmo del turno» (ahora es la
distancia visual en la regla), el «N pz/min ahora» duplicado del gráfico, y
el pz/h de reloj (sigue en hora-por-hora y exportaciones). Verificado con
turno real: de 6 cifras a 1; 1511 tests verdes (12 nuevos), tsc/eslint
limpios, `audit-piel.mjs` sin crecer deuda. Revisado a 375 px en ambos temas.
Merge commit `73ed94d0` en main (squash), deploy confirmado en GitHub Pages
(`buildSha: 73ed94d`).

⚠️ Este archivo pasó los ~150 KB de referencia (216 KB) — conviene
compactar entradas viejas en la próxima sesión de mantenimiento.

## 2026-08-17 · Monitor: ejes legibles, sin doble estado en turno cerrado, ritmo con periodo claro (PR #622)

Los ejes de los dos gráficos y del detalle de paradas estaban a 9 px, bajo el
piso de 11 de la Constitución (§9/§64): subidos los 7 usos, verificado sin
solapes entre etiquetas del eje X. Con el turno cerrado la cabecera mostraba
la píldora de estado en vivo junto a «Turno cerrado» (dos estados a la vez, y
a 375 px empujaba la fecha a una tercera línea); la píldora ahora solo
aparece con el turno en curso. El «ritmo andando» (`totalPieces /
producingMin`, promedio acumulado de todo el turno) decía «cuando la línea
produce», que se lee como velocidad actual y contradecía al gráfico de abajo
(caso real: número 12,37→12,33→12,16 mientras el gráfico iba de 0 a 17
pz/min); ahora dice «promedio del turno, cuando produce». 1499 tests verdes,
tsc limpio, `audit-piel.mjs` sin crecer la deuda. Merge commit `ad53ad3c` en
main (squash), deploy en verificación en GitHub Pages.

## 2026-08-17 · Monitor: 44 px de área táctil y el chip activo legible (PR #620)

Auditoría del monitor público con Filete en vivo a 375 px: 19 de 19 controles
bajo 44 px (cabeceras plegables 17 px, chips de comparación 21, «agrandar»/
«Cambiar» 20, flechas Anterior/Siguiente 30, botón de tema 26×26), y el chip
SELECCIONADO era el texto menos legible de la pantalla (2,81:1 oscuro / 3,81:1
claro vs 8,1:1 de los no seleccionados) por `text-brand-ink` sobre
`bg-primary/[0.13]`, mismo azul en texto y fondo. Fix: nueva utilidad `.tap-44`
en `index.css` (`::after` transparente 44×44 fuera de layout, no engorda el
control) aplicada a los 20 controles; `text-brand-ink` → `text-foreground` en
los 7 lugares con el patrón del chip activo. Verificado: 0 controles bajo
44 px, contraste 2,81→10,64 (oscuro) y 3,81→13,64 (claro), sin robo de clic
entre chips (`elementFromPoint`), sin scroll horizontal a 375 px. 1499 tests
verdes, tsc/eslint limpios. Merge commit `5575b838` en main, deploy confirmado
en GitHub Pages (`buildSha: 5575b83`).

## 2026-08-17 · Monitor: sin hora de cierre no se inventa una cuota (PR #618)

Auditoría visual con Filete en vivo: a las 02:45 (turno produciendo hacía
2h21) la pantalla decía «Van 1.829 de las 5.000 que tocaban a las 02:45» y
titulaba «−3.171 vs cuota», imputando deuda por tiempo que aún no había
pasado. Dos causas: `ventanaTurnoMin` caía a `windowMin` (minutos
transcurridos, no duración del turno) cuando faltaba `plannedEnd`; y el
cierre estimado del PR #616 se restaba contra `scheduledStart`, que en un
turno sin definir cae 24h atrás, estirando la ventana a ~26h y diluyendo la
cuota casi a cero. Fix: la ventana se mide desde el arranque real de
producción hasta el cierre estimado (455 min, no 26h), y sin cierre conocido
no se dibuja cuota (`0` en vez de fallback engañoso), igual regla que ya usa
«para llegar a la meta». Verificado con turno real: titular pasó de
«−3.171 vs cuota» a «2.022 pz · 494 arriba de vie 14». 1499 tests verdes,
tsc/eslint limpios. Merge commit `3740eb21` en main, deploy confirmado en
GitHub Pages (`buildSha: 3740eb2`).

## 2026-08-17 · Monitor: el turno arranca donde arranca la producción, cierre estimado por duración (PR #616)

Filete cambia el horario del turno noche de un día para otro (hoy 00:00→08:00,
mañana 21:00→05:00) y Shoplogix aún no lo tiene definido (`Unscheduled`), así
que un cierre aprendido «por hora» no sirve. Dos cambios: (1) el arranque del
turno ya no es el primer pico de piezas — si tras el primer tramo con
producción hay un hueco >60 min, el inicio es el bloque siguiente (evita que
piezas sueltas de prueba de máquina, ej. 3 pz a las 21:45, corran el inicio
real de 00:20 y hundan «tiempo produciendo»; las piezas siguen contando en el
total). (2) nuevo `inferShiftEndFromDuration()` en el backend: sin cierre
fijado/aprendido/configurado, suma la duración mediana de los turnos de la
línea (11 turnos, 449-461 min, mediana 452) al arranque productivo — al final
de la cascada, después de cualquier horario real. También corrige
«Producción real desde…», que usaba `effectiveStart` del backend y no
coincidía con la cabecera.

Verificado con turno real: cabecera pasó de `21:45–02:51` a `00:20–02:51`,
«hora por hora» quedó en 3 filas todas con producción. 1499 tests verdes en
cliente (105 archivos, 4 casos nuevos), 2 tests nuevos en backend
(`inferShiftEndFromDuration`); tsc/eslint limpios. `functions/publicMonitor.test.js`
(node --test) da 35/37, los 2 fallos son preexistentes en main. Merge commit
`5b952ed` en main, deploy confirmado en GitHub Pages (`buildSha: 5b952ed`) y
`Deploy Firebase Functions` en success.

⚠️ Pendiente: definir el turno nocturno de Filete en Shoplogix — mientras no
exista sigue entrando como `Unscheduled`, fuera del Pareto y del historial.

⚠️ Este archivo pasó los ~150 KB recomendados (ahora ~216 KB) — compactar
entradas antiguas en la próxima sesión de mantenimiento.

## 2026-08-17 · Monitor: la cabecera anuncia el arranque real del turno (PR #614)

Último cabo suelto del #612: el resto de la pantalla ya contaba desde la
primera pieza pero la cabecera seguía mostrando el horario declarado
(`06:00–02:17` vs `21:45–02:23` en el resto). Cabecera ahora usa
`serieDelTurno[0].t` (respaldo: declarado si aún no hay piezas), en ambos
estados (vivo/cerrado). El declarado no se pierde: el aviso de abajo lo
nombra junto al tiempo sin actividad no dibujado. 1495 tests verdes,
tsc/eslint limpios. Merge commit `d09d71f` en main, deploy confirmado en
GitHub Pages (`buildSha: d09d71f`).

⚠️ Este archivo sigue sobre los ~150 KB recomendados (ahora ~214 KB) —
compactar entradas antiguas en la próxima sesión de mantenimiento.

## 2026-08-17 · Monitor: el turno empieza en la primera pieza, no en el primer tramo sincronizado (PR #612)

Reemplaza el auto-zoom del PR #610 (lo causaba desalineado): `monitorHourly.ts`
y `monitorCompare.ts` decían en comentarios «arranca en la primera pieza» pero
tomaban el primer tramo sincronizado. Con Filete `Unscheduled` (ventana desde
06:00) la serie arrancaba 09:45 y la primera pieza 21:45 → «hora por hora»
mostraba 12 filas en cero y el comparador quedaba corrido 12 h (ningún día de
referencia «llegaba a la altura» del turno). Nuevo `desdePrimeraPieza()` en
`monitorActividad.ts` (recorta solo por delante, conserva la cola vacía),
usado en `buildHourlyRows`, `cumulativeFromStart`, los 6 usos de
`live.series[0].t` en `PublicShiftMonitorPage.tsx` y el rótulo de
`MonitorShiftParts.tsx`. También corrige el bloque «¿se llega a la meta?»:
mensaje distinto para turno `Unscheduled` (nunca cierra 2 turnos con ese
nombre) y el botón «Fijar cierre» ya no queda inalcanzable en ese estado.

Verificado con turno real de Filete de madrugada: hora por hora de 16 filas
(12 en cero) a 5; comparador ahora compara («6 días anteriores de 2.074 a
2.668»); 1495 tests verdes (105 archivos); tsc/eslint limpios. Merge commit
`d2711130` en main, deploy confirmado en GitHub Pages (`buildSha: d271113`).

⚠️ Este archivo sigue sobre los ~150 KB recomendados (ahora ~213 KB) —
compactar entradas antiguas en la próxima sesión de mantenimiento.

## 2026-08-17 · Monitor: los gráficos parten donde la línea arrancó, no donde dice el turno (PR #610)

Filete de noche llega sin turno definido (`Unscheduled`), y la ventana
por defecto va de 06:00 a ahora: de madrugada eso daba 16 h de eje
para 1 h de producción. Nuevo `monitorActividad.ts` con
`ventanaDeActividad()`: encuentra el primer/último tramo con piezas y
lo propone como encuadre inicial de ambos gráficos (reusa la ventana
de `useZoomGesto`, sin estado nuevo); aviso en pantalla de qué se
recortó y por qué, solo si el recorte supera 45 min. No comprime
huecos interiores ni esconde picos aislados.

Verificado con el turno real de Filete en vivo (eje `09:20–01:20` →
`21:35–01:30`); 1488 tests verdes (105 archivos, 10 nuevos del
helper); tsc/eslint limpios. Merge commit `61cbbf3c` en main, deploy
confirmado en GitHub Pages (`buildSha: 61cbbf3`).

⚠️ Este archivo sigue sobre los ~150 KB recomendados (ahora ~212 KB) —
compactar entradas antiguas en la próxima sesión de mantenimiento.

## 2026-08-17 · Fix: los targets táctiles de piel/ miden 44 px de verdad, no 37 (PR #608)

`min-h-11`/`h-11` no rendía 44 px: `index.css` baja el root al 87,5%
(85% en móvil), o sea 1 rem ≈ 13,6 px, así que `2.75rem` daba 37 px.
Salió a la luz arreglando el botón «Recargar» del banner (PR #606).
Se pasan a píxeles literales cuatro primitivos de `components/piel/`:
`GroupedList.tsx` (`ListCell`, 23 apariciones en 6 archivos — el de
mayor alcance), `Button.tsx` (tamaño `md`, el default), `Disclosure.tsx`
(variante `section`) y `TabBar.tsx`, cada uno con comentario para que
no se revierta a `min-h-11`. Sin tocar: `Button` `sm`, `Disclosure`
`inline` (documentados como exentos o zona gris), ni nada fuera de
`components/piel/`.

Verificado: 1478 tests verdes (104 archivos, línea base), tsc/eslint
limpios, audit-piel sin crecer deuda; medido en navegador a 375 px
(celdas 44 px, tabs 44,2 px, antes 37). Merge commit `9f90208b` en
main, deploy confirmado en GitHub Pages (`buildSha: 9f90208`).

⚠️ Este archivo sigue sobre los ~150 KB recomendados (~210 KB) —
compactar entradas antiguas en la próxima sesión de mantenimiento.

## 2026-08-16 · Accesos por línea en Análisis de Turno + banner sin versión (PR #606)

«Grader» pasa a «Análisis de Turno» en home móvil (admin y supervisor),
alineado con el sidebar; la tarjeta gana 3 accesos directos por línea
(`Principal · Eviscerado`, `Principal · Filete`, `Yal · Eviscerado`)
derivados de `PLANT_LINES.filter(shoplogixEnabled)`, con `ListCell
variant="child"`. El banner de actualización deja de mostrar el semver
(«4.2.0») y muestra hora de la nueva versión + tiempo desactualizado
(`formatDesfase`/`formatHora` en `buildInfo.ts`); botón «Recargar» pasa
de 31 px a 44 px de alto.

Verificado: 1478 tests verdes (104 archivos, 11 nuevos), tsc/eslint
limpios, audit-piel OK; 375 px con sesión real de admin. Merge commit
`2b496dda` en main, deploy confirmado en GitHub Pages
(`buildSha: 2b496dd`).

⚠️ Este archivo pasó los ~150 KB recomendados (209 KB) — conviene
compactar entradas antiguas en la próxima sesión de mantenimiento.

## 2026-08-16 · Fuera la mediana punteada del Pareto; filas con piezas y % (PR #604)

Orel: la línea punteada de la tira «Cómo viene turno a turno» ensuciaba
el gráfico más de lo que informaba. Se quita la punteada; su valor pasa
al encabezado en las dos unidades («mediana 11,9% · ≈640 pz», con
`banda.medianaPiezas` calculado sobre su propia serie ordenada, no
aplicando el % mediano al turno promedio). Las filas del ranking ahora
muestran piezas y % (`≈2.460 pz 35,4%`, un solo denominador que suma
100% vía `repartir100()` por mayor resto sobre todas las filas). Los
minutos bajan a la línea de metadatos.

Verificado: 438 tests verdes (32 en el archivo), tsc/eslint limpios,
audit-piel OK; suma de % de filas = 100,0 exacto en las 4 ventanas (5,
10, 15, todos) medido en navegador con datos reales; 375 px. Merge
commit `617c5922` en main, deploy confirmado en GitHub Pages
(`buildSha: 617c592`).

## 2026-08-16 · Fix: la tendencia del Pareto pierde el color (PR #602)

`bg-ink-warn` tenía dos sentidos en el mismo bloque: en las filas del
ranking «pérdida de Mantención» (`DUENO_UI`), en la tira «Cómo viene
turno a turno» «peor que la mediana». Las 10 barras quedan en un solo
gris neutro (`bg-muted-foreground/[0.45]`); la mediana punteada sube de
`/[0.5]` a `/[0.75]` como única señal de comparación. El ámbar queda
con un solo significado en todo el bloque.

Verificado: 438 tests verdes, tsc/eslint limpios, audit-piel OK; 375 px
en ambos temas. Merge commit `77f72b8c` en main, deploy confirmado en
GitHub Pages (`buildSha: 77f72b8`).

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

# Historial resumido · 2026-08-01 → 2026-08-10

Narración PR-por-PR colapsada (vive en git y en los PRs). Se conservan los gotchas, las causas
raíz, las decisiones con su porqué y las cifras medidas.

---

## Monitor público de turno (link/QR sin sesión) · 2026-08-10

**Entregas, todas HECHAS y desplegadas** (#434, #447 y PRs asociados): monitor `/monitor/{token}` con
doc espejo · modo `line` que sigue el turno vigente · link por Telegram al arrancar el turno · rescate
de las piezas de fuera del turno · swipe a los 6 turnos anteriores · `Unscheduled` deja de ganar como
turno vigente · la tarjeta aparece en Filete + callable idempotente · telemetría anónima · eje sin
recorte / navegación en ambos sentidos · fix del doble conteo en la MATRIZ · theme-aware · la vista de
turno cuenta también la cola · apodos de aparatos · detenciones ubicadas en el gráfico.

**Arquitectura y decisiones vigentes:**
- **Espejo, no lectura directa**: `shoplogix/**` exige `isNotAnonymous()` y abrirla expondría todos
  los turnos de todas las plantas. Se publica `publicShiftMonitors/{token}`, que escribe SIEMPRE el
  Admin SDK (`write: if false`) y lee cualquiera solo mientras no venza
  (`timestamp.value(expiresAt) > request.time`, reloj del servidor).
- **El trigger va al doc PADRE del turno, no a `machines/{id}`**: el padre se escribe una vez por
  ciclo de sync; la subcolección dispararía un evento por máquina (3 en Eviscerado) componiendo el
  mismo payload. Frescura ~5 min. Sin comentarios de operador (texto libre con nombres).
- **La invariante del modo línea: el TOKEN NO CAMBIA.** `ensureLineMonitor` reusa el link vigente y
  solo extiende la vigencia (a 30 d) cuando le quedan <7. Crear uno nuevo en cada arranque pasaría
  cualquier test de contenido y rompería lo único que hace útil al link: que el QR de la pared y el
  Telegram de ayer abran la misma pantalla (4 tests, comprobados mutando el código).
- ⚠ **El monitor de línea NUNCA adopta el turno que disparó el trigger**: el re-sync móvil reescribe
  padres de ayer y de hace 2-3 días, y adoptarlos haría saltar el link a un turno viejo mientras
  alguien lo mira. Siempre se re-resuelve (`resolveCurrentShiftDocId`: padres de hoy y ayer en
  wall-clock, gana el que contiene el reloj de planta con 30 min de gracia; entre turnos gana el
  último que YA empezó, porque quien abre el QR a las 20:00 quiere ver cómo terminó).
- Tres estados verificados: corriendo · vencido/revocado · **"Esperando el próximo turno"** (un link
  de línea puede nacer un domingo: no está roto, espera).

**Gotchas y causas raíz:**
- ⚠⚠ **DOBLE CONTEO, el bug que casi se cuela.** El doc del turno guarda intervals MÁS ALLÁ de su
  `scheduledEnd` y Shoplogix repite esos minutos en `Unscheduled` — **idénticos, 112 piezas** (15:30 y
  15:35 del 10-ago en Filete). Filtrar por la ventana declarada NO los atrapa: **dedupe por (máquina,
  timestamp del interval), nunca por ventana.** Se detectó MIRANDO: el máximo del tramo saltó de 83 a
  130 pz, justo 65+65. Acá el doble conteo es el peor error posible: quien mira el link no tiene con
  qué contrastar.
- ⚠ **El mismo doble conteo en la MATRIZ, con un bug propio que costó una vuelta**: usé
  `s.key.slice(11)` para armar la ruta, pero la key es `${dateKey}__${shiftId}` con **DOS** guiones
  bajos y el doc lleva **UNO**. La ruta no existía, el `catch` devolvía un set vacío y el dedupe no
  hacía nada — todo en verde. Detectado mirando la matriz: seguía diciendo 5.033 (real 4.921). Usar
  `s.shiftId`.
- **Diferencia intencional monitor 4.915 vs matriz 4.921** = las 6 pz de higiene de las 06:10. El
  monitor descarta tramos <20 pz; la matriz atribuye todo (decisión de Orel del 03-ago: *ningún ciclo
  queda sin turno*). Conviven a propósito.
- **El umbral de ruido ≥20 pz fuera de turno** nace de un dato real (6 pz sueltas a las 06:10,
  higiene) pero se dejó como UMBRAL y no como "ignorar todo lo anterior al turno", porque el arranque
  anticipado real existe y ya costó un fix entero.
- ⚠ **`Unscheduled` ganaba como turno vigente**: mostraba 623 pz mientras el `Turno Dia` real llevaba
  4.915 — ganaba por horario y pasaba el filtro de 50 ciclos. **Un cambio puede invalidar un umbral
  que llevaba meses siendo correcto**: desde que el monitor rescata la cola, esas 623 YA están en el
  turno real. Regla: nunca caer a `Unscheduled` como fallback de un turno nombrado; solo se acepta si
  la línea no tiene NINGÚN turno con nombre en hoy/ayer y aun así hubo proceso.
- ⚠ **Ordenar el historial por el id NO sirve**: en Chonchi "Turno 1" arranca 21:30 y "Turno 2" a las
  09:00, así que alfabéticamente sale al revés. Ordenar por `scheduledStart`.
- ⚠ **Bug de React**: el efecto que reubica la vista al arrancar un turno nuevo dependía también de
  `idx`, así que se disparaba con la navegación del propio usuario y lo devolvía al turno actual —
  **el botón parecía no responder**. Debe depender SOLO de `vistas`; quien navega actualiza el ref a
  mano. No lo vieron tsc ni los tests.
- **Costo**: un turno cerrado ya no cambia, así que el historial se REUSA del doc anterior; sin ese
  reuso serían ~40 lecturas por refresco por monitor.
- ⚠ **"Turno cerrado" con el turno vivo**: en Filete el `scheduledEnd` se DERIVA del último intervalo
  sincronizado, o sea que siempre queda en el pasado. Fix: margen de 30 min **Y** exigir que ninguna
  máquina esté en uptime (test que falla si se revierte cualquiera de las dos).
- ⚠ **Gotcha de UI reusable**: el root de la app corre a **85% (13,6px)**, así que **`text-xs` renderiza
  a 10,2px reales**, bajo el piso de 11px de la piel nueva → en pantallas públicas los tamaños van en
  px explícitos. Y `capitalize` de Tailwind capitaliza CADA palabra ("Lunes, 10 De Agosto"): usar
  `first-letter:uppercase`.
- ⚠ **El gráfico mentía por recorte**: `SERIES_MAX_POINTS` en 48 tramos (4 h) cortaba la mañana entera
  y el eje decía "12:30–16:25" para un turno que arrancó 07:55. Subido a 192 (16 h): 48 → 106 tramos.
  *Un gráfico que se come la mitad del turno no es incompleto: engaña.*
- ⚠ **Listado y gráfico salían de DOS cálculos distintos** (listado "85x", gráfico 55 bandas): estados
  duplicados + estados de duración cero. El backend publica `stopReasons` + `stopEvents` desde la MISMA
  fuente deduplicada.
- ⚠ **Las bandas se ubicaban por aritmética de tiempo y quedaban corridas** (3 fuera del área):
  **la serie NO es continua**, solo trae los tramos que el sensor registró → hay que buscar el ÍNDICE
  del tramo en la serie.
- ⚠ **La cadencia se diluía**: al estirar la ventana hasta la última pieza del día, un hueco de 1,5 h
  en la mañana convertía 557 pz/h en 487. El denominador son las horas de **OPERACIÓN** (se descuentan
  los huecos ≥30 min sin una sola pieza). El **% produciendo** se calcula sobre el tiempo RASTREADO
  (uptime/(uptime+down+break)), no sobre el `shiftRuntime` de Shoplogix, que solo conoce el turno (con
  la cola vacía da 73,3% vs su 73,28%: no rompe lo verificado).
- ⚠ **`Planned Downtime` NO es detención**: es el relleno de las horas en que la planta no operaba. Al
  rescatar la cola entraba al denominador y hundía el "% produciendo" de 72% a 58%, y además encabezaba
  el ranking de detenciones ("el primer lugar era: no estábamos trabajando"). Excluido de las dos
  partes → vuelve a **76,5%**.
- ⚠ **La tarjeta del monitor NO aparecía en Filete**, el caso de uso principal: estaba anidada dentro
  de `{summary && shiftWindow && (...)}` y ese `summary` es **el del Excel del Grader**, que Filete no
  tiene. tsc, eslint, 1.104 tests, build y vista pública, todos en verde. Nunca se abrió la página a
  mirar la tarjeta, y se declaró "pendiente: falta apretar Generar link" cuando lo honesto era "no se
  sabe si la tarjeta aparece". **Un pendiente de verificación no es un detalle: es exactamente donde
  estaba el bug.**
- **Cómo se verifica con sesión**: `claude-in-chrome` sobre el Chrome REAL de Orel contra un `vite` en
  el **puerto 5173**, el autorizado por Firebase. ⚠ En ese tab el `.click()` programático NO toma y el
  screenshot falla por `document_idle` perpetuo (la suscripción de Firestore deja la página
  "cargando") → verificar con el navegador interno y clic real por `ref`. ⚠ **No hay viewport móvil
  real**: `resize_window` no cambia el viewport del Chrome del usuario, y el navegador de la
  herramienta —que sí emula móvil— no tiene su sesión.
- ⚠ **Filete NO tenía el canal Telegram abierto** (`notificationConfig` solo existía para chonchi y
  yal): la línea donde más se pide el monitor era la que no iba a recibir nada. Flag propio
  `monitorLink.enabled` (default true, `ttlDays` 30) independiente de `channels.telegram` — **no se le
  abrió el canal de alertas**, porque habría traído detenciones y fin de turno que nadie pidió. Y el
  envío salió del gate `eligibleIds.length > 0`: ese gate son las preferencias de push de los usuarios
  y el mensaje va al chat del admin, así que apagar el push propio no puede dejar sin link a Control de
  Producción.
- **Telemetría anónima y sus límites**: identidad no (quien abre el link no tiene sesión ni dio
  consentimiento), uso sí. **NO se guarda** IP, geolocalización, user-agent crudo, nombres ni correos;
  lo único que distingue un aparato es un `viewerId` **aleatorio** que genera su propio navegador en
  localStorage. Contadores en colección APARTE `publicShiftMonitorStats/{token}`
  (`read: if isNotAnonymous()`, `write: if false`) — NO en el doc del monitor, que es de lectura
  pública y engordaría cada refresco. Endpoint abierto con defensas: solo tokens vigentes, formato fijo
  de `viewerId` (`danilo@empresa.cl` NO entra), tiempo topeado, 10 min de ventana antidoble por
  apertura, poda a 60 aparatos y 14 días. Latidos cada 2 min **solo con la pestaña visible** (el tiempo
  en segundo plano no es tiempo mirado). Con el endpoint caído el fetch se traga en silencio: única
  conducta aceptable para telemetría.
- ⚠ **Un test destapó un bug real**: `applyEvent` mutaba el objeto del día del estado previo
  (`{...s.byDay}` es copia superficial) — dentro de una transacción Firestore, exactamente la clase de
  cosa que produce números irreproducibles.
- **Apodos: se resuelve con lo que sabe el usuario, no con huellas.** El mismo celular figura dos veces
  si el link se abre con navegadores distintos (WhatsApp/Telegram usan webview propio con storage
  aparte); resolverlo técnicamente exigiría **fingerprinting**, que es justo lo que esta pantalla
  prometió NO hacer. Salida: nombrar cada aparato y **fusionar las filas con el mismo nombre**,
  avisando "(2 navegadores)" para que la fusión sea visible y no magia. Los apodos viven en
  `publicShiftMonitorLabels/{token}`, colección aparte, y **NUNCA se copian al doc público**.
  ⚠ Bug propio detectado probando: el guardado fallaba y el editor se cerraba igual, o sea que el
  usuario creía haber guardado. *El fallo era la regla sin desplegar, pero el silencio era mío.*
  La etiqueta "nuevo" solo aparece si el link lleva más de un día: recién creado todos son nuevos.
- ⚠ **Umbral unificado en la matriz**: aplicarlo tal cual hizo fallar dos tests reales porque castigaba
  ciclos sueltos DENTRO del horario del turno, que son del turno sin discusión. **El umbral solo aplica
  FUERA de las ventanas.** Hubo que actualizar un test que fijaba la decisión anterior (Yal 1.836 →
  1.835 cic) dejando escrito en el test por qué cambió.
- **Tema claro/oscuro** (57 hardcodes, playbook `/tema-claro-oscuro`): acentos con `-700/-800
  dark:-300/-400` (un `-300` sobre fondo claro queda lavado); tintes de estado de `/10` a `/20` (en
  claro un /10 colapsa contra la superficie); `bg-red-500/15` con borde `/25` es invisible en claro →
  borde `/40`. ⚠ **Contraste medido, no mirado**: la primera medición dio 2,48:1 y 1,94:1 y eran
  **falsos** porque el script no componía el alfa de los tintes; con alfa compuesto el chip "Detenida"
  daba 4,25:1, **bajo el 4,5 de AA** → `-700`→`-800` y quedó en **5,46:1**. Resto en claro: número
  grande 12,34 · KPI 5,17 · secundario 7,18 · chip ámbar 4,78. En oscuro: 15,47 / 9,49 / 7,33 / 7,25,
  fondo `rgb(13,23,34)`.
- **La vista de turno era la tercera superficie con el mismo dato y un número distinto** (4.410 vs
  4.915): hook `useShiftOutsidePieces` con el MISMO umbral y el MISMO dedupe; cuesta 1 lectura.

---

## Protocolo BAADER 142 y avisos por Telegram · 2026-08-09

**Entregas** (#409, #410, #412, desplegadas): recordatorio semanal `recordatorioProtocoloBaader142`
(viernes 16:30) + trigger `onProtocoloBaader142Created` que evalúa cada lectura contra las dos
anteriores de esa máquina.

- **Criterio: un aviso que llega siempre se deja de leer.** El recordatorio solo manda mensaje si falta
  registrar alguna de las tres máquinas; si están todas, calla (igual que el verificador de arranque).
- **Los tres criterios de alerta y su porqué**: (1) `umbral` — llegó a intervenir (30) o crítico (100);
  es el ESTADO, no el movimiento, así que avisa aunque no haya subido. (2) `tendencia` — subió en las
  dos últimas lecturas **y además llegó a "vigilar" (5)**, porque 0→1→2 por mil es ruido y sin ese piso
  nadie leería el aviso a la tercera semana. (3) `falla-dura` — paró con las correcciones en cero: no
  es desgaste, es inductivo/cable/bloqueo, y el mensaje manda a mirar el inductivo (B1…B5), no la correa.
- ⚠⚠ **EL AVISO NUNCA LLEGABA: topic de Telegram roto.** Telegram devolvía
  `400 "Bad Request: message thread not found"` — el topic `equipos` apunta a un hilo que ya no existe.
  Y como **`sendTelegramMessage` loguea sin lanzar**, la función terminaba en verde con el mensaje
  perdido: todos los viernes habría fallado en silencio. Fix doble: `sendTelegramMessage` **reintenta
  sin topic** (hilo principal) cuando el error es "thread not found", y el protocolo pasa a
  `getTopicId('general')`. **Topics sanos verificados: `general`, `incidencias`, `repuestos`.**
- **Cómo probar un trigger sin ensuciar el grupo**: primero una lectura **sana** (contadores en 0) — el
  trigger corre, no encuentra nada, no manda mensaje, y el log prueba que está enganchado. Después una
  con alerta y `fecha: '1999-01-01'` para que sea inconfundiblemente una prueba. Borrar los docs al
  terminar.
- ⚠ **Los tests de `functions/` NO corren en CI**: el vitest de `apps/pwa` solo incluye `src/**`, así
  que los 18 de `protocoloAlertas` y los 12 de shoplogix tampoco corren. Deuda preexistente; se corren
  a mano con `node --test`.
- ⚠⚠ **Toda function nueva: `region` explícita, o el deploy queda ROJO con las funciones andando.** Un
  `onDocumentCreated('col/{id}', fn)` **sin `region`** lo crea firebase-functions v7 en la región de la
  BASE DE DATOS (`southamerica-west1`). Las funciones quedan operativas pero el deploy falla con *"could
  not set up cleanup policy in location southamerica-west1"* → **exit 1**: CI en rojo con todo
  funcionando, la peor combinación porque esconde el próximo fallo de verdad. Fix: forma con objeto
  `{ document, region: 'us-central1' }`. Y **hubo que borrar a mano la función de la región vieja**
  (`firebase functions:delete <fn> --region southamerica-west1 --force`), porque cambiar de región
  implica borrar+crear y el CI corre `--non-interactive` sin `--force`.
- **Verificación mirando, no solo asserts**: `__tests__/previewMensajes.js` imprime los 7 mensajes
  renderizados para revisar la redacción antes de soltarla al grupo. Ahí se confirmó que "más pescados
  con las mismas correcciones" NO dispara alerta, porque compara **tasas** y no totales — un test que
  solo mirara el total habría dado un falso positivo.

---

## Perilla 5 · módulo BAADER 142 en Aprendizaje · 2026-08-08

**Entregas** (PR #402 y dos siguientes): módulo `/aprendizaje/perilla-5` (patrón Variadores) con vista
`herramienta` (embed HTML standalone) y vista `protocolo` (13 contadores, tasas /1000 en vivo,
tendencia Chart.js, guardado en `baader142Protocolo`) · visor con pinch-zoom, paneo y anotaciones sobre
las figuras · notas compartidas en Firestore, tema claro/oscuro y menos cascarón.

- **Máquinas: `baader-n1` (antigua) / `n2` / `n3`**, orden confirmado por Orel. **Umbrales 5/30/100
  etiquetados "criterio interno de Mantención ANTARFOOD"** (sin respaldo de manual, regla del PR #310);
  el resto citado a §22.4 / runbook E8xx.
- ⚠ **Índice compuesto (plantId, maquina, fecha desc) + `createdAt`**: sin él la query de lecturas
  devolvería `[]` **en silencio**.
- ⚠⚠ **Bug de encoding que casi se publica**: ensamblar el HTML con
  `Get-Content | Set-Content -Encoding UTF8` en **PowerShell 5.1** dejó BOM + **284 caracteres en
  mojibake** (`alcanzÃ³`, `SOLUCIÃ³N`) — visible en pantalla, invisible para tsc/eslint/tests, y el
  archivo quedó mixto. **Regla: ensamblar SIEMPRE con Python `io.open(encoding='utf-8')`, nunca con
  `Get-Content | Set-Content`.**
- ⚠ **Gotcha de verificación que costó 10 min**: un **service worker viejo de otra sesión** en un puerto
  reciclado (:5174) servía un bundle sin la ruta nueva → redirect a `/login`. **Desregistrar el SW y
  borrar caches antes de verificar en un puerto reciclado.**
- **Duplicados por hash perceptual** (dHash 12×12, Hamming ≤12): **9 de las 12 "fotos de campo" de
  Telegram eran capturas de páginas del manual** ya extraídas en mejor calidad, y **dib. 64 es la MISMA
  foto que dib. 35** (BAADER la publica dos veces, págs. 41 y 85) → `ALIAS={'dib-64':'dib-35'}` para no
  romper enlaces. Aparecieron además dib. 16 y 17 (§12.3.1) que faltaban: **el grep textual no los
  encuentra porque su rótulo es solo el número dentro del cajón.** Neto 55 → **46 figuras**, HTML 2,5 →
  2,07 MB.
- **Notas compartidas vía PUENTE postMessage** (el iframe no hereda la sesión de Firebase — mismo patrón
  que `PlanosAguasPage`), en `baader142Notas`. **La foto NO va en el documento**: se sube a Storage y en
  Firestore queda su URL, porque con base64 traer las notas de todas las figuras costaría decenas de MB
  (así cada doc pesa ~½ KB). Contenido vivo, no evidencia: regla como `planoNotas`, no como
  `variadoresCambios`.
- **Las figuras conservan fondo blanco a propósito**: un dibujo técnico en negativo no se lee. El tema
  entra por `?theme=` al montar (evita el parpadeo) y después por postMessage, porque recargar el iframe
  perdería el zoom y la figura abierta.
- **"Vacío" NO se quita** (Orel preguntó): es la causa raíz de "esófago demasiado largo" y "vísceras mal
  chupadas", los defectos de corte que más reporta el operador. Sin esa sección el técnico busca en el
  motor lo que está en el ciclón. §21 del manual, verificable.
- **iPhone 16 Pro (402×874)**: safe-areas, breakpoint ≤460 px, **inputs a 16 px** (bajo eso Safari hace
  zoom solo al enfocar), tocables ≥46 px. Fotos comprimidas a WebP ≤1100 px (~4 MB → ~100 KB): sin eso
  dos fotos llenaban la cuota de localStorage. Los pins se contra-escalan (`scale(1/s)`).
- ⚠ **Bug encontrado al verificar, no en el código**: el stage centraba por flex **Y** por transform a la
  vez, así que la figura terminaba fuera de pantalla. Se ve solo mirando; los tests de estado daban todos
  verdes. Fix: canvas `position:absolute` en 0,0 y el encuadre solo con `fit()`.
- **Revisión cruzada por subagente — 5 hallazgos reales**: (1) staleness guard al cambiar de máquina (la
  respuesta lenta de N1 pisaba la lista de N2); (2) **fecha por defecto LOCAL, no UTC** — a las 20:00 de
  Chile el default caía en mañana, justo la ventana "fin de turno" del caso de uso; (3) `orderBy`
  secundario `createdAt` (semanal + pre-reset el mismo día es el caso esperado); (4) tope de `fish`
  bajado a 1M para calzar con los contadores (rechazaba lecturas legítimas); (5) los mensajes de
  guardado/error se limpian al cambiar de máquina.

---

## Ventana del turno: el arranque anticipado (FASES 1 y 2) · 2026-08-05

**Entregas**: FASE 1 (#373, lo que se AFIRMA sobre los datos) y FASE 2 (#374, el sync).

- **El hallazgo**: el turno corrió desde las 7:15 pero el Análisis lo tomaba desde las 8:00, y **las
  piezas no se pierden, se le suman al día anterior**: `2026-08-04_Turno 2` estaba guardado como 04-ago
  08:00 → **05-ago 08:00** (24 h) con 16.398 ciclos, incluyendo los 45 min de arranque de HOY. Causa:
  `fullDayWindow` consultaba 08:00 → 08:00. **No es un evento raro, es sistemático**: Filete 12 de 31
  docs (arranca 07:30), Yal 6 (07:45), Chonchi 2 (07:15).
- ⚠ **El "Programado 09:00-17:15" que mostraba la app NO venía de Shoplogix**: es un literal de
  `plantLines.ts:144` que en turno EN CURSO le ganaba a Shoplogix, desactualizado hacía días.
- ⚠ **Dos reglas que costaron una iteración cada una**, ambas encontradas por tests existentes:
  1. **NO preferir siempre el horario oficial**: en `yal 2026-08-02` el turno produjo desde las 14:00
     con el whiteboard declarando 16:15 — arranque anticipado real de 2 h 15 que solo lo observado ve.
  2. **NO unir siempre las dos ventanas**: un turno declarado 09:00-17:15 que produjo 09:05-17:02
     corrió 09:05-17:02; unir infla la ventana con tiempo muerto y empeora la disponibilidad. Regla
     final: **manda lo observado salvo que venga contaminado por el borde**, detectado por evidencia
     contra lo declarado (cabeza en el ancla / cola desbordada), **nunca por duración** — un
     `Unscheduled` real dura 16 h 48 y es legítimo.
- **FASE 2, los tres cambios de `functions/shoplogix/sync.js`:**
  1. `fullDayWindow` empieza a las **06:00**. **06:00 y no antes**: el nocturno de Chonchi termina 05:00
     y arrancar antes metía su cola en el día siguiente (el mismo problema con el signo cambiado).
  2. `deriveShiftGroups` separa por **continuidad temporal** además de por nombre: un hueco > 8 h
     significa turnos de días distintos. Sin esto, con la ventana ensanchada el "Turno 2" de ayer y el
     de hoy colapsaban en un grupo de 24 h — el bug que se veía en producción. Clave del grupo:
     `nombre + día de inicio`.
  3. **`isTruncatedHeadOfPrevWindow`**, espejo del guard de cola del #354, necesario **porque** la
     ventana se ensanchó: ahora la consulta de un día ve la cola del nocturno anterior.
- **Tests: de 104 a 138.** Las cuatro funciones del corazón del sync (`fullDayWindow`,
  `deriveShiftGroups`, `shiftDateKeyFromStart`, `currentDateKey`) **no tenían ninguno**; se escribieron
  ANTES de tocar nada (12 de 14 pasaban como red de seguridad, 2 fallaban a propósito). ⚠ **Uno de mis
  tests estaba mal, no el código**: `currentDateKey` a las 06:30 de Chile SÍ devuelve el día anterior.
  Verificación con la serie REAL reconstruida del probe (reproduce sus tres conteos exactos: 93 Turno 2
  / 102 Unscheduled / 93 Turno 1) + mutation test.
- ⚠ **`shoplogixProbe` replicaba la ventana a mano** y la copia desfasada ya había hecho que un debug
  concluyera "no hay datos" en falso. Ahora llama a `fullDayWindow`.
- ⚠ **Backfill con cuidado**: `shoplogixBackfillRange` de UN día, verificar los docs leyendo Firestore,
  y recién entonces el resto de los días contaminados. **Snapshot antes del backfill masivo.**

---

## Exportaciones ejecutivas del turno · formatos A, B y C · 2026-08-04 / 08-05

**Entregas** (#359 PNG del turno, #364/#366 PDF con el resumen como página 1, #368 comparativo de
periodo, + el botón en la vista de turno): los tres formatos del mockup aprobado por Orel.

- **Un solo modelo, dos renderers** (`graderExecutiveSummary.ts`, lógica pura que responde 4 preguntas
  EN ORDEN: cómo fue · por qué · qué hizo Mantención · qué se necesita). Si el PNG dice que el turno se
  perdió por la Baader 2, el PDF no puede decir otra cosa.
- **Canvas nativo, NO html2canvas**: el DOM real depende del tema, del CSS que soporte el parser y de
  que el nodo esté visible; para algo que se manda a gerencia es demasiada superficie de falla. Dibujo
  determinista, siempre en claro (se imprime). El PNG **no necesita ECharts**, a diferencia del PDF, que
  sí tiene un sondeo desde que el detalle pasó a pestañas (#361).
- **Decisiones de redacción**: el veredicto NOMBRA la máquina parada; los KPIs traen su contexto ("39%
  de 7 h 09 de turno"); MTTR bajo se marca OK — es el único KPI donde menos es mejor, y sin eso un turno
  malo con buena respuesta se lee como todo malo; **sin Excel del Grader lo DICE**, en vez de imprimir
  ceros que se leen como "no hubo piezas malas" cuando en realidad NO SE MIDIÓ.
- ⚠ **Bug que cazó un test**: el `lossDriver` no tenía opción "ninguna" y caía a `'ritmo'` por defecto,
  así que un turno sano al 95% afirmaba haber corrido bajo el objetivo. **Un reporte que inventa una
  pérdida inexistente es peor que uno que no dice nada.**
- ⚠ **Rompí los 16 tests existentes de `graderTurnToPDF`**: su mock de jsPDF no tenía
  `setLineWidth/setFillColor/rect/splitTextToSize`. **Un mock que no refleja la API usada da verde falso.**
- **Formato C — la decisión que ordena todo el texto**: separar lo que Mantención controla (MTTR,
  averías resueltas, micro absorbidas) de lo que no (cuántas máquinas arrancan el turno). Mezclarlos
  produce el reporte de siempre —"el mes estuvo malo"— que no dice a quién le toca hacer qué.
- ⚠ **No inventar tendencias**: con menos de 4 turnos la hoja dice que no hay tendencia en vez de dibujar
  una flecha. **Las mitades se comparan por MEDIANA, no por media**: un solo turno catastrófico al final
  arrastraba la media y daba "sin tendencia" en un mes que subió de 45% a 80%. Tabla adaptativa: hasta 12
  turnos uno por fila, sobre eso agrupa por tipo de turno **y lo DICE**; nunca se recorta en silencio.
- ⚠⚠ **MIRAR la hoja encontró 5 bugs que ningún test habría pillado**: el cierre declaraba
  "disponibilidad resuelta" con 58% de uptime; se rankeaba "más disponible" un 59% contra un 58%; el
  título decía "Agosto de 2026"; el rango repetía el mes ("1 ago - 5 ago"); y con datos reales de julio
  de Yal, un tipo de turno con UN solo registro al 0% se llevaba la etiqueta "menos disponible" del mes.
  **Banco de pruebas sin sesión en `/dev/resumen-turno` y `/dev/resumen-periodo`: el entregable hay que
  MIRARLO antes de que salga.**
- **Refactor verificado fila por fila**: al extraer las primitivas compartidas (`graderExecutiveCanvas`)
  se comparó el canvas contra el original — **2.094 filas idénticas, 0 diferencias**; la única variación
  fue +40 px de margen inferior por un desfase preexistente (los KPIs medían 108 y el dibujo avanzaba 128).
- **Costo**: las pausas no vienen en el hook del periodo (viven en una subcolección y encarecerían la
  matriz, que se abre muchas veces al día): se cargan recién cuando alguien pide el comparativo.

---

## Matriz de turnos y afinado de la vista · 2026-08-01 → 08-03

**Entregas** (#349, #351 y siguientes): la matriz reemplaza al calendario mensual · 4 fixes de uso real ·
retirado `GraderHistoricalCalendar` del bundle · la card de cuota se ve siempre.

- **Problema raíz**: el calendario usaba el DÍA como contenedor, así que un turno que cruza medianoche se
  partía en dos fragmentos, con 4 `CardKind` solo para tapar el corte. **El contenedor pasa a ser el
  TURNO**: una fila por shiftId, una columna por día, cada turno UNA celda anclada al día en que arranca.
- **`Unscheduled` NO es un turno**: es la ventana 00:00-24:00 donde Shoplogix reporta lo que cae fuera de
  las ventanas configuradas. **Decisión de Orel, reafirmada 3 veces: CERO ciclos sin asignar** → se
  atribuyen al turno más cercano (mismo día primero; si el día no tiene turnos, cruza de día), auditable
  en `attributedCycles`. Verificado en vivo: la madrugada huérfana del 02-ago (293 cic) fue al Turno 1
  Lunes del 03 (3.720+293 = 4.013 exacto).
- **Un padre = una entrada** → el doble conteo por alias (`Turno dia`→`Turno 2`) es imposible **por
  construcción**, no mitigado. Costo: 2 queries/mes + 1 por bloque Unscheduled (2-3/mes).
- ⚠ **Bug que solo apareció validando contra prod**: `2026-07-31_Turno 1` de Chonchi tiene dateKey 31-jul
  pero su producción real fue 01:34-05:11 del 1-ago — **medir el cruce start-vs-end no lo detecta**; los
  offsets se miden contra el día de anclaje (`startDayOffset`/`endDayOffset`). Además: **terminar a las
  00:00 en punto NO es cruce** (4 de 5 "cruces" de Yal-julio eran eso).
- ⚠ **"Ver turno" no hacía nada**: navegaba a `/analisis-grader?date=…&shift=…&autoload=1` pero ya
  estábamos EN esa ruta → React Router no remontaba nada. La ruta canónica de detalle es
  `/analisis-grader/turno/:dateKey__:shiftId`.
- **"Turno 1 Lunes"**: Shoplogix pega el día de la semana a algunos shiftId. `displayShiftName()` quita
  **solo** el sufijo de día; **el shiftId crudo se conserva intacto** porque es la clave de Firestore y
  lo que va en la ruta. También en el `aria-label`, que decía algo distinto a la pantalla.
- **Vista Lista retirada** ("no la entiendo"). En pantalla angosta la matriz hace scroll horizontal: se
  ve menos mes, pero lo que se ve es cierto.
- **`GraderHistoricalCalendar` (5.756 líneas) borrado**: ya no se montaba pero seguía entrando al bundle
  por imports estáticos, y `AnalisisGraderUploadPage` sí lo montaba en una rama **inalcanzable** — código
  muerto en runtime, peso vivo en el bundle. Medición: el chunk `AnalisisGraderWizardPage` pasa de
  **481 kB** (medido por curl al bundle publicado en prod) a **344 kB** — **−137 kB, −28%**.
- ⚠ **Efecto colateral cubierto al borrar**: el calendario era el ÚNICO emisor de
  `graderSelectionStore.setSelectedHistorical`, que consume `AnalisisGraderGatesConfigPage` para calibrar
  el peso medio. Sin reemplazo esa página caía a su fallback **en silencio**. Ahora lo emite
  `GraderShiftPeriodContainer`.
- ⚠ **Regla que deja el caso de la card de cuota**: `ShiftQuotaCard` hacía `return null` sin cuota y sin
  permiso, así que **la función entera parecía no existir** — nadie sabía que había cuota por turno.
  **Un `return null` por permisos esconde la FUNCIONALIDAD, no solo el control**: si el usuario no puede
  actuar, mostrar el estado y quién puede.
- **Salto de layout** al seleccionar un turno: alto reservado con `min-h`, medido en el navegador (delta 0
  en el panel, en `scrollHeight` y en la posición de las celdas).

---

## Sueltos de agosto que valen por el gotcha · 08-01 → 08-05

- ⚠ **Leyenda del gráfico de ritmo tapada por las líneas** (`ProductionRateLineEC`): `legend.top: 0` con
  `grid.top: 6`. **ECharts NO reserva el alto de la leyenda solo**, así que la leyenda se dibujaba ENCIMA
  del área y las líneas pasaban por detrás del texto. Fix: `grid.top` 6→22 y contenedor 120→142 px (el
  área de datos pasa de 114 a 120: el gráfico **no** se achica). `UpstreamMachinesPanel` ya lo tenía bien.
- ⚠ **El botón de encuadre del eje no hacía nada (bug propio)**: el panel resuelve su ventana con una
  prioridad —(1) zoom, (2) bounds del snapshot Shoplogix, (3) prop `shiftWindow`— y el encuadre viajaba
  por el prop, así que los bounds del snapshot (08:00→08:00, las 24 h de Filete) le ganaban siempre. El
  chip cambiaba de estado y el eje seguía clavado. **No se detectó antes porque se verificó el TEXTO del
  chip y el prop, no el eje que realmente dibuja el chart.** Como **ECharts pinta en canvas** no había
  forma de leer el eje desde fuera → el contenedor expone **`data-axis-start/end`** con el rango
  EFECTIVO, y con eso la verificación es real y automatizable. La prioridad se extrajo a
  `resolvePanelWindow` (pura y testeada). Después el estado pasó de booleano a override de 3 valores
  (`auto`/`produccion`/`turno`), porque en Yal y Chonchi el chip aparecía pero no hacía nada: la
  heurística decía que no hacía falta acotar. ⚠ **El chip anunciaba un rango distinto al dibujado**
  (decía "14:45–00:00" mientras el eje era 15:15–23:09) → la etiqueta sale de la ventana RESUELTA.
- **Primer turno real de Filete (01-08)**: 240 pz de 5.000 (4%), 22 min de uptime, velocidad máxima real
  7,2 pz/min contra objetivo de 20, 16 paros (11 micro). Fue arranque, no producción. **Shoplogix YA
  acota el turno de Filete** (08:00→14:45, no las 24 h de antes). ⚠ **`scrapReasons` volvió VACÍO con
  producción real → se descarta la Calidad automática en Filete**; su OEE se queda en A×R. 0 de 16 paros
  trajeron causa del sensor → el panel de causas dictadas es la única vía.
- ⚠ **`shortMachineName` renombraba a "Baader N" cualquier máquina terminada en número**, así que la
  Baader 200 —que Shoplogix llama "Linea 1"— aparecía como "Baader 1", confundiéndola con las 142. Ahora
  solo traduce evisceradoras. Mismo patrón: `DayTimeSummaryBar` decía "las 3 Baader" también en Filete.
- ⚠ **`endBriefSentAt` se estampa en el claim ANTES de evaluar el umbral de piezas**: marca "procesado",
  no "enviado". El turno de 180 pz quedó marcado pero NO se mandó brief (180 < 200) — comportamiento
  correcto, nombre de campo engañoso.
- **Barrido de worktrees y ramas: 141 ramas → 11, 6 worktrees → 3** (+ PR #324).
  ⚠ **El criterio obvio NO sirve**: como el repo mergea con **SQUASH**, los commits de la rama no quedan
  como ancestros de main (`git merge-base --is-ancestor` da falso y `git cherry` marca todo como ausente
  por patch-id distinto). **El criterio correcto es comparar el SHA local de la rama contra el
  `headRefOid` del PR** (`gh pr list --state merged --json headRefName,headRefOid`): si coinciden, todo
  su trabajo entró; si difieren, la rama AVANZÓ tras el merge y hay commits sin publicar. **Ese criterio
  evitó borrar trabajo en curso**: 4 ramas habían avanzado tras su merge, entre ellas
  `fix/b142-diagnosis-overrides` con un fix que aún no estaba en main.
  Gotchas de worktree: (a) `git worktree remove` deja atrás los archivos no versionados y falla si un dev
  server tiene la carpeta tomada (hubo que matar un Vite en :5173 vivo 12 h después del merge); (b) **para
  correr los tests en un worktree hace falta `.env.local`** (no está en git) o 7 archivos fallan con
  `auth/invalid-api-key` — parece un fallo del cambio y no lo es; (c) si se enlaza `node_modules` con un
  junction, **quitar el junction ANTES del `rm -rf`** o se borra el `node_modules` real a través del enlace.
- **Checklist de escalabilidad SaaS** (#254, solo docs): `.ai/CHECKLIST_ESCALABILIDAD_SAAS.md`, con el
  diagnóstico con evidencia (índices Firestore parciales, `onSnapshot` sin `limit()` en
  incidents/photoEvidence, 0 try/catch en `incidents.ts`, sin monitoreo de producción, functions sin
  `minInstances`, sin rate limiting en rules). Conclusión: esta PWA (uso interno, una planta) no lo
  necesita hoy; el checklist queda para proyectos futuros con más usuarios.

> **Compactado el 2026-07-30, el 2026-08-13 y el 2026-08-18.** Las entradas anteriores al
> 2026-08-01 están resumidas en bloques temáticos más abajo; las del 2026-08-01 al 2026-08-10, en
> el bloque inmediatamente anterior. El detalle completo de cada una vive en git
> (`git log -p .ai/WORKLOG.md`, y en los commits de cada PR) y en `.ai/backups/`.
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

## 2026-08-26 · Ventanas de intervención (PR #789, en producción)

Módulo nuevo en `/calendario-mantencion` → pestaña «Ventanas de intervención». Responde
tres preguntas encadenadas: dónde puede entrar Mantención, dónde choca, y si alcanza el
tiempo. Desplegado y verificado en producción (`buildSha 285e0bf`) abriendo la ruta pública.

- **Dos capas por tramo de 5 min** (quién ocupa el equipo / dónde entra Mantención). Con una
  sola capa, «intervenir mientras higiene lava» se guarda como simple bloqueo y se pierde el
  dato que hay que mostrar: las horas con agua encima.
- **Ocupante `X` (higiene en colación)**: en esta planta higiene entra durante la colación de
  producción. Es el único hueco sin línea corriendo, así que higiene y mantención se lo
  disputan — el choque es estructural, no accidental.
- **Rueda para pintar, franja para mostrar**: un arco se juzga por ángulo y seis máquinas
  serían seis relojes sueltos.
- **`ruedaCarga`**: capacidad vs carga en horas-hombre. Capacidad de un tramo =
  `min(máquinas disponibles, dotación)`, NO el producto.
- **`ruedaProgramacion`**: encaja cada ejecución en día y hora, arrastrables. ⚠ El veredicto
  sale del ENCAJE, no de la suma: con dotación 1 los totales decían «cabe» (13,7 h contra
  107 h) y solo se ubicaban 5 de 10 ejecuciones.
- Link público `/rueda/:token` (snapshot, 30 días, expiración validada en reglas).
- 113 tests. Reglas `rueda_ventanas_state` y `ruedaVentanasPublicTokens` desplegadas.

⚠ Los horarios cargados son una BASE DE EJEMPLO, no el horario real de planta.

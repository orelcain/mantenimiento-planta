---
name: rondas-de-pulido
description: Cazar defectos que SOLO aparecen usando la app con datos reales — recorridos en producción, mediciones sobre los datos publicados y revisión de lo que nunca se miró. Complementa a evaluar-modulo y auditar-ux-modulo, que parten del código; esta parte del producto vivo. Usar cuando un módulo ya funciona y se quiere llevar a nivel de terreno.
argument-hint: "<módulo o ruta> [nº de rondas, por defecto 10]"
---

# Rondas de pulido — cazar lo que el código no muestra

Destilada de ~30 rondas reales sobre el módulo de planos (24-08-2026). Todo lo
que sigue salió de lo que **funcionó** o de lo que **falló** ahí, no de teoría.

## Qué encuentra esta skill que las otras no

Los hallazgos de más valor **no se ven leyendo código**:

- Buscar una arandela devolvía **159 filas de la misma arandela** (el 55% del
  catálogo eran repeticiones).
- La primera búsqueda de la sesión contestaba *"sin coincidencias"* mientras
  bajaba el índice: el técnico concluye que su pieza no existe.
- El plano más usado **saltaba la hoja 43** sin decirlo; el dato de que el PDF
  no la trae ya estaba publicado y nadie lo consumía.
- Los botones de navegación medían **23×23 px** — inusables con guantes.
- Un mapeo mandaba a buscar los fusibles a una figura de **chapas**
  (`Sicherungsring` es un seeger, no un fusible).

Ninguno da error, ninguno rompe un test, todos degradan el trabajo real.

---

## Orden de caza (no alterar: rinde de arriba hacia abajo)

### 1. Recorrer como el usuario, en PRODUCCIÓN
Con la tarea concreta de alguien: *"tengo este código en la mano, ¿dónde va?"*.
En el teléfono (375 px), y también **sin sesión** si la ruta es pública.
- Contar lo que sale en pantalla, no lo que debería salir.
- Probar **la primera interacción de una sesión limpia**: mucho se rompe solo ahí.
- Escribir como escribe la gente ("ocupacion cable", no "OCUPACIONCABLE").

### 2. Medir los datos publicados
Bajar el JSON/índice **que sirve producción** y contar sobre él.
- ¿Cuántos duplicados, vacíos, truncados, en otro idioma?
- ¿Los enlaces aterrizan? ¿Los contadores cuadran con el contenido?
- Comparar peso **en red** (gzip), no en disco: dos veces "optimicé" algo que
  pesaba 19 KB porque el archivo en disco decía 297 KB.

### 3. Revisar lo que nunca se miró
Lo que no está en el camino feliz: la otra máquina, el otro plano, el modo
invitado, el archivo generado que quizá nadie consume.
- **Buscar datos generados sin consumidor**: pasó tres veces en un día
  (un mapa de 1.510 códigos, un `busqueda.json` que el subidor no llevaba, un
  campo `faltante` que la UI ignoraba). Grep del nombre del archivo en `src/`.

### 4. Recién ahora, leer código
Solo para explicar algo que YA se observó. Leer código primero produce
sospechas bonitas que no existen.

---

## Criterios de parada

- **Dos rondas seguidas sin hallazgo real ⇒ el módulo está pulido.** Cambiar de
  módulo o parar. No inventar cambios para llenar la ronda.
- Una ronda que cierra con *"medí y no había nada"* **es un resultado válido**:
  reportarla así. De ~30 rondas, 6-7 fueron eso y ahorraron trabajo inútil.
- Si tres rondas seguidas arreglan cosas rotas en rondas anteriores, parar:
  se está generando churn.

## Prioridad cuando hay varios hallazgos

1. Lo que **miente** al usuario (dice 0 cuando hay 9; "sin coincidencias" cuando
   está cargando; promete bodega en una máquina sin SAP).
2. Lo que **manda a buscar donde no está** (un mapeo falso es PEOR que ninguno).
3. Lo que **esconde** información (un listado cortado sin avisar).
4. Lo que **cuesta esfuerzo físico** (targets táctiles, pasos de más).
5. Cosmético — casi nunca vale una ronda.

---

## Reglas de ejecución (las que más fallaron)

- **`tsc` + lint JUSTO ANTES del push**, no cuando creés haber terminado. Se
  rompió el build dos veces por verificar el penúltimo cambio.
- **Leer el lint, no contarlo.** Un "1 problem" que se ignoró era un hook
  después de un early return.
- **Verificar el EFECTO observable**, no que el comando salió 0. Tres veces un
  cambio "pasó" sin hacer nada (el parche no encontró su texto y falló mudo).
- **Un test que pasa no prueba nada**: romper el fix a propósito y confirmar que
  el test falla, con el síntoma real.
- **Mirar el campo correcto.** Dos veces leí un campo equivocado y concluí que
  197 figuras estaban rotas cuando era 1. Ante un número sorprendente, verificar
  el nombre del campo antes de alarmar.
- **Cuerpos de PR y mensajes largos a archivo** (`--body-file`, `commit -F`):
  los backticks en bash se ejecutan y se comen el texto.
- **Un regex que "no matchea" y se ve bien**: comparar `repr()` del `.pattern`
  contra uno compilado en el momento, en el MISMO proceso. Un `\b` mal escapado
  deja un `\x08` invisible.

## Al cerrar cada ronda

- PR chico, con **el número medido** en el título o el cuerpo ("159 filas",
  "24 de 26 controles"), no adjetivos.
- Verificar en producción después del deploy, no solo en local.
- Si el hallazgo revela una trampa reutilizable, anotarla en la memoria del
  proyecto. Si vale para otros repos, en la de proceso.

## Qué NO hacer

- No refactorizar por gusto: el objetivo es lo que le pasa al usuario.
- No tocar lo que no se pudo verificar. Decir "no pude verificar X" es correcto.
- No publicar un dato que mande a buscar donde no está, ni aunque "se vea
  razonable": revisar la evidencia fila por fila.
- No inventar traducciones ni nombres que la fuente no da.

# PLAN — Centro Técnico Documental (Gestión de Activos / NFPA 70B)

> Estado: **PROPUESTA — no codear aún**. Documento de diseño para revisión con Orel.
> Fecha: 2026-06-20. Origen: cursos Electricidad 2026 (Módulo 3 NFPA 70B + RCM).

## 1. Idea en una frase

Un módulo **Centro Técnico Documental** donde cada equipo tiene su **expediente
vivo** (placa, documentos, criticidad/RCM e **historial de mantenimiento**), tal como
exige la NFPA 70B. Es la "central de datos / centro documental" de la que habla el
relator del curso: *"la historia del equipo debe vivir en la planta, no en el disco de
una persona"*.

No es lo mismo que `/aprendizaje` (eso es **formación**). Este es el **núcleo operativo**;
se conecta con Aprendizaje, pero son capas distintas.

## 2. Decisiones tomadas

- **Nombre del módulo:** `Centro Técnico Documental` (término literal del relator).
- **Piloto:** **motores y bombas** — completar 1 expediente real de punta a punta antes
  de generalizar.
- **Ubicación (decidida 2026-06-20):** NO es un módulo aparte. Se **enriquece el módulo
  Equipos existente** (`/equipment`, `EquipmentPage`), que ya tiene `criticidad`, fotos, QR y
  es a lo que apuntan las incidencias (`equipmentId`). La ficha **hereda** repuestos/manuales
  del nodo `hierarchy` vinculado vía `hierarchyNodeId`.
- **Fundamento de datos:** se construye sobre el **modelo vigente** (`equipment` + `hierarchy`),
  NO sobre `plantAssets` (legacy, en retirada — ver `.ai/TASKS.md` Fase 5).

## 3. Lo que YA existe (no se reinventa)

| Pieza NFPA 70B | Ya resuelto en la app |
|---|---|
| Equipo operativo (criticidad, fotos, QR, ficha) | colección `equipment` + `/equipment` (`EquipmentPage`) |
| Ubicación / jerarquía SAP | `hierarchy` (702 nodos) — fuente de verdad de repuestos/manuales |
| Documentos por equipo | colección `manuales` (N:M, heredados vía `hierarchyNodeId`) |
| Repuestos por equipo | maestro `repuestos` con `equipos: [nodeIds]` (N:M) |
| Registro de fallas | módulo `incidents` |
| Predictivo / telemetría | `predictive` + `telemetry` |
| Evidencia fotográfica | `photoEvidence` |
| Formación | `/aprendizaje` (NFPA 70B, RCM, SVB) |

→ El "centro documental" está **~70% construido pero disperso**. Falta consolidarlo y
agregar 3 cosas: **ficha de placa, criticidad/RCM e historial por equipo**.

## 4. Esquema propuesto

### 4.1 Expediente → enriquecer el registro `equipment`

La ficha vive en el registro `equipment` (ya tiene `nombre`, `codigo`, `estado`,
`criticidad`, fotos, QR y `hierarchyNodeId`). Se le agrega un campo dedicado tipado
`fichaTecnica` con los bloques que faltan. Repuestos y manuales **no se duplican**: se leen
del nodo `hierarchy` enlazado por `hierarchyNodeId`.

**Identificación / placa (común):** `nSerie`, `fabricante`, `anio`, `proveedor`,
`fechaInstalacion`.

**Placa específica por tipo** (un motor y una bomba no se documentan igual):

| Motor | Bomba |
|---|---|
| potencia (kW/HP), voltaje, corriente nominal (A), RPM, factor de servicio, clase aislamiento, grado IP, tipo rodamientos, conexión (Y/Δ) | caudal (m³/h), altura/TDH (mca), RPM, Ø impulsor, tipo de sello (mecánico/empaque), NPSH, Ø succión/descarga, material |

**Bloque RCM / criticidad:** `criticidad` ('A'|'B'|'C'), `puntajeCriticidad`,
`justificacion`, `vidaUtilEstimada` (años), `frecuenciaInspeccionDias`,
`condicionActual` (1|2|3 — NFPA 70B Cap. 9, deriva de la última inspección),
`modosFalla: []`. `aniosEnServicio` se calcula de `fechaInstalacion` (no se persiste).

### 4.2 Documentos → extender `manuales`

`manuales` ya es N:M y se hereda vía el `hierarchyNodeId` del registro `equipment`. Añadir
un campo `tipoDoc`: `'manual' | 'plano' | 'certificado' | 'garantia' | 'fichaTecnica'`, y
para garantías `fechaVencimiento`. Así el expediente muestra todo lo documental sin colección
nueva.

### 4.3 Historial → nueva colección `maintenanceLog`

La gran pieza faltante. Una entrada por evento, referenciada al equipo por `equipmentId`:

```
maintenanceLog/{id}
  equipmentId: string          // registro equipment (mismo id que usa incidents)
  hierarchyNodeId?: string     // ubicación SAP, copiada del equipment para consultas
  fecha: Timestamp
  tipo: 'preventivo' | 'correctivo' | 'predictivo' | 'inspeccion' | 'termografia' | 'medicion'
  tecnico: string
  hallazgo: string
  severidad: 'verde' | 'amarillo' | 'rojo'   // mismo código que ya usa incidents
  mediciones?: { temperatura?, vibracion?, aislamientoMOhm?, ... }
  fotos?: string[]
  incidenciaId?: string        // enlace a incidents
  repuestosUsados?: { repuestoId, cantidad }[]
  proximaInspeccion?: Timestamp
```

**Estructura del formulario (NFPA 70B §2.2 — las 5 preguntas):** cada entrada / orden de
trabajo responde **Why** (¿por qué intervenir?), **Where** (¿en qué equipo o componente?),
**What** (¿qué intervención?), **Who** (¿quién?) y **How** (¿cómo? — seguridad y
procedimiento). Esos campos ya están cubiertos por `tipo`, `equipmentId`, `hallazgo`,
`tecnico` y la referencia al procedimiento.

**Clave de diseño:** que `incidents` (y termografías) **escriban aquí automáticamente**,
para que la historia se construya sola y no dependa de captura manual.

### 4.4 Regla de criticidad (RCM) — anclada a la norma

**Definición normativa (NFPA 70B §2.4):** un equipo es **crítico** si la falla de su
funcionamiento causa una *seria amenaza al personal, la propiedad o el producto*. Esos
tres son los criterios base. Se operacionaliza puntuando 1–3 cada factor (rango 5–15):

| Factor | Criterio NFPA 70B | Pregunta |
|---|---|---|
| Personal | seguridad de las personas | ¿Riesgo a personas si falla? |
| Producto | continuidad del producto | ¿Para la línea si falla? |
| Propiedad | daño a la instalación | ¿Daño/derrame o costo de reemplazo alto? |
| Redundancia | (operativo) | ¿Hay equipo de respaldo? |
| Historial de fallas | (operativo) | ¿Ha fallado antes? |

→ 12–15 = **A**, 8–11 = **B**, 5–7 = **C**.

La criticidad **deriva** `frecuenciaInspeccionDias`. Rango normativo (NFPA 70B §2.11): el
ciclo de pruebas va de **6 meses a 3 años** según uso y condiciones ambientales →
A ≈ 180 d, B ≈ 365 d, C ≈ 1095 d (las inspecciones visuales/termografía pueden ser más
frecuentes que las pruebas).

### 4.4.1 Modelo de DOS ejes (NFPA 70B 2023, Capítulo 9)

Hallazgo clave de la edición 2023: la frecuencia no depende solo de la criticidad, sino de
**dos ejes** que se cruzan:

- **Eje 1 — Consecuencia = `criticidad` A/B/C** (§2.4: amenaza a personal/propiedad/producto).
- **Eje 2 — `condicionActual` del equipo (Condition 1/2/3, Cap. 9)** — sale de la última
  inspección y mapea directo al semáforo que ya usamos:
  - **Condición 1** (🟢 como nuevo, sin alertas) → se puede **alargar** el intervalo.
  - **Condición 2** (🟡 mediciones se desvían, requiere reparación menor) → se **mantiene**.
  - **Condición 3** (🔴 saltó las últimas 2 inspecciones o fallas repetidas) → se **acorta** /
    acción correctiva.

→ Implicación de producto: la app puede **proponer sola la próxima fecha de inspección**
cruzando `criticidad` × `condicionActual` (último `severidad` del historial). Esto es la
Tabla 9.2.2 de la norma hecha función.

**Regla de la norma (§9.2.2):** un intervalo solo es obligatorio si otro capítulo lo
referencia (9.2.2.1); puede alterarse según el riesgo a personas/operación (9.2.2.2); y
**toda desviación debe quedar documentada en el EMP** (9.2.2.3). El EMP (*Electrical
Maintenance Program*) es justamente lo que este módulo materializa: **el Centro Técnico
Documental ES el registro del EMP**.

### 4.5 Puente Aprendizaje ↔ Operación

Cada bloque del expediente lleva un enlace "¿qué es esto?" que abre la lección
correspondiente en `/aprendizaje` (RCM, criticidad, NFPA 70B). Así el técnico aprende
en el contexto del trabajo real.

## 5. Alcance del piloto

Equipos elegidos (nodos reales de `hierarchy`, sistema de refrigeración NH₃ — criticidad A
por amenaza a personal/producto, coherente con la narrativa de la norma):

- **Motor:** `720004608` — MOTOR ELECTRICO BOMBA FLUJO NH3 N2
- **Bomba:** `720004607` — BOMBA FLUJO NH3 N2

Pasos:
1. Completar su expediente de punta a punta: placa + documentos + criticidad +
   `condicionActual` + 1–2 entradas de historial.
2. Validar la pantalla "ficha de equipo" con Orel.
3. Recién ahí: generalizar y cablear el auto-registro desde `incidents` + el cálculo de
   próxima inspección (criticidad × condición, §4.4.1).

## 6. Restricciones (convenciones del repo)

- NO tocar `firestore.rules` / `functions/` / `firebase.json` sin pedido explícito
  (proyecto Firebase compartido).
- NO construir sobre `plantAssets` (legacy en retirada).
- Verificación antes de cualquier PR: `npx tsc --noEmit` + `eslint` limpios + preview.

## 7. Decisiones (cerradas 2026-06-20)

- [x] **Criticidad** → anclada a NFPA 70B §2.4 + modelo de dos ejes con `condicionActual`
  (§4.4 / §4.4.1). No es regla inventada.
- [x] **Ubicación** → **enriquecer el módulo Equipos** (`/equipment`), NO módulo aparte. La
  ficha hereda repuestos/manuales del nodo `hierarchy` vía `hierarchyNodeId`. (Ver §2.)
- [x] **`fichaTecnica`** → **campo dedicado y tipado** en el registro `equipment` (no dentro de
  `metadata`). Razón: tipado TS, validable y consultable.
- [x] **`maintenanceLog`** → **colección plana top-level** con `equipmentId` indexado (no
  subcolección). Razón: consistente con el patrón del repo (`incidents`, `manuales`, `bodega`)
  y habilita consultas transversales (todos los 🔴 del mes, termografías por vencer, tableros).
- [x] **Piloto** → motor `720004608` + bomba `720004607` (sistema NH₃). Ver §5.
  ⚠️ Verificar en datos vivos que existen como registros `equipment` (si `equipment` solo tiene
  equipos con incidencia, sembrar la ficha desde su nodo `hierarchy`).

## 8. Próximos pasos

1. Mockup de la pantalla "ficha de equipo" (en revisión con Orel).
2. Cerrar §7.
3. Recién entonces: implementación incremental (tipos → lectura → UI → auto-registro).

## 9. Base normativa — la "plantilla" según NFPA 70B

La NFPA 70B no trae un formulario con casillas, sino la **lista de qué debe contener la
documentación de cada equipo**. El manual del curso (Módulo 3, Sección 2) la transcribe
cláusula por cláusula con la etiqueta "(NFPA 70B)". Mapeo a los bloques del expediente:

| La norma exige | Cláusula | Bloque del expediente |
|---|---|---|
| Registros completos de datos de rotulación (placa) | §2.2 | Datos de placa |
| Diagramas unifilares y esquemáticos | §2.2 | Documentos · plano |
| Catálogos de los fabricantes | §2.2 | Documentos · manual |
| Procedimientos de inspección y prueba por área | §2.2 | Documentos · procedimiento + checklist |
| Copias de informes anteriores | §2.2 | Historial (`maintenanceLog`) |
| Catálogo de almacenamiento / repuestos | §2.2 | Repuestos vinculados (maestro + bodega) |
| Suministro de formularios de informe | §2.2 / §2.6 | Formulario de la entrada de historial |
| Identificación de equipo crítico | §2.4 | Campo `criticidad` (def. normativa) |
| Programa sistemático: atmósfera, carga, registro histórico, frecuencia | §2.5 | Ficha (ambiente/carga) + Historial + RCM |
| Frecuencia de pruebas: ciclo 6 meses – 3 años | §2.11 | `frecuenciaInspeccionDias` |
| Equipos importados: catálogos/manuales/planos en idioma del usuario | §2.7 | Documentos |
| Procedimientos de emergencia | §2.3 / §2.6 | Documento + campo de la OT |

→ Conclusión: el expediente propuesto **cubre 1:1 lo que pide la NFPA 70B**. No se inventa
estructura; se implementa la que dicta la norma.

### Bibliografía citada por el curso (fuentes normativas)

1. **NFPA 70B (2023)** — Norma para el Mantenimiento del Equipo Eléctrico (principal).
2. OSHA 1910.269 — Generación, transmisión y distribución de energía eléctrica.
3. **SEC — Pliego Técnico RPTD N°15 (Operación y Mantenimiento)** — el "pliego chileno"; revisar
   si trae formato propio de registro de O&M.
4. SEC — Pliego Técnico RPTD N°17.
5. DS 08/2019 (RIC) y Decreto Supremo 109/2018.
6. Normas ASTM e IEEE (ensayos y métodos de prueba).

> **Pendiente de profundizar:** la edición completa de NFPA 70B 2023 trae anexos
> informativos con formularios de ejemplo y el Capítulo 9 con tareas/intervalos por tipo de
> equipo. No están en el material del curso (solo el digest). Si Orel consigue el estándar
> completo o el RPTD N°15, se puede afinar el checklist por tipo de equipo.

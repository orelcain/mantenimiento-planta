# Costos GCP — causa de la fuga de agosto 2026 y cómo vigilar el gasto

Cuenta de facturación: **"app inventario repuestos imagenes"** (`019228-F1A0F9-23F524`,
orelcain23@gmail.com). El 99,99% del gasto es el proyecto **mantenimiento-planta-771a3**;
los otros proyectos de la cuenta (app-inventario-repuestos, baader-repuestos,
gestion-empresa-cl) gastan centavos o nada.

## Qué pasó en agosto 2026 (CLP 71.013 vs ~13.600 histórico)

| SKU | Agosto | Julio | Causa |
|---|---:|---:|---|
| Cloud Firestore **Read Ops Santiago** | 45.247 (114M lecturas) | ~770 | monitor público (backend) |
| Cloud Run Functions CPU | 20.593 (305 h) | ~11.100 | pulso 1-min 24/7 + trigger |
| Firestore egress + resto | ~5.200 | ~1.800 | arrastre de lo anterior |

⚠ Firestore de este proyecto vive en **región Santiago** (southamerica-west1): cada
lectura cuesta ~2× lo de us-central1. No se migra (cirugía mayor), pero significa que
cualquier fuga de lecturas acá duele el doble.

### La causa raíz (confirmada en código, PR `fix/costos-firestore-monitor`)

**No era el cliente ni las TVs** — la pantalla pública hace `onSnapshot` de UN doc.
Era el backend del monitor público:

1. El sync de Shoplogix reescribe el doc padre del turno **en cada ciclo** aunque nada
   cambie (renueva `lastSyncAt`), y cada write dispara
   `onShoplogixShiftWrittenPublicMonitor`.
2. Ese trigger ejecutaba **7 barridos `listDocuments()` de la colección completa de
   turnos** (Firestore cobra 1 lectura por doc devuelto) × hasta 12 `buildMonitorLive`
   por refresco ≈ **4.000 lecturas por patch × ~2 patches/min = 6-7M lecturas/día**.
   Como la colección crece 3-4 docs/día desde abril, el costo subía en RAMPA.
3. `shoplogixPulseWakeup` corría cada minuto 24/7 sin chequear si había turno.
4. Los turnos "prueba" (<500 pz) nunca se cacheaban y se reconstruían por siempre.

### El fix (mismo PR)

- `loadShiftIndex()`: la lista de turnos se lee **una vez por evento** con una query
  acotada a 45 días por rango de `documentId`, y viaja por parámetro a todos los
  builders. Corta ~90% de las lecturas.
- Debounce del trigger (`parentSinCambioReal`): un write que solo renueva `lastSyncAt`
  no refresca nada.
- El pulso sale temprano si todos los monitores tienen su turno sellado
  (`live.shiftClosed`).
- Los turnos descartados quedan anotados en el doc del monitor
  (`statsDescartados` / `forecastDescartados`) y no se reconstruyen más.

**Regla para el futuro:** en `functions/`, jamás `listDocuments()` ni `getDocs` de una
colección que crece con el tiempo dentro de un trigger o un cron. Siempre acotar por
rango de `documentId`/fecha, y si varios consumidores necesitan la misma lista en una
invocación, leerla UNA vez y pasarla por parámetro.

## Presupuestos y export (estado desde sept 2026)

- Presupuesto **USD 20/mes** en la cuenta, alertas al 25/50/75/100% del gasto **real**
  (el viejo de USD 10 llegaba a 150% el día 1: no avisaba nada útil).
- **Export estándar de facturación a BigQuery habilitado** → desglose real por SKU/día
  consultable con SQL de aquí en adelante.

## Cómo revisar el gasto en 1 minuto (cada semana)

1. Abrir <https://console.cloud.google.com/billing/019228-F1A0F9-23F524/reports>
   (cuenta orelcain23@gmail.com).
2. En el resumen de Gemini Cloud Assist de arriba ya se ve el total del mes y el
   pronóstico. Regla de dedo: **>CLP 500/día sostenido = investigar**.
3. Si hay salto: agrupar por **SKU** y filtrar el mes → el SKU que creció es el
   culpable. `Cloud Firestore Read Ops Santiago` = lecturas del backend (revisar
   triggers/crons recientes en `functions/`); `Cloud Run functions CPU` = alguna
   función corriendo demasiado o muy seguido.
4. Métrica interna de sanidad: en Logs Explorer, la línea
   `[publicShiftMonitor] refrescados` no debería aparecer de madrugada con la planta
   parada (el debounce la silencia). Si reaparece 24/7, algo volvió a escribir el doc
   padre con cambios de verdad… o alguien rompió el debounce.

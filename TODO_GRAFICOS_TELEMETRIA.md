# TODO: Gráficos de Historial de Telemetría

## Feature Request
Agregar gráficos para visualizar el historial de cambios de temperatura y humedad en el tiempo.

## Requisitos
1. **Página de detalle de equipo** con gráficos históricos
2. **Bibliotecas sugeridas**:
   - [Recharts](https://recharts.org/) (React, ligera)
   - [Chart.js](https://www.chartjs.org/) + react-chartjs-2
   - [Visx](https://airbnb.io/visx/) (D3 + React)

3. **Datos históricos**:
   - Almacenar en Firestore (mejor para queries históricos)
   - O agregar índice temporal en RTDB `sensors/{equipId}/history/{timestamp}`
   - Limitar a últimas 24h/7 días para no saturar

4. **Componentes necesarios**:
   ```tsx
   // TelemetryChart.tsx
   - LineChart temperatura (últimas 24h)
   - LineChart humedad (últimas 24h)
   - Selector de rango temporal (1h, 6h, 24h, 7d)
   - Indicadores de umbrales (warning/critical)
   ```

5. **Estructura de datos históricos**:
   ```typescript
   // Firestore: telemetryHistory collection
   {
     equipmentId: string
     deviceId: string
     timestamp: Timestamp
     temperatura: number
     humedad: number
     status: 'normal' | 'warning' | 'critical'
   }
   ```

6. **Query Firestore**:
   ```typescript
   const last24h = query(
     collection(db, 'telemetryHistory'),
     where('equipmentId', '==', equipmentId),
     where('timestamp', '>=', Timestamp.fromDate(new Date(Date.now() - 24*60*60*1000))),
     orderBy('timestamp', 'asc')
   )
   ```

## Estimación
- **Complejidad**: Media
- **Tiempo estimado**: 4-6 horas
- **Prioridad**: Media (feature nice-to-have, no bloqueante)

## Dependencias
- Implementar almacenamiento histórico (ESP32 o Cloud Function)
- Agregar índices Firestore
- Instalar biblioteca de gráficos

## Notas
- Considerar costos de almacenamiento histórico (Firestore cobra por documento)
- Posible solución: agregación diaria para reducir documentos
- Alternativa: usar Firebase Realtime Database con TTL (auto-delete)

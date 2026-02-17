# Integración LOGO! 8 → PWA (Contrato RTDB)

## Objetivo
Conectar sensores/variables de un PLC Siemens LOGO! 8 al módulo de sensores de la PWA **sin cambiar frontend**, escribiendo en el mismo esquema RTDB que ya usa `ESP32`.

## Esquema RTDB requerido por la PWA

### 1) Estado del dispositivo
Ruta: `devices/{deviceId}`

Campos mínimos:
- `online: boolean`
- `lastSeen: number` (epoch ms)
- `deviceName: string`
- `deviceType: "logo8"`
- `assignedEquipmentId: string | null`
- `telemetry.temperatura.value: number`
- `telemetry.temperatura.unit: "°C"`
- `telemetry.temperatura.status: "normal" | "warning" | "critical"`
- `telemetry.temperatura.timestamp: number` (epoch ms)
- `telemetry.humedad.value: number`
- `telemetry.humedad.unit: "%"`
- `telemetry.humedad.status: "normal" | "warning" | "critical"`
- `telemetry.humedad.timestamp: number` (epoch ms)
- `telemetry.source: "logo8"`

### 2) Resumen por equipo
Ruta: `sensors/{equipmentId}`

Campos mínimos:
- `online: boolean`
- `lastSeen: number`
- `equipmentId: string`
- `temperatura` (mismo shape de `telemetry.temperatura`)
- `humedad` (mismo shape de `telemetry.humedad`)

### 3) Histórico para gráficos
Ruta: `sensors/{equipmentId}/readings/{pushId}`

Campos por lectura:
- `timestamp: number` (epoch ms)
- `temperature: number`
- `humidity: number`
- `tempStatus: "normal" | "warning" | "critical"`
- `humStatus: "normal" | "warning" | "critical"`
- `source: "logo8"`

## Pipeline recomendado
1. `LOGO! 8` expone variables por `Modbus TCP`.
2. `Gateway` (Node-RED o servicio Node.js/Python en edge PC) lee registros cada 5-15s.
3. El gateway transforma y publica en RTDB con el contrato anterior.
4. La PWA consume en tiempo real (`/sensors` y `/sensors/monitor`) sin cambios adicionales.

## Mapeo sugerido (ejemplo)
- `VW0` → temperatura (divisor `10`)
- `VW2` → humedad/proxy proceso (divisor `10` o `100` según instrumento)
- bit de comunicación/heartbeat → `online`

## Reglas de calidad de dato
- Todos los timestamps en **ms epoch UTC**.
- Publicar `lastSeen` en cada ciclo.
- Si pasan más de 2 ciclos sin lectura válida, setear `online=false`.
- No escribir `NaN`; usar omisión de campo o último valor válido con estado `warning`.

## Seguridad mínima
- Usar credencial de servicio dedicada para el gateway.
- No usar secretos embebidos en firmware del PLC.
- Limitar permisos RTDB al subárbol de dispositivos/sensores de planta.

## Payload de referencia

```json
{
  "devices": {
    "logo8-linea1": {
      "online": true,
      "lastSeen": 1771224000000,
      "deviceName": "LOGO8 Línea 1",
      "deviceType": "logo8",
      "assignedEquipmentId": "eq-linea1-compresor",
      "telemetry": {
        "temperatura": {
          "value": 28.4,
          "unit": "°C",
          "status": "normal",
          "timestamp": 1771224000000
        },
        "humedad": {
          "value": 63.1,
          "unit": "%",
          "status": "warning",
          "timestamp": 1771224000000
        },
        "source": "logo8"
      }
    }
  }
}
```

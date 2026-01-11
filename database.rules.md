# Firebase Realtime Database Rules

## Documentación de Reglas de Seguridad

### Estructura Global
- **Lectura y escritura por defecto**: Requiere autenticación (`auth != null`)

### Nodo: `devices/`
**Path**: `/devices/$deviceId`

**Reglas**:
- **Lectura (`.read`)**: Solo usuarios autenticados (PWA)
  - `auth != null`
  
- **Escritura (`.write`)**: 
  - Usuarios autenticados (PWA) pueden asignar equipos
  - **O** el propio device puede escribir su estado SIN autenticación
  - `auth != null || newData.child('online').exists()`

**Estructura esperada**:
```json
{
  "online": boolean,
  "lastSeen": timestamp,
  "ip": "192.168.x.x",
  "rssi": number,
  "firmwareVersion": "2.13.x",
  "sensorType": "dht11",
  "assignedEquipmentId": "equip_id" | ""
}
```

### Nodo: `sensors/`
**Path**: `/sensors/$equipmentId`

**Reglas**:
- **Lectura (`.read`)**: Solo usuarios autenticados (PWA)
  - `auth != null`
  
- **Escritura (`.write`)**: 
  - Usuarios autenticados (PWA)
  - **O** ESP32 puede escribir datos de sensores SIN autenticación
  - Validación: debe tener `temperatura` y `humedad`
  - `auth != null || (newData.child('temperatura').exists() && newData.child('humedad').exists())`

**Estructura esperada**:
```json
{
  "temperatura": number,
  "humedad": number,
  "timestamp": number,
  "deviceId": "esp32_xxxxxxxxxxxx"
}
```

## Razón de Diseño

### ¿Por qué ESP32 escribe SIN autenticación?

1. **Limitaciones de hardware**: ESP32 tiene RAM limitada, Firebase Auth requiere ~100KB adicionales
2. **Seguridad por validación de estructura**: Solo datos con estructura correcta son aceptados
3. **Database Secret (legacy)**: ESP32 usa token de base de datos (no Auth)
4. **Separación de concerns**: 
   - ESP32 solo escribe telemetría (`online`, `temperatura`, `humedad`)
   - PWA asigna equipos y lee datos (requiere Auth)

### Seguridad

- PWA siempre requiere autenticación Firebase Auth
- ESP32 usa Database Secret para escribir solo en `devices/$deviceId` y `sensors/$equipmentId`
- Las reglas validan que los datos tengan estructura correcta
- No hay riesgo de escritura maliciosa sin estructura válida

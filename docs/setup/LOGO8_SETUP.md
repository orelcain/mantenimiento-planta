# 🔌 Configuración LOGO 8 → Firebase

> Nota (2026-02): para integración directa con el módulo actual de sensores de la PWA usar el contrato de RTDB definido en `docs/setup/LOGO8_PWA_RTDB_CONTRACT.md`.

## Hardware Disponible
- ✅ LOGO 8 (ya disponible)
- 📦 ESP32 Gateway (comprar: $8)

## 3 Opciones de Conexión

### **OPCIÓN 1: ESP32 Gateway Modbus TCP** (RECOMENDADA)

**Ventajas:**
- WiFi directo → Firebase
- Bajo costo ($8)
- No requiere servidor intermedio
- Datos en tiempo real

**Hardware necesario:**
```
ESP32 DevKit: $5
MAX485 Module: $3 (conversor RS485/TTL)
Cables dupont: $1
Total: $9 USD
```

**Conexión física:**
```
LOGO 8              MAX485         ESP32
─────────────      ────────────   ──────────
A (RS485) ────→   A              
B (RS485) ────→   B              
               RO ───────────→   GPIO16 (RX)
               DI ←───────────   GPIO17 (TX)
               GND ←──────────   GND
               VCC ←──────────   3.3V
```

**Firmware ESP32:**
```cpp
#include <WiFi.h>
#include <FirebaseESP32.h>
#include <ModbusMaster.h>

// Config WiFi
const char* ssid = "PlantaWiFi";
const char* password = "tu_password";

// Config Firebase
#define FIREBASE_HOST "tu-proyecto.firebaseio.com"
#define FIREBASE_AUTH "tu_api_key"

// Modbus
ModbusMaster node;
FirebaseData fbdo;

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, 16, 17); // RX=16, TX=17
  
  // WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado");
  
  // Firebase
  Firebase.begin(FIREBASE_HOST, FIREBASE_AUTH);
  Firebase.reconnectWiFi(true);
  
  // Modbus (Slave ID 1)
  node.begin(1, Serial2);
}

void loop() {
  // Leer VW0 (Temperatura Motor 1)
  uint8_t result = node.readHoldingRegisters(0, 1);
  if (result == node.ku8MBSuccess) {
    float temp = node.getResponseBuffer(0) / 10.0; // Dividir por 10 si usas 1 decimal
    Firebase.setFloat(fbdo, "/iot/logo8/motor1/temperature", temp);
    Firebase.setTimestamp(fbdo, "/iot/logo8/motor1/timestamp");
    Serial.print("Temp Motor 1: "); Serial.println(temp);
  }
  
  // Leer VW2 (Presión Bomba 1)
  result = node.readHoldingRegisters(2, 1);
  if (result == node.ku8MBSuccess) {
    float pressure = node.getResponseBuffer(0) / 100.0; // bar
    Firebase.setFloat(fbdo, "/iot/logo8/pump1/pressure", pressure);
    Firebase.setTimestamp(fbdo, "/iot/logo8/pump1/timestamp");
    Serial.print("Presión Bomba 1: "); Serial.println(pressure);
  }
  
  // Leer VW4 (Corriente Compresor 1)
  result = node.readHoldingRegisters(4, 1);
  if (result == node.ku8MBSuccess) {
    float current = node.getResponseBuffer(0) / 10.0; // Amperios
    Firebase.setFloat(fbdo, "/iot/logo8/compressor1/current", current);
    Firebase.setTimestamp(fbdo, "/iot/logo8/compressor1/timestamp");
    Serial.print("Corriente Compresor 1: "); Serial.println(current);
  }
  
  // Leer M0.0 (Alarma Vibración)
  result = node.readCoils(0, 1);
  if (result == node.ku8MBSuccess) {
    bool alarm = node.getResponseBuffer(0);
    Firebase.setBool(fbdo, "/iot/logo8/motor1/vibration_alarm", alarm);
    if (alarm) {
      Serial.println("⚠️ ALARMA VIBRACIÓN ACTIVA");
      // Opcional: Trigger para crear incidencia automática
      Firebase.setBool(fbdo, "/iot/alerts/vibration_motor1", true);
    }
  }
  
  delay(30000); // Leer cada 30 segundos
}
```

---

### **OPCIÓN 2: LOGO! Web Server** (Sin hardware adicional)

**Ventajas:**
- No requiere ESP32
- Usa WiFi integrado del LOGO 8 (si tiene CMR2020)

**Limitaciones:**
- Requiere polling HTTP (más lento)
- No es tiempo real

**Configuración LOGO 8:**
1. TIA Portal → Habilitar Web Server
2. Configurar IP fija (ej: 192.168.1.100)
3. Crear página web con variables

**Firebase Function (Node.js):**
```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();

exports.pollLOGO8 = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const LOGO_IP = '192.168.1.100';
    
    try {
      // Leer variables via HTTP
      const response = await axios.get(`http://${LOGO_IP}/VarTable.xml`);
      const data = parseXML(response.data); // Parsear XML
      
      // Guardar en Firestore
      await admin.firestore().collection('iot_readings').add({
        deviceId: 'logo8',
        temperature: data.VW0,
        pressure: data.VW2,
        current: data.VW4,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      console.log('Datos LOGO 8 actualizados');
    } catch (error) {
      console.error('Error leyendo LOGO 8:', error);
    }
  });
```

---

### **OPCIÓN 3: TIA Portal + Node-RED** (Avanzada)

**Ventajas:**
- Más control y flexibilidad
- Dashboard Node-RED integrado

**Requiere:**
- PC/Servidor siempre encendido
- Node-RED instalado
- LOGO 8 con Ethernet

---

## 📋 Paso a Paso (Opción 1 - Recomendada)

### **1. Comprar Hardware**
- Amazon/AliExpress: "ESP32 DevKit" + "MAX485 Module"
- Costo total: ~$8-10 USD
- Envío: 1-2 semanas

### **2. Configurar LOGO 8 en TIA Portal**

**Mapeo de variables sugerido:**
```
VW0  = Temperatura Motor 1 (°C × 10)     → 250 = 25.0°C
VW2  = Presión Bomba 1 (bar × 100)       → 350 = 3.50 bar
VW4  = Corriente Compresor 1 (A × 10)    → 125 = 12.5 A
VW6  = RPM Motor 1                        → 1450 rpm
VW8  = Flujo Bomba 1 (L/min)             → 45 L/min
VW10 = Temperatura Bomba 1 (°C × 10)     → 380 = 38.0°C

M0.0 = Alarma Vibración Motor 1
M0.1 = Alarma Sobrecalentamiento
M0.2 = Alarma Sobrecarga
M0.3 = Alarma Fallo General
```

**Configurar Modbus RTU Slave:**
1. TIA Portal → Propiedades LOGO 8
2. Pestaña "Comunicación"
3. Habilitar "Modbus RTU Slave"
4. Slave Address: 1
5. Baud Rate: 9600
6. Parity: None
7. Stop Bits: 1

### **3. Instalar Librerías ESP32**

Arduino IDE:
```
Sketch → Include Library → Manage Libraries

Buscar e instalar:
- FirebaseESP32 by Mobizt
- ModbusMaster by Doc Walker
```

### **4. Subir Firmware ESP32**
1. Copiar código de arriba
2. Modificar credenciales WiFi
3. Modificar Firebase URL/Auth
4. Tools → Board → ESP32 Dev Module
5. Upload

### **5. Probar Conexión**

Arduino Serial Monitor (115200 baud):
```
WiFi conectado
Temp Motor 1: 25.3
Presión Bomba 1: 3.52
Corriente Compresor 1: 12.8
```

Firebase Console → Realtime Database:
```json
{
  "iot": {
    "logo8": {
      "motor1": {
        "temperature": 25.3,
        "timestamp": 1703721234567,
        "vibration_alarm": false
      },
      "pump1": {
        "pressure": 3.52,
        "timestamp": 1703721234567
      },
      "compressor1": {
        "current": 12.8,
        "timestamp": 1703721234567
      }
    }
  }
}
```

---

## 🔧 Troubleshooting

### Error: "Modbus response timeout"
- ✅ Verificar conexión A/B (RS485)
- ✅ Revisar Slave ID (debe ser 1)
- ✅ Confirmar baud rate (9600)
- ✅ Voltaje MAX485 debe ser 3.3V (NO 5V)

### Error: "Firebase auth failed"
- ✅ Verificar `FIREBASE_AUTH` en código
- ✅ Firebase Console → Settings → Database secrets

### WiFi no conecta
- ✅ SSID/Password correctos
- ✅ ESP32 en rango de señal
- ✅ Router permite nuevos dispositivos

---

## 📊 Siguiente Paso: Dashboard IoT

Crear en tu PWA:
```tsx
// components/iot/IoTDashboard.tsx
import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { database } from '@/lib/firebase'

export function IoTDashboard() {
  const [data, setData] = useState<any>({})
  
  useEffect(() => {
    const iotRef = ref(database, 'iot/logo8')
    return onValue(iotRef, (snapshot) => {
      setData(snapshot.val() || {})
    })
  }, [])
  
  return (
    <div className="grid grid-cols-3 gap-4">
      <SensorCard 
        title="Motor 1 - Temperatura"
        value={data.motor1?.temperature}
        unit="°C"
        threshold={50}
      />
      <SensorCard 
        title="Bomba 1 - Presión"
        value={data.pump1?.pressure}
        unit="bar"
        threshold={5}
      />
      <SensorCard 
        title="Compresor 1 - Corriente"
        value={data.compressor1?.current}
        unit="A"
        threshold={15}
      />
    </div>
  )
}
```

---

## ✅ Checklist

- [ ] Comprar ESP32 + MAX485 ($8)
- [ ] Mapear variables LOGO 8 en TIA Portal
- [ ] Configurar Modbus RTU Slave
- [ ] Instalar librerías Arduino
- [ ] Subir firmware ESP32
- [ ] Probar lectura datos
- [ ] Verificar Firebase Realtime DB
- [ ] Crear dashboard IoT en PWA

**Tiempo estimado:** 1 día (cuando llegue hardware)

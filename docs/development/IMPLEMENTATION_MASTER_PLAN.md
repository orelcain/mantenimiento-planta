# 🚀 PLAN MAESTRO DE IMPLEMENTACIÓN
**4 Tipos de Mantenimiento + IA + IoT**

## 📋 RESUMEN EJECUTIVO

**Objetivo:** Sistema completo de mantenimiento inteligente con LOGO 8 + ESP32 + IA (Groq)  
**Duración:** 12 semanas  
**Costo:** $0 APIs + ~$350 hardware ESP32 (20 nodos)  
**Prioridad:** LOGO 8 primero (ya disponible) → ESP32 después

---

## 🎯 SPRINTS

### **SPRINT 1: Quick Wins + IA Básica** (2 semanas)
✅ **Completado parcialmente**
- [x] Tipos TypeScript IoT y IA
- [x] Servicio `ai.ts` con Groq
- [ ] Botón delete en `IncidentDetail.tsx`
- [ ] Opción "Otro" en síntomas
- [ ] Obtener API Key Groq: https://console.groq.com/keys

**Entregables:**
- UI mejorada (delete + otro síntoma)
- IA generando síntomas contextuales
- Análisis de patrones básico

---

### **SPRINT 2: Integración LOGO 8** (3 semanas) - **PRIORITARIO**
**Hardware:** LOGO 8 existente

**Tareas:**
1. **Configurar conectividad LOGO 8 → Firebase**
   - Opción A: Modbus TCP (requiere gateway ESP32/Raspberry Pi)
   - Opción B: LOGO! Web Server → HTTP polling
   - Opción C: TIA Portal + Node-RED

2. **Mapear variables LOGO 8**
   ```
   VW0: Temperatura motor 1
   VW2: Presión bomba 1
   VW4: Corriente compresor 1
   M0.0: Alarma vibración
   ```

3. **Crear servicio `iot.ts`**
   - Leer datos LOGO 8 cada 30s
   - Detectar anomalías
   - Auto-crear incidentes críticos

4. **Dashboard IoT básico**
   - Mostrar valores en tiempo real
   - Alertas visuales
   - Histórico 24h

**Entregables:**
- LOGO 8 conectado a Firebase
- Datos en tiempo real en PWA
- Auto-generación de incidentes

---

### **SPRINT 3: ESP32 Prototipo** (2 semanas)
**Hardware:** Comprar kit de prueba ($50)

**Componentes:**
```
ESP32 DevKit: $5
ADXL345 (vibración): $2
DS18B20 (temperatura): $1
ACS712 (corriente): $3
Cables + proto-board: $10
```

**Firmware ESP32:**
```cpp
// Sensores → Firebase cada 5 min
void loop() {
  float vib = readVibration();
  float temp = readTemperature();
  float curr = readCurrent();
  
  Firebase.setFloat("sensors/motor-01/vibration", vib);
  Firebase.setFloat("sensors/motor-01/temperature", temp);
  Firebase.setFloat("sensors/motor-01/current", curr);
  
  delay(300000); // 5 min
}
```

**Entregables:**
- Firmware funcional
- 1 nodo ESP32 operativo
- Validación datos precisos

---

### **SPRINT 4: IA Predictiva** (2 semanas)
**Requisitos:** Datos de Sprints 2-3

**Implementar:**
1. **Análisis de tendencias**
   - Detectar degradación progresiva
   - Alertas tempranas (7-14 días antes)

2. **Predicción de fallas**
   - Usar `predictNextFailure()` de `ai.ts`
   - Calcular probabilidad + días estimados

3. **Mantenimiento Predictivo automático**
   - Generar tareas preventivas antes de falla
   - Notificar técnicos

**Entregables:**
- Sistema predice fallas 7 días antes
- Reduce correctivos en 40%
- Dashboard con predicciones

---

### **SPRINT 5: IA Proactiva** (2 semanas)
**Requisitos:** 3 meses de datos históricos

**Implementar:**
1. **Análisis de causa raíz**
   - Usar `analyzeRootCause()` de `ai.ts`
   - Identificar patrones profundos

2. **Recomendaciones proactivas**
   - Soluciones permanentes
   - ROI calculado

3. **Mantenimiento Proactivo automático**
   - Eliminar recurrencias
   - Optimización continua

**Entregables:**
- IA sugiere mejoras permanentes
- Reduce correctivos en 70%
- ROI documentado

---

### **SPRINT 6: Escala IoT** (1 semana)
**Hardware:** 15-20 nodos ESP32

**Tareas:**
1. Fabricar cases impresos 3D
2. Instalar en equipos críticos
3. Configurar alertas por equipo
4. Entrenar IA con datos reales

**Costo:**
- 20 nodos × $16 = $320 USD

**Entregables:**
- 20+ equipos monitoreados
- Cobertura 80% equipos críticos

---

## 🏗️ ARQUITECTURA TÉCNICA

```
┌─────────────────────────────────────┐
│         PLANTA INDUSTRIAL           │
├─────────────────────────────────────┤
│  LOGO 8 → Modbus TCP → ESP32 Gateway│
│     ↓                                │
│  Firebase Realtime DB                │
│                                      │
│  ESP32 #1 (Motor) → WiFi → Firebase │
│  ESP32 #2 (Bomba) → WiFi → Firebase │
│  ESP32 #3 (Compresor) → WiFi        │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│    FIREBASE FUNCTIONS (Triggers)    │
├─────────────────────────────────────┤
│  • detectAnomaly()                  │
│  • autoCreateIncident()             │
│  • callGroqAI()                     │
│  • generatePrediction()             │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│         GROQ AI (FREE)              │
├─────────────────────────────────────┤
│  • Análisis de patrones             │
│  • Predicción de fallas             │
│  • Causa raíz                       │
│  • Recomendaciones                  │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│      PWA REACT (Frontend)           │
├─────────────────────────────────────┤
│  • Dashboard IoT tiempo real        │
│  • Alertas predictivas              │
│  • Gestión incidencias              │
│  • 4 tipos mantenimiento            │
└─────────────────────────────────────┘
```

---

## 📊 TIPOS DE MANTENIMIENTO

### **1. CORRECTIVO (Actual + IA asistida)**
- Técnico reporta falla
- IA sugiere síntomas contextuales
- IA busca casos similares
- IA sugiere solución

### **2. PREVENTIVO (Actual + Auto-programación)**
- Tareas programadas
- IA optimiza frecuencias
- Auto-genera según histórico

### **3. PREDICTIVO (IoT + IA)**
- Sensores monitorean 24/7
- IA detecta tendencias
- Alerta 7-14 días antes
- Auto-genera tarea preventiva

### **4. PROACTIVO (IA + Histórico)**
- IA analiza 3-6 meses datos
- Identifica causa raíz
- Sugiere solución permanente
- Elimina recurrencias

---

## 🔌 CONFIGURACIÓN LOGO 8

### **Opción Recomendada: ESP32 como Gateway Modbus**

**Hardware necesario:**
- ESP32 DevKit: $5
- Conversor RS485/TTL: $3
- Cables: $2

**Conexión física:**
```
LOGO 8 [RS485 A/B] ← → [RS485 Module] ← → [ESP32 GPIO 16/17]
                                               ↓
                                            WiFi → Firebase
```

**Código ESP32 Gateway:**
```cpp
#include <WiFi.h>
#include <FirebaseESP32.h>
#include <ModbusMaster.h>

ModbusMaster modbus;
FirebaseData fbdo;

void setup() {
  Serial2.begin(9600, SERIAL_8N1, 16, 17); // RX=16, TX=17
  modbus.begin(1, Serial2); // Slave ID 1
  
  WiFi.begin("PlantaWiFi", "password");
  Firebase.begin("your-firebase-url", "api-key");
}

void loop() {
  // Leer VW0 (temperatura)
  uint8_t result = modbus.readHoldingRegisters(0, 1);
  if (result == modbus.ku8MBSuccess) {
    float temp = modbus.getResponseBuffer(0) / 10.0;
    Firebase.setFloat(fbdo, "/logo8/motor1/temperature", temp);
  }
  
  // Leer VW2 (presión)
  result = modbus.readHoldingRegisters(2, 1);
  if (result == modbus.ku8MBSuccess) {
    float pres = modbus.getResponseBuffer(0) / 100.0;
    Firebase.setFloat(fbdo, "/logo8/pump1/pressure", pres);
  }
  
  delay(30000); // Cada 30s
}
```

**Configurar LOGO 8:**
1. TIA Portal → Configurar Modbus TCP Server
2. Asignar IP fija al LOGO 8
3. Mapear variables VW a registros Modbus
4. Habilitar puerto 502

---

## 💰 COSTOS TOTALES

| Componente | Cantidad | Precio Unit | Total |
|------------|----------|-------------|-------|
| **APIs** | | | |
| Groq AI | Ilimitado | $0 | $0 |
| Firebase Firestore | 50k/día | $0 | $0 |
| **Hardware LOGO 8** | | | |
| ESP32 Gateway | 1 | $5 | $5 |
| Módulo RS485 | 1 | $3 | $3 |
| **Hardware ESP32** | | | |
| ESP32 DevKit | 20 | $5 | $100 |
| Sensores | 20 sets | $8 | $160 |
| Cases + misc | 20 | $3 | $60 |
| **TOTAL** | | | **$328** |

**ROI Estimado:**
- Reducción correctivos: 40-70%
- Ahorro anual: $15k-25k
- Recuperación: < 1 mes

---

## 📝 ARCHIVO .ENV

Crear `apps/pwa/.env`:
```bash
# Groq AI (GRATIS)
VITE_GROQ_API_KEY=gsk_tu_key_aqui

# Firebase (ya configurado)
VITE_FIREBASE_API_KEY=tu_key
VITE_FIREBASE_AUTH_DOMAIN=tu_domain

# IoT
VITE_IOT_ENABLED=true
VITE_AUTO_CREATE_INCIDENTS=true
```

Obtener API Key:
1. https://console.groq.com/keys
2. Sign up (gratis, sin tarjeta)
3. Create API Key
4. Copiar a `.env`

---

## ✅ CHECKLIST INICIO

**AHORA (hoy):**
- [ ] Obtener Groq API Key
- [ ] Configurar `.env`
- [ ] Implementar botón delete
- [ ] Implementar "Otro" síntoma
- [ ] Probar generación síntomas IA

**SEMANA 1:**
- [ ] Documentar variables LOGO 8
- [ ] Comprar ESP32 Gateway ($8)
- [ ] Configurar Modbus en LOGO 8
- [ ] Crear servicio `iot.ts`

**SEMANA 2:**
- [ ] Conectar LOGO 8 → Firebase
- [ ] Dashboard IoT básico
- [ ] Probar auto-incidentes

**MES 1:**
- [ ] Comprar kit ESP32 ($50)
- [ ] Firmware básico
- [ ] 1 nodo operativo

---

## 🎯 PRÓXIMOS PASOS INMEDIATOS

1. **Obtener Groq API Key** (5 min)
2. **Terminar Quick Wins** (2 horas)
3. **Documentar LOGO 8** (1 día)
4. **Comprar hardware** (online)

**¿Empezamos con el botón delete y "Otro" síntoma ahora?**

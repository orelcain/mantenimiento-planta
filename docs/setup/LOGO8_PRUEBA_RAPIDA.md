# LOGO! 8 - Prueba rápida inicial (simple)

## Objetivo
Hacer una prueba mínima, manual y segura con tu LOGO encendido por Ethernet:
1. Validar conectividad en red.
2. Validar que la PWA puede mostrar datos con el contrato RTDB.
3. Preparar siguiente paso de lectura real desde LOGO.

---

## 1) Confirmar red del LOGO

1. Obtén IP del LOGO (display, router o TIA/Soft Comfort).
2. Desde PC:

```powershell
ping <IP_LOGO>
```

3. Si responde, la conectividad cableada básica está OK.

---

## 2) Verificación funcional en PWA (sin PLC aún)

Antes de integrar lectura real, prueba el frontend con datos de ejemplo en RTDB.

### Escribe payload mínimo (manual)

```powershell
firebase database:set /devices/logo8-test "{\"online\":true,\"lastSeen\":1760000000000,\"deviceName\":\"LOGO8 Test\",\"deviceType\":\"logo8\",\"assignedEquipmentId\":\"720004501\",\"telemetry\":{\"temperatura\":{\"value\":26.5,\"unit\":\"°C\",\"status\":\"normal\",\"timestamp\":1760000000000},\"humedad\":{\"value\":61.2,\"unit\":\"%\",\"status\":\"normal\",\"timestamp\":1760000000000},\"source\":\"logo8\"}}"
```

```powershell
firebase database:set /sensors/720004501 "{\"online\":true,\"lastSeen\":1760000000000,\"equipmentId\":\"720004501\",\"temperatura\":{\"value\":26.5,\"unit\":\"°C\",\"status\":\"normal\",\"timestamp\":1760000000000},\"humedad\":{\"value\":61.2,\"unit\":\"%\",\"status\":\"normal\",\"timestamp\":1760000000000}}"
```

Con esto verificas de inmediato que la PWA muestra datos correctamente con el contrato esperado.

---

## 3) Validar contrato de integración

Revisa y usa como referencia obligatoria:

- `docs/setup/LOGO8_PWA_RTDB_CONTRACT.md`

No cambies shape de datos en esta etapa.

---

## 4) Primera prueba real de lectura desde LOGO (mínima)

Opciones simples para arrancar:

- Opción A (rápida): un script en PC que lea LOGO (Modbus TCP o endpoint web del LOGO) y escriba RTDB.
- Opción B (estable): Node-RED en una PC de planta.

Para primera validación, objetivo mínimo:
- leer 1 variable de proceso,
- escribir en `devices/logo8-test/telemetry/temperatura` y `sensors/{equipmentId}/temperatura`,
- confirmar visualización en PWA.

---

## 5) Criterio de éxito de esta fase

- [ ] LOGO responde en red por IP.
- [ ] PWA muestra datos desde RTDB con payload de prueba.
- [ ] Contrato RTDB validado.
- [ ] Lista la ruta para conectar lectura real de 1 variable.

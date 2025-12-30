# 📋 Tareas Pendientes - Sistema de Mantenimiento

**Última actualización:** 26 de diciembre de 2025  
**Versión actual:** v1.3.5

---

## ✅ Completadas Recientemente (v1.3.1 - v1.3.5)

- ✅ **[v1.3.1]** Bug visual de círculos dobles en botones de prioridad
- ✅ **[v1.3.2]** Schema Zod corregido para soportar hierarchyNodeId
- ✅ **[v1.3.3]** Validación de fechas para prevenir crash RangeError
- ✅ **[v1.3.4]** Validación de fechas en formatDate() y formatRelativeTime()
- ✅ **[v1.3.5]** Botones separados cámara/galería + compresión WebP
- ✅ **Cierre de incidencias:** Ya implementado con formulario de resolución
- ✅ **Visualización de fotos:** Grid responsivo en IncidentDetail

---

## 🔥 Prioridad Alta (Próximas 2 semanas)

### 1. Sistema de Roles y Permisos
**Problema:** Actualmente todos los usuarios ven todo y pueden hacer todo.  
**Solución requerida:**
- Implementar roles: Administrador, Supervisor, Técnico, Usuario
- Permisos por rol:
  - **Administrador:** Acceso total
  - **Supervisor:** Validar/rechazar incidencias, asignar técnicos
  - **Técnico:** Trabajar incidencias asignadas, cerrar
  - **Usuario:** Reportar incidencias solamente
- Ocultar botones según permisos (validar, cerrar, configuración)

**Archivos a modificar:**
- `types/index.ts` - Agregar tipo `Role`
- `services/auth.ts` - Agregar campo `role` a User
- `hooks/usePermissions.ts` - Crear hook de permisos
- Componentes de UI - Condicionales según rol

**Estimación:** 2-3 días

---

### 2. Asignación de Técnicos
**Problema:** No hay forma de asignar incidencias a técnicos específicos.  
**Solución requerida:**
- Botón "Asignar técnico" en IncidentDetail (solo supervisores)
- Selector de usuarios con rol "Técnico"
- Notificación al técnico asignado
- Badge "Asignado a: [Nombre]" en tarjeta de incidencia
- Filtro por "Mis incidencias" para técnicos

**Función ya existe:** `assignTechnician()` en `services/incidents.ts`  
**Falta:** Conectar UI y permisos

**Estimación:** 1-2 días

---

### 3. Notificaciones Push (PWA)
**Problema:** Los usuarios no reciben alertas cuando hay nuevas incidencias.  
**Solución requerida:**
- Configurar Firebase Cloud Messaging (FCM)
- Solicitar permiso de notificaciones
- Enviar notificación cuando:
  - Nueva incidencia creada (a supervisores)
  - Incidencia asignada (a técnico)
  - Incidencia validada/rechazada (a reportador)
  - Incidencia cerrada (a supervisor)
- Icono de notificación con badge de count

**Archivos nuevos:**
- `services/notifications.ts`
- `firebase-messaging-sw.js`

**Estimación:** 2-3 días

---

## 🎨 Mejoras de UX (Próximas 4 semanas)

### 4. Dashboard con Métricas
**Problema:** No hay vista general del estado de mantenimiento.  
**Solución requerida:**
- Gráfico de incidencias por estado (pendientes, en proceso, cerradas)
- Gráfico de incidencias por prioridad
- Tiempo promedio de resolución
- Top 5 sistemas con más incidencias
- Heatmap de incidencias por día de la semana
- Usar Recharts o similar

**Página:** `pages/DashboardPage.tsx` (existe pero está básico)

**Estimación:** 3-4 días

---

### 5. Modo Offline Mejorado
**Problema:** La app no funciona bien sin internet.  
**Solución requerida:**
- Guardar incidencias en IndexedDB si no hay conexión
- Sincronizar cuando vuelva la conexión
- Indicador visual de modo offline
- Cache de imágenes de jerarquía
- Queue de acciones pendientes

**Tecnología:** Workbox (ya configurado) + IndexedDB

**Estimación:** 4-5 días

---

### 6. Búsqueda y Filtros Avanzados
**Problema:** Solo hay filtros básicos de estado y prioridad.  
**Solución requerida:**
- Búsqueda por título, descripción, síntomas
- Filtro por rango de fechas
- Filtro por técnico asignado
- Filtro por nodo jerárquico (Empresa → Área → Sistema)
- Guardar filtros favoritos

**Página:** `pages/IncidentsPage.tsx`

**Estimación:** 2-3 días

---

## 🚀 Funcionalidades Nuevas (1-2 meses)

### 7. Sistema de Repuestos
**Problema:** No hay gestión de repuestos usados.  
**Solución requerida:**
- CRUD de repuestos (código, nombre, stock)
- Al cerrar incidencia, agregar repuestos usados
- Restar del stock automáticamente
- Alertas de stock bajo
- Historial de uso por equipo

**Página nueva:** `pages/InventoryPage.tsx`

**Estimación:** 5-7 días

---

### 8. Reportes y Exportación
**Problema:** No se pueden generar reportes para gerencia.  
**Solución requerida:**
- Exportar incidencias a Excel/PDF
- Reporte mensual de mantenimiento
- Gráficos exportables
- Indicadores KPI (MTBF, MTTR, disponibilidad)

**Librería:** xlsx, jsPDF

**Estimación:** 3-4 días

---

### 9. Firmas Digitales al Cerrar
**Problema:** No hay forma de firmar digitalmente el cierre.  
**Solución requerida:**
- Canvas de firma al cerrar incidencia
- Guardar firma en Firebase Storage
- Mostrar firma en detalle de incidencia cerrada
- Campo `firmaCierre` ya existe en modelo

**Librería:** react-signature-canvas

**Estimación:** 1-2 días

---

### 10. Historial de Cambios (Auditoría)
**Problema:** No se registra quién hizo qué y cuándo.  
**Solución requerida:**
- Timeline de cambios de estado
- Registro de:
  - Creación
  - Validación/Rechazo (quién y cuándo)
  - Asignación
  - Cambios de estado
  - Cierre
- Mostrar en IncidentDetail

**Modelo nuevo:** `IncidentLog` collection

**Estimación:** 3-4 días

---

## 🔮 Visión a Largo Plazo (3-6 meses)

### 11. Sistema de IA para Síntomas Dinámicos
**Referencia:** Ver `AI_SYMPTOM_SYSTEM_PLAN.md`

**Fases:**
1. **MVP Dinámico (6 semanas):** Árbol de síntomas con OpenAI API
2. **Knowledge Base (4 semanas):** Clustering de síntomas similares
3. **Modelo Predictivo (6 semanas):** Predicción de fallos con ML
4. **Mantenimiento Proactivo (4 semanas):** Recomendaciones preventivas

**Presupuesto estimado:** $53,000 - $80,000 USD  
**ROI esperado:** Reducir paradas de producción de $10k-50k/mes

**Decisión:** Pendiente de aprobación de gerencia

---

### 12. Integración con ERP/SAP
**Problema:** Datos de equipos y repuestos están desconectados del ERP.  
**Solución requerida:**
- API para sincronizar equipos
- API para sincronizar repuestos
- Webhook para órdenes de trabajo
- Mapeo de códigos internos

**Estimación:** 2-3 semanas (depende del ERP)

---

### 13. App Móvil Nativa
**Problema:** PWA tiene limitaciones en iOS.  
**Solución requerida:**
- React Native o Flutter
- Sincronización con Firebase
- Push notifications nativas
- Scanner QR de equipos
- Firma biométrica

**Estimación:** 2-3 meses

---

## 🐛 Bugs Conocidos (No Críticos)

### 14. Cache de PWA Muy Agresivo
**Problema:** Usuarios deben hacer Ctrl+Shift+R para ver cambios.  
**Impacto:** Bajo (solo afecta durante desarrollo)  
**Solución temporal:** Documentar en README  
**Solución permanente:** Configurar update prompt en Workbox

---

### 15. Imágenes Grandes Tardan en Cargar
**Problema:** Fotos de alta resolución tardan en mostrarse.  
**Impacto:** Medio  
**Solución:** Lazy loading con thumbnails  
**Estimación:** 1 día

---

### 16. Selector de Jerarquía Rerenderiza Mucho
**Problema:** Re-monta componente múltiples veces (visible en logs).  
**Impacto:** Bajo (solo logs innecesarios)  
**Solución:** Optimizar con useMemo/useCallback  
**Estimación:** 1 día

---

## 📚 Documentación Pendiente

- [ ] Manual de usuario en español
- [ ] Video tutoriales (YouTube/Vimeo)
- [ ] Documentación de API interna
- [ ] Guía de despliegue para otros clientes
- [ ] Casos de prueba automatizados (Jest/Cypress)

---

## 🎯 Métricas de Éxito

**Objetivos Q1 2026:**
- ✅ 100% de incidencias reportadas digitalmente (vs papel)
- 🔄 80% de incidencias resueltas en <24h (actualmente: ?)
- 🔄 Reducir paradas de producción en 30%
- 🔄 MTTR (Mean Time To Repair) < 4 horas
- 🔄 100% de técnicos usando la app diariamente

---

## 💡 Ideas para Evaluar

- 🤔 Integración con WhatsApp para notificaciones
- 🤔 Scanner QR para escanear equipos rápidamente
- 🤔 Modo oscuro (ya preparado, solo activar)
- 🤔 Multi-idioma (inglés, portugués)
- 🤔 Chat en vivo entre técnicos
- 🤔 Gamificación (badges por resolver incidencias rápido)
- 🤔 Integración con Slack/Teams
- 🤔 Dashboard público para clientes

---

## 📞 Contacto

**Desarrollador:** GitHub Copilot  
**Repositorio:** https://github.com/orelcain/mantenimiento-planta  
**Versión actual:** v1.3.5 (26/12/2025)

---

**Próxima revisión:** 9 de enero de 2026

---
name: auditar-ux-modulo
description: Realizar una auditoria UX profesional de un modulo especifico usando un agente experto en diseño. Genera lista priorizada de mejoras con cambios concretos de CSS/layout. Usar cuando un modulo necesita revision de usabilidad.
argument-hint: "<nombre-del-modulo>"
---

# Auditar UX de Modulo — Revision con agente experto

## Procedimiento

### 1. Capturar estado actual
Tomar screenshots del modulo en desktop, tablet y movil (usar skill `revisar-responsive`).

### 2. Lanzar agente UX experto
Crear un agente general-purpose con este prompt:

```
Eres un experto en diseño UX/UI para aplicaciones industriales y PWAs moviles.
Necesito tu analisis critico del modulo "<NOMBRE>" — una app para tecnicos de planta.

## Contexto
- PWA usada en planta industrial (ambientes humedos, manos con guantes, pantallas pequeñas)
- Usuarios: tecnicos mecanicos que consultan info mientras trabajan
- [Describir que hace el modulo especificamente]

## Vista actual
[Adjuntar screenshots de los 3 breakpoints]

## Tu tarea
Analiza considerando:
1. Jerarquia visual: ¿El orden es correcto para un tecnico en planta?
2. Imagenes/contenido: ¿Se muestra de forma util?
3. Responsive: ¿Los breakpoints son correctos?
4. Accesibilidad industrial: guantes, pantallas mojadas, luz variable
5. Mejoras concretas: lista priorizada (P0/P1/P2) con cambios CSS/layout especificos

Responde en español, se directo. Prioriza alto impacto + bajo esfuerzo.
```

### 3. Clasificar mejoras
Organizar las mejoras del agente en:
- **P0 (critico)**: Afecta usabilidad basica — implementar inmediatamente
- **P1 (alto impacto)**: Mejora significativa — implementar en esta sesion
- **P2 (nice to have)**: Mejora menor — documentar para futuro

### 4. Implementar P0 y P1
Aplicar cambios y verificar con `revisar-responsive`.

### 5. Documentar
Agregar las mejoras P2 no implementadas al CLAUDE.md en "Pendientes priorizados".

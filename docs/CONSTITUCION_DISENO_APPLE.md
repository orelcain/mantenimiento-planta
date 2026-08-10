# Constitución de Diseño de la PWA — Apple-inspired

> **Norma suprema de diseño de la PWA de mantención.** La entregó Orel el 2026-08-09 y
> **manda sobre cualquier otra decisión previa**, incluido `NUEVA_PIEL_APPLE_HIG.md`
> (ese documento pasa a ser la *implementación* de esta constitución: tokens medidos,
> valores de contraste y estado del barrido).
>
> Objetivo, en una frase: **"Apple diseñando una herramienta industrial profesional."**
> No una página decorada. No un dashboard genérico. No un ERP tradicional.

---

## Principio central

La interfaz debe **desaparecer** para que la información sea protagonista. Cada elemento
responde a una pregunta: *¿ayuda a comprender el estado del sistema o a realizar una
acción?* Si no, **se elimina**. Orden: **información → contexto → acción**.

## Los tres pilares

- **Clarity** — se entiende de inmediato. Nunca depender **solo del color**.
- **Deference** — el contenido manda; los controles acompañan. Sin bordes gruesos, cajas
  innecesarias, sombras fuertes ni gradientes decorativos.
- **Depth** — la profundidad explica jerarquía y contexto (capas, blur, sombras
  suavísimas), **nunca decora**.

## Jerarquía de la arquitectura

`App → Área → Vista/módulo → Secciones → Cards/listas/grupos → Datos y acciones`
El usuario debe saber dónde está **sin leer instrucciones**.

## Escala de espaciado (múltiplos de 4)

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80`
8 mínimo · 12 controles compactos · 16 estándar · 24 entre grupos · 32 entre secciones ·
48–64 estructural. **Prohibidos** los valores arbitrarios (13, 19, 27, 37…) sin justificar.

## Radios

10–12 controles pequeños · 14–16 controles estándar · 18–22 cards · 24–28 paneles.
Sin radios exagerados en elementos pequeños.

## Tipografía (px)

| Rol | Tamaño | Peso |
|---|---|---|
| Large Title | 32–34 | 700 |
| Title 1 | 28 | 700 |
| Title 2 | 22–24 | 600 |
| Title 3 | 19–20 | 600 |
| Headline | 16–17 | 600 |
| Body | 15–17 | 400 |
| Secondary | 13–15 | 400 |
| Caption | 11–13 | 400 |

Familia: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", …`
**Priorizar peso y espacio antes que agrandar.**

## Texto

**Evitar MAYÚSCULAS en toda la interfaz.** Solo se permiten en códigos técnicos,
identificadores, labels industriales cortos y tags. Lenguaje breve: *"Ver equipo"*, no
*"PRESIONE AQUÍ PARA VISUALIZAR INFORMACIÓN DEL EQUIPO"*.

## Color

**Claro**: fondo `#F5F5F7` · superficies `#FFFFFF` · texto `#1D1D1F` · secundario `#6E6E73`
· separadores negro al 8–12%.
**Oscuro**: fondo `#000`–`#0A0A0A` · superficie `#1C1C1E` · elevada `#2C2C2E` · texto
`#F5F5F7` · secundario `#AEAEB2`.
El **acento** se reserva a acciones, navegación activa, enlaces y selección — no inunda la app.

Semánticos con significado constante: verde operativo · ámbar advertencia · rojo alarma o
destructivo · azul información · gris neutro.

## Estados industriales

`OPERATIVO · DETENIDO · MANTENCIÓN · ADVERTENCIA · FALLA · FUERA DE SERVICIO · SIN INFORMACIÓN`
Cada uno con **color + ícono + texto**. Nunca solo color.

## Componentes y navegación

- Botones con jerarquía: **primary (uno)**, secondary, tertiary, destructive.
- Área táctil mínima **44×44** (ideal 48×48). Uso con guantes.
- Sidebar en escritorio; **bottom navigation de 3–5 destinos** en móvil.
- **Progressive disclosure**: primero lo importante; el detalle se expande.
- Listas para comparar; tablas para datos densos; cards solo con agrupación conceptual real.
- **Nunca cards dentro de cards** sin necesidad clara.
- Modales solo para decisiones cortas; contenido largo va a página o sheet.
- Acciones secundarias en menú `•••`.

## Movimiento

Microinteracción 120–180 ms · transición 180–250 ms · panel/modal 220–320 ms.
Curvas `ease-out` / `ease-in-out`. Presión: `scale(0.97–0.99)` por 80–120 ms.
Nada elástico ni largo. La animación **explica continuidad**, no impresiona.

## Materiales

Transparencia + blur **solo** en cromo (nav bar, sidebar flotante, toolbar, overlays,
sheets). Sombras de baja opacidad. Bordes de 1 px casi invisibles: **separar con espacio,
no con línea**.

## Estados de datos (crítico en industrial)

Feedback inmediato en cada acción: guardando / guardado / error / sin conexión /
actualizando / sincronizado. Mostrar **última actualización** en datos en vivo. Nunca
ocultar problemas de sincronización. Empty states con ícono + mensaje + acción sugerida.
Errores que expliquen qué pasó, qué implica y qué hacer. Skeletons, no spinners gigantes.

## Nunca hacer

Dashboards recargados · neomorphism · sombras exageradas · gradientes llamativos · bordes
gruesos · cards innecesarias · íconos multicolor sin función · botones pequeños · texto
diminuto · animaciones largas · menús gigantes · formularios interminables · estética de
ERP antiguo · demasiados colores · exceso de información simultánea.

## Flujo obligatorio antes de tocar una pantalla

1. Objetivo de la pantalla → 2. Info primaria → 3. Info secundaria → 4. Acción principal →
5. Acciones secundarias → 6. **Eliminar lo innecesario** → 7. Jerarquía visual →
8. Diseñar móvil → 9. Tablet → 10. Escritorio → 11. Accesibilidad → 12. Consistencia con
el design system.

## Refactorización

Ante código inconsistente: **no apilar CSS encima**. Preguntar qué componente debería
existir, qué regla aplica, qué debería ser token y qué duplicación se elimina.

## Prioridad

`Funcionalidad → Comprensión → Velocidad → Accesibilidad → Consistencia → Estética`
Nunca sacrificar claridad por impresionar.

## Prueba final de cada pantalla

> ¿Podría pertenecer a una aplicación profesional moderna hecha con las HIG de Apple,
> adaptada a un sistema industrial?

Debe sentirse: simple · espaciosa · precisa · silenciosa · rápida · coherente · premium ·
funcional.

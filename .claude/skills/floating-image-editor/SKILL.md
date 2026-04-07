---
name: floating-image-editor
description: Create an interactive floating image viewer/editor with free positioning, resize, crop, inline zoom/pan, and SVG annotations. Use when building image display components that need to be freely positioned, resized, cropped, annotated with shapes/text, and zoomed inline.
argument-hint: "[container-selector]"
---

# Floating Image Editor Pattern

Create an interactive image component where images float freely over content, can be moved/resized by dragging, cropped visually, zoomed/panned inline, and annotated with SVG shapes.

Reference implementation: `apps/pwa/public/baader-200-learn-embed.html`

---

## Architecture Overview

```
Container (position:relative, overflow:auto)
  ├── Content (text, tables, etc.)
  └── .img-card (position:absolute, display:flex, flex-direction:column)
        ├── .img-edit-bar (controls: move, crop, annotate, remove)
        ├── .img-body (flex:1, overflow:hidden, position:relative)
        │     ├── <div> zoom-wrapper (position:absolute, inset:0, transform-origin:0 0)
        │     │     └── <img> (width:100%, height:100%, object-fit:fill)
        │     ├── <svg class="ann-svg"> (annotations overlay)
        │     └── zoom-hint label
        ├── .ann-toolbar (drawing tools, shown when annotating)
        ├── .img-caption
        └── .img-resize-handle (corner ↘)
```

---

## 1. Data Model

Each image stores these fields (all optional except url):

```typescript
interface FloatingImage {
  url: string
  caption?: string
  // Free position (pixels relative to container)
  layout?: { x: number, y: number, w?: number, h?: number }
  // Crop region (fractions 0-1 of original image)
  crop?: { x: number, y: number, w: number, h: number }
  // SVG annotations
  annotations?: Annotation[]
}

interface Annotation {
  id: string
  type: 'circle' | 'rect' | 'arrow' | 'polygon' | 'text'
  x: number        // % of image (0-100)
  y: number
  x2?: number      // arrow endpoint
  y2?: number
  w?: number        // rect width
  h?: number        // rect height
  r?: number        // circle radius
  points?: {x:number, y:number}[]  // polygon vertices
  label?: string
  color?: string    // hex color
  strokeW?: number  // stroke width (1-8)
  opacity?: number  // fill opacity (0-1)
  noStroke?: boolean // fill only, no border
}
```

Coordinates use **percentages** (0-100 for annotations, 0-1 for crop) for resolution independence.

---

## 2. CSS Requirements

### Image Card (absolute positioned, flex column)
```css
.img-card {
  position: absolute;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 6px;
  border: 1px solid #252a38;
  background: #0a0c12;
  z-index: 2;
}
```

### Image Body (flex:1, clips content)
```css
.img-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
```

### CRITICAL: Image fills container
**Problem**: `<img>` is a "replaced element" — browsers ignore `flex:1` on it and use natural size.
**Solution**: Wrap `<img>` in a regular `<div>` that receives `flex:1`:

```css
/* The div wrapper responds to flex:1 correctly */
.img-body { flex: 1; min-height: 0; overflow: hidden; position: relative; }

/* Image fills the wrapper */
.img-body img { width: 100%; height: 100%; object-fit: fill; }
```

DO NOT put `flex:1` directly on `<img>` — it won't work.

### Crop Display
Crop uses overflow:hidden + scale/offset (NOT clip-path which leaves empty space):

```css
.img-body.cropped img { position: absolute; object-fit: fill; }
```

```javascript
// Inline styles for cropped image:
var scaleW = (100 / crop.w).toFixed(2);  // e.g., crop.w=0.5 → 200%
var scaleH = (100 / crop.h).toFixed(2);
var offsetX = (-crop.x / crop.w * 100).toFixed(2);
var offsetY = (-crop.y / crop.h * 100).toFixed(2);
img.style = `width:${scaleW}%; height:${scaleH}%; left:${offsetX}%; top:${offsetY}%`;
```

### SVG Annotations Overlay
```css
.ann-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;  /* pass-through when not drawing */
  z-index: 4;
}
.ann-svg.drawing { pointer-events: all; cursor: crosshair; }
```

SVG must use `viewBox="0 0 100 100"` with `preserveAspectRatio="none"` so annotation coordinates (0-100%) map directly.

---

## 3. Free Move (drag to position)

Drag the edit-bar to move the entire card:

```javascript
function startMove(e) {
  // DON'T start from resize handle, buttons, or img
  if (e.target.closest('.img-resize-handle') || e.target.closest('button')) return;
  // DON'T move while annotating
  if (annotationModeActive) return;

  var card = this;
  var startX = e.clientX, startY = e.clientY;
  var origLeft = card.offsetLeft, origTop = card.offsetTop;

  function onMove(ev) {
    card.style.left = (origLeft + ev.clientX - startX) + 'px';
    card.style.top = (origTop + ev.clientY - startY) + 'px';
  }
  function onUp() {
    // Save position to data model
    image.layout.x = card.offsetLeft;
    image.layout.y = card.offsetTop;
    image.layout.w = card.offsetWidth;
    image.layout.h = card.offsetHeight;
    save();
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
```

---

## 4. Free Resize (drag corner)

Resize handle at bottom-right corner changes both width AND height:

```javascript
function startResize(e) {
  if (annotationModeActive) return;
  var card = this.closest('.img-card');
  var startX = e.clientX, startY = e.clientY;
  var startW = card.offsetWidth, startH = card.offsetHeight;

  function onMove(ev) {
    card.style.width = Math.max(80, startW + ev.clientX - startX) + 'px';
    card.style.height = Math.max(60, startH + ev.clientY - startY) + 'px';
  }
  function onUp() {
    image.layout.w = card.offsetWidth;
    image.layout.h = card.offsetHeight;
    save();
  }
  // ... listeners
}
```

---

## 5. Inline Zoom & Pan

Scroll wheel zooms, drag pans when zoomed. Bounded to not show outside crop region.

**Key insight**: Apply transform to a **wrapper div inside .img-body**, not to .img-body itself (which has overflow:hidden that must stay unscaled).

```javascript
// Create zoom wrapper inside .img-body
var zoomWrap = document.createElement('div');
zoomWrap.style.cssText = 'position:absolute;inset:0;transform-origin:0 0;';
// Move img and svg inside zoomWrap
body.insertBefore(zoomWrap, body.firstChild);

// Apply zoom/pan to wrapper
zoomWrap.style.transform = `translate(${tx}px,${ty}px) scale(${zoom})`;

// Boundary clamping (simple formula):
// At zoom=1, image fills container exactly.
// Pan range: 0 to -(containerSize * (zoom - 1))
var maxTx = 0, minTx = -containerWidth * (zoom - 1);
var maxTy = 0, minTy = -containerHeight * (zoom - 1);
tx = Math.max(minTx, Math.min(maxTx, tx));
ty = Math.max(minTy, Math.min(maxTy, ty));
```

**IMPORTANT**: Disable zoom/pan when annotation mode is active.

---

## 6. SVG Annotations

### Rendering (viewBox coordinates 0-100):
```html
<svg class="ann-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
  <circle cx="50" cy="30" r="5" stroke="#ff4444" fill="#ff4444"
          fill-opacity="0.3" stroke-width="2"/>
  <rect x="10" y="10" width="20" height="15" stroke="#44aaff" fill="#44aaff"
        fill-opacity="0.15" stroke-width="2"/>
  <line x1="10" y1="50" x2="40" y2="50" stroke="#44ff44" stroke-width="2"
        marker-end="url(#arrowhead)"/>
  <polygon points="60,10 80,10 80,30 60,30" stroke="#ffaa00" fill="#ffaa00"
           fill-opacity="0.15" stroke-width="2"/>
  <text x="50" y="50" text-anchor="middle" fill="#fff"
        font-size="11" font-weight="700">Label</text>
</svg>
```

### Drawing flow:
1. mousedown → record start point (converted to 0-100 coordinates)
2. mousemove → render temporary preview shape
3. mouseup → save shape to data model, re-render

### Coordinate conversion:
```javascript
function svgCoords(clientX, clientY, svgElement) {
  var rect = svgElement.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / rect.width * 100,
    y: (clientY - rect.top) / rect.height * 100
  };
}
```

### Use SVG attributes (NOT CSS) for fill-opacity:
```html
<!-- CORRECT: SVG attribute -->
<circle fill-opacity="0.5" stroke-width="3" ... />

<!-- WRONG: CSS style (ignored by some browsers in SVG) -->
<circle style="fill-opacity:0.5; stroke-width:3" ... />
```

### Editing existing annotations:
- Click shape → select (visual highlight with animation)
- Drag selected shape → move (update coordinates in data model)
- Edit panel: change color, opacity, stroke width, label text
- Click empty area → deselect

### Locking during annotation:
When annotation mode is active, block ALL other interactions:
```javascript
if (annotationModeActive) return;  // Add to: startMove, startResize, scrollZoom, startPan
```

---

## 7. Common Pitfalls

1. **`<img>` ignores flex:1** — Always wrap in a `<div>` for flex sizing
2. **clip-path:inset() for crop leaves empty space** — Use overflow:hidden + scale/offset instead
3. **fill-opacity in CSS style ignored in SVG** — Use SVG attributes directly
4. **Transform on overflow:hidden container scales the clip** — Apply transform to inner wrapper
5. **Drag events fire during annotation drawing** — Check annotation state in all drag handlers
6. **Container needs min-height** — Absolutely positioned children don't contribute to parent height; calculate from positions

---

## 8. Admin Protection

Gate all editing behind authentication. The pattern uses a lock/unlock flow:
1. Initially locked (readonly)
2. User clicks lock button → prompt for password
3. Password verified against backend → unlock editing
4. Edit bar, resize handle, annotation tools only visible when unlocked

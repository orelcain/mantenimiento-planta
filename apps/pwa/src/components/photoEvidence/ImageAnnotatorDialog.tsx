import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label, Switch } from '@/components/ui'
import { cn } from '@/lib/utils'

type AnnotatorMode = 'shape' | 'text'

type Point = { x: number; y: number }

type Shape = {
  id: string
  name?: string
  points: Point[]
  fillColor: string
  opacity: number // 0..1
  showBorder: boolean
  borderColor: string
  cornerRadius: number // 0..1 (0%..100%)
}

type TextItem = {
  id: string
  name?: string
  x: number
  y: number
  text: string
  color: string
  fontSize: number
  backgroundEnabled: boolean
  backgroundColor: string
  backgroundOpacity: number // 0..1
}

function isPointInPolygon(p: Point, polygon: Point[]) {
  if (polygon.length < 3) return false

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]
    const pj = polygon[j]
    if (!pi || !pj) continue

    const intersect =
      pi.y > p.y !== pj.y > p.y &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y + 0.0000001) + pi.x
    if (intersect) inside = !inside
  }
  return inside
}

function clampNumber(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

interface ImageAnnotatorDialogProps {
  open: boolean
  title?: string
  sourceUrl: string | null
  onClose: () => void
  onSave: (file: File) => void
}

function clampCanvasSize(width: number, height: number, maxDim: number) {
  const maxSide = Math.max(width, height)
  if (maxSide <= maxDim) return { width, height, scale: 1 }
  const scale = maxDim / maxSide
  return { width: Math.round(width * scale), height: Math.round(height * scale), scale }
}

async function fetchAsObjectUrl(url: string): Promise<{ objectUrl: string; mime: string }>
{
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error('No se pudo cargar la imagen')
  }
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  return { objectUrl, mime: blob.type || 'image/jpeg' }
}

export function ImageAnnotatorDialog({
  open,
  title = 'Anotar imagen',
  sourceUrl,
  onClose,
  onSave,
}: ImageAnnotatorDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null)
  const [imageMime, setImageMime] = useState<string>('image/jpeg')

  const [mode, setMode] = useState<AnnotatorMode>('shape')

  const [shapes, setShapes] = useState<Shape[]>([])
  const [currentShapePoints, setCurrentShapePoints] = useState<Point[]>([])
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null)

  const [shapeFillColor, setShapeFillColor] = useState('#dc2626')
  const [shapeOpacity, setShapeOpacity] = useState(0.25)
  const [shapeShowBorder, setShapeShowBorder] = useState(true)
  const [shapeBorderColor, setShapeBorderColor] = useState('#dc2626')
  const [shapeCornerRadius, setShapeCornerRadius] = useState(0)
  const [shapeName, setShapeName] = useState('')

  const [textValue, setTextValue] = useState('')
  const [textColor, setTextColor] = useState('#111827')
  const [textFontSize, setTextFontSize] = useState(18)
  const [textName, setTextName] = useState('')
  const [textBackgroundEnabled, setTextBackgroundEnabled] = useState(false)
  const [textBackgroundColor, setTextBackgroundColor] = useState('#ffffff')
  const [textBackgroundOpacity, setTextBackgroundOpacity] = useState(0.75)
  const [texts, setTexts] = useState<TextItem[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)

  const selectShapeById = (id: string | null, shapeList?: Shape[]) => {
    if (!id) {
      setSelectedShapeId(null)
      return
    }
    const list = shapeList ?? shapes
    const s = list.find((x) => x.id === id)
    if (!s) return

    setSelectedShapeId(id)
    setCurrentShapePoints([])
    setShapeName(s.name ?? '')
    setShapeFillColor(s.fillColor)
    setShapeOpacity(clampNumber(s.opacity, 0, 1))
    setShapeShowBorder(Boolean(s.showBorder))
    setShapeBorderColor(s.borderColor)
    setShapeCornerRadius(clampNumber(s.cornerRadius ?? 0, 0, 1))
  }

  const selectTextById = (id: string | null, textList?: TextItem[]) => {
    if (!id) {
      setSelectedTextId(null)
      return
    }
    const list = textList ?? texts
    const t = list.find((x) => x.id === id)
    if (!t) return

    setSelectedTextId(id)
    setTextName(t.name ?? '')
    setTextValue(t.text)
    setTextColor(t.color)
    setTextFontSize(t.fontSize)
    setTextBackgroundEnabled(Boolean(t.backgroundEnabled))
    setTextBackgroundColor(t.backgroundColor ?? '#ffffff')
    setTextBackgroundOpacity(clampNumber(t.backgroundOpacity ?? 0.75, 0, 1))
  }

  useEffect(() => {
    if (!selectedShapeId) return
    setShapes((prev) => {
      let changed = false
      const next = prev.map((s) => {
        if (s.id !== selectedShapeId) return s
        const nextShape: Shape = {
          ...s,
          name: shapeName.trim() || undefined,
          fillColor: shapeFillColor,
          opacity: shapeOpacity,
          showBorder: shapeShowBorder,
          borderColor: shapeBorderColor,
          cornerRadius: shapeCornerRadius,
        }
        const same =
          nextShape.name === s.name &&
          nextShape.fillColor === s.fillColor &&
          nextShape.opacity === s.opacity &&
          nextShape.showBorder === s.showBorder &&
          nextShape.borderColor === s.borderColor &&
          nextShape.cornerRadius === s.cornerRadius
        if (same) return s
        changed = true
        return nextShape
      })
      return changed ? next : prev
    })
  }, [selectedShapeId, shapeName, shapeFillColor, shapeOpacity, shapeShowBorder, shapeBorderColor, shapeCornerRadius])

  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)

  const canSave = useMemo(() => {
    return Boolean(localImageUrl && (shapes.length > 0 || texts.length > 0))
  }, [localImageUrl, shapes.length, texts.length])

  useEffect(() => {
    if (!open) return
    setLoadError(null)
    setIsLoading(false)
    setMode('shape')
    setShapes([])
    setCurrentShapePoints([])
    setSelectedShapeId(null)
    setSelectedTextId(null)
    setTextValue('')
    setTextName('')
    setTextBackgroundEnabled(false)
    setTextBackgroundColor('#ffffff')
    setTextBackgroundOpacity(0.75)
    setTexts([])
    setImageSize(null)
  }, [open])

  useEffect(() => {
    if (!selectedTextId) return
    setTexts((prev) => {
      let changed = false
      const next = prev.map((t) => {
        if (t.id !== selectedTextId) return t
        const nextText: TextItem = {
          ...t,
          name: textName.trim() || undefined,
          text: textValue,
          color: textColor,
          fontSize: textFontSize,
          backgroundEnabled: textBackgroundEnabled,
          backgroundColor: textBackgroundColor,
          backgroundOpacity: textBackgroundOpacity,
        }
        const same =
          nextText.name === t.name &&
          nextText.text === t.text &&
          nextText.color === t.color &&
          nextText.fontSize === t.fontSize &&
          nextText.backgroundEnabled === t.backgroundEnabled &&
          nextText.backgroundColor === t.backgroundColor &&
          nextText.backgroundOpacity === t.backgroundOpacity
        if (same) return t
        changed = true
        return nextText
      })
      return changed ? next : prev
    })
  }, [selectedTextId, textName, textValue, textColor, textFontSize, textBackgroundEnabled, textBackgroundColor, textBackgroundOpacity])

  useEffect(() => {
    if (!open) return
    if (!sourceUrl) return

    let isCancelled = false
    let tempObjectUrl: string | null = null

    const run = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const { objectUrl, mime } = await fetchAsObjectUrl(sourceUrl)
        if (isCancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        tempObjectUrl = objectUrl
        setLocalImageUrl(objectUrl)
        setImageMime(mime)
      } catch (e) {
        setLoadError((e as Error)?.message || 'Error cargando la imagen')
        setLocalImageUrl(null)
      } finally {
        setIsLoading(false)
      }
    }

    run()

    return () => {
      isCancelled = true
      if (tempObjectUrl) URL.revokeObjectURL(tempObjectUrl)
    }
  }, [open, sourceUrl])

  const redraw = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!localImageUrl) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const ctx2 = ctx

    const img = new Image()
    img.crossOrigin = 'anonymous'

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Error cargando imagen'))
      img.src = localImageUrl
    })

    const fitted = clampCanvasSize(img.width, img.height, 1600)
    if (!imageSize || imageSize.width !== fitted.width || imageSize.height !== fitted.height) {
      setImageSize({ width: fitted.width, height: fitted.height })
    }

    canvas.width = fitted.width
    canvas.height = fitted.height

    // Background
    ctx2.clearRect(0, 0, canvas.width, canvas.height)
    ctx2.fillStyle = '#ffffff'
    ctx2.fillRect(0, 0, canvas.width, canvas.height)

    ctx2.drawImage(img, 0, 0, canvas.width, canvas.height)

    // Shapes
    const drawPolygon = (
      points: Point[],
      style: Pick<Shape, 'fillColor' | 'opacity' | 'showBorder' | 'borderColor' | 'cornerRadius'>
    ) => {
      if (points.length < 3) return

      const corner = Math.max(0, Math.min(1, style.cornerRadius || 0))

      const drawStraight = () => {
        const firstPoint = points[0]
        if (!firstPoint) return
        ctx2.beginPath()
        ctx2.moveTo(firstPoint.x, firstPoint.y)
        for (let i = 1; i < points.length; i++) {
          const pt = points[i]
          if (!pt) continue
          ctx2.lineTo(pt.x, pt.y)
        }
        ctx2.closePath()
      }

      const drawRounded = () => {
        const n = points.length
        const get = (idx: number) => points[(idx + n) % n]

        const unit = (from: Point, to: Point) => {
          const dx = to.x - from.x
          const dy = to.y - from.y
          const len = Math.hypot(dx, dy) || 1
          return { x: dx / len, y: dy / len, len }
        }

        const cornerPoints = (i: number) => {
          const prev = get(i - 1)
          const curr = get(i)
          const next = get(i + 1)
          if (!prev || !curr || !next) return null

          const uPrev = unit(curr, prev)
          const uNext = unit(curr, next)
          const minLen = Math.min(uPrev.len, uNext.len)
          const r = Math.max(0, Math.min(minLen * 0.45, minLen * corner))

          const start = { x: curr.x + uPrev.x * r, y: curr.y + uPrev.y * r }
          const end = { x: curr.x + uNext.x * r, y: curr.y + uNext.y * r }
          return { start, curr, end }
        }

        const first = cornerPoints(0)
        if (!first) return
        ctx2.beginPath()
        ctx2.moveTo(first.start.x, first.start.y)
        for (let i = 0; i < n; i++) {
          const cp = cornerPoints(i)
          if (!cp) continue
          ctx2.lineTo(cp.start.x, cp.start.y)
          ctx2.quadraticCurveTo(cp.curr.x, cp.curr.y, cp.end.x, cp.end.y)
        }
        ctx2.closePath()
      }

      ctx2.save()
      if (corner <= 0.001) {
        drawStraight()
      } else {
        drawRounded()
      }

      ctx2.globalAlpha = Math.max(0, Math.min(1, style.opacity))
      ctx2.fillStyle = style.fillColor
      ctx2.fill()
      ctx2.globalAlpha = 1

      if (style.showBorder) {
        ctx2.strokeStyle = style.borderColor
        ctx2.lineWidth = 2
        ctx2.stroke()
      }
      ctx2.restore()
    }

    for (const shape of shapes) {
      drawPolygon(shape.points, shape)
    }

    // Current shape (preview as polyline + points numbering)
    if (currentShapePoints.length > 0) {
      const firstPoint = currentShapePoints[0]
      if (firstPoint) {
        ctx2.save()
        ctx2.strokeStyle = shapeBorderColor
        ctx2.lineWidth = 2
        ctx2.setLineDash([6, 4])
        ctx2.beginPath()
        ctx2.moveTo(firstPoint.x, firstPoint.y)
        for (let i = 1; i < currentShapePoints.length; i++) {
          const pt = currentShapePoints[i]
          if (!pt) continue
          ctx2.lineTo(pt.x, pt.y)
        }
        ctx2.stroke()
        ctx2.restore()
      }

      for (let i = 0; i < currentShapePoints.length; i++) {
        const pt = currentShapePoints[i]
        if (!pt) continue
        const number = i + 1
        ctx2.save()
        ctx2.fillStyle = '#ffffff'
        ctx2.strokeStyle = shapeBorderColor
        ctx2.lineWidth = 2
        ctx2.beginPath()
        ctx2.arc(pt.x, pt.y, 10, 0, Math.PI * 2)
        ctx2.fill()
        ctx2.stroke()
        ctx2.fillStyle = '#111827'
        ctx2.font = 'bold 12px system-ui, sans-serif'
        ctx2.textAlign = 'center'
        ctx2.textBaseline = 'middle'
        ctx2.fillText(String(number), pt.x, pt.y)
        ctx2.restore()
      }
    }

    // Text
    for (const t of texts) {
      ctx2.save()
      ctx2.font = `bold ${Math.max(8, Math.min(80, t.fontSize))}px system-ui, sans-serif`
      const safeText = t.text ?? ''

      if (t.backgroundEnabled) {
        const opacity = Math.max(0, Math.min(1, t.backgroundOpacity ?? 0.75))
        const paddingX = 10
        const paddingY = 6
        const metrics = ctx2.measureText(safeText)
        const textWidth = metrics.width
        const textHeight = Math.max(12, Math.min(90, t.fontSize))
        const bgX = t.x - paddingX
        const bgY = t.y - textHeight - paddingY
        const bgW = textWidth + paddingX * 2
        const bgH = textHeight + paddingY * 2
        const r = 10

        ctx2.save()
        ctx2.globalAlpha = opacity
        ctx2.fillStyle = t.backgroundColor
        ctx2.beginPath()
        ctx2.moveTo(bgX + r, bgY)
        ctx2.lineTo(bgX + bgW - r, bgY)
        ctx2.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + r)
        ctx2.lineTo(bgX + bgW, bgY + bgH - r)
        ctx2.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - r, bgY + bgH)
        ctx2.lineTo(bgX + r, bgY + bgH)
        ctx2.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - r)
        ctx2.lineTo(bgX, bgY + r)
        ctx2.quadraticCurveTo(bgX, bgY, bgX + r, bgY)
        ctx2.closePath()
        ctx2.fill()
        ctx2.restore()
      }

      ctx2.fillStyle = t.color
      ctx2.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx2.lineWidth = 4
      ctx2.strokeText(safeText, t.x, t.y)
      ctx2.fillText(safeText, t.x, t.y)
      ctx2.restore()
    }
  }

  useEffect(() => {
    if (!open) return
    if (!localImageUrl) return

    let cancelled = false
    const run = async () => {
      try {
        await redraw()
      } catch (e) {
        if (!cancelled) setLoadError((e as Error)?.message || 'Error redibujando')
      }
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, localImageUrl, shapes, currentShapePoints, texts, shapeBorderColor])

  const getCanvasPoint = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = ((evt.clientX - rect.left) / rect.width) * canvas.width
    const y = ((evt.clientY - rect.top) / rect.height) * canvas.height
    return { x, y }
  }

  const hitTestShape = (p: Point) => {
    // Top-most wins: iterate from end to start
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i]
      if (!s) continue
      if (isPointInPolygon(p, s.points)) return s
    }
    return null
  }

  const hitTestText = (p: Point) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    // Even if ctx is missing, we can do a rough hit using fontSize
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i]
      if (!t) continue
      const text = t.text ?? ''
      const fontSize = clampNumber(t.fontSize ?? 18, 8, 80)

      let textWidth = 0
      if (ctx) {
        ctx.save()
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`
        textWidth = ctx.measureText(text).width
        ctx.restore()
      } else {
        // Fallback: approx width
        textWidth = text.length * (fontSize * 0.6)
      }

      const textHeight = Math.max(12, Math.min(90, fontSize))

      // Match drawing: background box is above baseline; we allow selection around glyphs too
      const paddingX = 10
      const paddingY = 6
      const left = t.x - paddingX
      const top = t.y - textHeight - paddingY
      const right = t.x + textWidth + paddingX
      const bottom = t.y + paddingY

      if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) return t
    }
    return null
  }

  const handleCanvasClick = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const p = getCanvasPoint(evt)
    if (!p) return

    // Prefer selecting existing items when clicking on them
    if (mode === 'shape') {
      const hit = hitTestShape(p)
      if (hit) {
        selectShapeById(hit.id)
        // Keep text selection independent
        setSelectedTextId(null)
        return
      }
      // If user is editing a shape and clicked outside, keep it simple: don't add points.
      if (selectedShapeId) return
    }

    if (mode === 'text') {
      const hit = hitTestText(p)
      if (hit) {
        selectTextById(hit.id)
        setSelectedShapeId(null)
        return
      }
    }

    if (mode === 'shape') {
      setCurrentShapePoints((prev) => {
        const firstPoint = prev[0]
        const next = [...prev]

        // Cerrar forma si vuelve al punto 1
        if (firstPoint && prev.length >= 3) {
          const dx = p.x - firstPoint.x
          const dy = p.y - firstPoint.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist <= 14) {
            const id = crypto.randomUUID()
            const newShape: Shape = {
              id,
              name: shapeName.trim() || undefined,
              points: prev,
              fillColor: shapeFillColor,
              opacity: shapeOpacity,
              showBorder: shapeShowBorder,
              borderColor: shapeBorderColor,
              cornerRadius: shapeCornerRadius,
            }
            setShapes((existing) => [...existing, newShape])
            return []
          }
        }

        next.push(p)
        return next
      })
      return
    }

    const t = textValue.trim()
    if (!t) return
    const id = crypto.randomUUID()
    setTexts((prev) => [
      ...prev,
      {
        id,
        name: textName.trim() || undefined,
        x: p.x,
        y: p.y,
        text: t,
        color: textColor,
        fontSize: textFontSize,
        backgroundEnabled: textBackgroundEnabled,
        backgroundColor: textBackgroundColor,
        backgroundOpacity: textBackgroundOpacity,
      },
    ])
  }

  const handleClear = () => {
    setShapes([])
    setCurrentShapePoints([])
    setSelectedShapeId(null)
    setTexts([])
    setSelectedTextId(null)
  }

  const handleSave = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const blob: Blob | null = await new Promise((resolve) => {
      try {
        canvas.toBlob(
          (b) => resolve(b),
          'image/webp',
          0.92
        )
      } catch {
        resolve(null)
      }
    })

    if (blob) {
      const file = new File([blob], 'anotada.webp', { type: 'image/webp' })
      onSave(file)
      return
    }

    // Fallback PNG
    const pngBlob: Blob | null = await new Promise((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), 'image/png')
      } catch {
        resolve(null)
      }
    })

    if (!pngBlob) {
      throw new Error('No se pudo generar la imagen anotada')
    }

    const file = new File([pngBlob], 'anotada.png', { type: 'image/png' })
    onSave(file)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {!sourceUrl ? (
          <div className="text-sm text-muted-foreground">No hay imagen para anotar.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1">
                <Label>Modo</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={mode === 'shape' ? 'default' : 'outline'} size="sm" onClick={() => setMode('shape')}>
                    Forma (puntos)
                  </Button>
                  <Button type="button" variant={mode === 'text' ? 'default' : 'outline'} size="sm" onClick={() => setMode('text')}>
                    Texto
                  </Button>
                </div>
              </div>

              {mode === 'shape' && (
                <>
                  <div className="space-y-1 min-w-[220px]">
                    <Label>Nombre de la forma</Label>
                    <Input value={shapeName} onChange={(e) => setShapeName(e.target.value)} placeholder="Ej: Área afectada" />
                  </div>
                  <div className="space-y-1">
                    <Label>Color forma</Label>
                    <Input type="color" value={shapeFillColor} onChange={(e) => setShapeFillColor(e.target.value)} className="h-9 w-[64px] p-1" />
                  </div>
                  <div className="space-y-1">
                    <Label>Transparencia</Label>
                    <Input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={shapeOpacity}
                      onChange={(e) => setShapeOpacity(Number(e.target.value))}
                      className="w-[180px]"
                    />
                    <div className="text-xs text-muted-foreground">{Math.round(shapeOpacity * 100)}%</div>
                  </div>
                  <div className="space-y-1">
                    <Label>Curvatura</Label>
                    <Input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={shapeCornerRadius}
                      onChange={(e) => setShapeCornerRadius(Number(e.target.value))}
                      className="w-[180px]"
                    />
                    <div className="text-xs text-muted-foreground">{Math.round(shapeCornerRadius * 100)}%</div>
                  </div>
                  <div className="space-y-1">
                    <Label>Marco</Label>
                    <div className="flex items-center gap-2 h-9">
                      <Switch checked={shapeShowBorder} onCheckedChange={setShapeShowBorder} />
                      <span className="text-sm text-muted-foreground">{shapeShowBorder ? 'Sí' : 'No'}</span>
                    </div>
                  </div>
                  {shapeShowBorder && (
                    <div className="space-y-1">
                      <Label>Color marco</Label>
                      <Input type="color" value={shapeBorderColor} onChange={(e) => setShapeBorderColor(e.target.value)} className="h-9 w-[64px] p-1" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedShapeId(null)
                        setCurrentShapePoints([])
                        setShapeName('')
                      }}
                      disabled={!selectedShapeId && currentShapePoints.length === 0}
                    >
                      Nueva forma
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={handleClear}>
                      Limpiar
                    </Button>
                  </div>
                </>
              )}

              {mode === 'text' && (
                <>
                  <div className="space-y-1 min-w-[220px]">
                    <Label>Nombre del texto</Label>
                    <Input value={textName} onChange={(e) => setTextName(e.target.value)} placeholder="Ej: Nota 1" />
                  </div>
                  <div className="space-y-1 min-w-[260px]">
                    <Label>Texto</Label>
                    <Input value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="Escribe y luego haz click para colocarlo" />
                  </div>
                  <div className="space-y-1">
                    <Label>Color</Label>
                    <Input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-9 w-[64px] p-1" />
                  </div>
                  <div className="space-y-1">
                    <Label>Tamaño</Label>
                    <Input
                      type="number"
                      min={8}
                      max={80}
                      value={textFontSize}
                      onChange={(e) => setTextFontSize(Number(e.target.value) || 18)}
                      className="w-[90px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Fondo</Label>
                    <div className="flex items-center gap-2 h-9">
                      <Switch checked={textBackgroundEnabled} onCheckedChange={setTextBackgroundEnabled} />
                      <span className="text-sm text-muted-foreground">{textBackgroundEnabled ? 'Sí' : 'No'}</span>
                    </div>
                  </div>
                  {textBackgroundEnabled && (
                    <>
                      <div className="space-y-1">
                        <Label>Color fondo</Label>
                        <Input type="color" value={textBackgroundColor} onChange={(e) => setTextBackgroundColor(e.target.value)} className="h-9 w-[64px] p-1" />
                      </div>
                      <div className="space-y-1">
                        <Label>Transp. fondo</Label>
                        <Input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={textBackgroundOpacity}
                          onChange={(e) => setTextBackgroundOpacity(Number(e.target.value))}
                          className="w-[180px]"
                        />
                        <div className="text-xs text-muted-foreground">{Math.round(textBackgroundOpacity * 100)}%</div>
                      </div>
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleClear}>
                      Limpiar
                    </Button>
                  </div>
                </>
              )}
            </div>

            {isLoading && <div className="text-sm text-muted-foreground">Cargando imagen…</div>}
            {loadError && <div className="text-sm text-red-600">{loadError}</div>}

            <div className={cn('w-full rounded-md border border-border bg-muted/20 overflow-auto', isLoading && 'opacity-60')}>
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="block max-w-full"
                style={{ cursor: mode === 'shape' ? 'crosshair' : 'text' }}
              />
            </div>

            {mode === 'shape' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-md border border-border p-3">
                  <div className="text-sm font-medium">Formas</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Click agrega puntos 1..N. Para cerrar, vuelve al punto 1.
                  </div>
                  <div className="mt-2 space-y-1">
                    {shapes.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Sin formas.</div>
                    ) : (
                      shapes.map((s, idx) => (
                        <div key={s.id} className="flex items-center justify-between gap-2">
                            <div className="text-sm">{s.name?.trim() ? s.name : `Forma ${idx + 1}`} ({s.points.length} pts)</div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={selectedShapeId === s.id ? 'default' : 'outline'}
                              onClick={() => {
                                selectShapeById(s.id)
                              }}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setShapes((prev) => prev.filter((x) => x.id !== s.id))
                                if (selectedShapeId === s.id) setSelectedShapeId(null)
                              }}
                            >
                              Eliminar
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {selectedShapeId && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="text-sm font-medium">Editar forma seleccionada</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Cambia color/transparencia/marco y se aplica en vivo.
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setSelectedShapeId(null)}>
                          Listo
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-border p-3">
                  <div className="text-sm font-medium">Texto</div>
                  <div className="text-xs text-muted-foreground mt-1">Usa “Texto” para agregar y editar.</div>
                </div>
              </div>
            )}

            {mode === 'text' && (
              <div className="rounded-md border border-border p-3">
                <div className="text-sm font-medium">Textos</div>
                <div className="text-xs text-muted-foreground mt-1">Selecciona un texto para editar contenido/color/tamaño.</div>
                <div className="mt-2 space-y-1">
                  {texts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Sin textos.</div>
                  ) : (
                    texts.map((t, idx) => (
                      <div key={t.id} className="flex items-center justify-between gap-2">
                        <div className="text-sm truncate">{t.name?.trim() ? t.name : `${idx + 1}.`} {t.text}</div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={selectedTextId === t.id ? 'default' : 'outline'}
                            onClick={() => {
                              selectTextById(t.id)
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTexts((prev) => prev.filter((x) => x.id !== t.id))
                              if (selectedTextId === t.id) setSelectedTextId(null)
                            }}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {selectedTextId && (
                  <div className="mt-3 pt-3 border-t border-border flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setSelectedTextId(null)}>
                      Listo
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSave} disabled={!canSave || isLoading}>
                Guardar imagen anotada
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Tip: en “Forma”, click agrega puntos 1..N y al volver al punto 1 se cierra. En “Texto”, escribe y haz click para colocarlo.
            </div>
          </div>
        )}

        {/* Nota: imageMime se conserva por si en el futuro se quiere condicionar formato */}
        <input type="hidden" value={imageMime} readOnly />
      </DialogContent>
    </Dialog>
  )
}

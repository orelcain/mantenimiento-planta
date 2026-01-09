import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label, Switch } from '@/components/ui'
import { cn } from '@/lib/utils'

type AnnotatorMode = 'shape' | 'text'

type Point = { x: number; y: number }

type Shape = {
  id: string
  points: Point[]
  fillColor: string
  opacity: number // 0..1
  showBorder: boolean
  borderColor: string
  cornerRadius: number // 0..1 (0%..100%)
}

type TextItem = {
  id: string
  x: number
  y: number
  text: string
  color: string
  fontSize: number
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

  const [textValue, setTextValue] = useState('')
  const [textColor, setTextColor] = useState('#111827')
  const [textFontSize, setTextFontSize] = useState(18)
  const [texts, setTexts] = useState<TextItem[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedShapeId) return
    setShapes((prev) => {
      let changed = false
      const next = prev.map((s) => {
        if (s.id !== selectedShapeId) return s
        const nextShape: Shape = {
          ...s,
          fillColor: shapeFillColor,
          opacity: shapeOpacity,
          showBorder: shapeShowBorder,
          borderColor: shapeBorderColor,
          cornerRadius: shapeCornerRadius,
        }
        const same =
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
  }, [selectedShapeId, shapeFillColor, shapeOpacity, shapeShowBorder, shapeBorderColor, shapeCornerRadius])

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
    setTexts([])
    setImageSize(null)
  }, [open])

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
      ctx2.fillStyle = t.color
      ctx2.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx2.lineWidth = 4
      ctx2.strokeText(t.text, t.x, t.y)
      ctx2.fillText(t.text, t.x, t.y)
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

  const handleCanvasClick = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const p = getCanvasPoint(evt)
    if (!p) return

    if (mode === 'shape') {
      if (selectedShapeId) return

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
        x: p.x,
        y: p.y,
        text: t,
        color: textColor,
        fontSize: textFontSize,
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
                          <div className="text-sm">Forma {idx + 1} ({s.points.length} pts)</div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={selectedShapeId === s.id ? 'default' : 'outline'}
                              onClick={() => {
                                setSelectedShapeId(s.id)
                                setCurrentShapePoints([])
                                setShapeFillColor(s.fillColor)
                                setShapeOpacity(s.opacity)
                                setShapeShowBorder(s.showBorder)
                                setShapeBorderColor(s.borderColor)
                                setShapeCornerRadius(s.cornerRadius ?? 0)
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
                        <div className="text-sm truncate">{idx + 1}. {t.text}</div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={selectedTextId === t.id ? 'default' : 'outline'}
                            onClick={() => {
                              setSelectedTextId(t.id)
                              setTextValue(t.text)
                              setTextColor(t.color)
                              setTextFontSize(t.fontSize)
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
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const nextText = textValue.trim()
                        if (!nextText) return
                        setTexts((prev) =>
                          prev.map((t) =>
                            t.id === selectedTextId
                              ? { ...t, text: nextText, color: textColor, fontSize: textFontSize }
                              : t
                          )
                        )
                      }}
                    >
                      Aplicar
                    </Button>
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

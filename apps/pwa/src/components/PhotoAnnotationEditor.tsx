import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { X, 
  Undo, 
  Type, 
  MousePointer,
  Pencil,
  Download,
  Trash2, Lightbulb } from 'lucide-react'

type Point = { x: number; y: number }

type Shape = {
  id: string
  points: Point[]
  opacity: number
  cornerRadius: number
  color: string
}

type TextAnnotation = {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  color: string
}

type Tool = 'select' | 'polygon' | 'text'

interface PhotoAnnotationEditorProps {
  photoUrl: string
  onSave: (annotatedImageUrl: string) => void
  onClose: () => void
}

export function PhotoAnnotationEditor({
  photoUrl,
  onSave,
  onClose,
}: PhotoAnnotationEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  
  const [shapes, setShapes] = useState<Shape[]>([])
  const [currentShape, setCurrentShape] = useState<Point[]>([])
  const [opacity, setOpacity] = useState(30)
  const [cornerRadius, setCornerRadius] = useState(0)
  const [shapeColor, setShapeColor] = useState('#FF6B6B')
  
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([])
  const [currentText, setCurrentText] = useState('')
  const [textFontSize, setTextFontSize] = useState(20)
  const [textColor, setTextColor] = useState('#FFFFFF')
  const [placingText, setPlacingText] = useState(false)
  
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)

  // Cargar imagen
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImage(img)
    img.src = photoUrl
  }, [photoUrl])

  // Dibujar canvas
  useEffect(() => {
    if (!canvasRef.current || !image) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Ajustar tamaño del canvas a la imagen
    canvas.width = image.width
    canvas.height = image.height

    // Limpiar y dibujar imagen base
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0)

    // Dibujar formas completadas
    shapes.forEach((shape) => {
      if (shape.points.length < 3 || !shape.points[0]) return
      
      ctx.beginPath()
      ctx.moveTo(shape.points[0].x, shape.points[0].y)
      
      for (let i = 1; i < shape.points.length; i++) {
        const point = shape.points[i]
        if (point) ctx.lineTo(point.x, point.y)
      }
      
      ctx.closePath()
      ctx.fillStyle = shape.color + Math.round((shape.opacity / 100) * 255).toString(16).padStart(2, '0')
      ctx.fill()
      ctx.strokeStyle = shape.color
      ctx.lineWidth = 2
      ctx.stroke()
      
      // Dibujar puntos
      shape.points.forEach((point) => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI)
        ctx.fillStyle = shape.color
        ctx.fill()
      })
    })

    // Dibujar forma en progreso
    if (currentShape.length > 0 && currentShape[0]) {
      ctx.strokeStyle = shapeColor
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(currentShape[0].x, currentShape[0].y)
      
      for (let i = 1; i < currentShape.length; i++) {
        const point = currentShape[i]
        if (point) ctx.lineTo(point.x, point.y)
      }
      
      ctx.stroke()
      
      // Dibujar puntos
      currentShape.forEach((point, idx) => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, idx === 0 ? 8 : 5, 0, 2 * Math.PI)
        ctx.fillStyle = idx === 0 ? '#00FF00' : shapeColor
        ctx.fill()
      })
    }

    // Dibujar textos
    textAnnotations.forEach((textItem) => {
      ctx.font = `${textItem.fontSize}px Arial`
      ctx.fillStyle = textItem.color
      ctx.fillText(textItem.text, textItem.x, textItem.y)
      
      // Borde si está seleccionado
      if (textItem.id === selectedTextId) {
        const metrics = ctx.measureText(textItem.text)
        ctx.strokeStyle = '#00FF00'
        ctx.lineWidth = 2
        ctx.strokeRect(
          textItem.x - 5,
          textItem.y - textItem.fontSize,
          metrics.width + 10,
          textItem.fontSize + 10
        )
      }
    })
  }, [image, shapes, currentShape, shapeColor, textAnnotations, selectedTextId])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = canvasRef.current.width / rect.width
    const scaleY = canvasRef.current.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    if (tool === 'polygon') {
      // Verificar si está cerrando la forma (click en primer punto)
      if (currentShape.length >= 3 && currentShape[0]) {
        const firstPoint = currentShape[0]
        const distance = Math.sqrt((x - firstPoint.x) ** 2 + (y - firstPoint.y) ** 2)
        
        if (distance < 15) {
          // Cerrar forma
          setShapes([
            ...shapes,
            {
              id: `shape-${Date.now()}`,
              points: currentShape,
              opacity,
              cornerRadius,
              color: shapeColor,
            },
          ])
          setCurrentShape([])
          return
        }
      }

      // Agregar punto
      setCurrentShape([...currentShape, { x, y }])
    } else if (tool === 'text' && placingText) {
      // Colocar texto
      if (currentText.trim()) {
        setTextAnnotations([
          ...textAnnotations,
          {
            id: `text-${Date.now()}`,
            text: currentText,
            x,
            y,
            fontSize: textFontSize,
            color: textColor,
          },
        ])
        setCurrentText('')
        setPlacingText(false)
      }
    }
  }

  const handleStartPlacingText = () => {
    if (currentText.trim()) {
      setPlacingText(true)
      setTool('text')
    }
  }

  const handleUndo = () => {
    if (currentShape.length > 0) {
      setCurrentShape(currentShape.slice(0, -1))
    } else if (shapes.length > 0) {
      setShapes(shapes.slice(0, -1))
    } else if (textAnnotations.length > 0) {
      setTextAnnotations(textAnnotations.slice(0, -1))
    }
  }

  const handleDeleteShape = () => {
    if (selectedShapeId) {
      setShapes(shapes.filter(s => s.id !== selectedShapeId))
      setSelectedShapeId(null)
    }
  }

  const handleDeleteText = () => {
    if (selectedTextId) {
      setTextAnnotations(textAnnotations.filter(t => t.id !== selectedTextId))
      setSelectedTextId(null)
    }
  }

  const handleSave = () => {
    if (!canvasRef.current) return

    // Exportar canvas como imagen
    canvasRef.current.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        onSave(url)
      }
    }, 'image/webp', 0.9)
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4">
      <div className="w-full max-w-7xl h-full flex flex-col gap-4">
        {/* Barra de herramientas */}
        <Card className="flex-shrink-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Button
                  variant={tool === 'select' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTool('select')}
                >
                  <MousePointer className="h-4 w-4 mr-2" />
                  Seleccionar
                </Button>
                <Button
                  variant={tool === 'polygon' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTool('polygon')}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Dibujar forma
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUndo}
                  disabled={currentShape.length === 0 && shapes.length === 0 && textAnnotations.length === 0}
                >
                  <Undo className="h-4 w-4 mr-2" />
                  Deshacer
                </Button>
                {(selectedShapeId || selectedTextId) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectedShapeId ? handleDeleteShape : handleDeleteText}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSave}>
                  <Download className="h-4 w-4 mr-2" />
                  Guardar
                </Button>
                <Button variant="outline" size="sm" onClick={onClose}>
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
              </div>
            </div>

            {/* Controles de forma */}
            {tool === 'polygon' && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Transparencia: {opacity}%</Label>
                  <Slider
                    value={[opacity]}
                    onValueChange={(v) => setOpacity(v[0] ?? 0)}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
                <div>
                  <Label>Curvatura: {cornerRadius}</Label>
                  <Slider
                    value={[cornerRadius]}
                    onValueChange={(v) => setCornerRadius(v[0] ?? 0)}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
                <div>
                  <Label>Color</Label>
                  <Input
                    type="color"
                    value={shapeColor}
                    onChange={(e) => setShapeColor(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Controles de texto */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <Label>Texto</Label>
                <Input
                  value={currentText}
                  onChange={(e) => setCurrentText(e.target.value)}
                  placeholder="Escribe el texto..."
                />
              </div>
              <div>
                <Label>Tamaño: {textFontSize}px</Label>
                <Slider
                  value={[textFontSize]}
                  onValueChange={(v) => setTextFontSize(v[0] ?? 20)}
                  min={12}
                  max={72}
                  step={2}
                />
              </div>
              <div>
                <Label>Color texto</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={handleStartPlacingText}
                    disabled={!currentText.trim()}
                  >
                    <Type className="h-4 w-4 mr-2" />
                    Colocar
                  </Button>
                </div>
              </div>
            </div>

            {tool === 'polygon' && currentShape.length > 0 && (
              <div className="mt-2 text-sm text-muted-foreground">
                <Lightbulb className="inline h-3 w-3" /> Clic en el primer punto (verde) para cerrar la forma
              </div>
            )}
            {placingText && (
              <div className="mt-2 text-sm text-muted-foreground">
                <Lightbulb className="inline h-3 w-3" /> Haz clic en la imagen para colocar el texto
              </div>
            )}
          </CardContent>
        </Card>

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center overflow-auto">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="max-w-full max-h-full cursor-crosshair border border-white/20"
            style={{ imageRendering: 'crisp-edges' }}
          />
        </div>
      </div>
    </div>
  )
}

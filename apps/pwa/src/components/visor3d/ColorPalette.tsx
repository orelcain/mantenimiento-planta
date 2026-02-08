/**
 * ColorPalette - Paleta de colores mate para pintar objetos 3D
 * 
 * Colores tipo Pantone mate (sin brillos) para diferenciar piezas.
 */

import { useState } from 'react'
import { Paintbrush, Eraser, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui'

/** Paleta de colores mate tipo Pantone */
const MATTE_COLORS = [
  // Rojos / Naranjas
  { hex: '#c0392b', name: 'Rojo Industrial' },
  { hex: '#e74c3c', name: 'Rojo Señal' },
  { hex: '#d35400', name: 'Naranja Máquina' },
  { hex: '#e67e22', name: 'Naranja Alerta' },
  // Amarillos
  { hex: '#f39c12', name: 'Amarillo Precaución' },
  { hex: '#f1c40f', name: 'Amarillo Seguridad' },
  // Verdes
  { hex: '#27ae60', name: 'Verde Operativo' },
  { hex: '#2ecc71', name: 'Verde Claro' },
  { hex: '#1abc9c', name: 'Turquesa' },
  { hex: '#16a085', name: 'Verde Azulado' },
  // Azules
  { hex: '#2980b9', name: 'Azul Industrial' },
  { hex: '#3498db', name: 'Azul Cielo' },
  { hex: '#2c3e50', name: 'Azul Oscuro' },
  { hex: '#34495e', name: 'Gris Azulado' },
  // Violetas / Rosas
  { hex: '#8e44ad', name: 'Violeta' },
  { hex: '#9b59b6', name: 'Lila' },
  // Grises / Neutros
  { hex: '#7f8c8d', name: 'Gris Medio' },
  { hex: '#95a5a6', name: 'Gris Claro' },
  { hex: '#bdc3c7', name: 'Plata Mate' },
  { hex: '#ecf0f1', name: 'Blanco Crema' },
  // Oscuros
  { hex: '#1a1a2e', name: 'Negro Mate' },
  { hex: '#4a3728', name: 'Marrón Oscuro' },
  { hex: '#6b4226', name: 'Marrón Cobre' },
  { hex: '#a0522d', name: 'Siena' },
]

interface ColorPaletteProps {
  selectedColor: string | null
  onSelectColor: (color: string) => void
  onClearMode: () => void
  onResetAll: () => void
  isEraseMode: boolean
  onToggleErase: () => void
  paintedCount: number
}

export function ColorPalette({
  selectedColor,
  onSelectColor,
  onClearMode,
  onResetAll,
  isEraseMode,
  onToggleErase,
  paintedCount,
}: ColorPaletteProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="absolute top-2 left-2 z-20 pointer-events-auto">
      <div className="bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg overflow-hidden max-w-[260px]">
        {/* Header */}
        <button
          className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <Paintbrush className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Pintar</span>
            {paintedCount > 0 && (
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 rounded-full">
                {paintedCount}
              </span>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        {expanded && (
          <div className="border-t px-3 py-2 space-y-2">
            {/* Color grid */}
            <div className="grid grid-cols-6 gap-1.5">
              {MATTE_COLORS.map((c) => (
                <button
                  key={c.hex}
                  className={`w-7 h-7 rounded-md border-2 transition-all hover:scale-110 ${
                    selectedColor === c.hex && !isEraseMode
                      ? 'border-white ring-2 ring-primary scale-110'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => onSelectColor(c.hex)}
                  title={c.name}
                />
              ))}
            </div>

            {/* Custom color picker */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Otro:</label>
              <input
                type="color"
                value={selectedColor || '#888888'}
                onChange={(e) => onSelectColor(e.target.value)}
                className="w-8 h-6 rounded cursor-pointer border border-muted"
              />
              {selectedColor && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {selectedColor}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 pt-1 border-t">
              <Button
                variant={isEraseMode ? 'destructive' : 'outline'}
                size="sm"
                className="gap-1 h-7 text-xs flex-1"
                onClick={onToggleErase}
              >
                <Eraser className="h-3 w-3" />
                Borrar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 h-7 text-xs flex-1"
                onClick={onResetAll}
                disabled={paintedCount === 0}
              >
                <RotateCcw className="h-3 w-3" />
                Limpiar
              </Button>
            </div>

            {/* Instructions */}
            <p className="text-[10px] text-muted-foreground leading-tight">
              {isEraseMode
                ? 'Haz clic en una pieza para quitar su color'
                : selectedColor
                ? 'Haz clic en una pieza del modelo para pintarla'
                : 'Selecciona un color y haz clic en una pieza'}
            </p>

            {/* Close paint mode */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground"
              onClick={onClearMode}
            >
              Cerrar pintura
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

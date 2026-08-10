/**
 * PDFViewer - Visor de PDFs con sistema de marcadores visuales
 * 
 * Características principales:
 * - Renderizado de PDFs con PDF.js
 * - Navegación por páginas
 * - Zoom (fit-width, fit-page, custom)
 * - Marcadores visuales (círculos, rectángulos, polígonos)
 * - Coordenadas normalizadas (0-1) para responsive
 * - Modo edición vs vista
 * - Persistencia de marcadores en Firestore
 * 
 * Basado en sistema de Repuestos-App (1,386 líneas)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import type { VinculoManual } from '@/types/vinculos';
import { logger } from '@/lib/logger';
import { getCachedPdf } from '@/services/pdfCache';
import {
  normalizeCoordinates,
  denormalizeCoordinates,
  normalizePoints,
  denormalizePoints,
  MARKER_COLORS,
} from '@/types/vinculos';

// Configurar worker de PDF.js
if (typeof window !== 'undefined') {
  // Worker self-hosted en public/vendor/pdfjs/ — evita CDN externa, compatible con pdfjs-dist 4+/5+
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}vendor/pdfjs/pdf.worker.min.mjs`;
}

type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

interface PDFViewerProps {
  pdfUrl: string;
  vinculos?: VinculoManual[];
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onMarkerClick?: (vinculo: VinculoManual) => void;
  editMode?: boolean;
  onAddMarker?: (vinculo: Omit<VinculoManual, 'id'>) => void;
  highlightMarker?: string | null; // ID del marcador a resaltar
  className?: string;
}

export function PDFViewer({
  pdfUrl,
  vinculos = [],
  currentPage = 1,
  onPageChange,
  onMarkerClick,
  editMode = false,
  onAddMarker,
  highlightMarker,
  className = '',
}: PDFViewerProps) {
  // Estados del PDF
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(currentPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de visualización
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');
  const [customZoom, setCustomZoom] = useState(1.0);

  // Estados de dibujo (modo edición)
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingShape, setDrawingShape] = useState<'circulo' | 'rectangulo' | 'poligono'>('rectangulo');
  const [drawingColor, setDrawingColor] = useState(MARKER_COLORS[0]);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [tempMarker, setTempMarker] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Referencias
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Cargar PDF
  useEffect(() => {
    let isMounted = true;

    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(null);

        const pdf = await getCachedPdf(pdfUrl);

        if (!isMounted) return;

        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch (err: any) {
        logger.error('Error loading PDF', err instanceof Error ? err : new Error(String(err)));
        if (isMounted) {
          setError('Error al cargar el PDF');
          setLoading(false);
        }
      }
    };

    loadPDF();

    return () => {
      isMounted = false;
    };
  }, [pdfUrl]);

  // Renderizar página
  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

      try {
        const page = await pdfDoc.getPage(pageNumber);
        const canvas = canvasRef.current;
        const container = containerRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        // Calcular escala según el modo de zoom
        let targetScale = 1.0;

        if (zoomMode === 'fit-width') {
          const containerWidth = container.clientWidth;
          const viewport = page.getViewport({ scale: 1.0 });
          targetScale = containerWidth / viewport.width;
        } else if (zoomMode === 'fit-page') {
          const containerWidth = container.clientWidth;
          const containerHeight = container.clientHeight;
          const viewport = page.getViewport({ scale: 1.0 });
          const scaleWidth = containerWidth / viewport.width;
          const scaleHeight = containerHeight / viewport.height;
          targetScale = Math.min(scaleWidth, scaleHeight);
        } else {
          targetScale = customZoom;
        }

        const viewport = page.getViewport({ scale: targetScale });

        // Configurar canvas
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // Renderizar (pdfjs-dist >=4.2 requiere 'canvas' en RenderParameters)
        const renderContext = {
          canvas,
          canvasContext: ctx,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
      } catch (err) {
        logger.error('Error rendering page', err instanceof Error ? err : new Error(String(err)));
      }
    },
    [pdfDoc, zoomMode, customZoom]
  );

  // Renderizar cuando cambia la página, zoom o PDF
  useEffect(() => {
    renderPage(pageNum);
  }, [pageNum, renderPage]);

  // Sincronizar página externa
  useEffect(() => {
    setPageNum(currentPage);
  }, [currentPage]);

  // Navegación
  const goToPage = (page: number) => {
    const newPage = Math.max(1, Math.min(page, numPages));
    setPageNum(newPage);
    onPageChange?.(newPage);
  };

  const nextPage = () => goToPage(pageNum + 1);
  const prevPage = () => goToPage(pageNum - 1);

  // Zoom
  const zoomIn = () => {
    setZoomMode('custom');
    setCustomZoom(prev => Math.min(prev * 1.2, 5.0));
  };

  const zoomOut = () => {
    setZoomMode('custom');
    setCustomZoom(prev => Math.max(prev / 1.2, 0.1));
  };

  // Marcadores - filtrar por página actual
  const markersOnPage = vinculos.filter(v => v.pagina === pageNum);

  // Dibujo de marcadores (modo edición)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!editMode || !canvasRef.current || !overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (drawingShape === 'poligono') {
      setCurrentPath(prev => [...prev, { x, y }]);
    } else {
      setIsDrawing(true);
      setTempMarker({ x, y, width: 0, height: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!editMode || !isDrawing || !tempMarker || !overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setTempMarker({
      x: Math.min(tempMarker.x, currentX),
      y: Math.min(tempMarker.y, currentY),
      width: Math.abs(currentX - tempMarker.x),
      height: Math.abs(currentY - tempMarker.y),
    });
  };

  const handleMouseUp = () => {
    if (!editMode || !canvasRef.current) return;

    if (drawingShape === 'poligono') {
      // Polígono se completa con doble click
      return;
    }

    if (isDrawing && tempMarker && tempMarker.width > 5 && tempMarker.height > 5 && drawingColor) {
      // Convertir a coordenadas normalizadas
      const canvasWidth = canvasRef.current.width;
      const canvasHeight = canvasRef.current.height;

      const normalized = normalizeCoordinates(
        {
          x: tempMarker.x,
          y: tempMarker.y,
          width: tempMarker.width,
          height: tempMarker.height
        },
        canvasWidth,
        canvasHeight
      );

      const newVinculo: Omit<VinculoManual, 'id'> = {
        pagina: pageNum,
        machineId: '', // Se asignará desde el componente padre
        manualUrl: pdfUrl,
        coordenadas: normalized,
        forma: drawingShape === 'circulo' ? 'circulo' : 'rectangulo',
        color: drawingColor.value,
        descripcion: '',
        sinBorde: false,
      };

      onAddMarker?.(newVinculo);
    }

    setIsDrawing(false);
    setTempMarker(null);
  };

  const handleDoubleClick = () => {
    if (!editMode || drawingShape !== 'poligono' || currentPath.length < 3 || !canvasRef.current || !drawingColor) return;

    // Finalizar polígono
    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;

    const normalizedPoints = normalizePoints(currentPath, canvasWidth, canvasHeight);

    const newVinculo: Omit<VinculoManual, 'id'> = {
      pagina: pageNum,
      machineId: '',
      manualUrl: pdfUrl,
      puntos: normalizedPoints,
      forma: 'poligono',
      color: drawingColor.value,
      descripcion: '',
      sinBorde: false,
    };

    onAddMarker?.(newVinculo);
    setCurrentPath([]);
  };

  // Renderizar marcador en el overlay
  const renderMarker = (vinculo: VinculoManual) => {
    if (!canvasRef.current) return null;

    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;

    const isHighlighted = highlightMarker === vinculo.id;
    const opacity = isHighlighted ? 0.6 : 0.3;

    if (vinculo.forma === 'poligono' && vinculo.puntos) {
      const denormalizedPoints = denormalizePoints(vinculo.puntos, canvasWidth, canvasHeight);
      const pathData = denormalizedPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ') + ' Z';

      return (
        <svg
          key={vinculo.id}
          className="absolute top-0 left-0 pointer-events-none"
          style={{ width: canvasWidth, height: canvasHeight }}
        >
          <path
            d={pathData}
            fill={vinculo.color}
            fillOpacity={opacity}
            stroke={vinculo.sinBorde ? 'none' : vinculo.color}
            strokeWidth={isHighlighted ? 3 : 2}
            className="cursor-pointer pointer-events-auto"
            onClick={() => onMarkerClick?.(vinculo)}
          />
        </svg>
      );
    }

    if (vinculo.coordenadas) {
      const { x, y, width, height } = denormalizeCoordinates(vinculo.coordenadas, canvasWidth, canvasHeight);

      if (vinculo.forma === 'circulo') {
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const radius = Math.max(width, height) / 2;

        return (
          <div
            key={vinculo.id}
            className="absolute rounded-full cursor-pointer"
            style={{
              left: centerX - radius,
              top: centerY - radius,
              width: radius * 2,
              height: radius * 2,
              backgroundColor: vinculo.color,
              opacity,
              border: vinculo.sinBorde ? 'none' : `${isHighlighted ? 3 : 2}px solid ${vinculo.color}`,
            }}
            onClick={() => onMarkerClick?.(vinculo)}
          />
        );
      }

      // Rectángulo
      return (
        <div
          key={vinculo.id}
          className="absolute cursor-pointer"
          style={{
            left: x,
            top: y,
            width,
            height,
            backgroundColor: vinculo.color,
            opacity,
            border: vinculo.sinBorde ? 'none' : `${isHighlighted ? 3 : 2}px solid ${vinculo.color}`,
          }}
          onClick={() => onMarkerClick?.(vinculo)}
        />
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-card">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-red-50 rounded-card">
        <div className="text-center text-ink-crit">
          <p className="font-semibold">❌ {error}</p>
          <p className="text-sm mt-2">Verifica que el archivo PDF sea accesible</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 bg-gray-100 border-b">
        {/* Navegación */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevPage}
            disabled={pageNum <= 1}
            className="p-2 rounded-ctl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium px-3">
            {pageNum} / {numPages}
          </span>
          <button
            onClick={nextPage}
            disabled={pageNum >= numPages}
            className="p-2 rounded-ctl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-2">
          <button onClick={zoomOut} className="p-2 rounded-ctl hover:bg-gray-200">
            <ZoomOut className="w-5 h-5" />
          </button>
          <select
            value={zoomMode}
            onChange={(e) => setZoomMode(e.target.value as ZoomMode)}
            className="px-2 py-1 text-sm border rounded-ctl"
          >
            <option value="fit-width">Ajustar ancho</option>
            <option value="fit-page">Ajustar página</option>
            <option value="custom">{Math.round(customZoom * 100)}%</option>
          </select>
          <button onClick={zoomIn} className="p-2 rounded-ctl hover:bg-gray-200">
            <ZoomIn className="w-5 h-5" />
          </button>
        </div>

        {/* Herramientas de dibujo (modo edición) */}
        {editMode && drawingColor && (
          <div className="flex items-center gap-2">
            <select
              value={drawingShape}
              onChange={(e) => setDrawingShape(e.target.value as any)}
              className="px-2 py-1 text-sm border rounded-ctl"
            >
              <option value="rectangulo">Rectángulo</option>
              <option value="circulo">Círculo</option>
              <option value="poligono">Polígono</option>
            </select>
            <select
              value={drawingColor.value}
              onChange={(e) => {
                const color = MARKER_COLORS.find(c => c.value === e.target.value);
                if (color) setDrawingColor(color);
              }}
              className="px-2 py-1 text-sm border rounded-ctl"
            >
              {MARKER_COLORS.map(c => (
                <option key={c.value} value={c.value} style={{ backgroundColor: c.value }}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Visor del PDF */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto bg-gray-200"
        style={{ minHeight: '500px' }}
      >
        <div className="relative inline-block">
          <canvas ref={canvasRef} className="block" />
          
          {/* Overlay para marcadores */}
          <div
            ref={overlayRef}
            className="absolute top-0 left-0"
            style={{
              width: canvasRef.current?.width || 0,
              height: canvasRef.current?.height || 0,
              cursor: editMode ? 'crosshair' : 'default',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          >
            {/* Marcadores existentes */}
            {markersOnPage.map(renderMarker)}

            {/* Marcador temporal (durante dibujo) */}
            {tempMarker && drawingColor && (
              <div
                className="absolute border-2 border-dashed"
                style={{
                  left: tempMarker.x,
                  top: tempMarker.y,
                  width: tempMarker.width,
                  height: tempMarker.height,
                  borderColor: drawingColor.value,
                  backgroundColor: `${drawingColor.value}40`,
                }}
              />
            )}

            {/* Polígono temporal */}
            {currentPath.length > 0 && drawingColor && (
              <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
                <polyline
                  points={currentPath.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={drawingColor.value}
                  strokeWidth="2"
                  strokeDasharray="5,5"
                />
                {currentPath.map((point, i) => (
                  <circle
                    key={i}
                    cx={point.x}
                    cy={point.y}
                    r="4"
                    fill={drawingColor.value}
                  />
                ))}
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Info de marcadores */}
      {markersOnPage.length > 0 && (
        <div className="p-2 bg-blue-50 text-sm text-blue-800 border-t">
          📍 {markersOnPage.length} marcador{markersOnPage.length > 1 ? 'es' : ''} en esta página
        </div>
      )}
    </div>
  );
}

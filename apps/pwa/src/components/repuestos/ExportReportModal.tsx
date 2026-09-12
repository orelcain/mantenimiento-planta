import { useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { FileText, ClipboardList, Factory } from 'lucide-react'
import type { Repuesto } from '@/types/repuestos'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import * as repuestoExports from '@/utils/repuestos'
import type { EquipoSap } from '@/utils/repuestos/exportBomSAP'
import { rowKeyDeRepuesto } from '@/hooks/repuestos/identidadDeRepuesto'
import { logger } from '@/lib/logger'

export type ReportType = 'catalog' | 'sap_bom' | 'technical_sheet'

/** Identidad del equipo para la BOM de SAP. Si no viene, la opción SAP ni se ofrece. */
export interface SapEquipoContext {
  /** Número de equipo SAP (los `720004...`). */
  codigo: string
  nombre: string
  /** Centro: derivado del árbol, NUNCA del nombre del equipo. */
  centro: string
}

interface ExportReportModalProps {
  isOpen: boolean
  onClose: () => void
  repuestos: Repuesto[]
  filteredRepuestos?: Repuesto[] 
  machineName?: string
  /**
   * Claves de favoritos del usuario (las del módulo Repuestos). Habilitan las fichas técnicas:
   * medido sobre el catálogo, solo el 1% de los repuestos tiene foto y ninguno tiene ficha
   * técnica — una ficha por página del catálogo entero son miles de hojas en blanco. Entre los
   * favoritos, en cambio, más de la mitad tiene foto: es el subconjunto que la gente documenta.
   */
  favKeys?: ReadonlySet<string>
  /** Presente solo cuando se está viendo UN equipo: habilita la exportación IB01. */
  sapEquipo?: SapEquipoContext
  /** Equipos del alcance visible: habilita la exportacion masiva cuando no hay uno solo elegido. */
  sapEquipos?: EquipoSap[]
}



/**
 * Items unicos por id.
 *
 * La lista que llega al modal trae una fila POR CADA equipo donde sirve el repuesto (un
 * material de la Baader 142 aparece 3 veces, una por maquina hermana de Chonchi). Para una BOM
 * eso es veneno: SAP rechaza la lista entera si un material se repite, y sin esto la 142
 * exportaba 1.428 posiciones en vez de 476.
 */
const unicosPorId = <T extends { id: string }>(items: T[]): T[] => {
  const vistos = new Set<string>()
  return items.filter((r) => (vistos.has(r.id) ? false : (vistos.add(r.id), true)))
}

export function ExportReportModal({ isOpen, onClose, repuestos, filteredRepuestos, machineName = 'General', sapEquipo, sapEquipos, favKeys }: ExportReportModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reportType, setReportType] = useState<ReportType>('catalog')
  const [includeImages, setIncludeImages] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [filterMode, setFilterMode] = useState<'all' | 'filtered'>('all')
  // Las posiciones de texto (despiece sin código SAP) quedan fuera por defecto: incluirlas
  // multiplica el largo de la lista y la vuelve inmanejable al elegir componentes en IW31.
  const [incluirSinSap, setIncluirSinSap] = useState(false)

  // Un equipo elegido manda; si no hay, se ofrece la exportacion masiva del alcance visible.
  const sapMasivo = !sapEquipo && (sapEquipos?.length ?? 0) > 0
  const sapDisponible = !!sapEquipo || sapMasivo

  useEffect(() => {
    if (isOpen && filteredRepuestos && filteredRepuestos.length < repuestos.length) {
        setFilterMode('filtered')
        setSelectedIds(new Set(filteredRepuestos.map(r => r.id)))
    } else if (isOpen) {
        setFilterMode('all')
        setSelectedIds(new Set())
    }
  }, [isOpen, filteredRepuestos, repuestos.length])


  /** Los ítems que se pueden elegir: el mismo origen que alimentaba el árbol. */
  const itemsDelAlcance = useMemo(
    // `unicosPorId` por la misma razon que en la exportacion (#978): la lista trae una fila por
    // cada equipo donde sirve el repuesto, asi que la Baader 142 daba 5.409 filas para 1.803
    // materiales. El arbol lo ocultaba estando colapsado; una lista plana lo muestra repetido.
    () => unicosPorId(filterMode === 'filtered' && filteredRepuestos ? filteredRepuestos : repuestos),
    [filterMode, filteredRepuestos, repuestos],
  )

  /*
   * Se RENDERIZAN los primeros TOPE_VISIBLE; la selección sigue siendo de todos.
   * El árbol los tenía colapsados, así que pintarlos todos de golpe fue una regresión medible:
   * con el despiece de la Baader 142 (1.803 ítems) el diálogo tardaba 2,5 s en abrir. Este panel
   * es para AJUSTAR la selección —"Todos", "Ninguno", destildar un par—, no para leer 1.800
   * filas: para eso están los filtros de la lista de atrás. Mismo patrón que CargaRapidaModal.
   */
  const TOPE_VISIBLE = 150
  const itemsVisibles = useMemo(() => itemsDelAlcance.slice(0, TOPE_VISIBLE), [itemsDelAlcance])


  const handleExport = async () => {
    const selected = repuestos.filter(r => selectedIds.has(r.id)) 
    if (selected.length === 0) return

    setIsExporting(true)
    try {
        switch (reportType) {
            case 'technical_sheet':
                // Solo los favoritos: ver el comentario de `favKeys` en las props.
                if (favoritosSeleccionados.length === 0) break
                await repuestoExports.exportMultipleTechnicalSheetsToPDF(favoritosSeleccionados, machineName)
                break
            case 'catalog':
                await repuestoExports.exportRepuestosToPDF(selected, { 
                    machineName, 
                    includeStats: true
                }) 
                break
            case 'sap_bom': {
                const unicos = unicosPorId(selected)
                if (sapEquipo) {
                    const bom = repuestoExports.buildBomIB01(unicos, {
                        equipoCodigo: sapEquipo.codigo,
                        equipoNombre: sapEquipo.nombre,
                        centro: sapEquipo.centro,
                        incluirSinSap,
                    })
                    repuestoExports.exportBomIB01ToExcel(bom)
                } else if (sapEquipos?.length) {
                    const boms = repuestoExports.buildBomsIB01(unicos, sapEquipos, { incluirSinSap })
                    if (boms.length === 0) {
                        logger.warn('BOM SAP: ningun equipo del alcance tiene posiciones que exportar')
                        break
                    }
                    repuestoExports.exportBomsIB01ToExcel(boms)
                }
                break
            }
        }
        onClose()
    } catch (error) {
        logger.error('Export failed', error instanceof Error ? error : new Error(String(error)))
    } finally {
        setIsExporting(false)
    }
  }

  /**
   * Cuantas posiciones saldran DE VERDAD en la BOM.
   *
   * El contador de la seleccion no sirve para esta pestana y enganaba por mucho: los
   * materiales sin codigo SAP no entran en la lista (en SELLADO la seleccion deci­a 832 y
   * salian 27 posiciones) y, al reves, un material compartido genera una posicion por CADA
   * equipo donde sirve (en EMPAQUE 74 seleccionados daban 112 filas). Se calcula con las
   * mismas funciones que hacen la exportacion, para que el numero no pueda divergir.
   */
  /** Los favoritos que hay dentro de la selección actual (identidad estable, no docId). */
  const favoritosSeleccionados = useMemo(() => {
    if (!favKeys?.size) return []
    return unicosPorId(repuestos.filter((r) => selectedIds.has(r.id) && favKeys.has(rowKeyDeRepuesto(r))))
  }, [favKeys, repuestos, selectedIds])

  const sapPreview = useMemo(() => {
    if (reportType !== 'sap_bom') return null
    const selected = unicosPorId(repuestos.filter((r) => selectedIds.has(r.id)))
    if (selected.length === 0) return { posiciones: 0, equipos: 0 }
    if (sapEquipo) {
      const bom = repuestoExports.buildBomIB01(selected, {
        equipoCodigo: sapEquipo.codigo,
        equipoNombre: sapEquipo.nombre,
        centro: sapEquipo.centro,
        incluirSinSap,
      })
      return { posiciones: bom.resumen.total, equipos: bom.rows.length > 0 ? 1 : 0 }
    }
    if (sapEquipos?.length) {
      const r = repuestoExports.resumirBoms(repuestoExports.buildBomsIB01(selected, sapEquipos, { incluirSinSap }))
      return { posiciones: r.posiciones, equipos: r.equipos }
    }
    return { posiciones: 0, equipos: 0 }
  }, [reportType, repuestos, selectedIds, sapEquipo, sapEquipos, incluirSinSap])

  /**
   * Si la seleccion no trae ningun material SIN codigo SAP, la casilla de despiece no puede
   * hacer nada: el hub filtra por defecto a los ordenables, asi que marcarla no cambiaba una
   * sola posicion y no habia forma de notarlo.
   */
  const hayDespieceEnSeleccion = useMemo(() => {
    if (reportType !== 'sap_bom') return false
    return repuestos.some((r) => selectedIds.has(r.id) && !repuestoExports.esCodigoSapValido(r.codigoSAP))
  }, [reportType, repuestos, selectedIds])

  const totalSelected = selectedIds.size

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-muted shrink-0">
            <div>
                 <DialogTitle className="text-xl flex items-center gap-2">
                    <FileText className="w-5 h-5"/> Centro de Reportes
                 </DialogTitle>
                 <DialogDescription>Selecciona ítems y formato de salida</DialogDescription>
            </div>
            
            <div className="flex bg-muted rounded-card p-1">
                <Button 
                    variant={filterMode === 'all' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    onClick={() => { setFilterMode('all'); setSelectedIds(new Set()) }}
                    className="text-xs h-8"
                >
                    Catálogo Completo ({repuestos.length})
                </Button>
                {filteredRepuestos && filteredRepuestos.length < repuestos.length && (
                    <Button 
                        variant={filterMode === 'filtered' ? 'secondary' : 'ghost'} 
                        size="sm" 
                        onClick={() => { setFilterMode('filtered'); setSelectedIds(new Set(filteredRepuestos.map(r => r.id))) }}
                        className="text-xs h-8"
                    >
                        Vista Actual ({filteredRepuestos.length})
                    </Button>
                )}
            </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/*
              Era un "Arbol de Navegacion" que ocupaba el 45% del dialogo y NUNCA agrupaba nada:
              `getRepuestoCategoryId` devuelve siempre undefined y el hub pasa `categories={[]}`,
              asi que por construccion habia una sola rama ("Sin Categoria") con todo dentro. El
              panel de formato quedaba apretado por un arbol de un solo nivel. Ahora es la lista
              plana que siempre fue, y el espacio va donde se decide algo.
            */}
            <div className="w-[30%] min-w-[200px] border-r flex flex-col bg-background">
                <div className="p-3 border-b bg-muted font-medium text-xs tracking-wider text-muted-foreground flex justify-between items-center">
                    <span>Ítems</span>
                    <div className="space-x-1">
                        <Button variant="ghost" className="h-6 text-xs" onClick={() => setSelectedIds(new Set())}>Ninguno</Button>
                        <Button variant="ghost" className="h-6 text-xs" onClick={() => {
                             const modeList = filterMode === 'filtered' && filteredRepuestos ? filteredRepuestos : repuestos
                             setSelectedIds(new Set(modeList.map(r => r.id)))
                        }}>Todos</Button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-1">
                    {itemsVisibles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                            <p>No se encontraron ítems</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/50">
                            {itemsVisibles.map((rep) => (
                                <label
                                    key={rep.id}
                                    className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/40"
                                >
                                    <Checkbox
                                        checked={selectedIds.has(rep.id)}
                                        onCheckedChange={(c) => {
                                            setSelectedIds((prev) => {
                                                const next = new Set(prev)
                                                if (c) next.add(rep.id)
                                                else next.delete(rep.id)
                                                return next
                                            })
                                        }}
                                    />
                                    {rep.codigoSAP && (
                                        <span className="w-24 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{rep.codigoSAP}</span>
                                    )}
                                    <span className="min-w-0 flex-1 truncate">{rep.textoBreve || rep.descripcion || '(sin nombre)'}</span>
                                </label>
                            ))}
                        </div>
                    )}
                    {itemsDelAlcance.length > TOPE_VISIBLE && (
                        <p className="px-2 py-2 text-center text-caption text-muted-foreground">
                            Mostrando {TOPE_VISIBLE} de {itemsDelAlcance.length}. «Todos» y «Ninguno» actúan sobre los {itemsDelAlcance.length}; para acotar, usa los filtros de la lista.
                        </p>
                    )}
                </div>
                <div className="p-2 border-t text-xs text-muted-foreground text-center bg-muted">
                    {totalSelected} ítems seleccionados para exportar
                </div>
            </div>

            {/* Right Panel: Options */}
            <div className="w-[70%] flex flex-col p-6 space-y-8 bg-muted overflow-y-auto">
                <div className="space-y-4">
                    <h3 className="font-semibold text-sm tracking-wide text-foreground flex items-center gap-2">
                        <span className="w-1 h-4 bg-primary rounded-full"/>
                        Formato de Reporte
                    </h3>
                    <Tabs value={reportType} onValueChange={(v) => setReportType(v as ReportType)} className="w-full">
                        <TabsList className="grid w-full grid-cols-1 h-auto gap-3 bg-transparent p-0">
                            <TabsTrigger
                                value="catalog"
                                className="justify-start px-4 py-3 border bg-background hover:bg-muted/50 data-[state=active]:border-primary data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all shadow-sm rounded-card"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="p-2.5 bg-cat-4-tint/[0.15] text-cat-4-ink rounded-card shrink-0 mt-0.5">
                                        <FileText className="h-5 w-5"/>
                                    </div>
                                    <div className="text-left space-y-1">
                                        <div className="font-semibold text-foreground">Catálogo Resumen</div>
                                        <div className="text-xs text-muted-foreground font-normal leading-relaxed">
                                            Listado compacto en formato tabla, para imprimir o revisar en papel. Optimizado para la mayor cantidad de ítems por página.
                                        </div>
                                    </div>
                                </div>
                            </TabsTrigger>
                            {sapDisponible && (
                            <TabsTrigger
                                value="sap_bom"
                                className="justify-start px-4 py-3 border bg-background hover:bg-muted/50 data-[state=active]:border-primary data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all shadow-sm rounded-card"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="p-2.5 bg-cat-8-tint/[0.15] text-cat-8-ink rounded-card shrink-0 mt-0.5">
                                        <Factory className="h-5 w-5"/>
                                    </div>
                                    <div className="text-left space-y-1">
                                        <div className="font-semibold text-foreground">Lista de materiales SAP (IB01)</div>
                                        <div className="text-xs text-muted-foreground font-normal leading-relaxed">
                                            {sapEquipo
                                                ? <>Planilla lista para cargar la BOM del equipo {sapEquipo.codigo} en SAP PM, centro {sapEquipo.centro || 'sin determinar'}. Uso de lista 4 (Mantenimiento).</>
                                                : <>Una BOM por cada uno de los {sapEquipos?.length} equipos del alcance, en un solo archivo con las posiciones en hoja plana (formato de carga masiva). Uso de lista 4 (Mantenimiento).</>}
                                        </div>
                                    </div>
                                </div>
                            </TabsTrigger>
                            )}
                            {(favKeys?.size ?? 0) > 0 && (
                            <TabsTrigger
                                value="technical_sheet"
                                className="justify-start px-4 py-3 border bg-background hover:bg-muted/50 data-[state=active]:border-primary data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all shadow-sm rounded-card"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="p-2.5 bg-blue-500/[0.15] text-blue-600 rounded-card shrink-0 mt-0.5">
                                        <ClipboardList className="h-5 w-5"/>
                                    </div>
                                    <div className="text-left space-y-1">
                                        <div className="font-semibold text-foreground">Fichas de mis favoritos</div>
                                        <div className="text-xs text-muted-foreground font-normal leading-relaxed">
                                            Una página por repuesto, con fotos grandes y especificaciones. Solo tus favoritos: {favoritosSeleccionados.length} de los seleccionados. Sobre el catálogo entero saldrían miles de páginas en blanco.
                                        </div>
                                    </div>
                                </div>
                            </TabsTrigger>
                            )}
                        </TabsList>
                    </Tabs>
                </div>

                <div className="space-y-4">
                    <h3 className="font-semibold text-sm tracking-wide text-foreground flex items-center gap-2">
                        <span className="w-1 h-4 bg-primary rounded-full"/>
                        Configuración
                    </h3>
                    
                    {reportType === 'sap_bom' && (
                    <div className="p-4 border rounded-card bg-background shadow-sm">
                         <div className="flex items-start space-x-3">
                            <Checkbox id="incluir-sin-sap" checked={incluirSinSap && hayDespieceEnSeleccion} disabled={!hayDespieceEnSeleccion} onCheckedChange={(c) => setIncluirSinSap(!!c)} className="mt-1" />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="incluir-sin-sap" className="text-sm font-medium cursor-pointer">
                                    Incluir despiece sin código SAP
                                </Label>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {hayDespieceEnSeleccion
                                        ? 'Los agrega como posiciones de texto (tipo T), identificadas por código de fabricante. Hace la lista mucho más larga: déjalo apagado si la BOM es para elegir componentes en una orden.'
                                        : 'La vista actual solo trae materiales con código SAP, así que no hay despiece que agregar. Actívalo con el filtro «+N despiece» de la lista y vuelve a abrir este panel.'}
                                </p>
                            </div>
                         </div>
                    </div>
                    )}

                    {reportType !== 'sap_bom' && (
                    <div className="p-4 border rounded-card bg-background shadow-sm">
                         <div className="flex items-start space-x-3">
                            <Checkbox id="include-images" checked={includeImages} onCheckedChange={(c) => setIncludeImages(!!c)} className="mt-1" />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="include-images" className="text-sm font-medium cursor-pointer">
                                    Incluir Imágenes
                                </Label>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Intenta renderizar las imágenes disponibles en el documento PDF.
                                </p>
                            </div>
                         </div>
                    </div>
                    )}
                </div>

            </div>
        </div>

        <DialogFooter className="p-4 border-t bg-background shrink-0">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleExport} disabled={selectedIds.size === 0 || isExporting || sapPreview?.posiciones === 0 || (reportType === 'technical_sheet' && favoritosSeleccionados.length === 0)} className="gap-2 min-w-[180px]">
            {isExporting ? (
                <>Generando...</>
            ) : (
                sapPreview
                    ? <>Exportar {sapPreview.posiciones} {sapPreview.posiciones === 1 ? 'posición' : 'posiciones'}{sapPreview.equipos > 1 ? ' · ' + sapPreview.equipos + ' equipos' : ''}</>
                    : reportType === 'technical_sheet'
                        ? <>Exportar {favoritosSeleccionados.length} {favoritosSeleccionados.length === 1 ? 'ficha' : 'fichas'}</>
                        : <>Exportar Selección ({selectedIds.size})</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

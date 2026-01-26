import { useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { FileText, FileSpreadsheet, ClipboardList, ChevronRight, ChevronDown, CheckSquare, Square, Image as ImageIcon } from 'lucide-react'
import type { Repuesto } from '@/types/repuestos'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import * as repuestoExports from '@/utils/repuestos'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

export type ReportType = 'technical_sheet' | 'catalog' | 'excel'

interface ExportReportModalProps {
  isOpen: boolean
  onClose: () => void
  repuestos: Repuesto[]
  filteredRepuestos?: Repuesto[] // Optional: passed from current search results
  categories: { id: string, nombre: string, parentId?: string }[]
  machineName?: string
}

// Helper to build tree
type TreeNode = {
    id: string
    label: string
    type: 'category' | 'subcategory' | 'item'
    children: TreeNode[]
    item?: Repuesto
    parentId?: string
}

export function ExportReportModal({ isOpen, onClose, repuestos, filteredRepuestos, categories, machineName = 'General' }: ExportReportModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reportType, setReportType] = useState<ReportType>('technical_sheet')
  const [includeImages, setIncludeImages] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [filterMode, setFilterMode] = useState<'all' | 'filtered'>('all')

  // Effect to default selection to filtered if available
  useEffect(() => {
    if (isOpen && filteredRepuestos && filteredRepuestos.length < repuestos.length) {
        setFilterMode('filtered')
        // Default to filtered selection
        setSelectedIds(new Set(filteredRepuestos.map(r => r.id)))
    } else if (isOpen) {
        setFilterMode('all')
        // Automatically select all if opening full mode initially? No, user might want to pick.
        // But better UX might be empty selection.
        setSelectedIds(new Set())
    }
  }, [isOpen, filteredRepuestos, repuestos.length])

  // Build Tree
  const treeData = useMemo(() => {
    // 1. Determine source list based on mode
    const sourceList = filterMode === 'filtered' && filteredRepuestos ? filteredRepuestos : repuestos

    // 2. Identify active categories based on repuestos
    const activeCategoryIds = new Set<string>()
    sourceList.forEach(r => {
        if (r.categoryId) activeCategoryIds.add(r.categoryId)
    })

    // 3. Build Category Map
    const rootNodes: TreeNode[] = []
    const categoryNodes = new Map<string, TreeNode>()

    // Create Category Nodes
    categories.forEach(cat => {
        categoryNodes.set(cat.id, {
            id: cat.id,
            label: cat.nombre,
            type: cat.parentId ? 'subcategory' : 'category',
            children: [],
            parentId: cat.parentId
        })
    })

    // Helper to get or create node
    // Assemble Hierarchy
    categoryNodes.forEach(node => {
        if (node.parentId && categoryNodes.has(node.parentId)) {
            const parent = categoryNodes.get(node.parentId)!
            parent.children.push(node)
        } else if (!node.parentId) {
            rootNodes.push(node)
        }
    })

    // Add Items to Categories
    const unassignedNode: TreeNode = { id: 'unassigned', label: 'Sin Categoría', type: 'category', children: [] }
    let hasUnassigned = false

    sourceList.forEach(rep => {
        const itemNode: TreeNode = {
            id: rep.id,
            label: `${rep.codigoSAP || 'S/C'} - ${rep.textoBreve}`,
            type: 'item',
            children: [],
            item: rep,
            parentId: rep.categoryId
        }

        if (rep.categoryId && categoryNodes.has(rep.categoryId)) {
            categoryNodes.get(rep.categoryId)!.children.push(itemNode)
        } else {
            unassignedNode.children.push(itemNode)
            hasUnassigned = true
        }
    })

    // Prune empty branches (recursive)
    const prune = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.filter(node => {
            if (node.type === 'item') return true
            node.children = prune(node.children)
            // Keep category if it has items OR subcategories with items
            return node.children.length > 0
        })
    }

    const prunedRoots = prune(rootNodes)
    if (hasUnassigned) prunedRoots.push(unassignedNode)

    return prunedRoots
  }, [repuestos, filteredRepuestos, categories, filterMode])


  // Recursively get all item IDs under a node
  const getNodeItemIds = (node: TreeNode): string[] => {
      if (node.type === 'item') return [node.id]
      return node.children.flatMap(getNodeItemIds)
  }

  const handleToggleNode = (node: TreeNode, checked: boolean) => {
      const idsToToggle = getNodeItemIds(node)
      const newSet = new Set(selectedIds)
      
      idsToToggle.forEach(id => {
          if (checked) newSet.add(id)
          else newSet.delete(id)
      })
      setSelectedIds(newSet)
  }

  const handleToggleExpand = (nodeId: string) => {
      const newSet = new Set(expandedNodes)
      if (newSet.has(nodeId)) newSet.delete(nodeId)
      else newSet.add(nodeId)
      setExpandedNodes(newSet)
  }

  // Check state helpers
  const getNodeState = (node: TreeNode): 'checked' | 'unchecked' | 'indeterminate' => {
      const allIds = getNodeItemIds(node)
      if (allIds.length === 0) return 'unchecked'
      
      const selectedCount = allIds.filter(id => selectedIds.has(id)).length
      if (selectedCount === allIds.length) return 'checked'
      if (selectedCount === 0) return 'unchecked'
      return 'indeterminate'
  }

  const renderTree = (nodes: TreeNode[]) => {
      return (
          <div className="pl-4 border-l ml-1 border-border/50">
              {nodes.map(node => {
                  const state = getNodeState(node)
                  const isExpanded = expandedNodes.has(node.id)
                  const hasChildren = node.children.length > 0

                  return (
                      <div key={node.id} className="py-0.5">
                          <div className="flex items-center gap-2 hover:bg-muted/50 rounded p-1 group">
                                {hasChildren && node.type !== 'item' ? (
                                    <button onClick={(e) => { e.stopPropagation(); handleToggleExpand(node.id) }} className="p-0.5 hover:bg-muted rounded text-muted-foreground">
                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </button>
                                ) : <span className="w-5" />}
                                
                                <div 
                                    className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-2 flex-1"
                                    onClick={() => handleToggleNode(node, state !== 'checked')}
                                >
                                    {state === 'checked' && <CheckSquare className="h-4 w-4 text-primary shrink-0" />}
                                    {state === 'unchecked' && <Square className="h-4 w-4 shrink-0" />}
                                    {state === 'indeterminate' && <div className="h-4 w-4 flex items-center justify-center shrink-0"><div className="h-2 w-2 bg-primary rounded-sm" /></div>}
                                    
                                    <span className={`text-sm select-none truncate ${node.type === 'category' ? 'font-semibold text-foreground' : ''} ${node.type === 'item' ? 'text-muted-foreground' : ''}`}>
                                        {node.label}
                                    </span>
                                </div>
                          </div>
                          {hasChildren && isExpanded && (
                              <div className="ml-1">
                                  {renderTree(node.children)}
                              </div>
                          )}
                      </div>
                  )
              })}
          </div>
      )
  }

  const handleExport = async () => {
    // Always export from the Full List of Repuestos, matching the selected IDs
    // This allows selecting something that might be currently filtered out if we switch modes, 
    // though in this UI we restrict view to mode. But logic is safer using full list + ID set.
    const selected = repuestos.filter(r => selectedIds.has(r.id)) 
    if (selected.length === 0) return

    setIsExporting(true)
    try {
        switch (reportType) {
            case 'technical_sheet':
                // Pass includeImages flag if the function supports it (it usually assumes yes for technical sheets but check utils)
                await repuestoExports.exportMultipleTechnicalSheetsToPDF(selected, machineName)
                break
            case 'catalog':
                await repuestoExports.exportRepuestosToPDF(selected, { 
                    machineName, 
                    includeStats: true, 
                    includeTagsDetail: true
                    // TODO: Add support for includeImages in catalog table if not present
                }) 
                break
            case 'excel':
                await repuestoExports.exportRepuestosToExcel(selected, {
                    machineName,
                    includeTags: true,
                    includeImages: includeImages
                })
                break
        }
        onClose()
    } catch (error) {
        console.error("Export failed", error)
    } finally {
        setIsExporting(false)
    }
  }

  const totalSelected = selectedIds.size

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/10 shrink-0">
            <div>
                 <DialogTitle className="text-xl flex items-center gap-2">
                    <FileText className="w-5 h-5"/> Centro de Reportes
                 </DialogTitle>
                 <DialogDescription>Selecciona ítems y formato de salida</DialogDescription>
            </div>
            
            <div className="flex bg-muted rounded-lg p-1">
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
            {/* Sidebar: Tree Selection */}
            <div className="w-[45%] border-r flex flex-col bg-background">
                <div className="p-3 border-b bg-muted/5 font-medium text-xs uppercase tracking-wider text-muted-foreground flex justify-between items-center">
                    <span>Árbol de Navegación</span>
                    <div className="space-x-1">
                        <Button variant="ghost" className="h-6 text-xs" onClick={() => setSelectedIds(new Set())}>Ninguno</Button>
                        <Button variant="ghost" className="h-6 text-xs" onClick={() => {
                             const modeList = filterMode === 'filtered' && filteredRepuestos ? filteredRepuestos : repuestos
                             setSelectedIds(new Set(modeList.map(r => r.id)))
                        }}>Todos</Button>
                    </div>
                </div>
                <ScrollArea className="flex-1 p-2">
                    {treeData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                            <p>No se encontraron ítems</p>
                        </div>
                    ) : (
                        <div className="-ml-4">
                            {renderTree(treeData)}
                        </div>
                    )}
                </ScrollArea>
                <div className="p-2 border-t text-xs text-muted-foreground text-center bg-muted/10">
                    {totalSelected} ítems seleccionados para exportar
                </div>
            </div>

            {/* Right Panel: Options */}
            <div className="w-[55%] flex flex-col p-6 space-y-8 bg-muted/5 overflow-y-auto">
                
                <div className="space-y-4">
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-foreground flex items-center gap-2">
                        <span className="w-1 h-4 bg-primary rounded-full"/>
                        Formato de Reporte
                    </h3>
                    <Tabs value={reportType} onValueChange={(v) => setReportType(v as ReportType)} className="w-full">
                        <TabsList className="grid w-full grid-cols-1 h-auto gap-3 bg-transparent p-0">
                            <TabsTrigger 
                                value="technical_sheet" 
                                className="justify-start px-4 py-3 border bg-background hover:bg-muted/50 data-[state=active]:border-primary data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all shadow-sm rounded-lg"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shrink-0 mt-0.5">
                                        <ClipboardList className="h-5 w-5"/>
                                    </div>
                                    <div className="text-left space-y-1">
                                        <div className="font-semibold text-foreground">Fichas Técnicas</div>
                                        <div className="text-xs text-muted-foreground font-normal leading-relaxed">
                                            Genera un documento PDF detallado donde cada ítem ocupa una página completa. Incluye fotos grandes, galería y todas las especificaciones técnicas. Ideal para imprimir carpetas de mantenimiento.
                                        </div>
                                    </div>
                                </div>
                            </TabsTrigger>
                            <TabsTrigger 
                                value="catalog" 
                                className="justify-start px-4 py-3 border bg-background hover:bg-muted/50 data-[state=active]:border-primary data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all shadow-sm rounded-lg"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="p-2.5 bg-orange-50 text-orange-600 rounded-lg shrink-0 mt-0.5">
                                        <FileText className="h-5 w-5"/>
                                    </div>
                                    <div className="text-left space-y-1">
                                        <div className="font-semibold text-foreground">Catálogo Resumen</div>
                                        <div className="text-xs text-muted-foreground font-normal leading-relaxed">
                                            Genera un listado compacto en formato tabla. Optimizado para mostrar la mayor cantidad de ítems por página. Ideal para inventarios físicos, checklists o búsquedas rápidas.
                                        </div>
                                    </div>
                                </div>
                            </TabsTrigger>
                            <TabsTrigger 
                                value="excel" 
                                className="justify-start px-4 py-3 border bg-background hover:bg-muted/50 data-[state=active]:border-primary data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all shadow-sm rounded-lg"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="p-2.5 bg-green-50 text-green-600 rounded-lg shrink-0 mt-0.5">
                                        <FileSpreadsheet className="h-5 w-5"/>
                                    </div>
                                    <div className="text-left space-y-1">
                                        <div className="font-semibold text-foreground">Datos Excel</div>
                                        <div className="text-xs text-muted-foreground font-normal leading-relaxed">
                                            Descarga los datos crudos en formato .xlsx. La estructura es tabular plana, perfecta para importar en Power BI, tablas dinámicas o migraciones de datos.
                                        </div>
                                    </div>
                                </div>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                <div className="space-y-4">
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-foreground flex items-center gap-2">
                        <span className="w-1 h-4 bg-primary rounded-full"/>
                        Configuración
                    </h3>
                    
                    <div className="p-4 border rounded-lg bg-background shadow-sm">
                         <div className="flex items-start space-x-3">
                            <Checkbox id="include-images" checked={includeImages} onCheckedChange={(c) => setIncludeImages(!!c)} className="mt-1" />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="include-images" className="text-sm font-medium cursor-pointer">
                                    Incluir Imágenes
                                </Label>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {reportType === 'excel' 
                                        ? 'Agrega una columna con el conteo de imágenes disponibles.' 
                                        : 'Intenta renderizar las imágenes disponibles en el documento PDF.'}
                                </p>
                            </div>
                         </div>
                    </div>
                </div>

            </div>
        </div>

        <DialogFooter className="p-4 border-t bg-background shrink-0">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleExport} disabled={selectedIds.size === 0 || isExporting} className="gap-2 min-w-[180px]">
            {isExporting ? (
                <>Generando reporte...</>
            ) : (
                <>Exportar Selección ({selectedIds.size})</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { FolderTree, FileText, FileSpreadsheet, ClipboardList } from 'lucide-react'
import type { Repuesto } from '@/types/repuestos'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import * as repuestoExports from '@/utils/repuestos'

export type ReportType = 'technical_sheet' | 'catalog' | 'excel'

interface ExportReportModalProps {
  isOpen: boolean
  onClose: () => void
  repuestos: Repuesto[]
  categories: { id: string, nombre: string }[]
  machineName?: string
}

export function ExportReportModal({ isOpen, onClose, repuestos, categories, machineName = 'General' }: ExportReportModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reportType, setReportType] = useState<ReportType>('technical_sheet')
  const [isExporting, setIsExporting] = useState(false)

  // Memo: Group items by category (Reuse existing logic)
  const groupedRepuestos = useMemo(() => {
    const groups: Record<string, Repuesto[]> = {}
    
    // Init groups
    categories.forEach(c => { groups[c.id] = [] })
    groups['otros'] = []

    repuestos.forEach(rep => {
        let found = false
        if (rep.tags && rep.tags.length > 0) {
            for (const tag of rep.tags) {
                const tagStr = typeof tag === 'string' ? tag : tag.nombre
                const cat = categories.find(c => c.id === tagStr || c.nombre.toLowerCase() === tagStr.toLowerCase())
                if (cat) {
                    if (!groups[cat.id]) groups[cat.id] = []
                    groups[cat.id]!.push(rep)
                    found = true
                    break 
                }
            }
        }
        if (!found) {
            if (!groups['otros']) groups['otros'] = []
            groups['otros']!.push(rep)
        }
    })
    return groups
  }, [repuestos, categories])

  const handleToggleRepuesto = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedIds(newSet)
  }

  const handleToggleCategory = (reps: Repuesto[]) => {
    if (!reps || reps.length === 0) return
    const newSet = new Set(selectedIds)
    const allSelected = reps.every(r => newSet.has(r.id))
    if (allSelected) reps.forEach(r => newSet.delete(r.id))
    else reps.forEach(r => newSet.add(r.id))
    setSelectedIds(newSet)
  }

  const handleSelectAll = (select: boolean) => {
    if (select) setSelectedIds(new Set(repuestos.map(r => r.id)))
    else setSelectedIds(new Set())
  }

  const handleExport = async () => {
    const selected = repuestos.filter(r => selectedIds.has(r.id))
    if (selected.length === 0) return

    setIsExporting(true)
    try {
        switch (reportType) {
            case 'technical_sheet':
                // PDF Detallado (Una página por ítem)
                await repuestoExports.exportMultipleTechnicalSheetsToPDF(selected, machineName)
                break
            case 'catalog':
                // PDF Listado (Tabla simple)
                await repuestoExports.exportRepuestosToPDF(selected, { 
                    machineName, 
                    includeStats: true, 
                    includeTagsDetail: true 
                })
                break
            case 'excel':
                // Excel Export
                await repuestoExports.exportRepuestosToExcel(selected, {
                    machineName,
                    includeTags: true,
                    includeImages: true
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
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl">Centro de Exportación y Reportes</DialogTitle>
          <DialogDescription>
            Genera documentos técnicos, catálogos o archivos de inventario.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={reportType} onValueChange={(v) => setReportType(v as ReportType)} className="w-full pt-4">
            <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="technical_sheet" className="gap-2">
                    <ClipboardList className="h-4 w-4"/> Fichas Técnicas
                </TabsTrigger>
                <TabsTrigger value="catalog" className="gap-2">
                    <FileText className="h-4 w-4"/> Catálogo PDF
                </TabsTrigger>
                <TabsTrigger value="excel" className="gap-2">
                    <FileSpreadsheet className="h-4 w-4"/> Inventario Excel
                </TabsTrigger>
            </TabsList>
            
            <div className="bg-muted/50 p-4 rounded-lg mb-4 text-sm text-muted-foreground min-h-[60px]">
                {reportType === 'technical_sheet' && "Genera un archivo PDF con una ficha detallada por cada repuesto seleccionado, incluyendo especificaciones completas, dimensiones y galería de fotos."}
                {reportType === 'catalog' && "Genera un reporte PDF compacto en formato lista/tabla, ideal para inventarios rápidos o listas de chequeo."}
                {reportType === 'excel' && "Descarga un archivo .xlsx con toda la información tabular, permitiendo análisis de datos y edición masiva."}
            </div>
        </Tabs>

        <div className="flex justify-between items-center py-2 border-b">
            <div className="font-semibold text-sm">Selección de Ítems ({totalSelected})</div>
            <div className="space-x-2">
                <Button variant="ghost" size="sm" onClick={() => handleSelectAll(true)}>Todos</Button>
                <Button variant="ghost" size="sm" onClick={() => handleSelectAll(false)}>Ninguno</Button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 mt-2 border rounded-md bg-background">
            <div className="p-4 space-y-6">
                {categories.map(cat => {
                    const groupReps = groupedRepuestos[cat.id] || []
                    if (groupReps.length === 0) return null
                    const allSelected = groupReps.every(r => selectedIds.has(r.id))
                    
                    return (
                        <div key={cat.id} className="border rounded-md p-3 bg-gray-50/50 dark:bg-gray-800/50">
                            <div className="flex items-center space-x-2 mb-3">
                                <Checkbox 
                                    id={`cat-${cat.id}`}
                                    checked={allSelected} 
                                    onCheckedChange={() => handleToggleCategory(groupReps)}
                                />
                                <Label htmlFor={`cat-${cat.id}`} className="font-semibold flex items-center cursor-pointer select-none">
                                    <FolderTree className="h-4 w-4 mr-2 text-blue-500"/>
                                    {cat.nombre}
                                    <Badge variant="secondary" className="ml-2 text-xs">{groupReps.length}</Badge>
                                </Label>
                            </div>
                            
                            <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-2">
                                {groupReps.map(rep => (
                                    <div key={rep.id} className="flex items-start space-x-2 bg-white dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-700">
                                        <Checkbox 
                                            id={`rep-${rep.id}`}
                                            checked={selectedIds.has(rep.id)}
                                            onCheckedChange={() => handleToggleRepuesto(rep.id)}
                                        />
                                        <div className="grid gap-0.5">
                                            <Label htmlFor={`rep-${rep.id}`} className="text-sm font-medium cursor-pointer leading-tight select-none">
                                                {rep.textoBreve}
                                            </Label>
                                            <span className="text-xs text-gray-400">{rep.codigoSAP || 'Sin SAP'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}

                {groupedRepuestos['otros'] && groupedRepuestos['otros'].length > 0 && (
                     <div className="border rounded-md p-3 bg-gray-50/50 dark:bg-gray-800/50">
                        <div className="flex items-center space-x-2 mb-3">
                             <Checkbox 
                                id="cat-otros"
                                checked={groupedRepuestos['otros'].every(r => selectedIds.has(r.id))}
                                onCheckedChange={() => handleToggleCategory(groupedRepuestos['otros'] || [])}
                            />
                            <Label htmlFor="cat-otros" className="font-semibold flex items-center cursor-pointer select-none">
                                <FileText className="h-4 w-4 mr-2 text-gray-500"/>
                                Otros / Sin Categoría
                                <Badge variant="secondary" className="ml-2 text-xs">{groupedRepuestos['otros'].length}</Badge>
                            </Label>
                        </div>
                        <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-2">
                            {groupedRepuestos['otros'].map(rep => (
                                <div key={rep.id} className="flex items-start space-x-2 bg-white dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-700">
                                    <Checkbox 
                                        id={`rep-${rep.id}`}
                                        checked={selectedIds.has(rep.id)}
                                        onCheckedChange={() => handleToggleRepuesto(rep.id)}
                                    />
                                    <div className="grid gap-0.5">
                                        <Label htmlFor={`rep-${rep.id}`} className="text-sm font-medium cursor-pointer leading-tight select-none">
                                            {rep.textoBreve}
                                        </Label>
                                        <span className="text-xs text-gray-400">{rep.codigoSAP || 'Sin SAP'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>

        <DialogFooter className="pt-4 mt-auto">
          <Button variant="outline" onClick={onClose} disabled={isExporting}>Cancelar</Button>
          <Button onClick={handleExport} disabled={totalSelected === 0 || isExporting} className="gap-2">
            {isExporting ? (
                <>Generando...</>
            ) : (
                <>
                    {reportType === 'excel' ? <FileSpreadsheet className="h-4 w-4"/> : <FileText className="h-4 w-4"/>}
                    Exportar {totalSelected} Ítems ({reportType === 'excel' ? 'XLSX' : 'PDF'})
                </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

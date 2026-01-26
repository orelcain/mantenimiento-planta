import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { FolderTree, FileText } from 'lucide-react'
import type { Repuesto } from '@/types/repuestos'
import { Badge } from '@/components/ui/badge'

interface ExportPDFModalProps {
  isOpen: boolean
  onClose: () => void
  onExport: (selectedRepuestos: Repuesto[]) => void
  repuestos: Repuesto[]
  categories: { id: string, nombre: string }[]
}

export function ExportPDFModal({ isOpen, onClose, onExport, repuestos, categories }: ExportPDFModalProps) {
  // Estado de selección (IDs de repuestos)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Agrupar repuestos por categoría (usando tags o categoryId implícito)
  // Como los repuestos pueden no tener categoryId directo, usaremos una lógica simple:
  // Si tienen tags que coinciden con categorías, se agrupan ahí. Si no, a "Otros".
  
  const groupedRepuestos = useMemo(() => {
    const groups: Record<string, Repuesto[]> = {}

    // Inicializar grupos con categorías conocidas
    categories.forEach(c => {
        groups[c.id] = []
    })
    groups['otros'] = []

    repuestos.forEach(rep => {
        // Intentar encontrar categoría en sus tags
        let found = false
        // Revisar si algún tag coincide con el ID o nombre de una categoría
        if (rep.tags && rep.tags.length > 0) {
            for (const tag of rep.tags) {
                const tagStr = typeof tag === 'string' ? tag : tag.nombre
                // Búsqueda simple por coincidencia
                const cat = categories.find(c => c.id === tagStr || c.nombre.toLowerCase() === tagStr.toLowerCase())
                if (cat) {
                    if (!groups[cat.id]) groups[cat.id] = []
                    groups[cat.id]!.push(rep)
                    found = true
                    break // Asignar a la primera que encuentre
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

  // Inicializar selección con todos al abrir (opcional, o vacío)
  // React.useEffect(() => {
  //     if (isOpen) {
  //         setSelectedIds(new Set(repuestos.map(r => r.id)))
  //     }
  // }, [isOpen, repuestos])

  const handleToggleRepuesto = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
        newSet.delete(id)
    } else {
        newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleToggleCategory = (reps: Repuesto[]) => {
    // Si no hay repuestos, no hacer nada
    if (!reps || reps.length === 0) return

    const newSet = new Set(selectedIds)
    const allSelected = reps.every(r => newSet.has(r.id))

    if (allSelected) {
        // Deseleccionar todos
        reps.forEach(r => newSet.delete(r.id))
    } else {
        // Seleccionar todos
        reps.forEach(r => newSet.add(r.id))
    }
    setSelectedIds(newSet)
  }

  const handleSelectAll = (select: boolean) => {
    if (select) {
        setSelectedIds(new Set(repuestos.map(r => r.id)))
    } else {
        setSelectedIds(new Set())
    }
  }

  const handleExportClick = () => {
    const selected = repuestos.filter(r => selectedIds.has(r.id))
    onExport(selected)
    onClose()
  }

  const totalSelected = selectedIds.size

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Exportar Fichas Técnicas PDF</DialogTitle>
          <DialogDescription>
            Selecciona los repuestos o grupos que deseas incluir en el reporte.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-between items-center py-2 border-b">
            <div className="text-sm text-gray-500">
                {totalSelected} repuestos seleccionados de {repuestos.length}
            </div>
            <div className="space-x-2">
                <Button variant="ghost" size="sm" onClick={() => handleSelectAll(true)}>Todos</Button>
                <Button variant="ghost" size="sm" onClick={() => handleSelectAll(false)}>Ninguno</Button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-4">
            <div className="space-y-6 py-4">
                {categories.map(cat => {
                    const groupReps = groupedRepuestos[cat.id] || []
                    if (groupReps.length === 0) return null

                    const allSelected = groupReps.every(r => selectedIds.has(r.id))

                    return (
                        <div key={cat.id} className="border rounded-md p-3 bg-gray-50/50">
                            <div className="flex items-center space-x-2 mb-3">
                                <Checkbox 
                                    id={`cat-${cat.id}`}
                                    checked={allSelected} 
                                    // indeterminate={someSelected && !allSelected} // Checkbox UI might not support indeterminate prop directly in all versions
                                    onCheckedChange={() => handleToggleCategory(groupReps)}
                                />
                                <Label htmlFor={`cat-${cat.id}`} className="font-semibold flex items-center cursor-pointer">
                                    <FolderTree className="h-4 w-4 mr-2 text-blue-500"/>
                                    {cat.nombre}
                                    <Badge variant="secondary" className="ml-2 text-xs">{groupReps.length}</Badge>
                                </Label>
                            </div>
                            
                            <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-2">
                                {groupReps.map(rep => (
                                    <div key={rep.id} className="flex items-start space-x-2 bg-white p-2 rounded border border-gray-100">
                                        <Checkbox 
                                            id={`rep-${rep.id}`}
                                            checked={selectedIds.has(rep.id)}
                                            onCheckedChange={() => handleToggleRepuesto(rep.id)}
                                        />
                                        <div className="grid gap-0.5">
                                            <Label htmlFor={`rep-${rep.id}`} className="text-sm font-medium cursor-pointer leading-tight">
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

                {/* Grupo Otros/Sin Categoría */}
                {groupedRepuestos['otros'] && groupedRepuestos['otros'].length > 0 && (
                     <div className="border rounded-md p-3 bg-gray-50/50">
                        <div className="flex items-center space-x-2 mb-3">
                             <Checkbox 
                                id="cat-otros"
                                checked={groupedRepuestos['otros'].every(r => selectedIds.has(r.id))}
                                onCheckedChange={() => handleToggleCategory(groupedRepuestos['otros'] || [])}
                            />
                            <Label htmlFor="cat-otros" className="font-semibold flex items-center cursor-pointer">
                                <FileText className="h-4 w-4 mr-2 text-gray-500"/>
                                Otros / Sin Categoría
                                <Badge variant="secondary" className="ml-2 text-xs">{groupedRepuestos['otros'].length}</Badge>
                            </Label>
                        </div>
                        <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-2">
                            {groupedRepuestos['otros'].map(rep => (
                                <div key={rep.id} className="flex items-start space-x-2 bg-white p-2 rounded border border-gray-100">
                                    <Checkbox 
                                        id={`rep-${rep.id}`}
                                        checked={selectedIds.has(rep.id)}
                                        onCheckedChange={() => handleToggleRepuesto(rep.id)}
                                    />
                                    <div className="grid gap-0.5">
                                        <Label htmlFor={`rep-${rep.id}`} className="text-sm font-medium cursor-pointer leading-tight">
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

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleExportClick} disabled={totalSelected === 0}>
            Exportar {totalSelected} Fichas (PDF)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

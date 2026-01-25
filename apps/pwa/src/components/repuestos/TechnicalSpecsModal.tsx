import { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Database, 
  Camera, 
  Image as ImageIcon, 
  Trash2, 
  Plus, 
  Save, 
  X, 
  Loader2,
  ChevronDown
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui';
import type { Repuesto, TechnicalSpecs, MachineImage, TechnicalDataField, TechnicalDataType } from '@/types/repuestos';

interface TechnicalSpecsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repuesto: Repuesto | null;
  initialTab?: 'specs' | 'gallery';
  onSave?: (repuestoId: string, specs: TechnicalSpecs, gallery: MachineImage[]) => Promise<void>;
}

const TEMPLATES: Record<string, { label: string; fields: Record<string, string> }> = {
  motor: {
    label: 'Motor Eléctrico',
    fields: {
      power: 'Potencia (HP)',
      rpm: 'RPM',
      voltage: 'Voltaje',
      frame: 'Frame / Carcasa'
    }
  },
  bomba: {
    label: 'Bomba Hidráulica',
    fields: {
      flow: 'Caudal (L/min)',
      head: 'Altura (m)',
      inlet: 'Entrada (pulgadas)',
      outlet: 'Salida (pulgadas)'
    }
  },
  cinta: {
    label: 'Cinta Transportadora',
    fields: {
      width: 'Ancho Banda (mm)',
      length: 'Largo Total (mm)',
      material: 'Material',
      type: 'Tipo de Banda'
    }
  },
  reductor: {
    label: 'Reductor',
    fields: {
      ratio: 'Relación (Ratio)',
      torque: 'Torque (Nm)',
      shaftCheck: 'Eje Salida (mm)'
    }
  },
  general: {
    label: 'General / Otro',
    fields: {}
  }
};

export function TechnicalSpecsModal({
  open,
  onOpenChange,
  repuesto,
  initialTab = 'specs',
  onSave
}: TechnicalSpecsModalProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [saving, setSaving] = useState(false);
  
  // State for Specs
  const [specs, setSpecs] = useState<TechnicalSpecs>({
    type: 'general',
    standardValues: {},
    customFields: [],
    updatedAt: Date.now()
  });

  // State for Gallery
  const [gallery, setGallery] = useState<MachineImage[]>([]);

  // Load data when opening
  useEffect(() => {
    if (open && repuesto) {
      setActiveTab(initialTab);
      
      if (repuesto.technicalSpecs) {
        setSpecs({ ...repuesto.technicalSpecs });
      } else {
        // Init default
        setSpecs({
          type: 'general',
          standardValues: {},
          customFields: [],
          updatedAt: Date.now()
        });
      }

      if (repuesto.gallery) {
        setGallery([...repuesto.gallery]);
      } else {
        setGallery([]);
      }
    }
  }, [open, repuesto, initialTab]);

  const handleStandardChange = (key: string, value: string | number) => {
    setSpecs(prev => ({
      ...prev,
      standardValues: {
        ...prev.standardValues,
        [key]: value
      }
    }));
  };

  const handleCustomChange = (id: string, field: 'label' | 'value', value: string) => {
    setSpecs(prev => ({
      ...prev,
      customFields: prev.customFields.map(f => 
        f.id === id ? { ...f, [field]: value } : f
      )
    }));
  };

  const addCustomField = () => {
    const newField: TechnicalDataField = {
      id: crypto.randomUUID(),
      label: '',
      value: '',
      isCustom: true
    };
    setSpecs(prev => ({
      ...prev,
      customFields: [...prev.customFields, newField]
    }));
  };

  const removeCustomField = (id: string) => {
    setSpecs(prev => ({
      ...prev,
      customFields: prev.customFields.filter(f => f.id !== id)
    }));
  };

  const handleSave = async () => {
    if (!repuesto || !onSave) return;
    
    setSaving(true);
    try {
      await onSave(repuesto.id, { ...specs, updatedAt: Date.now() }, gallery);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving specs', error);
    } finally {
      setSaving(false);
    }
  };

  if (!repuesto) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header Personalizado */}
        <div className="p-4 border-b bg-muted/20 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <ClipboardList className="w-4 h-4" />
            <span className="text-xs font-mono uppercase tracking-wider">Ficha Técnica & Galería</span>
          </div>
          <DialogTitle className="text-lg font-bold truncate pr-8">
            {repuesto.textoBreve || 'Repuesto sin nombre'}
          </DialogTitle>
          <div className="text-xs text-muted-foreground font-mono">
            SAP: {repuesto.codigoSAP || 'N/A'}
          </div>
        </div>

        {/* Content with Scroll */}
        <div className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 pt-2">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="specs">Especificaciones</TabsTrigger>
                <TabsTrigger value="gallery">Galería</TabsTrigger>
              </TabsList>
            </div>

            <div className="p-4">
              <TabsContent value="specs" className="mt-0 space-y-6">
                
                {/* Selector de Tipo */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Tipo de Componente</span>
                  <Select 
                    value={specs.type} 
                    onValueChange={(val: TechnicalDataType) => setSpecs(prev => ({ ...prev, type: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TEMPLATES).map(([key, tpl]) => (
                        <SelectItem key={key} value={key}>{tpl.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Campos Estándar Dinámicos */}
                {Object.keys(TEMPLATES[specs.type]?.fields || {}).length > 0 && (
                  <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Datos Estándar</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.entries(TEMPLATES[specs.type].fields).map(([fieldKey, label]) => (
                        <div key={fieldKey} className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase">{label}</label>
                          <Input 
                            value={specs.standardValues[fieldKey] || ''} 
                            onChange={(e) => handleStandardChange(fieldKey, e.target.value)}
                            className="bg-background h-8 text-sm"
                            placeholder="-"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Campos Personalizados */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Campos Adicionales</h3>
                    </div>
                    <Button variant="outline" size="sm" onClick={addCustomField} className="h-7 text-xs gap-1">
                      <Plus className="w-3 h-3" /> Agregar
                    </Button>
                  </div>

                  {specs.customFields.length === 0 ? (
                    <div className="text-center py-4 text-xs text-muted-foreground italic border border-dashed rounded-lg">
                      No hay campos personalizados
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {specs.customFields.map((field) => (
                        <div key={field.id} className="flex gap-2 items-start animate-in fade-in slide-in-from-left-2 duration-200">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <Input 
                              placeholder="Nombre (ej: Marca sello)"
                              value={field.label}
                              onChange={(e) => handleCustomChange(field.id, 'label', e.target.value)}
                              className="h-8 text-xs font-medium"
                            />
                            <Input 
                              placeholder="Valor"
                              value={field.value}
                              onChange={(e) => handleCustomChange(field.id, 'value', e.target.value)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => removeCustomField(field.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notas */}
                <div className="space-y-2 pt-2 border-t">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Observaciones</span>
                  <Textarea 
                    value={specs.notes || ''} 
                    onChange={(e) => setSpecs(prev => ({ ...prev, notes: e.target.value }))}
                    className="min-h-[80px] bg-background resize-none text-sm" 
                    placeholder="Información relevante adicional..."
                  />
                </div>
              </TabsContent>

              <TabsContent value="gallery" className="mt-0 space-y-4">
                {/* Upload Placeholder */}
                <div className="border-2 border-dashed border-muted-foreground/25 hover:border-blue-500/50 hover:bg-muted/10 rounded-lg p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer">
                  <div className="bg-muted p-3 rounded-full mb-3">
                    <Camera className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Click para subir nuevas fotos</p>
                  <p className="text-xs text-muted-foreground mt-1">Placas, detalles o estado actual</p>
                </div>

                <div className="space-y-2">
                   <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Imágenes Guardadas</h3>
                   {gallery.length === 0 ? (
                     <div className="text-center py-8 text-muted-foreground text-sm">
                       No hay imágenes en la galería
                     </div>
                   ) : (
                     <div className="grid grid-cols-1 gap-2">
                       {/* Todo: Implement Gallery List mapping from 'gallery' state */}
                       <div className="text-xs text-muted-foreground">
                         (Implementación de lista de imágenes en progreso...)
                       </div>
                     </div>
                   )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-background flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" /> Guardar Cambios
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

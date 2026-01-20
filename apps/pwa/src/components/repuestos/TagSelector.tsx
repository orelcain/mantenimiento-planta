/**
 * TagSelector - Selector multi-tag con cantidades
 * 
 * Características:
 * - Lista de tags globales (solicitud y stock)
 * - Asignación de cantidades por tag
 * - Totales calculados automáticamente
 * - Separación visual solicitud vs stock
 * - Validación de cantidades
 */

import { useState, useEffect } from 'react';
import { useTags } from '@/hooks/repuestos/useTags';
import { useCurrentMachine } from '@/contexts/MachineContext';
import type { TagAsignado } from '@/types/tags';
import { getTotalCantidadesRepuesto } from '@/types/tags';

interface TagSelectorProps {
  selectedTags: (string | TagAsignado)[];
  onChange: (tags: TagAsignado[]) => void;
  valorUnitario: number;
  className?: string;
}

export function TagSelector({
  selectedTags,
  onChange,
  valorUnitario,
  className = '',
}: TagSelectorProps) {
  const currentMachine = useCurrentMachine();
  const { tags: globalTags, loading } = useTags([], currentMachine?.id || 'baader-200');

  // Estado local para las cantidades
  const [localTags, setLocalTags] = useState<Map<string, TagAsignado>>(new Map());

  // Sincronizar con props al cambiar
  useEffect(() => {
    const tagMap = new Map<string, TagAsignado>();
    selectedTags.forEach((tag) => {
      if (typeof tag === 'string') {
        // Migrar formato antiguo
        const globalTag = globalTags.find(g => g.nombre === tag);
        if (globalTag) {
          tagMap.set(tag, {
            nombre: tag,
            tipo: globalTag.tipo,
            cantidad: 0,
            fecha: new Date(),
          });
        }
      } else {
        tagMap.set(tag.nombre, tag);
      }
    });
    setLocalTags(tagMap);
  }, [selectedTags, globalTags]);

  const handleToggleTag = (tagNombre: string) => {
    const newTags = new Map(localTags);
    
    if (newTags.has(tagNombre)) {
      newTags.delete(tagNombre);
    } else {
      const globalTag = globalTags.find(g => g.nombre === tagNombre);
      if (globalTag) {
        newTags.set(tagNombre, {
          nombre: tagNombre,
          tipo: globalTag.tipo,
          cantidad: 0,
          fecha: new Date(),
        });
      }
    }

    setLocalTags(newTags);
    onChange(Array.from(newTags.values()));
  };

  const handleCantidadChange = (tagNombre: string, cantidad: number) => {
    const newTags = new Map(localTags);
    const tag = newTags.get(tagNombre);
    
    if (tag) {
      newTags.set(tagNombre, { ...tag, cantidad });
      setLocalTags(newTags);
      onChange(Array.from(newTags.values()));
    }
  };

  if (loading) {
    return <div className="text-gray-500 text-sm">Cargando tags...</div>;
  }

  const solicitudTags = globalTags.filter(t => t.tipo === 'solicitud');
  const stockTags = globalTags.filter(t => t.tipo === 'stock');

  const totals = getTotalCantidadesRepuesto({ tags: Array.from(localTags.values()) });
  const totalValor = (totals.solicitud + totals.stock) * valorUnitario;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Tags de Solicitud */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          📋 Solicitudes/Eventos
        </h4>
        <div className="space-y-2">
          {solicitudTags.map((globalTag) => {
            const isSelected = localTags.has(globalTag.nombre);
            const tag = localTags.get(globalTag.nombre);

            return (
              <div key={globalTag.nombre} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`tag-${globalTag.nombre}`}
                  checked={isSelected}
                  onChange={() => handleToggleTag(globalTag.nombre)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label
                  htmlFor={`tag-${globalTag.nombre}`}
                  className="flex-1 text-sm text-gray-700 cursor-pointer"
                >
                  {globalTag.nombre}
                </label>
                {isSelected && (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={tag?.cantidad ?? 0}
                    onChange={(e) =>
                      handleCantidadChange(globalTag.nombre, parseInt(e.target.value) || 0)
                    }
                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    placeholder="Cant."
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tags de Stock */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          📦 Stock/Bodega
        </h4>
        <div className="space-y-2">
          {stockTags.map((globalTag) => {
            const isSelected = localTags.has(globalTag.nombre);
            const tag = localTags.get(globalTag.nombre);

            return (
              <div key={globalTag.nombre} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`tag-${globalTag.nombre}`}
                  checked={isSelected}
                  onChange={() => handleToggleTag(globalTag.nombre)}
                  className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                />
                <label
                  htmlFor={`tag-${globalTag.nombre}`}
                  className="flex-1 text-sm text-gray-700 cursor-pointer"
                >
                  {globalTag.nombre}
                </label>
                {isSelected && (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={tag?.cantidad ?? 0}
                    onChange={(e) =>
                      handleCantidadChange(globalTag.nombre, parseInt(e.target.value) || 0)
                    }
                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                    placeholder="Cant."
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Totales */}
      {localTags.size > 0 && (
        <div className="pt-3 border-t border-gray-200">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Solicitudes:</span>
            <span className="font-semibold text-blue-600">{totals.solicitud}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-600">Stock:</span>
            <span className="font-semibold text-green-600">{totals.stock}</span>
          </div>
          <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-200">
            <span className="text-gray-700 font-semibold">Total:</span>
            <span className="font-bold text-gray-900">{totals.solicitud + totals.stock}</span>
          </div>
          {valorUnitario > 0 && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Valor total:</span>
              <span className="font-semibold text-gray-900">
                ${totalValor.toLocaleString('es-CL')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

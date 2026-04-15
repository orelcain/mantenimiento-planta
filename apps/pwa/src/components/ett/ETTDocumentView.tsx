/**
 * ETTDocumentView — Vista WYSIWYG principal del editor ETT
 *
 * Muestra el documento ETT tal como se verá en Word, con los campos
 * editables resaltados en amarillo y las zonas fijas en gris.
 *
 * Estructura (matching el formato AquaChile):
 *   1. Encabezado AQUACHILE (fijo)
 *   2. Tabla de cabecera (ETTHeaderFields — editable)
 *   3. Consideraciones previas (ETTFixedText — fijo)
 *   4. Especificación del servicio
 *        - Área de intervención (ETTInlineText — editable)
 *        - Descripción de trabajos (bloques flexibles via ETTBlockRenderer)
 *        - Responsabilidades del contratista (lista editable)
 *   5. Bloque fijo final (SUMINISTROS / EQUIPOS / ASEO)
 *   6. Bases administrativas (fijo)
 */

import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui'
import type { ETT, ETTBloque } from '@/types'
import { ETTInlineText } from './ETTInlineText'
import { ETTFixedText } from './ETTFixedText'
import { ETTHeaderFields } from './ETTHeaderFields'
import { ETTBlockRenderer } from './ETTBlockRenderer'
import { ETTBlockToolbar } from './ETTBlockToolbar'

export interface ETTDocumentViewProps {
  ett: ETT
  onChange: (ett: ETT) => void
}

// ============================================================================
// TEXTOS FIJOS (espejo de exportETTWord.ts)
// ============================================================================

const CONSIDERACIONES_PREVIAS = [
  {
    texto:
      'Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.',
    rojo: true,
  },
  {
    texto:
      'La fecha estimada para el inicio del servicio queda sujeta a la planificación de gerencia, por lo que se podría extender su fecha de realización.',
  },
  {
    texto:
      'Trabajo se realizará de acuerdo con la planificación de planta y áreas que involucren servicios, además se debe considerar trabajar sin restricción de día ni horario.',
  },
  {
    texto:
      'Cotización debe ser abierta con la descripción de los materiales a utilizar, mano de obra, gastos generales y utilidad.',
  },
  {
    texto:
      'Se debe indicar en cotización la cantidad de días requeridos, para realizar el servicio.',
  },
  {
    texto:
      'Se considerará la realización de visita en terreno, para revisar condiciones de trabajo y cantidad de materiales a utilizar, a la hora de definir una propuesta.',
  },
]

const BASES_ADMINISTRATIVAS = [
  { num: '1', titulo: 'OFERTAS:', texto: 'Las ofertas deberán indicar por separado y en desglose los ítems de Materiales y Mano de Obra. Los Gastos Generales y Utilidades, deberán estar indicados aparte con sus respectivos montos y porcentajes. Además, se debe indicar un plazo estimado de ejecución del servicio.' },
  { num: '2', titulo: 'SUPERVISIÓN E INSPECCIÓN TÉCNICA:', texto: 'La ejecución del servicio, coordinación, gestión y supervisión estará a cargo del área Mandante.' },
  { num: '3', titulo: 'REGLAMENTO INTERNO Y SEGURIDAD:', texto: 'Será de responsabilidad del oferente considerar en su propuesta los insumos y EPP para la correcta ejecución de los trabajos. Asimismo, ejecutar sus trabajos según las normas de calidad y buenas prácticas vigentes de la compañía.' },
  { num: '4', titulo: 'PROTOCOLOS COVID:', texto: 'Al momento de hacer visita técnica y/o ejecución del servicio, se exige presentarse con examen PCR o test de antígeno negativo, con un máximo de 72 horas. Esta información está sujeta a confirmación para cada Centro.' },
  { num: '6', titulo: 'FACTURACIÓN:', texto: 'Para servicios, la factura debe ser emitida una vez que adquisiciones haya enviado el número de OC (documento pdf) y el mandante (usuario directo de servicio) haya enviado el número de HES. Los números de OC y HES deben ser indicados en la factura para que esta sea aceptada por Aquachile, de lo contrario esta será reclamada automáticamente por el servicio de impuestos internos.' },
  { num: '7', titulo: 'CONDICIONES DE PAGO:', texto: 'Pago a 30 días desde emisión de factura. Empresa mandante no efectuará pagos por anticipo, a excepción de aquellos requerimientos que involucre montos de mayor envergadura, cuya empresa contratista otorgue una boleta de garantía equivalente al monto del anticipo solicitado.' },
  { num: '8', titulo: 'PENALIZACIÓN:', texto: 'Se aplicará una multa equivalente al 0,5% sobre el valor neto del presupuesto adjudicado por cada día de atraso en los tiempos de entrega del servicio mientras sea atribuible por responsabilidad del proveedor.' },
  { num: '9', titulo: 'GARANTÍAS:', texto: 'Proveedor deberá otorgar en la cotización una garantía en caso de incumplir con lo solicitado en la EETT o con la calidad del servicio realizado.' },
  { num: '10', titulo: 'CERTILAP:', texto: 'Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.' },
]

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function ETTDocumentView({ ett, onChange }: ETTDocumentViewProps) {
  // --- Helpers para actualizar partes del documento ---

  const updateBloque = (index: number, nuevo: ETTBloque) => {
    const bloques = [...ett.descripcion_trabajos]
    bloques[index] = nuevo
    onChange({ ...ett, descripcion_trabajos: bloques })
  }

  const deleteBloque = (index: number) => {
    onChange({
      ...ett,
      descripcion_trabajos: ett.descripcion_trabajos.filter((_, i) => i !== index),
    })
  }

  const moveBloque = (from: number, to: number) => {
    if (to < 0 || to >= ett.descripcion_trabajos.length) return
    const bloques = [...ett.descripcion_trabajos]
    const [moved] = bloques.splice(from, 1)
    if (!moved) return
    bloques.splice(to, 0, moved)
    onChange({ ...ett, descripcion_trabajos: bloques })
  }

  const addBloque = (nuevo: ETTBloque, posicion?: number) => {
    const bloques = [...ett.descripcion_trabajos]
    if (posicion !== undefined) {
      bloques.splice(posicion, 0, nuevo)
    } else {
      bloques.push(nuevo)
    }
    onChange({ ...ett, descripcion_trabajos: bloques })
  }

  const updateResponsabilidad = (idx: number, texto: string) => {
    const resp = [...ett.responsabilidades_contratista]
    resp[idx] = texto
    onChange({ ...ett, responsabilidades_contratista: resp })
  }

  const addResponsabilidad = () => {
    onChange({
      ...ett,
      responsabilidades_contratista: [...ett.responsabilidades_contratista, ''],
    })
  }

  const removeResponsabilidad = (idx: number) => {
    onChange({
      ...ett,
      responsabilidades_contratista: ett.responsabilidades_contratista.filter(
        (_, i) => i !== idx,
      ),
    })
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="max-w-4xl mx-auto bg-white shadow-lg p-8 font-serif">
      {/* =========================================================== */}
      {/* 1. ENCABEZADO FIJO (AQUACHILE)                                */}
      {/* =========================================================== */}
      <div className="grid grid-cols-[25%_75%] border border-blue-200 bg-white mb-6">
        <div className="flex items-center justify-center border-r border-blue-200 p-4">
          <span className="text-3xl font-bold text-blue-900">AQUACHILE</span>
        </div>
        <div className="flex flex-col">
          <div className="flex-1 flex items-center justify-center border-b border-blue-200 p-3">
            <span className="text-xl font-bold text-gray-800">
              ESPECIFICACIONES TECNICAS Y BASES
            </span>
          </div>
          <div className="flex items-center justify-center p-2 text-sm text-gray-600">
            Adquisiciones - Servicios
          </div>
        </div>
      </div>

      {/* =========================================================== */}
      {/* 2. TABLA DE CABECERA (EDITABLE)                               */}
      {/* =========================================================== */}
      <ETTHeaderFields
        cabecera={ett.cabecera}
        onChange={(cab) => onChange({ ...ett, cabecera: cab })}
      />

      {/* =========================================================== */}
      {/* 3. CONSIDERACIONES PREVIAS (FIJO)                             */}
      {/* =========================================================== */}
      <div className="mt-6">
        <h3 className="text-base font-bold text-blue-900 mb-2">
          1. CONSIDERACIONES PREVIAS:
        </h3>
        <div className="space-y-1 ml-4">
          {CONSIDERACIONES_PREVIAS.map((c, idx) => (
            <ETTFixedText key={idx} variant="bullet" danger={c.rojo}>
              {c.texto}
            </ETTFixedText>
          ))}
        </div>
      </div>

      {/* =========================================================== */}
      {/* 4. ESPECIFICACIÓN DEL SERVICIO                                */}
      {/* =========================================================== */}
      <div className="mt-6">
        <h3 className="text-base font-bold text-blue-900 mb-3">
          ESPECIFICACIÓN SERVICIO:
        </h3>

        {/* Área de intervención */}
        <div className="mb-4">
          <h4 className="font-semibold text-gray-800 mb-1">Área de intervención:</h4>
          <ETTInlineText
            value={ett.area_intervencion}
            onChange={(v) => onChange({ ...ett, area_intervencion: v })}
            placeholder="[Describir el área específica a intervenir]"
            multiline
            className="block w-full"
          />
        </div>

        {/* Descripción de trabajos — zona libre con bloques */}
        <div className="pl-8 relative">
          {ett.descripcion_trabajos.map((bloque, idx) => (
            <div key={idx}>
              <ETTBlockRenderer
                bloque={bloque}
                index={idx}
                total={ett.descripcion_trabajos.length}
                onChange={(b) => updateBloque(idx, b)}
                onDelete={() => deleteBloque(idx)}
                onMoveUp={() => moveBloque(idx, idx - 1)}
                onMoveDown={() => moveBloque(idx, idx + 1)}
              />
              {/* Botones compactos entre bloques */}
              <ETTBlockToolbar
                compact
                onAdd={(b) => addBloque(b, idx + 1)}
              />
            </div>
          ))}

          {/* Toolbar completa al final */}
          <ETTBlockToolbar onAdd={(b) => addBloque(b)} />
        </div>

        {/* Responsabilidades del contratista */}
        <div className="mt-6">
          <h4 className="font-semibold text-gray-800 mb-2">
            Responsabilidades del contratista:
          </h4>
          <div className="pl-4 space-y-1">
            {ett.responsabilidades_contratista.map((resp, idx) => (
              <div key={idx} className="flex items-start gap-2 group/resp">
                <span className="text-gray-500 pt-0.5">•</span>
                <div className="flex-1">
                  <ETTInlineText
                    value={resp}
                    onChange={(v) => updateResponsabilidad(idx, v)}
                    placeholder="[Responsabilidad del contratista]"
                    multiline
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-red-600 opacity-0 group-hover/resp:opacity-100"
                  onClick={() => removeResponsabilidad(idx)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="ml-5 h-7 text-xs text-gray-500"
              onClick={addResponsabilidad}
            >
              <Plus className="h-3 w-3 mr-1" /> Agregar responsabilidad
            </Button>
          </div>
        </div>

        {/* Imágenes de referencia */}
        {ett.imagenes.length > 0 && (
          <div className="mt-6">
            <h4 className="font-semibold text-gray-800 mb-2">
              Imágenes de referencia:
            </h4>
            <ETTFixedText variant="body">
              Se adjuntan {ett.imagenes.length} fotografía
              {ett.imagenes.length > 1 ? 's' : ''} del área desde diferentes
              ángulos, donde se identifica claramente la zona a intervenir.
            </ETTFixedText>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
              {ett.imagenes.map((img, idx) => (
                <div
                  key={img.id}
                  className="aspect-video bg-gray-100 rounded overflow-hidden relative"
                >
                  <img
                    src={img.url}
                    alt={img.nombre}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1">
                    {idx + 1}. {img.nombre}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================== */}
      {/* 5. BLOQUE FIJO FINAL                                          */}
      {/* =========================================================== */}
      <div className="mt-8 space-y-2">
        <ETTFixedText variant="body">
          <strong>MATERIAL GRAFICO:</strong>
        </ETTFixedText>
        <ETTFixedText variant="body">
          <strong>SUMINISTROS:</strong> Parte de la oferta
        </ETTFixedText>
        <ETTFixedText variant="body">
          <strong>EQUIPOS Y HERRAMIENTAS:</strong> Todas las herramientas
          deberán ser suministrados por la empresa contratista y será de su
          exclusiva responsabilidad el cuidado y deterioro de estas producto
          del servicio o proyecto.
        </ETTFixedText>
        <ETTFixedText variant="body">
          <strong>ASEO Y ENTREGA:</strong> Se deberá entregar para recepción
          del servicio o proyecto, todas las zonas intervenidas en perfecto
          estado de limpieza. Los escombros o desechos resultantes de la
          ejecución deberán destinarse a los sectores de segregación,
          incorporándose en las respectivas tolvas de desecho o reciclaje.
        </ETTFixedText>
        <ETTFixedText variant="body">
          El contratista deberá cumplir con todas las normas de buenas
          prácticas de protección de alimentos, tomando todas las medidas
          necesarias durante su desarrollo y al término de este para prevenir
          la contaminación de los productos por materias extrañas a
          consecuencia de su trabajo, ya sea este al interior o exterior de
          los recintos productivos y almacenamiento.
        </ETTFixedText>
        <ETTFixedText variant="body">
          En caso de ocurrir daños a la propiedad o inmueble, contratista
          deberá reponerlos en su totalidad.
        </ETTFixedText>
      </div>

      {/* =========================================================== */}
      {/* 6. BASES ADMINISTRATIVAS (FIJO)                               */}
      {/* =========================================================== */}
      <div className="mt-8">
        <h3 className="text-lg font-bold text-blue-900 text-center mb-3">
          BASES ADMINISTRATIVAS
        </h3>
        <div className="space-y-2">
          {BASES_ADMINISTRATIVAS.map((base) => (
            <ETTFixedText key={base.num} variant="body">
              <strong>{base.num}. {base.titulo}</strong> {base.texto}
            </ETTFixedText>
          ))}
        </div>
      </div>
    </div>
  )
}

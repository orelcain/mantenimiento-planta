import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Equipment, Incident, MaintenanceLogEntry } from '@/types'
import { criticidadEvaluada, CRIT } from '@/lib/ctd'
import { FAMILIA_LABEL, familiaDe, checklistDe, medicionesDe } from '@/lib/nfpa70b'
import { textoSeguroPdf, filaSegura } from '@/utils/pdf/textoSeguroPdf'
import { cantidadDePosicion, contarSinCantidad } from '@/services/repuestos/cantidadDePosicion'

/**
 * Reporte PDF del expediente de un equipo (handoff de auditoría NFPA 70B).
 *
 * NO es un informe de lo que hay: es **la hoja que el técnico se lleva a la máquina y vuelve
 * llena**. Medido el 13-09 sobre los 553 equipos, placa, trabajos, notas, mediciones y fotos
 * están al **0 %** — un documento que solo imprimiera lo cargado saldría en blanco. Por eso lo
 * conocido va impreso y lo que falta va como campo para anotar a mano.
 *
 * ⚠ Todo el texto pasa por `textoSeguroPdf`: las fuentes base de jsPDF usan cp1252 y un solo
 * carácter fuera de ese juego ROMPE LA LÍNEA ENTERA, en silencio y solo en el papel.
 */

const ESTADO_LABEL: Record<Equipment['estado'], string> = {
  operativo: 'Operativo',
  en_mantenimiento: 'En mantención',
  fuera_servicio: 'Fuera de servicio',
}
const COND_LABEL: Record<1 | 2 | 3, string> = {
  1: '1 · como nuevo',
  2: '2 · con desvíos',
  3: '3 · acción requerida',
}
const SEV_LABEL: Record<MaintenanceLogEntry['severidad'], string> = {
  verde: 'Verde',
  amarillo: 'Amarillo',
  rojo: 'Rojo',
}

/** Un renglón en blanco para escribir con lápiz. Vale más que un guion mudo. */
const PARA_ANOTAR = '____________________'

function fmt(d: Date | string | undefined): string {
  if (!d) return '—'
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? '—' : new Date(t).toLocaleDateString()
}

/** Valor cargado, o un renglón para llenarlo en terreno. */
function valorOAnotar(v: unknown): string {
  if (v == null || v === '') return PARA_ANOTAR
  return String(v)
}

function lastY(doc: jsPDF, fallback: number): number {
  const v = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
  return typeof v === 'number' ? v : fallback
}

/** Posición de un repuesto en la lista de materiales del equipo. */
export interface PosicionMaterial {
  codigoSAP: string
  textoBreve: string
  cantidad?: number | null
  unidad?: string | null
}

export interface DatosExpediente {
  /** Posiciones CON código SAP: son las que se cargan en IB01. Las de despiece no entran. */
  materiales?: PosicionMaterial[]
  /** QR de la vista pública del equipo, como dataURL PNG. */
  qrDataUrl?: string
}

const TINTA: [number, number, number] = [30, 41, 59]
const ANCHO_UTIL = 182
const MARGEN = 14

export function generarReporteEquipo(
  equipment: Equipment,
  incidents: Incident[],
  log: MaintenanceLogEntry[],
  datos: DatosExpediente = {},
): void {
  const doc = new jsPDF()
  const f = equipment.fichaTecnica ?? {}
  const familia = familiaDe(equipment)
  const evaluada = criticidadEvaluada(equipment)

  // ── Membrete de la primera hoja (el de las demás se pinta al final) ──
  let y = 16
  doc.setFontSize(14)
  doc.text(textoSeguroPdf('Expediente técnico — NFPA 70B'), MARGEN, y)
  y += 7
  doc.setFontSize(11)
  doc.text(textoSeguroPdf(`${equipment.nombre}  (${equipment.codigo})`), MARGEN, y)
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(120)
  // El QR ocupa la esquina: la ruta se acorta para no meterse debajo.
  const anchoRuta = datos.qrDataUrl ? ANCHO_UTIL - 30 : ANCHO_UTIL
  doc.text(textoSeguroPdf(equipment.hierarchyPath ?? ''), MARGEN, y, { maxWidth: anchoRuta })
  doc.setTextColor(0)
  y += 4

  if (datos.qrDataUrl) {
    // Vuelve del papel a la app: apunta a la vista pública del equipo, sin sesión.
    doc.addImage(datos.qrDataUrl, 'PNG', 170, 12, 26, 26)
    doc.setFontSize(6)
    doc.setTextColor(150)
    doc.text('Ver en la app', 170, 41)
    doc.setTextColor(0)
    y = Math.max(y, 42)
  }

  autoTable(doc, {
    startY: y,
    head: [['Datos generales', '']],
    body: [
      // ⚠ La criticidad de los 553 equipos la puso la importación, no una evaluación. Sin este
      // aviso el PDF de auditoría afirma una clasificación que no existe.
      ['Criticidad', `${CRIT[equipment.criticidad].nivel}${evaluada ? '' : ' · sin evaluar'}`],
      ['Estado', ESTADO_LABEL[equipment.estado] ?? '—'],
      ['Condición', f.condicion ? (COND_LABEL[f.condicion] ?? '—') : '—'],
      ['Familia (protocolo)', FAMILIA_LABEL[familia]],
      ['Tipo', equipment.tipo ?? '—'],
    ].map(filaSegura),
    theme: 'striped',
    styles: { fontSize: 9 },
    headStyles: { fillColor: TINTA },
  })

  autoTable(doc, {
    startY: lastY(doc, y) + 6,
    head: [['Placa eléctrica (NFPA 70B §2.2)', 'Anotar en terreno lo que falte']],
    body: [
      ['Marca', valorOAnotar(equipment.marca)],
      ['Modelo', valorOAnotar(equipment.modelo)],
      ['N° de serie', valorOAnotar(equipment.numeroSerie)],
      ['Potencia (kW)', valorOAnotar(f.potenciaKw)],
      ['Voltaje (V)', valorOAnotar(f.voltajeV)],
      ['Corriente nominal (A)', valorOAnotar(f.corrienteA)],
      ['RPM', valorOAnotar(f.rpm)],
      ['Factor de servicio', valorOAnotar(f.factorServicio)],
      ['Clase de aislamiento', valorOAnotar(f.claseAislamiento)],
      ['Grado IP', valorOAnotar(f.gradoIP)],
    ].map(filaSegura),
    theme: 'striped',
    styles: { fontSize: 9 },
    headStyles: { fillColor: TINTA },
  })

  autoTable(doc, {
    startY: lastY(doc, y) + 6,
    head: [['Programa de inspección', '']],
    body: [
      ['Próxima inspección', fmt(f.proximaInspeccion)],
      ['Frecuencia (días)', f.frecuenciaInspeccionDias != null ? String(f.frecuenciaInspeccionDias) : '—'],
      ['Vida útil (años)', f.vidaUtilAnios != null ? String(f.vidaUtilAnios) : '—'],
    ].map(filaSegura),
    theme: 'striped',
    styles: { fontSize: 9 },
    headStyles: { fillColor: TINTA },
  })

  // ── Protocolo de la familia: es lo ÚNICO accionable que tiene el 92 % de los equipos ──
  const checklist = checklistDe(equipment)
  if (checklist.length > 0) {
    autoTable(doc, {
      startY: lastY(doc, y) + 6,
      head: [['OK', `Punto de inspección · ${FAMILIA_LABEL[familia]}`, 'Umbral', 'Medido']],
      body: checklist.map((t) => {
        // El umbral se arma del rango sugerido: «<= 70 °C», «>= 5 A», «12 – 15 mm/s».
        // ⚠ Nunca con «≤»: cp1252 no lo tiene y jsPDF se comería la línea entera.
        const { min, max } = t.rango ?? {}
        const u = t.unidad ?? ''
        let umbral = t.tipo === 'cualitativo' ? 'cualitativo' : u || '—'
        if (min != null && max != null) umbral = `${min} - ${max} ${u}`.trim()
        else if (max != null) umbral = `<= ${max} ${u}`.trim()
        else if (min != null) umbral = `>= ${min} ${u}`.trim()
        return filaSegura([
          t.tipo === 'cualitativo' ? '[  ]' : '[  ]',
          t.nota ? `${t.tarea}\n${t.nota}` : t.tarea,
          umbral,
          t.tipo === 'cualitativo' ? '' : PARA_ANOTAR,
        ])
      }),
      theme: 'grid',
      styles: { fontSize: 8, cellWidth: 'wrap', valign: 'top' },
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 100 }, 2: { cellWidth: 26 }, 3: { cellWidth: 44 } },
      headStyles: { fillColor: TINTA },
    })
  }

  const mediciones = medicionesDe(equipment)
  if (mediciones.length > 0) {
    autoTable(doc, {
      startY: lastY(doc, y) + 6,
      head: [['Serie de comportamiento', 'Unidad', 'En proceso', 'En reposo']],
      body: mediciones.map((m) => filaSegura([m.label, m.unidad, PARA_ANOTAR, PARA_ANOTAR])),
      theme: 'grid',
      styles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 20 }, 2: { cellWidth: 50 }, 3: { cellWidth: 50 } },
      headStyles: { fillColor: TINTA },
    })
  }

  // ── Lista de materiales: SOLO las posiciones con SAP, las que se cargan en IB01 ──
  const materiales = datos.materiales ?? []
  if (materiales.length > 0) {
    // Sin cantidad real la casilla queda en blanco para anotarla en terreno; el Excel de SAP
    // la sube como 1 (ver cantidadDePosicion).
    const sinCantidad = contarSinCantidad(materiales.map((m) => ({ cantidadPorMaquina: m.cantidad })))
    doc.addPage()
    autoTable(doc, {
      startY: 26,
      head: [['Pos', 'Código SAP', 'Texto breve', 'Cant.', 'UM', 'Repuesto']],
      body: materiales.map((m, i) =>
        filaSegura([
          String((i + 1) * 10),
          m.codigoSAP,
          m.textoBreve,
          cantidadDePosicion(m.cantidad).real ? String(m.cantidad) : '',
          m.unidad || 'UN',
          '______',
        ]),
      ),
      theme: 'grid',
      styles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'right' },
        1: { cellWidth: 26 },
        2: { cellWidth: 92 },
        3: { cellWidth: 14, halign: 'right' },
        4: { cellWidth: 12 },
        5: { cellWidth: 26 },
      },
      headStyles: { fillColor: TINTA },
      didDrawPage: () => {
        doc.setFontSize(9)
        doc.text(
          textoSeguroPdf(`Lista de materiales · carga IB01 · uso de lista 4 · ${materiales.length} posiciones con SAP${sinCantidad ? ` · ${sinCantidad} sin cantidad: anotarla` : ''}`),
          MARGEN,
          20,
        )
      },
    })
  }

  // ── Historial: maintenanceLog + incidencias, más reciente primero ──
  type Row = { fecha: Date; tipo: string; sev: string; texto: string }
  const filas: Row[] = [
    ...log.map((e) => ({
      fecha: e.fecha instanceof Date ? e.fecha : new Date(e.fecha),
      tipo: e.tipo,
      sev: SEV_LABEL[e.severidad] ?? '',
      texto: `${e.tecnico ? `${e.tecnico} — ` : ''}${e.hallazgo}`,
    })),
    ...incidents.map((i) => ({
      fecha: new Date(i.createdAt),
      tipo: 'incidencia',
      sev: i.prioridad,
      texto: i.titulo,
    })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

  // Sin historial la tabla no se imprime: una hoja que solo dice «sin datos» es aire.
  if (filas.length > 0) {
    autoTable(doc, {
      startY: lastY(doc, y) + 6,
      head: [['Fecha', 'Tipo', 'Sev.', 'Hallazgo']],
      body: filas.map((r) => filaSegura([fmt(r.fecha), r.tipo, r.sev, r.texto])),
      theme: 'grid',
      styles: { fontSize: 8, cellWidth: 'wrap' },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 26 }, 2: { cellWidth: 20 }, 3: { cellWidth: 112 } },
      headStyles: { fillColor: TINTA },
    })
  }

  autoTable(doc, {
    startY: lastY(doc, y) + 6,
    head: [['Tomado por', 'Fecha', 'Próxima inspección', 'Firma']],
    body: [[PARA_ANOTAR, '__________', '__________', PARA_ANOTAR]],
    theme: 'grid',
    styles: { fontSize: 8, minCellHeight: 14, valign: 'bottom' },
    headStyles: { fillColor: TINTA },
  })

  // ── Membrete y pie en TODAS las hojas: en terreno las hojas se separan ──
  const fecha = new Date().toLocaleString()
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    if (p > 1) {
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(textoSeguroPdf(`${equipment.nombre} · ${equipment.codigo}`), MARGEN, 12)
      doc.setTextColor(0)
    }
    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text(
      textoSeguroPdf(`Generado ${fecha} · Centro técnico documental · pág. ${p}/${pages}`),
      MARGEN,
      290,
    )
    doc.setTextColor(0)
  }

  doc.save(`expediente-${equipment.codigo}.pdf`)
}

/**
 * exportCombinedTimelinePng — compone un PNG vertical con todos los charts
 * ECharts inscritos al `groupId` (Grader + Gantts + ProductionBars del panel
 * upstream), apilados en el orden DOM. Útil para compartir el timeline
 * completo del turno en un solo archivo (Slack, email, ticket).
 *
 * Implementación:
 *   1. Enumera DOM por `[_echarts_instance_]` filtrando por `inst.group`
 *   2. Por cada chart: getDataURL PNG con pixel ratio 2x
 *   3. Carga las imágenes y compone un canvas con header + charts apilados
 *   4. Descarga blob
 */

import * as echarts from 'echarts'

export interface CombinedExportMetadata {
  /** Encabezado principal (ej. "Análisis de Turno · 2026-02-26 · Turno día") */
  title: string
  /** Subtítulo opcional (ej. "Cobertura 81% · 8 paros") */
  subtitle?: string
  /** Sufijo del nombre del archivo PNG (ej. "2026-02-26_dia") */
  filenameSuffix: string
}

/**
 * Composición visual:
 *   ┌──────────────────────────────────────────┐
 *   │  HEADER (title + subtitle)               │ — fondo slate-900
 *   ├──────────────────────────────────────────┤
 *   │  Grader chart (P0% timeline)             │
 *   ├──────────────────────────────────────────┤
 *   │  Línea upstream — Evisceradoras Baader   │ — sub-header
 *   ├──────────────────────────────────────────┤
 *   │  E1 Gantt + barras producción            │
 *   │  E2 Gantt + barras producción            │
 *   │  E3 Gantt + barras producción            │
 *   └──────────────────────────────────────────┘
 *
 * Nota de implementación: los Gantts y ProductionBars son charts MUY
 * pequeños individualmente. Para que el PNG final sea legible los apilamos
 * sin gaps verticales — el tamaño nativo es suficiente.
 */
export async function exportCombinedTimelinePng(
  groupId: string,
  meta: CombinedExportMetadata,
): Promise<void> {
  // 1. Enumerar instancias del grupo en orden DOM
  const roots = [...document.querySelectorAll('[_echarts_instance_]')] as HTMLElement[]
  const instances: { inst: any; el: HTMLElement }[] = []
  for (const el of roots) {
    const inst = echarts.getInstanceByDom(el)
    if (inst && inst.group === groupId) {
      instances.push({ inst, el })
    }
  }
  if (instances.length === 0) {
    throw new Error(`No hay charts inscritos al grupo "${groupId}"`)
  }

  // 2. Capturar dataURL de cada chart con pixel ratio 2x
  const captures = instances.map(({ inst, el }) => {
    const rect = el.getBoundingClientRect()
    return {
      url: inst.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#0f172a',  // slate-900 — consistente con header
      }) as string,
      cssWidth: Math.round(rect.width),
      cssHeight: Math.round(rect.height),
    }
  })

  // 3. Cargar imágenes (await todas)
  const images = await Promise.all(
    captures.map(
      (c) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('Error cargando captura PNG'))
          img.src = c.url
        }),
    ),
  )

  // 4. Calcular dimensiones del canvas combinado
  const PIXEL_RATIO = 2
  const HEADER_H_CSS = 56
  const SEPARATOR_H_CSS = 30  // sub-header "Línea upstream..." entre Grader y Baaders
  const maxWidthCss = Math.max(...captures.map((c) => c.cssWidth))
  const chartsTotalHCss = captures.reduce((s, c) => s + c.cssHeight, 0)
  // Asumimos: instance[0] = Grader. Resto = panel upstream → separator entre
  // chart[0] y chart[1] si hay más de 1.
  const hasUpstream = instances.length > 1
  const totalHCss = HEADER_H_CSS + chartsTotalHCss + (hasUpstream ? SEPARATOR_H_CSS : 0)

  const canvas = document.createElement('canvas')
  canvas.width = maxWidthCss * PIXEL_RATIO
  canvas.height = totalHCss * PIXEL_RATIO
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context no disponible')

  // 5. Pintar fondo + header
  ctx.fillStyle = '#0f172a'  // slate-900
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#f8fafc'  // slate-50
  ctx.font = `${600 * (PIXEL_RATIO / 2)} ${15 * PIXEL_RATIO}px system-ui, -apple-system, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillText(meta.title, 16 * PIXEL_RATIO, 12 * PIXEL_RATIO)
  if (meta.subtitle) {
    ctx.fillStyle = '#94a3b8'  // slate-400
    ctx.font = `${11 * PIXEL_RATIO}px system-ui, -apple-system, sans-serif`
    ctx.fillText(meta.subtitle, 16 * PIXEL_RATIO, 33 * PIXEL_RATIO)
  }

  // 6. Pintar charts apilados — Grader primero, separador, Baader charts
  let yCss = HEADER_H_CSS
  for (let i = 0; i < images.length; i++) {
    const img = images[i]!
    const cap = captures[i]!
    // Sub-header antes del primer chart upstream (idx === 1)
    if (i === 1 && hasUpstream) {
      ctx.fillStyle = '#1e293b'  // slate-800
      ctx.fillRect(0, yCss * PIXEL_RATIO, canvas.width, SEPARATOR_H_CSS * PIXEL_RATIO)
      ctx.fillStyle = '#a78bfa'  // violet-400
      ctx.font = `${600 * (PIXEL_RATIO / 2)} ${12 * PIXEL_RATIO}px system-ui, -apple-system, sans-serif`
      ctx.fillText('⚡ Línea upstream — Evisceradoras Baader 142', 16 * PIXEL_RATIO, (yCss + 8) * PIXEL_RATIO)
      yCss += SEPARATOR_H_CSS
    }
    // Centrar chart si su ancho < maxWidth
    const xCss = (maxWidthCss - cap.cssWidth) / 2
    ctx.drawImage(
      img,
      xCss * PIXEL_RATIO,
      yCss * PIXEL_RATIO,
      cap.cssWidth * PIXEL_RATIO,
      cap.cssHeight * PIXEL_RATIO,
    )
    yCss += cap.cssHeight
  }

  // 7. Descargar
  await new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas toBlob falló'))
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `timeline_combinado_${meta.filenameSuffix}.png`
      a.click()
      URL.revokeObjectURL(url)
      resolve()
    }, 'image/png')
  })
}

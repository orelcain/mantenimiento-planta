import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Download, FolderArchive } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Badge, Button, Card, CardContent, Input } from '@/components/ui'
import { getEquipments } from '@/services/equipment'
import { logger } from '@/lib/logger'
import type { Equipment, FichaTecnica } from '@/types'

/**
 * Centro Técnico Documental — portada / panel del programa (EMP · NFPA 70B).
 *
 * Vista de SOLO LECTURA y a nivel programa sobre la colección `equipment`:
 * KPIs (criticidad, condición, inspecciones vencidas, fichas incompletas) y
 * tabla de equipos que entra al expediente (pestaña Ficha NFPA 70B).
 * No duplica datos. Ver `docs/PLAN_CENTRO_TECNICO_DOCUMENTAL.md`.
 */

const CRIT: Record<Equipment['criticidad'], { nivel: string; cls: string }> = {
  alta: { nivel: 'A', cls: 'border-red-500 text-red-600' },
  media: { nivel: 'B', cls: 'border-amber-500 text-amber-600' },
  baja: { nivel: 'C', cls: 'border-emerald-500 text-emerald-600' },
}

const COND_EMOJI: Record<1 | 2 | 3, string> = { 1: '🟢', 2: '🟡', 3: '🔴' }

const PLACA_FIELDS: (keyof FichaTecnica)[] = [
  'potenciaKw',
  'voltajeV',
  'corrienteA',
  'rpm',
  'factorServicio',
  'claseAislamiento',
  'gradoIP',
]

function completitud(eq: Equipment): number {
  const ft = eq.fichaTecnica
  if (!ft) return 0
  const filled = PLACA_FIELDS.filter((k) => {
    const v = ft[k]
    return v !== undefined && v !== null && v !== ''
  }).length
  return Math.round((filled / PLACA_FIELDS.length) * 100)
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function diasVencida(iso?: string): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const diff = startOfToday() - t
  return diff > 0 ? Math.floor(diff / 86400000) : null
}

type Filtro = 'todos' | 'A' | 'cond3' | 'vencida' | 'incompleta'

export function CentroTecnicoDocumentalPage() {
  const navigate = useNavigate()
  const [equipos, setEquipos] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    getEquipments()
      .then((rows) => {
        if (alive) setEquipos(rows.filter((e) => !e.deleted))
      })
      .catch((err) =>
        logger.error('Error cargando equipos (Centro Técnico Documental)', err instanceof Error ? err : new Error(String(err))),
      )
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const kpis = useMemo(() => {
    let critA = 0
    let cond3 = 0
    let vencidas = 0
    let incompletas = 0
    for (const e of equipos) {
      if (e.criticidad === 'alta') critA++
      if (e.fichaTecnica?.condicion === 3) cond3++
      if (diasVencida(e.fichaTecnica?.proximaInspeccion) !== null) vencidas++
      if (completitud(e) < 100) incompletas++
    }
    return { total: equipos.length, critA, cond3, vencidas, incompletas }
  }, [equipos])

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase()
    const rows = equipos.filter((e) => {
      if (term && !`${e.nombre} ${e.codigo}`.toLowerCase().includes(term)) return false
      switch (filtro) {
        case 'A':
          return e.criticidad === 'alta'
        case 'cond3':
          return e.fichaTecnica?.condicion === 3
        case 'vencida':
          return diasVencida(e.fichaTecnica?.proximaInspeccion) !== null
        case 'incompleta':
          return completitud(e) < 100
        default:
          return true
      }
    })
    // Orden: criticidad (A>B>C), luego condición peor primero
    const critRank: Record<Equipment['criticidad'], number> = { alta: 0, media: 1, baja: 2 }
    return rows.sort((a, b) => {
      const c = critRank[a.criticidad] - critRank[b.criticidad]
      if (c !== 0) return c
      return (b.fichaTecnica?.condicion ?? 0) - (a.fichaTecnica?.condicion ?? 0)
    })
  }, [equipos, filtro, q])

  const chips: { key: Filtro; label: string }[] = [
    { key: 'todos', label: `Todos (${kpis.total})` },
    { key: 'A', label: `Criticidad A (${kpis.critA})` },
    { key: 'cond3', label: `Condición 🔴 (${kpis.cond3})` },
    { key: 'vencida', label: `Inspección vencida (${kpis.vencidas})` },
    { key: 'incompleta', label: `Ficha incompleta (${kpis.incompletas})` },
  ]

  // Exporta el programa (filtro actual) a Excel — handoff de auditoría NFPA 70B.
  function exportarExcel() {
    const rows = visibles.map((e) => {
      const dias = diasVencida(e.fichaTecnica?.proximaInspeccion)
      return {
        'Código': e.codigo,
        'Equipo': e.nombre,
        'Ubicación': e.hierarchyPath ?? e.zoneId ?? '',
        'Criticidad': CRIT[e.criticidad].nivel,
        'Condición': e.fichaTecnica?.condicion ?? '',
        'Estado': e.estado,
        'Vida útil (años)': e.fichaTecnica?.vidaUtilAnios ?? '',
        'Frecuencia (días)': e.fichaTecnica?.frecuenciaInspeccionDias ?? '',
        'Próx. inspección': e.fichaTecnica?.proximaInspeccion ?? '',
        'Vencida': dias !== null ? 'Sí' : 'No',
        'Días vencida': dias ?? '',
        'Ficha (%)': completitud(e),
        'Marca': e.marca ?? '',
        'Modelo': e.modelo ?? '',
        'N° serie': e.numeroSerie ?? '',
        'Potencia (kW)': e.fichaTecnica?.potenciaKw ?? '',
        'Voltaje (V)': e.fichaTecnica?.voltajeV ?? '',
        'Corriente (A)': e.fichaTecnica?.corrienteA ?? '',
        'RPM': e.fichaTecnica?.rpm ?? '',
      }
    })
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Programa NFPA 70B')
    XLSX.writeFile(wb, `centro-tecnico-documental-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FolderArchive className="h-5 w-5" /> Centro Técnico Documental
          </h1>
          <p className="text-sm text-muted-foreground">Programa de mantenimiento eléctrico · EMP · NFPA 70B</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportarExcel} disabled={loading || visibles.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar (Excel)
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { n: kpis.total, l: 'Equipos', cls: '' },
          { n: kpis.critA, l: 'Criticidad A', cls: 'text-red-600' },
          { n: kpis.cond3, l: 'Condición 🔴', cls: 'text-red-600' },
          { n: kpis.vencidas, l: 'Inspección vencida', cls: 'text-amber-600' },
          { n: kpis.incompletas, l: 'Ficha incompleta', cls: 'text-amber-600' },
        ].map((k) => (
          <Card key={k.l}>
            <CardContent className="p-3 text-center">
              <div className={`text-2xl font-extrabold leading-none ${k.cls}`}>{k.n}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{k.l}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Búsqueda */}
      <Input
        placeholder="Buscar equipo por nombre o código…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFiltro(c.key)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              filtro === c.key ? 'border-primary text-primary font-semibold' : 'border-border text-muted-foreground'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground italic">Cargando equipos…</p>
          ) : visibles.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground italic">No hay equipos para este filtro.</p>
          ) : (
            <div className="divide-y">
              {/* encabezado */}
              <div className="hidden md:grid grid-cols-[1fr_90px_90px_140px_70px_80px] gap-2 px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <div>Equipo</div>
                <div>Criticidad</div>
                <div>Condición</div>
                <div>Próx. inspección</div>
                <div>Ficha</div>
                <div></div>
              </div>
              {visibles.map((e) => {
                const crit = CRIT[e.criticidad]
                const cond = e.fichaTecnica?.condicion
                const dias = diasVencida(e.fichaTecnica?.proximaInspeccion)
                const prox = e.fichaTecnica?.proximaInspeccion
                const pct = completitud(e)
                return (
                  <div
                    key={e.id}
                    className="grid grid-cols-2 md:grid-cols-[1fr_90px_90px_140px_70px_80px] gap-2 px-4 py-3 items-center text-sm hover:bg-muted/40 cursor-pointer"
                    onClick={() => navigate(`/equipment?abrir=${e.id}&tab=ficha`)}
                  >
                    <div className="col-span-2 md:col-span-1">
                      <div className="font-medium">{e.nombre}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{e.codigo}</div>
                    </div>
                    <div>
                      <Badge variant="outline" className={`${crit.cls} text-xs`}>
                        {crit.nivel}
                      </Badge>
                    </div>
                    <div>{cond ? `${COND_EMOJI[cond]} ${cond}` : <span className="text-muted-foreground">—</span>}</div>
                    <div className={dias !== null ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                      {dias !== null ? `vencida ${dias} d` : prox ? new Date(prox).toLocaleDateString() : '—'}
                    </div>
                    <div className={pct < 100 ? 'text-amber-600' : 'text-emerald-600'}>{pct > 0 ? `${pct}%` : '—'}</div>
                    <div className="hidden md:flex justify-end">
                      <Button variant="ghost" size="sm" className="text-primary">
                        Abrir <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Solo lectura sobre los equipos existentes (no duplica datos). “Abrir” lleva al expediente del equipo →
        pestaña <strong>Ficha NFPA 70B</strong>. “Ficha %” = completitud de la placa.
      </p>
    </div>
  )
}

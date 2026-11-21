/**
 * DiagnosticoMatrixPage — admin, SOLO LECTURA.
 *
 * Junta en un minuto, desde el PC de planta, los datos para decidir cómo
 * automatizar la carga del Excel de Matrix (grader). No escribe en Firestore ni
 * en Matrix, y no sube nada: solo lee la carpeta que el usuario elige y arma un
 * texto para copiar.
 *
 * La lógica pura (recorrido, orden, formatos, resumen) vive en
 * services/grader/diagnosticoMatrix.ts.
 */
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { Pill } from '@/components/piel'
import { Stethoscope, FolderOpen, FileSpreadsheet, Copy, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { logger } from '@/lib/logger'
import { parseFile } from '@/services/grader/graderExcelParser'
import {
  armarResumenParaClaude,
  detectarNavegador,
  formatearFechaCorta,
  formatearHaceX,
  formatearResumenAnalisis,
  formatearTamano,
  listarExcelsEnCarpeta,
  resumirAnalisis,
  tituloListado,
  DIAG_TOP_RESUMEN,
  DIAG_MAX_ENTRADAS,
  type CarpetaHandle,
  type EntradaArchivo,
  type ResultadoAnalisisArchivo,
  type ResultadoListado,
} from '@/services/grader/diagnosticoMatrix'
import { DIAGNOSTICO_MATRIX_PS1 } from './diagnosticoMatrixScript'
import { SONDA_MATRIX_PS1 } from './sondaMatrixScript'
import { LECTURA_TABLA_MATRIX_PS1 } from './lecturaTablaMatrixScript'
import { PRUEBA_VIDA_ESPEJO_PS1 } from './pruebaVidaEspejoScript'
import { LectorEspejoCard } from './LectorEspejoCard'

/** showDirectoryPicker no está tipado en todas las versiones de lib.dom: se lee aparte. */
type ConPicker = { showDirectoryPicker?: (opts: { mode: 'read' }) => Promise<unknown> }

function esErrorDeNombre(e: unknown, nombre: string): boolean {
  return typeof e === 'object' && e !== null && 'name' in e && (e as { name: unknown }).name === nombre
}

function mensajeCarpeta(e: unknown): string {
  if (esErrorDeNombre(e, 'SecurityError')) {
    return 'Chrome no deja leer esa carpeta (suele ser una carpeta de sistema). Elige otra, por ejemplo una carpeta de Documentos o del Escritorio con copias de los exportes.'
  }
  return `No se pudo leer la carpeta: ${e instanceof Error ? e.message : 'error desconocido'}`
}

interface CarpetaElegida {
  nombre: string
  listado: ResultadoListado
}

export function DiagnosticoMatrixPage() {
  const { toast } = useToast()
  const navInfo = useMemo(() => detectarNavegador(navigator.userAgent), [])
  const lecturaCarpetas = useMemo(
    () => typeof (window as unknown as ConPicker).showDirectoryPicker === 'function',
    [],
  )
  const [online, setOnline] = useState(navigator.onLine)
  const [carpeta, setCarpeta] = useState<CarpetaElegida | null>(null)
  const [cargandoCarpeta, setCargandoCarpeta] = useState(false)
  const [errorCarpeta, setErrorCarpeta] = useState<string | null>(null)
  const [analisis, setAnalisis] = useState<ResultadoAnalisisArchivo | null>(null)
  const [analizandoRuta, setAnalizandoRuta] = useState<string | null>(null)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const ahora = Date.now()

  async function analizar(entrada: EntradaArchivo) {
    setAnalizandoRuta(entrada.ruta)
    setAnalisis(null)
    try {
      const file = await entrada.handle.getFile()
      const { fileMeta, partialData } = await parseFile(file)
      setAnalisis({ ok: true, nombre: entrada.ruta, resumen: resumirAnalisis(fileMeta, partialData) })
    } catch (e) {
      logger.error('DiagnosticoMatrix analizar', e instanceof Error ? e : new Error(String(e)))
      setAnalisis({
        ok: false,
        nombre: entrada.ruta,
        error: e instanceof Error ? e.message : 'No se pudo leer el archivo.',
      })
    } finally {
      setAnalizandoRuta(null)
    }
  }

  async function elegirCarpeta() {
    const pick = (window as unknown as ConPicker).showDirectoryPicker
    if (!pick) return
    let raiz: CarpetaHandle
    try {
      raiz = (await pick({ mode: 'read' })) as unknown as CarpetaHandle
    } catch (e) {
      // El usuario canceló el selector: no es un error.
      if (esErrorDeNombre(e, 'AbortError')) return
      setErrorCarpeta(mensajeCarpeta(e))
      return
    }

    setCargandoCarpeta(true)
    setErrorCarpeta(null)
    setAnalisis(null)
    try {
      const listado = await listarExcelsEnCarpeta(raiz)
      setCarpeta({ nombre: raiz.name, listado })
      const masNuevo = listado.archivos[0]
      if (masNuevo) await analizar(masNuevo)
    } catch (e) {
      setCarpeta(null)
      if (!esErrorDeNombre(e, 'AbortError')) setErrorCarpeta(mensajeCarpeta(e))
    } finally {
      setCargandoCarpeta(false)
    }
  }

  async function copiarTexto(texto: string, okTitulo: string) {
    try {
      await navigator.clipboard.writeText(texto)
      toast({ title: okTitulo })
    } catch (e) {
      logger.error('DiagnosticoMatrix copiar', e instanceof Error ? e : new Error(String(e)))
      toast({ title: 'No se pudo copiar', description: 'El navegador bloqueó el portapapeles.', variant: 'destructive' })
    }
  }

  function copiarResumen() {
    const texto = armarResumenParaClaude({
      generado: Date.now(),
      navegador: navInfo,
      online,
      lecturaCarpetas,
      carpeta: carpeta ? { nombre: carpeta.nombre, listado: carpeta.listado } : null,
      analisis,
    })
    void copiarTexto(texto, 'Resumen copiado')
  }

  const listado = carpeta?.listado ?? null

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-3xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Stethoscope className="w-5 h-5" />
          Diagnóstico Matrix
        </h1>
        <p className="text-sm text-muted-foreground">Solo lectura. No escribe en Matrix ni sube nada.</p>
      </header>

      {/* 1. Este navegador */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Este navegador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Pill tone="info">
              {navInfo.navegador}{navInfo.version ? ` ${navInfo.version}` : ''}
            </Pill>
            <Pill tone="neutral">{navInfo.sistema}</Pill>
            <Pill tone={online ? 'ok' : 'critical'} dot>
              {online ? 'En línea' : 'Sin conexión'}
            </Pill>
            <Pill tone={lecturaCarpetas ? 'ok' : 'warning'}>
              Lee carpetas: {lecturaCarpetas ? 'sí' : 'no'}
            </Pill>
          </div>
          {!lecturaCarpetas && (
            <p className="text-xs text-ink-warn">
              Este navegador no puede leer carpetas. Usa Chrome o Edge de escritorio.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. Carpeta de exportes de Matrix */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Carpeta de exportes de Matrix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => void elegirCarpeta()} disabled={!lecturaCarpetas || cargandoCarpeta}>
              {cargandoCarpeta ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FolderOpen className="h-4 w-4 mr-2" />}
              Elegir carpeta
            </Button>
            {carpeta && (
              <span className="text-xs text-muted-foreground">
                Carpeta: <span className="text-foreground">{carpeta.nombre}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Revisa la carpeta y hasta 2 niveles de subcarpetas, con tope de {DIAG_MAX_ENTRADAS} entradas.
            Si Chrome bloquea una carpeta de sistema, elige otra.
          </p>
          {errorCarpeta && <p className="text-xs text-ink-crit">{errorCarpeta}</p>}

          {listado && carpeta && (
            <div className="space-y-2 pt-1">
              <p className="text-sm">
                {tituloListado(listado.archivos.length, listado.archivos[0]?.modificado ?? null, ahora)}
              </p>
              {listado.truncado && (
                <p className="text-xs text-ink-warn">
                  Se alcanzó el tope de {DIAG_MAX_ENTRADAS} entradas: hay más archivos sin revisar.
                </p>
              )}
              {listado.elementosNoLeidos > 0 && (
                <p className="text-xs text-ink-warn">
                  {listado.elementosNoLeidos} elemento(s) no se pudieron leer.
                </p>
              )}
              <ul className="divide-y divide-border/60">
                {listado.archivos.map((a) => (
                  <li key={a.ruta} className="flex items-center gap-2 py-2 text-sm">
                    <FileSpreadsheet className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{a.ruta}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatearTamano(a.tamano)} · {formatearFechaCorta(a.modificado)} · {formatearHaceX(a.modificado, ahora)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void analizar(a)}
                      disabled={analizandoRuta !== null}
                    >
                      Analizar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analizandoRuta && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Analizando {analizandoRuta}…
            </p>
          )}
          {analisis && !analizandoRuta && (
            <div className="rounded-ctl border border-border/60 p-3 text-sm space-y-1">
              <div className="text-xs text-muted-foreground">{analisis.nombre}</div>
              {analisis.ok ? (
                <>
                  <div>{formatearResumenAnalisis(analisis.resumen)}</div>
                  {analisis.resumen.avisos.map((aviso, i) => (
                    <div key={i} className="text-xs text-ink-warn">{aviso}</div>
                  ))}
                </>
              ) : (
                <div className="text-ink-crit">{analisis.error}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Datos del PC que la web no ve */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Datos del PC que la web no ve</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Programas, servicios y bases del PC de Matrix. El script solo lee: no instala ni cambia nada.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void copiarTexto(DIAGNOSTICO_MATRIX_PS1, 'Script copiado')}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copiar script de solo lectura
          </Button>
          <p className="text-xs text-muted-foreground">
            Abre Matrix, pega en PowerShell y saca foto al informe que queda en pantalla (también queda en el Escritorio como diagnostico-matrix.txt).
          </p>
        </CardContent>
      </Card>

      {/* 4. Sonda: si Matrix se deja manejar sin mouse */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Controles que Matrix deja manejar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Revisa si Matrix se puede manejar sin mouse ni teclado, paso previo a exportar el informe de forma automática. La sonda solo lee: no pulsa ni cambia nada.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void copiarTexto(SONDA_MATRIX_PS1, 'Sonda copiada')}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copiar sonda de solo lectura
          </Button>
          <p className="text-xs text-muted-foreground">
            Pégala dos veces en PowerShell: una con «Pieza pieza Grader» en pantalla y otra con la ventana de exportar abierta, sin guardar. Cierra antes la pantalla de Administración. Saca foto al informe; el detalle queda en el Escritorio como sonda-matrix-HHmmss.txt.
          </p>
        </CardContent>
      </Card>

      {/* 5. Lectura: cuánto tarda leer la tabla del informe sin Excel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Leer la tabla de Matrix sin Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Mide cuánto tarda leer el informe que Matrix tiene en pantalla, paso previo a mostrarlo en la app sin exportar. El script solo lee: no pulsa ni cambia nada.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void copiarTexto(LECTURA_TABLA_MATRIX_PS1, 'Lectura copiada')}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copiar lectura de tabla
          </Button>
          <p className="text-xs text-muted-foreground">
            Carga el informe en Matrix («Pieza pieza Grader» y después «Puerta 0») y pega el script en PowerShell una vez con cada uno. Tarda menos de un minuto. Cierra antes la pantalla de Administración. Saca foto al informe; la muestra queda en el Escritorio como lectura-matrix-HHmmss.txt.
          </p>
        </CardContent>
      </Card>

      {/* 6. Prueba de vida del espejo: lo que hay que saber antes de dejar un lector corriendo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Prueba de vida del espejo del grader</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Antes de dejar un lector corriendo: revisa si la tabla de Matrix crece sola, si «Pieza pieza Grader» trae las piezas de la Gate 0 y si este PC llega a la app. El script solo lee: no pulsa ni cambia nada, no envía datos y termina solo.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void copiarTexto(PRUEBA_VIDA_ESPEJO_PS1, 'Prueba de vida copiada')}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copiar prueba de vida
          </Button>
          <p className="text-xs text-muted-foreground">
            Con la línea andando, deja «Pieza pieza Grader» en pantalla con el rango hasta mañana y pega el script en PowerShell. Tarda unos 6 minutos: no toques Matrix mientras corre. Cierra antes la pantalla de Administración. Saca foto al veredicto; queda en el Escritorio como vida-espejo-HHmmss.txt.
          </p>
        </CardContent>
      </Card>

      {/* 7. Lector del espejo: llave, lista y detener */}
      <LectorEspejoCard />

      {/* 8. Pie: resumen para Claude */}
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" onClick={copiarResumen}>
          Copiar resumen para Claude
        </Button>
        <p className="text-xs text-muted-foreground">
          Navegador, carpeta, los {DIAG_TOP_RESUMEN} más nuevos y el análisis. No copia el contenido de los archivos.
        </p>
      </div>
    </div>
  )
}

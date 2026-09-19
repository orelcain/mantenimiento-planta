import type { GrafoLineas, LineaProceso, NodoGrafo } from './modeloLineas'
import { PREFIJO_ENTRADA } from './modeloLineas'

/**
 * Propuesta inicial de Chonchi, deducida del árbol (19-09-2026): se usa cuando
 * todavía no hay nada guardado. Los equipos se buscan por NOMBRE en el árbol
 * cargado (incluidos los componentes); si alguno no está, no se dibuja. Las dudas
 * (Sellado, Cintas HG, Línea manual HG…) quedan fuera a propósito: las decide Orel.
 * La planta fluye de izquierda a derecha: Acopio → Eviscerado → Emparrillado →
 * Empaque, con Filete como rama; debajo, los servicios de apoyo.
 */
export const LINEAS_CHONCHI: LineaProceso[] = [
  { id: 'acopio', nombre: 'Acopio', zona: { x: 0, y: 0, w: 800, h: 640 } },
  { id: 'eviscerado', nombre: 'Eviscerado', zona: { x: 820, y: 0, w: 1800, h: 640 } },
  { id: 'emparrillado', nombre: 'Emparrillado', zona: { x: 2640, y: 0, w: 440, h: 310 } },
  { id: 'empaque', nombre: 'Empaque', zona: { x: 3100, y: 0, w: 1330, h: 310 } },
  { id: 'filete', nombre: 'Filete', zona: { x: 2640, y: 330, w: 1330, h: 310 } },
  { id: 'apoyo', nombre: 'Servicios de apoyo · influyen indirectamente', tipo: 'apoyo', zona: { x: 0, y: 670, w: 4430, h: 300 } },
]

/**
 * Equipos del Acopio del sitio que abastecen a OTRA planta (Orel, 19-09-2026: el
 * Sistema de bombeo N2 es de Yal). En el árbol cuelgan del Acopio compartido del
 * sitio, al lado de PLANTA CHONCHI y PLANTA YAL — y así debe seguir (su ubicación
 * técnica es la de SAP); aquí solo se marcan para no contarlos en Chonchi.
 */
export const DE_OTRA_PLANTA: Record<string, string> = { 'SISTEMA BOMBEO PECES N2': 'Yal' }

export function propuestaChonchi(idPorNombre: (nombre: string) => string | undefined): GrafoLineas {
  const nodos: NodoGrafo[] = []
  const aristas: [string, string][] = []
  const ent = (l: string, x: number, y: number) => {
    nodos.push({ id: PREFIJO_ENTRADA + l, x, y })
    return PREFIJO_ENTRADA + l
  }
  const pon = (nombre: string, x: number, y: number) => {
    const id = idPorNombre(nombre)
    if (id && !nodos.some((n) => n.id === id)) nodos.push({ id, x, y })
    return id
  }
  const une = (a?: string, b?: string) => {
    if (a && b) aristas.push([a, b])
  }
  const cadena = (...ids: (string | undefined)[]) => ids.slice(1).forEach((b, i) => une(ids[i], b))
  const abanico = (a: string | undefined, bs: (string | undefined)[], c?: string) => bs.forEach((b) => (une(a, b), c && une(b, c)))
  const X = (x0: number, i: number) => x0 + 150 + i * 205

  // Acopio: el Sistema de bombeo N1 por sus componentes (Orel: «Acopio tiene equipos
  // individuales en línea»). El resto de sus componentes queda a mano, sin unir.
  const ia = ent('acopio', 20, 290)
  const ducto = pon('DUCTO SUCCION PECES SISTEMA N1', X(0, 0), 280)
  const bv = [pon('BOMBA VACIO ANILLO LIQUIDO N1', X(0, 1), 220), pon('BOMBA VACIO ANILLO LIQUIDO N2', X(0, 1), 340)]
  const descarga = pon('DUCTO DESCARGA N1', X(0, 2), 280)
  cadena(ia, ducto)
  abanico(ducto, bv, descarga)
  ;['ESTANQUE BOMBEO A SISTEMA 1', 'ESTANQUE BOMBEO B SISTEMA 1', 'BOMBA FLUJO SISTEMA N1', 'COMPRESOR AIRE N1', 'CONJUNTO VALVULAS SISTEMA N1', 'HIDROFORO SISTEMA N1', 'TABLERO CONTROL SISTEMA N1'].forEach(
    (n, i) => pon(n, X(0, i % 3), 470 + Math.floor(i / 3) * 80),
  )

  const e0 = 820
  const ie = ent('eviscerado', e0 + 20, 290)
  const des = pon('DESANGRADOR', X(e0, 0), 280)
  const cam = pon('CINTA ACELERACION MAREL', X(e0, 1), 280)
  const bal = pon('BALANZA PESAJE MAREL', X(e0, 2), 280)
  const cal = pon('CINTA ACELERACION LARGA ENTRADA BAADER', X(e0, 3), 280)
  const cco = pon('CINTA CORTA DE ACELERACION', X(e0, 4), 280)
  const bd = ['EVISCERADORA BAADER 142 N1', 'EVISCERADORA BAADER 142 N2', 'EVISCERADORA BAADER 142 N3'].map((n, i) => pon(n, X(e0, 5), 170 + i * 110))
  const cts = pon('CINTA TRANSVERSAL SALIDA BAADER', X(e0, 6), 280)
  const cec = pon('CINTA ELEVADORA CLASIFICADO', X(e0, 7), 280)
  une(descarga, ie)
  cadena(ie, des, cam, bal, cal, cco)
  abanico(cco, bd, cts)
  une(cts, cec)
  pon('CORTINA AIRE ENTRADA SACRIFICIO', X(e0, 0), 480)
  pon('CORTINA AIRE ENTRADA EVISCERADO', X(e0, 1), 480)

  const ip = ent('emparrillado', 2660, 130)
  const sg = pon('CONJ BALANZA ESTATICA "STATIC GRADER"', 2810, 120)
  une(cec, ip)
  une(ip, sg)

  const k0 = 3100
  const ik = ent('empaque', k0 + 20, 130)
  const d1 = pon('DESPLAZADOR AUTOMATICO 1', X(k0, 0), 70)
  const d2 = pon('DESPLAZADOR AUTOMATICO 2', X(k0, 0), 170)
  const gl = pon('GLASEADOR AUTOMATICO', X(k0, 1), 120)
  const ep = pon('EMPACADORA E-PACK', X(k0, 2), 120)
  const dm = pon('DETECTOR DE METALES', X(k0, 3), 120)
  const ez = ['ENZUNCHADORA N1', 'ENZUNCHADORA N2', 'ENZUNCHADORA N3'].map((n, i) => pon(n, X(k0, 4), 35 + i * 88))
  une(sg, ik)
  abanico(ik, [d1, d2], gl)
  cadena(gl, ep, dm)
  abanico(dm, ez)
  pon('CLIMATIZACION EMPAQUE', X(k0, 1), 230)

  const f0 = 2640
  const iff = ent('filete', f0 + 20, 470)
  const vb = pon('VOLCADOR BINS COSECHA', X(f0, 0), 460)
  const b200 = pon('BAADER 200', X(f0, 1), 460)
  const sb = pon('CINTA SALIDA BAADER 200', X(f0, 2), 460)
  const cf = pon('CINTAS FILETE', X(f0, 3), 460)
  const cp = pon('CINTA PIMPONEO', X(f0, 4), 460)
  une(cec, iff)
  cadena(iff, vb, b200, sb, cf, cp)

  // Servicios de apoyo: abastecen (servicio → línea) o reciben (línea → servicio).
  const am = [pon('BOMBA AGUA MAR 1', X(0, 0), 740), pon('BOMBA AGUA MAR 2', X(0, 0), 840)]
  am.forEach((b) => une(b, ia))
  const agua = [pon('ESTANQUE AGUA DULCE 1', X(e0, 0), 740), pon('ESTANQUE AGUA DULCE 2', X(e0, 0), 840), pon('ESTANQUE AGUA MAR', X(e0, 1), 740)]
  agua.forEach((a) => une(a, ie))
  const riles = ['BOMBA VACIO ANILLO LIQ TOLVA VISCERA N1', 'BOMBA VACIO ANILLO LIQ TOLVA VISCERA N2', 'BOMBA VACIO ANILLO LIQ TOLVA VISCERA N3'].map((n, i) =>
    pon(n, X(e0, 5) + (i - 1) * 205, 800),
  )
  riles.forEach((r) => une(cts, r))

  return { version: 1, lineas: LINEAS_CHONCHI, nodos, aristas }
}

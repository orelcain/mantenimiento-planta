/**
 * GraderVisualPilot — piloto de los dos patrones nuevos (hotspots + relacionar),
 * en su propia pestaña "Componentes del equipo" del Grader, con contenido de
 * referencia escrito a mano (no viene de Firestore todavía). Cada foto real de
 * `public/learning-assets/grader/` se muestra como su propio HotspotDiagram
 * (puntos numerados con nota) en vez de una galería pasiva — y cualquier foto
 * se puede abrir en grande con zoom/paneo vía `ImageLightbox` (mismo visor que
 * usa el módulo de Repuestos).
 * Si el piloto se valida, el siguiente paso es mover este contenido a
 * `learningContent.ts` (tipos `HotspotDiagram` / `MatchingExercise`) para que
 * sea editable desde LearningAdminMachinePage, igual que el resto del manual.
 */
import { useState } from 'react'
import { ZoomIn } from 'lucide-react'
import { HotspotDiagram, type HotspotPoint } from './HotspotDiagram'
import { MatchingExercise, type MatchingPair } from './MatchingExercise'
import { ImageLightbox } from '../ui/ImageLightbox'

const ASSET_BASE = `${import.meta.env.BASE_URL}learning-assets/grader/`

const PAIRS: MatchingPair[] = [
  { id: 'atrapamiento', term: 'Atrapamiento', definition: 'Manos cerca del capacho mientras el cilindro neumático lo acciona' },
  { id: 'lectura', term: 'Falla de clasificación', definition: 'Fotocélula sucia o desalineada que no detecta el producto a tiempo' },
  { id: 'golpe', term: 'Golpe por impacto', definition: 'Brazo del capacho volcando producto mientras alguien limpia esa zona' },
]

type PhotoSection = {
  id: string
  file: string
  title: string
  /** Ancho/alto real de la foto (`img.naturalWidth/naturalHeight`) — evita que el
   * stage recorte o deje letterbox, así los puntos en % calzan con el contenido real. */
  aspectRatio: number
  points: HotspotPoint[]
}

const SECTIONS: PhotoSection[] = [
  {
    id: 'hero',
    file: 'grader-cinta-capachos-sensor.jpg',
    title: 'Banda de clasificación',
    aspectRatio: 1280 / 960,
    points: [
      { id: 'fotocelula', x: 58, y: 57, label: 'Fotocélula de lectura', description: 'Montada en el riel antes de los capachos; detecta el producto para disparar el flipper a tiempo. Mantener el lente limpio.' },
      { id: 'cinta', x: 45, y: 80, label: 'Cinta transportadora', description: 'Traslada el producto ya pesado/medido hacia los capachos. Revisar guías laterales y tensión de banda en cada limpieza.' },
      { id: 'capacho', x: 75, y: 42, label: 'Capacho de clasificación', description: 'Accionado por cilindro neumático; vuelca el producto al canal según su categoría. Riesgo de atrapamiento entre el cilindro y el brazo — no acercar manos con el equipo en marcha.' },
    ],
  },
  {
    id: 'transmisor',
    file: 'grader-fotocelula-transmisor.jpg',
    title: 'Fotocélula — transmisor',
    aspectRatio: 960 / 1280,
    points: [
      { id: 'sensor', x: 32, y: 45, label: 'Transmisor QS186LEQ8', description: 'Emisor láser Clase I que dispara el haz hacia el receptor (se alcanza a ver el punto rojo llegando al otro lado, a la derecha del encuadre). Alimentación 10-30VDC.' },
    ],
  },
  {
    id: 'receptor',
    file: 'grader-fotocelula-receptor.jpg',
    title: 'Fotocélula — receptor',
    aspectRatio: 960 / 1280,
    points: [
      { id: 'sensor', x: 52, y: 55, label: 'Receptor QS18VP6RQ8', description: 'Recibe el haz del transmisor y confirma que el paso está libre. Alimentación 10-30VDC.' },
    ],
  },
  {
    id: 'zeta-difusor',
    file: 'grader-cinta-zeta-difusor.jpg',
    title: 'Cinta elevadora Zeta — sensor difusor',
    aspectRatio: 960 / 1280,
    points: [
      { id: 'sensor', x: 63, y: 38, label: 'Sensor difusor T18SP6DQ', description: 'Configurado como difusor: un solo sensor capta directamente las paletas de la cinta elevadora Zeta, sin receptor aparte.' },
    ],
  },
  {
    id: 'panoramica',
    file: 'grader-panoramica-general.jpg',
    title: 'Vista panorámica de la máquina',
    aspectRatio: 1280 / 783,
    points: [
      { id: 'tambor', x: 25, y: 72, label: 'Tambor / mesa de distribución', description: 'Recibe el producto y lo reparte hacia la cinta elevadora.' },
      { id: 'panel', x: 22, y: 45, label: 'Panel de control', description: 'Caja de botoneras protegida con plástico junto a la línea.' },
      { id: 'salida', x: 75, y: 48, label: 'Cinta de salida hacia clasificación', description: 'Lleva el producto pesado hacia la báscula y los capachos (fuera de este encuadre). No incluye la cinta larga del Grader.' },
    ],
  },
  {
    id: 'pockets',
    file: 'grader-4-pockets-cinta-zeta.jpg',
    title: 'Los 4 pockets y la cinta Zeta',
    aspectRatio: 960 / 1280,
    points: [
      { id: 'zeta', x: 35, y: 25, label: 'Cinta elevadora Zeta', description: 'Sube el producto en pendiente hacia los 4 pockets.' },
      { id: 'pockets4', x: 45, y: 40, label: 'Los 4 pockets', description: 'Divisores de acero que separan el producto en 4 carriles antes de bajar a la cinta de salida.' },
      { id: 'salida-inf', x: 45, y: 83, label: 'Cinta de salida inferior', description: 'Cinta de placas plásticas que recibe el producto de los 4 pockets.' },
    ],
  },
  {
    id: 'motores',
    file: 'grader-motores-en-orden.jpg',
    title: 'Motores de la Grader, en orden',
    aspectRatio: 960 / 1280,
    points: [
      { id: 'm1', x: 48, y: 25, label: 'Motor 1 — SK90LH/4', description: '1.50kW, 230/400V, 1415 rpm.' },
      { id: 'm2', x: 48, y: 45, label: 'Motor 2 — TM113B25-0434', description: '0.25kW, 230/400V, 1.10 m/s.' },
      { id: 'm3', x: 48, y: 63, label: 'Motor 3 — TM113B25-0434', description: '0.25kW, 230/400V (segunda unidad idéntica).' },
      { id: 'm4', x: 48, y: 83, label: 'Motor 4 — TM160A30-0220', description: '1.50kW, 230/400V, 1.30 m/s.' },
    ],
  },
  {
    id: 'sm206',
    file: 'grader-tarjeta-sm206.jpg',
    title: 'Tarjeta SM206',
    aspectRatio: 1858 / 2165,
    points: [
      { id: 'tarjeta', x: 45, y: 45, label: 'Tarjeta SM206', description: 'Controla las celdas de pesaje de los pockets; conector J2 con líneas CAN (CANL/CANH).' },
    ],
  },
  {
    id: 'celda',
    file: 'grader-celda-pesaje.jpg',
    title: 'Celda de pesaje',
    aspectRatio: 2160 / 3840,
    points: [
      { id: 'celda1', x: 55, y: 55, label: 'Celda de pesaje AK300 (Scaime)', description: 'Cada pocket usa una celda de este tipo; capacidad máxima 300.3 kg.' },
    ],
  },
  {
    id: 'cilindros',
    file: 'grader-cilindros-exteriores-operador.jpg',
    title: 'Cilindros exteriores, lado operador',
    aspectRatio: 1280 / 410,
    points: [
      { id: 'cilindros-fila', x: 50, y: 28, label: 'Cilindros neumáticos de accionamiento', description: 'Fila de cilindros que accionan los capachos, vista desde el lado operador.' },
      { id: 'cajas', x: 45, y: 55, label: 'Cajas de conexión', description: 'Cajas eléctricas que agrupan el cableado de sensores y electroválvulas de esta zona.' },
    ],
  },
]

const LIGHTBOX_PHOTOS = SECTIONS.map(s => `${ASSET_BASE}${s.file}`)

export function GraderVisualPilot() {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  return (
    <div style={{ marginTop: 44, paddingTop: 26, borderTop: '1px solid var(--dp-rule-hard)' }}>
      <span className="dp-lbl" style={{ display: 'block', marginBottom: 18 }}>Piloto — componentes del equipo</span>

      {SECTIONS.map((section, i) => (
        <div key={section.id} style={{ marginTop: i === 0 ? 0 : 34 }}>
          <div className="dp-objetivo">
            <span className="dp-lbl">{section.title}</span>
            <p>Toca cada número para ver la nota. Usa la lupa para ver la foto en grande, con zoom y paneo.</p>
          </div>
          <div style={{ position: 'relative' }}>
            <HotspotDiagram
              points={section.points}
              stageSvg={<img src={`${ASSET_BASE}${section.file}`} alt={section.title} />}
              aspectRatio={section.aspectRatio}
            />
            <button
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label={`Ver ${section.title} en grande`}
              style={{
                position: 'absolute', top: 10, right: 10, zIndex: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 999,
                background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff', cursor: 'pointer',
              }}
            >
              <ZoomIn size={17} />
            </button>
          </div>
        </div>
      ))}

      <div className="dp-objetivo" style={{ marginTop: 34 }}>
        <span className="dp-lbl">Autoevaluación</span>
        <p>Relaciona cada riesgo con su causa.</p>
      </div>
      <MatchingExercise pairs={PAIRS} />

      {lightboxIndex !== null && (
        <ImageLightbox
          photos={LIGHTBOX_PHOTOS}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}

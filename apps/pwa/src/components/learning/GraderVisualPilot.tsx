/**
 * GraderVisualPilot — piloto de los dos patrones nuevos (hotspots + relacionar),
 * en su propia pestaña "Componentes del equipo" del Grader, con contenido de
 * referencia escrito a mano (no viene de Firestore todavía). El fondo es una
 * foto real de la banda de clasificación (Orel la ubicó en OneDrive, ya
 * sincronizada desde Telegram) en
 * `public/learning-assets/grader/grader-cinta-capachos-sensor.jpg`.
 * Si el piloto se valida, el siguiente paso es mover este contenido a
 * `learningContent.ts` (tipos `HotspotDiagram` / `MatchingExercise`) para que
 * sea editable desde LearningAdminMachinePage, igual que el resto del manual.
 */
import { HotspotDiagram, type HotspotPoint } from './HotspotDiagram'
import { MatchingExercise, type MatchingPair } from './MatchingExercise'

const ASSET_BASE = `${import.meta.env.BASE_URL}learning-assets/grader/`
const STAGE_IMG = `${ASSET_BASE}grader-cinta-capachos-sensor.jpg`

const POINTS: HotspotPoint[] = [
  { id: 'fotocelula', x: 28, y: 22, label: 'Fotocélula de lectura', description: 'Detecta el producto antes de la zona de clasificación; en esta foto se alcanza a ver el sensor de lectura. Mantener el lente limpio; un lente sucio o desalineado hace que el flipper no dispare a tiempo.' },
  { id: 'cinta', x: 20, y: 68, label: 'Cinta transportadora', description: 'Traslada el producto ya pesado/medido hacia los capachos. Revisar guías laterales y tensión de banda en cada limpieza.' },
  { id: 'capacho', x: 72, y: 45, label: 'Capacho de clasificación', description: 'Accionado por cilindro neumático; vuelca el producto al canal según su categoría. Riesgo de atrapamiento entre el cilindro y el brazo — no acercar manos con el equipo en marcha.' },
]

const PAIRS: MatchingPair[] = [
  { id: 'atrapamiento', term: 'Atrapamiento', definition: 'Manos cerca del capacho mientras el cilindro neumático lo acciona' },
  { id: 'lectura', term: 'Falla de clasificación', definition: 'Fotocélula sucia o desalineada que no detecta el producto a tiempo' },
  { id: 'golpe', term: 'Golpe por impacto', definition: 'Brazo del capacho volcando producto mientras alguien limpia esa zona' },
]

type ComponentPhoto = {
  id: string
  file: string
  caption: string
}

const COMPONENT_PHOTOS: ComponentPhoto[] = [
  { id: 'receptor', file: 'grader-fotocelula-receptor.jpg', caption: 'Fotocélula — receptor' },
  { id: 'transmisor', file: 'grader-fotocelula-transmisor.jpg', caption: 'Fotocélula — transmisor' },
  { id: 'zeta-difusor', file: 'grader-cinta-zeta-difusor.jpg', caption: 'Cinta elevadora Zeta, configurada como difusora: usa un solo sensor y capta las paletas de la cinta' },
  { id: 'panoramica', file: 'grader-panoramica-general.jpg', caption: 'Vista panorámica de la máquina (no incluye la cinta larga del Grader)' },
  { id: 'pockets-zeta', file: 'grader-4-pockets-cinta-zeta.jpg', caption: 'Los 4 pockets y la cinta elevadora Zeta' },
  { id: 'motores', file: 'grader-motores-en-orden.jpg', caption: 'Motores de la Grader, en orden' },
  { id: 'sm206', file: 'grader-tarjeta-sm206.jpg', caption: 'Tarjeta SM206 — controla las celdas de pesaje' },
  { id: 'celda-pesaje', file: 'grader-celda-pesaje.jpg', caption: 'Celda de pesaje — cada pocket usa una' },
  { id: 'cilindros-operador', file: 'grader-cilindros-exteriores-operador.jpg', caption: 'Vista panorámica de los cilindros exteriores, lado operador' },
]

export function GraderVisualPilot() {
  return (
    <div style={{ marginTop: 44, paddingTop: 26, borderTop: '1px solid var(--dp-rule-hard)' }}>
      <span className="dp-lbl" style={{ display: 'block', marginBottom: 18 }}>Piloto — componentes del equipo</span>

      <div className="dp-objetivo">
        <span className="dp-lbl">Referencia</span>
        <p>Puntos de riesgo y control sobre la banda de clasificación. Toca cada número para ver la nota.</p>
      </div>
      <HotspotDiagram points={POINTS} stageSvg={<img src={STAGE_IMG} alt="Banda de clasificación del Grader con capachos neumáticos" />} height={340} />

      <div className="dp-objetivo" style={{ marginTop: 34 }}>
        <span className="dp-lbl">Autoevaluación</span>
        <p>Relaciona cada riesgo con su causa.</p>
      </div>
      <MatchingExercise pairs={PAIRS} />

      <div className="dp-objetivo" style={{ marginTop: 34 }}>
        <span className="dp-lbl">Galería de componentes</span>
        <p>Fotos reales de componentes del Grader para reconocerlos en terreno.</p>
      </div>
      <div className="dp-gallery">
        {COMPONENT_PHOTOS.map(photo => (
          <figure key={photo.id}>
            <img
              src={`${ASSET_BASE}${photo.file}`}
              alt={photo.caption}
              loading="lazy"
            />
            <figcaption>{photo.caption}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

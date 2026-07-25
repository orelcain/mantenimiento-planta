/**
 * GraderVisualPilot — piloto de los dos patrones nuevos (hotspots + relacionar),
 * en su propia pestaña "Componentes del equipo" del Grader, con contenido de
 * referencia escrito a mano (no viene de Firestore todavía). El fondo es una
 * foto real de la banda de clasificación (Orel la ubicó en OneDrive, ya
 * sincronizada desde Telegram) en
 * `public/learning-assets/grader/grader-cinta-capachos-clasificacion.jpg`.
 * Si el piloto se valida, el siguiente paso es mover este contenido a
 * `learningContent.ts` (tipos `HotspotDiagram` / `MatchingExercise`) para que
 * sea editable desde LearningAdminMachinePage, igual que el resto del manual.
 */
import { HotspotDiagram, type HotspotPoint } from './HotspotDiagram'
import { MatchingExercise, type MatchingPair } from './MatchingExercise'

const STAGE_IMG = `${import.meta.env.BASE_URL}learning-assets/grader/grader-cinta-capachos-clasificacion.jpg`

const POINTS: HotspotPoint[] = [
  { id: 'fotocelula', x: 22, y: 14, label: 'Fotocélula de lectura', description: 'Detecta el producto antes de la zona de clasificación. Mantener el lente limpio; un lente sucio o desalineado hace que el flipper no dispare a tiempo.' },
  { id: 'cinta', x: 20, y: 68, label: 'Cinta transportadora', description: 'Traslada el producto ya pesado/medido hacia los capachos. Revisar guías laterales y tensión de banda en cada limpieza.' },
  { id: 'capacho', x: 72, y: 45, label: 'Capacho de clasificación', description: 'Accionado por cilindro neumático; vuelca el producto al canal según su categoría. Riesgo de atrapamiento entre el cilindro y el brazo — no acercar manos con el equipo en marcha.' },
]

const PAIRS: MatchingPair[] = [
  { id: 'atrapamiento', term: 'Atrapamiento', definition: 'Manos cerca del capacho mientras el cilindro neumático lo acciona' },
  { id: 'lectura', term: 'Falla de clasificación', definition: 'Fotocélula sucia o desalineada que no detecta el producto a tiempo' },
  { id: 'golpe', term: 'Golpe por impacto', definition: 'Brazo del capacho volcando producto mientras alguien limpia esa zona' },
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
    </div>
  )
}

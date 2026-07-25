/**
 * GraderVisualPilot — piloto de los dos patrones nuevos (hotspots + relacionar),
 * en su propia pestaña "Componentes del equipo" del Grader, con contenido de
 * referencia escrito a mano (no viene de Firestore todavía) y una ilustración
 * plana en vez de una foto real — pendiente encontrar/tomar una foto general
 * del equipo apta como fondo del diagrama (las fotos de OneDrive son de
 * repuestos en bodega o detalles muy cerrados, no sirven para esto). Si el
 * piloto se valida, el siguiente paso es mover este contenido a
 * `learningContent.ts` (tipos `HotspotDiagram` / `MatchingExercise`) para que
 * sea editable desde LearningAdminMachinePage, igual que el resto del manual.
 */
import { HotspotDiagram, type HotspotPoint } from './HotspotDiagram'
import { MatchingExercise, type MatchingPair } from './MatchingExercise'

const POINTS: HotspotPoint[] = [
  { id: 'cadena', x: 15, y: 62, label: 'Cadena de arrastre', description: 'Riesgo de atrapamiento. Bloquear y etiquetar (LOTO) antes de despejar un atasco.' },
  { id: 'hmi', x: 50, y: 20, label: 'Panel HMI', description: 'Control digital del ciclo. Solo personal autorizado modifica parámetros de calibración.' },
  { id: 'sensor', x: 85, y: 62, label: 'Sensor de peso', description: 'Celda de carga bajo la banda. Calibración periódica; evitar golpes o sobrecarga.' },
]

const PAIRS: MatchingPair[] = [
  { id: 'atrapamiento', term: 'Atrapamiento', definition: 'Manos cerca de la cadena de arrastre sin bloqueo del equipo' },
  { id: 'golpe', term: 'Golpe por impacto', definition: 'Producto en movimiento sobre las celdas de carga durante la calibración' },
  { id: 'caida', term: 'Caída de objetos', definition: 'Cajas clasificadas acumuladas en la zona de descarga' },
]

function StageIllustration() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 300 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
      <rect x="20" y="55" width="260" height="8" fill="var(--dp-rule-hard)" />
      <rect x="120" y="14" width="60" height="26" fill="none" stroke="var(--dp-rule-hard)" strokeWidth="1.5" />
    </svg>
  )
}

export function GraderVisualPilot() {
  return (
    <div style={{ marginTop: 44, paddingTop: 26, borderTop: '1px solid var(--dp-rule-hard)' }}>
      <span className="dp-lbl" style={{ display: 'block', marginBottom: 18 }}>Piloto — componentes del equipo</span>

      <div className="dp-objetivo">
        <span className="dp-lbl">Referencia</span>
        <p>Puntos de riesgo y control sobre la banda transportadora. Toca cada número para ver la nota.</p>
      </div>
      <HotspotDiagram points={POINTS} stageSvg={<StageIllustration />} height={340} />

      <div className="dp-objetivo" style={{ marginTop: 34 }}>
        <span className="dp-lbl">Autoevaluación</span>
        <p>Relaciona cada riesgo con su causa.</p>
      </div>
      <MatchingExercise pairs={PAIRS} />
    </div>
  )
}

/**
 * GraderVisualPilot — pestaña "Componentes del equipo" del Grader: fotos reales
 * con puntos numerados (hotspots) editables desde el admin (Componentes del
 * equipo, dentro de LearningAdminMachinePage). El contenido vive en Firestore
 * (`learningContent/{slug}/components/{id}`, ver `services/learningContent.ts`)
 * — este componente solo lee y renderiza, ya no tiene datos hardcodeados.
 */
import { useEffect, useState } from 'react'
import { Loader2, ZoomIn } from 'lucide-react'
import { HotspotDiagram } from './HotspotDiagram'
import { MatchingExercise, type MatchingPair } from './MatchingExercise'
import { ImageLightbox } from '../ui/ImageLightbox'
import { listComponentPhotos, type ComponentPhoto } from '@/services/learningContent'

const PAIRS: MatchingPair[] = [
  { id: 'atrapamiento', term: 'Atrapamiento', definition: 'Manos cerca del capacho mientras el cilindro neumático lo acciona' },
  { id: 'lectura', term: 'Falla de clasificación', definition: 'Fotocélula sucia o desalineada que no detecta el producto a tiempo' },
  { id: 'golpe', term: 'Golpe por impacto', definition: 'Brazo del capacho volcando producto mientras alguien limpia esa zona' },
]

function assetUrl(machineSlug: string, file: string) {
  return `${import.meta.env.BASE_URL}learning-assets/${machineSlug}/${file}`
}

export function GraderVisualPilot({ machineSlug = 'grader' }: { machineSlug?: string }) {
  const [photos, setPhotos] = useState<ComponentPhoto[] | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    listComponentPhotos(machineSlug).then(list => {
      if (!cancelled) setPhotos(list)
    })
    return () => { cancelled = true }
  }, [machineSlug])

  if (photos === null) {
    return (
      <div style={{ marginTop: 44, paddingTop: 26, borderTop: '1px solid var(--dp-rule-hard)', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--dp-ink-soft)' }}>
        <Loader2 size={16} className="animate-spin" />
        Cargando componentes…
      </div>
    )
  }

  const lightboxPhotos = photos.map(p => assetUrl(machineSlug, p.file))

  return (
    <div style={{ marginTop: 44, paddingTop: 26, borderTop: '1px solid var(--dp-rule-hard)' }}>
      <span className="dp-lbl" style={{ display: 'block', marginBottom: 18 }}>Piloto — componentes del equipo</span>

      {photos.length === 0 && (
        <p className="dp-ink-soft" style={{ fontSize: 13.5 }}>Aún no hay fotos cargadas para esta máquina.</p>
      )}

      {photos.map((section, i) => (
        <div key={section.id} style={{ marginTop: i === 0 ? 0 : 34 }}>
          <div className="dp-objetivo">
            <span className="dp-lbl">{section.title}</span>
            <p>Toca cada número para ver la nota. Usa la lupa para ver la foto en grande, con zoom y paneo.</p>
          </div>
          <div className="dp-hotspot" data-photo style={{ position: 'relative' }}>
            <HotspotDiagram
              points={section.points}
              stageSvg={<img src={assetUrl(machineSlug, section.file)} alt={section.title} />}
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
          photos={lightboxPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}

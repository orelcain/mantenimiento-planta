import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { SegmentedControl } from '@/components/piel'
import { JackKnifeCard } from '@/components/grader/JackKnifeCard'
import { LECTURA_NOTA } from '@/components/piel/Lectura'
import { usePielApple } from '@/hooks/usePielApple'

export default function JackKnifePage() {
  const location = useLocation()
  const inicial = location.hash.startsWith('#jk=') ? new URLSearchParams(location.hash.slice(4)).get('pl') : null
  const [planta, setPlanta] = useState(inicial === 'yal' ? 'yal' : 'chonchi')
  const apple = usePielApple()
  if (apple) {
    const opcion = (valor: string, texto: string) => (
      <button type="button" aria-pressed={planta === valor} onClick={() => setPlanta(valor)}
        className={`min-h-11 lg:min-h-8 border-b-2 pb-1 text-[length:calc(13px*var(--escala-texto,1))] ${planta === valor ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground'}`}>
        {texto}
      </button>
    )
    return <main className="w-full min-w-0 space-y-4 px-0 py-4 sm:p-4 lg:p-5">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1">
        <p className={LECTURA_NOTA}>Jack-Knife de Mantención</p>
        <div role="group" aria-label="Planta" className="flex gap-4">{opcion('chonchi', 'Chonchi')}{opcion('yal', 'Yal')}</div>
      </header>
      <JackKnifeCard key={planta} plantSlug={planta} />
    </main>
  }
  return <main className="w-full min-w-0 space-y-6 px-0 py-4 sm:p-4 lg:p-5">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-display font-bold text-foreground">Jack-Knife de Mantención</h1>
      <SegmentedControl className="sm:w-auto sm:min-w-[240px]" ariaLabel="Planta" value={planta} onChange={setPlanta} segments={[{ value: 'chonchi', label: 'Chonchi' }, { value: 'yal', label: 'Yal' }]} />
    </header>
    <JackKnifeCard key={planta} plantSlug={planta} />
  </main>
}

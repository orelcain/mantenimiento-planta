import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { SegmentedControl } from '@/components/piel'
import { JackKnifeCard } from '@/components/grader/JackKnifeCard'

export default function JackKnifePage() {
  const location = useLocation()
  const inicial = location.hash.startsWith('#jk=') ? new URLSearchParams(location.hash.slice(4)).get('pl') : null
  const [planta, setPlanta] = useState(inicial === 'yal' ? 'yal' : 'chonchi')
  return <main className="w-full min-w-0 space-y-6 px-0 py-4 sm:p-4 lg:p-5">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-display font-bold text-foreground">Jack-Knife de Mantención</h1>
      <SegmentedControl className="sm:w-auto sm:min-w-[240px]" ariaLabel="Planta" value={planta} onChange={setPlanta} segments={[{ value: 'chonchi', label: 'Chonchi' }, { value: 'yal', label: 'Yal' }]} />
    </header>
    <JackKnifeCard key={planta} plantSlug={planta} />
  </main>
}

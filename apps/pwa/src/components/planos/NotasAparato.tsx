import { useRef, useState } from 'react'
import { Camera, Loader2, Pencil, Trash2, X } from 'lucide-react'
import type { PlanoNota } from '@/hooks/usePlanoNotas'
import { auth } from '@/services/firebase'

type Props = {
  anclaId: string
  notas: PlanoNota[]
  onCrear: (n: { texto: string; codigoSAP?: string; archivos?: File[] }) => Promise<void>
  onBorrar: (n: PlanoNota) => Promise<void>
  onEditar: (id: string, texto: string) => Promise<void>
}

/**
 * Notas y fotos colgadas de un aparato del plano.
 *
 * El sentido es didáctico: que al tocar F24 en el dibujo salga la foto del
 * automático real en el tablero, y su código SAP para pedirlo sin buscarlo.
 */
export function NotasAparato({ anclaId, notas, onCrear, onBorrar, onEditar }: Props) {
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null)
  const [texto, setTexto] = useState('')
  const [sap, setSap] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const uid = auth.currentUser?.uid

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await onCrear({ texto, codigoSAP: sap.trim() || undefined, archivos })
      setTexto('')
      setSap('')
      setArchivos([])
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la nota.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {notas.map((n) => (
        <article key={n.id} className="rounded-lg border p-3"
                 style={{ background: 'var(--lc-surface)', borderColor: 'var(--lc-border)' }}>
          {editando?.id === n.id ? (
            <div className="flex flex-col gap-1.5">
              <textarea value={editando.texto} rows={3} maxLength={1500} autoFocus
                        onChange={(e) => setEditando({ id: n.id, texto: e.target.value })}
                        className="w-full resize-y rounded border bg-transparent p-2 text-[13px] outline-none"
                        style={{ color: 'var(--lc-ink)', borderColor: 'var(--lc-border)' }} />
              <div className="flex gap-2">
                <button type="button"
                        onClick={() => { void onEditar(n.id, editando.texto).then(() => setEditando(null)) }}
                        className="rounded px-2.5 py-1 text-[11.5px] font-medium"
                        style={{ background: 'var(--lc-aqua)', color: '#fff' }}>
                  Guardar
                </button>
                <button type="button" onClick={() => setEditando(null)}
                        className="rounded border px-2.5 py-1 text-[11.5px]"
                        style={{ borderColor: 'var(--lc-border)', color: 'var(--lc-ink-mid)' }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p className="m-0 whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: 'var(--lc-ink)' }}>
              {n.texto}
            </p>
          )}

          {!!n.fotos?.length && (
            <div className="mt-2 flex flex-wrap gap-2">
              {n.fotos.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt={`Foto de ${anclaId}`} loading="lazy"
                       className="h-20 w-20 rounded object-cover" />
                </a>
              ))}
            </div>
          )}

          <footer className="mt-2 flex items-center justify-between gap-2">
            <span className="font-mono text-[10.5px]" style={{ color: 'var(--lc-ink-ghost)' }}>
              {n.autorNombre ?? 'Anónimo'}
              {n.codigoSAP ? ` · SAP ${n.codigoSAP}` : ''}
            </span>
            {n.creadoPor === uid && (
              <span className="flex gap-0.5">
                <button type="button" onClick={() => setEditando({ id: n.id, texto: n.texto })}
                        title="Editar nota" className="rounded p-1 hover:opacity-70"
                        style={{ color: 'var(--lc-ink-mid)' }}>
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => void onBorrar(n)} title="Borrar nota"
                        className="rounded p-1 hover:opacity-70" style={{ color: 'var(--lc-danger)' }}>
                  <Trash2 size={13} />
                </button>
              </span>
            )}
          </footer>
        </article>
      ))}

      {uid ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3"
             style={{ background: 'var(--lc-bg-panel)', borderColor: 'var(--lc-border)' }}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            maxLength={1500}
            placeholder={`Qué conviene saber de ${anclaId}: dónde está, qué protege, qué pasó la última vez…`}
            className="w-full resize-y rounded border bg-transparent p-2 text-[13px] outline-none"
            style={{ color: 'var(--lc-ink)', borderColor: 'var(--lc-border)' }}
          />
          <input
            value={sap}
            onChange={(e) => setSap(e.target.value)}
            placeholder="Código SAP (opcional)"
            className="w-full rounded border bg-transparent px-2 py-1.5 font-mono text-[12px] outline-none"
            style={{ color: 'var(--lc-ink)', borderColor: 'var(--lc-border)' }}
          />

          {!!archivos.length && (
            <p className="m-0 text-[11px]" style={{ color: 'var(--lc-ink-mid)' }}>
              {archivos.length} foto{archivos.length !== 1 ? 's' : ''} lista
              {archivos.length !== 1 ? 's' : ''} para subir
              <button type="button" onClick={() => setArchivos([])} className="ml-2 align-middle">
                <X size={12} />
              </button>
            </p>
          )}

          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" hidden
                   onChange={(e) => setArchivos(Array.from(e.target.files ?? []).slice(0, 6))} />
            <button type="button" onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[12px]"
                    style={{ color: 'var(--lc-ink-mid)', borderColor: 'var(--lc-border)' }}>
              <Camera size={13} /> Foto
            </button>
            <button type="button" onClick={() => void guardar()} disabled={guardando || !texto.trim()}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium disabled:opacity-40"
                    style={{ background: 'var(--lc-aqua)', color: '#fff' }}>
              {guardando && <Loader2 size={13} className="animate-spin" />} Guardar nota
            </button>
          </div>

          {error && (
            <p className="m-0 text-[11.5px]" style={{ color: 'var(--lc-danger)' }}>{error}</p>
          )}
        </div>
      ) : (
        <p className="m-0 text-[11.5px]" style={{ color: 'var(--lc-ink-ghost)' }}>
          Inicia sesión para dejar una nota o subir una foto de este aparato.
        </p>
      )}
    </div>
  )
}

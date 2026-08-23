import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query,
  serverTimestamp, updateDoc, where, type Timestamp,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage, auth } from '@/services/firebase'
import { generateId } from '@/lib/utils'

export type PlanoNota = {
  id: string
  planoSlug: string
  /** Se ancla al APARATO, no a un punto del dibujo: el mismo aparato sale en
   *  varias hojas y la foto del automático real sirve en todas. */
  ancla: 'aparato' | 'hoja'
  anclaId: string
  texto: string
  fotos: string[]
  /** Gancho al maestro de repuestos, para cruzar con bodega. */
  codigoSAP?: string
  creadoPor: string
  autorNombre?: string
  createdAt?: Timestamp
}

const COL = 'planoNotas'
const MAX_FOTO_BYTES = 5 * 1024 * 1024 // igual que planosAguas en storage.rules

/**
 * Notas y fotos que la gente cuelga sobre el plano.
 *
 * Se suscribe a TODAS las notas del plano de una vez (son pocas y chicas) y las
 * agrupa por ancla en memoria: así al tocar un aparato el panel abre sin
 * esperar otra consulta, y el contador de notas se puede pintar sobre el dibujo.
 */
export function usePlanoNotas(planoSlug: string | undefined) {
  const [notas, setNotas] = useState<PlanoNota[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!planoSlug) return
    setCargando(true)
    // Sin orderBy: where + orderBy exige un indice compuesto que no existe y
    // las notas fallaban CON sesion iniciada ("failed-precondition"). Son
    // pocas notas por plano: se ordenan en memoria.
    const q = query(collection(db, COL), where('planoSlug', '==', planoSlug))
    const off = onSnapshot(
      q,
      (snap) => {
        const filas = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlanoNota)
        // mas nuevas primero; las recien creadas (serverTimestamp pendiente) arriba
        filas.sort((a, b) => (b.createdAt?.toMillis?.() ?? Infinity) - (a.createdAt?.toMillis?.() ?? Infinity))
        setNotas(filas)
        setError(null)
        setCargando(false)
      },
      (e) => {
        // Sin sesión (el visor se abre por QR desde el tablero) las reglas
        // niegan la lectura y eso es lo ESPERADO: no es un error que mostrar
        // en rojo, el panel ya invita a iniciar sesión. Se avisa solo cuando
        // hay sesión — ahí sí significa reglas sin desplegar o un problema
        // real. El caso original que motivó el mensaje (reglas no publicadas)
        // sigue cubierto.
        const anonimo = !auth.currentUser
        setError(
          e.code === 'permission-denied'
            ? (anonimo ? null : 'No tienes permiso para ver las notas, o las reglas de Firestore aún no están desplegadas.')
            : 'No se pudieron cargar las notas.',
        )
        setCargando(false)
      },
    )
    return off
  }, [planoSlug])

  const porAncla = useMemo(() => {
    const m = new Map<string, PlanoNota[]>()
    notas.forEach((n) => {
      const k = `${n.ancla}:${n.anclaId}`
      m.set(k, [...(m.get(k) ?? []), n])
    })
    return m
  }, [notas])

  const notasDe = useCallback(
    (ancla: PlanoNota['ancla'], anclaId: string) => porAncla.get(`${ancla}:${anclaId}`) ?? [],
    [porAncla],
  )

  const subirFotos = useCallback(
    async (archivos: File[]) => {
      const urls: string[] = []
      for (const f of archivos) {
        if (!f.type.startsWith('image/')) throw new Error(`"${f.name}" no es una imagen.`)
        if (f.size > MAX_FOTO_BYTES) throw new Error(`"${f.name}" pesa más de 5 MB.`)
        const r = storageRef(storage, `planosElectricos/${planoSlug}/${generateId()}`)
        await uploadBytes(r, f, { contentType: f.type })
        urls.push(await getDownloadURL(r))
      }
      return urls
    },
    [planoSlug],
  )

  const crear = useCallback(
    async (n: { ancla: PlanoNota['ancla']; anclaId: string; texto: string; codigoSAP?: string; archivos?: File[] }) => {
      const u = auth.currentUser
      if (!u) throw new Error('Hay que iniciar sesión para dejar una nota.')
      const texto = n.texto.trim()
      if (!texto) throw new Error('La nota no puede ir vacía.')
      const fotos = n.archivos?.length ? await subirFotos(n.archivos) : []
      await addDoc(collection(db, COL), {
        plantId: 'chonchi',
        planoSlug,
        ancla: n.ancla,
        anclaId: n.anclaId,
        texto,
        fotos,
        ...(n.codigoSAP ? { codigoSAP: n.codigoSAP } : {}),
        creadoPor: u.uid,
        autorNombre: u.displayName ?? u.email ?? 'Sin nombre',
        createdAt: serverTimestamp(),
      })
    },
    [planoSlug, subirFotos],
  )

  const editar = useCallback(async (id: string, texto: string) => {
    const t = texto.trim()
    if (!t) throw new Error('La nota no puede quedar vacía.')
    await updateDoc(doc(db, COL, id), { texto: t, updatedAt: serverTimestamp() })
  }, [])

  const borrar = useCallback(async (nota: PlanoNota) => {
    await deleteDoc(doc(db, COL, nota.id))
    // Las fotos se borran después del doc: si falla, queda un huérfano en
    // Storage pero la nota ya no se ve, que es lo que el usuario pidió.
    await Promise.all(
      (nota.fotos ?? []).map(async (url) => {
        try {
          await deleteObject(storageRef(storage, url))
        } catch {
          /* la foto ya no estaba */
        }
      }),
    )
  }, [])

  return { notas, notasDe, crear, editar, borrar, cargando, error }
}

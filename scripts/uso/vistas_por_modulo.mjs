// Uso: node scripts/uso/vistas_por_modulo.mjs [--desde YYYY-MM-DD] [--hasta YYYY-MM-DD]
// Por defecto: los últimos 14 días (hora de Chile). SOLO LECTURA: no escribe nada.
// Lee `moduloVistas/{dia}` (contador de la PWA) y arma una fila por módulo:
// vistas (= usuarios-día: la regla deja 1 por usuario, módulo y día), usuarios únicos distintos en el rango,
// % claro, % celular y días con uso.
// Necesita serviceAccountKey.json en la raíz del repo (gitignored).
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const admin = require('firebase-admin')
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })
const diaChile = (d) => FORMATO_DIA.format(d)

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const FORMA = /^\d{4}-\d{2}-\d{2}$/
const hasta = arg('hasta') ?? diaChile(new Date())
const desde = arg('desde') ?? diaChile(new Date(Date.now() - 13 * 86_400_000))
if (!FORMA.test(desde) || !FORMA.test(hasta) || desde > hasta) {
  console.error('Rango inválido. Usa --desde YYYY-MM-DD --hasta YYYY-MM-DD (desde <= hasta).')
  process.exit(2)
}

admin.initializeApp({ credential: admin.credential.cert(require(resolve(RAIZ, 'serviceAccountKey.json'))) })
const db = admin.firestore()

const snap = await db
  .collection('moduloVistas')
  .where(admin.firestore.FieldPath.documentId(), '>=', desde)
  .where(admin.firestore.FieldPath.documentId(), '<=', hasta)
  .get()

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const porModulo = new Map()
for (const d of snap.docs) {
  for (const [modulo, v] of Object.entries(d.data())) {
    if (modulo === 'ultimo' || !v || typeof v !== 'object') continue
    const f = porModulo.get(modulo) ?? { vistas: 0, claro: 0, cel: 0, dias: new Set(), usuarios: new Set() }
    f.vistas += num(v.vistas)
    f.claro += num(v.claro)
    f.cel += num(v.cel)
    f.dias.add(d.id)
    for (const h of Object.keys(v.u ?? {})) f.usuarios.add(h)
    porModulo.set(modulo, f)
  }
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-')
const filas = [...porModulo.entries()]
  .sort((a, b) => b[1].vistas - a[1].vistas)
  .map(([modulo, f]) => ({
    modulo,
    'vistas (usuario-día)': f.vistas,
    'usuarios únicos': f.usuarios.size,
    'claro': pct(f.claro, f.vistas),
    'celular': pct(f.cel, f.vistas),
    dias: f.dias.size,
  }))

console.log(`moduloVistas ${desde} .. ${hasta}  (${snap.size} días con datos de ${diasEntre(desde, hasta)})`)
if (filas.length) console.table(filas)
else console.log('Sin datos en el rango.')
console.log('Nota: "vistas" = usuarios-día por módulo (máx. 1 por usuario, módulo y día, garantizado por las reglas), no pantallazos.')
console.log('      "usuarios únicos" = hashes distintos en todo el rango; por día coincide con las vistas.')

function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1
}
process.exit(0)

import fs from 'fs'
import path from 'path'

type MdNode = {
  codigo: string
  denominacion: string
  padre: string | null
  line: number
}

type ExpectedNode = {
  codigo: string
  denominacion: string
  padre: string | null
}

type DiffReport = {
  md: {
    path: string
    total: number
  }
  expected: {
    path: string
    total: number
  }
  onlyInMd: Array<{ codigo: string; denominacion: string; padre: string | null; line: number }>
  onlyInExpected: Array<{ codigo: string; denominacion: string; padre: string | null }>
  mismatched: Array<{
    codigo: string
    md: { denominacion: string; padre: string | null; line: number }
    expected: { denominacion: string; padre: string | null }
  }>
}

const DEFAULT_MD_PATH = path.resolve(__dirname, 'jerarquia_datos.md')
const DEFAULT_EXPECTED_PATH = path.resolve(__dirname, 'EXPECTED_CANONICAL.json')

function parseArgs(argv: string[]) {
  const mdIdx = argv.indexOf('--md')
  const expectedIdx = argv.indexOf('--expected')
  const outIdx = argv.indexOf('--out')

  const mdPath = mdIdx >= 0 ? argv[mdIdx + 1] : DEFAULT_MD_PATH
  const expectedPath = expectedIdx >= 0 ? argv[expectedIdx + 1] : DEFAULT_EXPECTED_PATH
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : ''

  return {
    mdPath: path.resolve(process.cwd(), mdPath),
    expectedPath: path.resolve(process.cwd(), expectedPath),
    outPath: outPath ? path.resolve(process.cwd(), outPath) : '',
  }
}

function normalizeCodigo(codigo: string) {
  return codigo.trim()
}

function normalizeDenominacion(nombre: string) {
  return nombre.replace(/\s+/g, ' ').trim()
}

function parseMdHierarchy(mdRaw: string): MdNode[] {
  const nodes: MdNode[] = []
  const lines = mdRaw.split(/\r?\n/)

  // Stack de códigos por nivel de indentación
  // key: indentLevel (0,1,2...), value: last codigo at that level
  const stack: Array<{ indent: number; codigo: string }> = []

  // Acepta formatos como:
  // - **AQ-IN-CHO** (CHONCHI)
  // - **720004340** (SISTEMA BOMBEO...)
  const bulletRe = /^\s*-\s*\*\*(.+?)\*\*\s*(?:\((.+?)\))?\s*$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(bulletRe)
    if (!match) continue

    const leadingSpaces = (line.match(/^\s*/) ?? [''])[0].length
    // El MD suele usar 2-4 espacios por nivel. Usamos “bloques” de 2 espacios para ser tolerantes.
    const indent = Math.floor(leadingSpaces / 2)

    const codigo = normalizeCodigo(match[1] ?? '')
    if (!codigo) continue

    const denominacion = normalizeDenominacion(match[2] ?? '')

    // Ajustar stack al nivel actual
    while (stack.length && stack[stack.length - 1]!.indent >= indent) {
      stack.pop()
    }

    const padre = stack.length ? stack[stack.length - 1]!.codigo : null

    nodes.push({ codigo, denominacion, padre, line: i + 1 })
    stack.push({ indent, codigo })
  }

  return nodes
}

function loadExpected(expectedPath: string): Map<string, ExpectedNode> {
  const raw = fs.readFileSync(expectedPath, 'utf8')
  const parsed = JSON.parse(raw) as any

  const byCode = new Map<string, ExpectedNode>()

  const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : []
  for (const n of nodes) {
    const codigo = normalizeCodigo(String(n.codigo ?? ''))
    if (!codigo) continue

    const denominacion = normalizeDenominacion(String(n.denominacion ?? ''))
    const padre = n.padre ? normalizeCodigo(String(n.padre)) : null

    byCode.set(codigo, { codigo, denominacion, padre })
  }

  return byCode
}

function main() {
  const { mdPath, expectedPath, outPath } = parseArgs(process.argv.slice(2))

  if (!fs.existsSync(mdPath)) {
    console.error(`[compare_manus_md] No existe el MD: ${mdPath}`)
    console.error('Sugerencia: copia tu archivo a data/jerarquia/jerarquia_datos.md o pasa --md <ruta>')
    process.exit(1)
  }

  if (!fs.existsSync(expectedPath)) {
    console.error(`[compare_manus_md] No existe EXPECTED: ${expectedPath}`)
    process.exit(1)
  }

  const mdRaw = fs.readFileSync(mdPath, 'utf8')
  const mdNodes = parseMdHierarchy(mdRaw)

  const expectedByCode = loadExpected(expectedPath)

  const mdByCode = new Map<string, MdNode>()
  for (const n of mdNodes) {
    // Si un código aparece repetido en MD, nos quedamos con el último (más abajo suele ser más específico)
    mdByCode.set(n.codigo, n)
  }

  const onlyInMd: DiffReport['onlyInMd'] = []
  const onlyInExpected: DiffReport['onlyInExpected'] = []
  const mismatched: DiffReport['mismatched'] = []

  for (const [codigo, mdNode] of mdByCode.entries()) {
    const exp = expectedByCode.get(codigo)
    if (!exp) {
      onlyInMd.push({ codigo, denominacion: mdNode.denominacion, padre: mdNode.padre, line: mdNode.line })
      continue
    }

    const denomDiff = normalizeDenominacion(mdNode.denominacion) !== normalizeDenominacion(exp.denominacion)
    const padreDiff = (mdNode.padre ?? null) !== (exp.padre ?? null)
    if (denomDiff || padreDiff) {
      mismatched.push({
        codigo,
        md: { denominacion: mdNode.denominacion, padre: mdNode.padre, line: mdNode.line },
        expected: { denominacion: exp.denominacion, padre: exp.padre },
      })
    }
  }

  for (const [codigo, exp] of expectedByCode.entries()) {
    if (!mdByCode.has(codigo)) {
      onlyInExpected.push({ codigo, denominacion: exp.denominacion, padre: exp.padre })
    }
  }

  onlyInMd.sort((a, b) => a.codigo.localeCompare(b.codigo))
  onlyInExpected.sort((a, b) => a.codigo.localeCompare(b.codigo))
  mismatched.sort((a, b) => a.codigo.localeCompare(b.codigo))

  const report: DiffReport = {
    md: { path: mdPath, total: mdByCode.size },
    expected: { path: expectedPath, total: expectedByCode.size },
    onlyInMd,
    onlyInExpected,
    mismatched,
  }

  console.log('=== compare_manus_md ===')
  console.log(`MD: ${report.md.total} códigos (de ${report.md.path})`)
  console.log(`EXPECTED: ${report.expected.total} códigos (de ${report.expected.path})`)
  console.log(`Solo en MD: ${report.onlyInMd.length}`)
  console.log(`Solo en EXPECTED: ${report.onlyInExpected.length}`)
  console.log(`Diferencias (nombre/padre): ${report.mismatched.length}`)

  const sample = <T>(arr: T[], n = 15) => arr.slice(0, n)

  if (report.onlyInMd.length) {
    console.log('\n--- Solo en MD (muestra) ---')
    for (const x of sample(report.onlyInMd)) {
      console.log(`${x.codigo} (padre=${x.padre ?? 'null'}) [L${x.line}] :: ${x.denominacion}`)
    }
  }

  if (report.mismatched.length) {
    console.log('\n--- Diferencias (muestra) ---')
    for (const x of sample(report.mismatched)) {
      console.log(`${x.codigo} [L${x.md.line}]`) 
      console.log(`  MD:       padre=${x.md.padre ?? 'null'} :: ${x.md.denominacion}`)
      console.log(`  EXPECTED: padre=${x.expected.padre ?? 'null'} :: ${x.expected.denominacion}`)
    }
  }

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`\nReporte escrito en: ${outPath}`)
  }
}

main()

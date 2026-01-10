import fs from 'fs'
import path from 'path'

type MdNode = {
  codigo: string
  denominacion: string
  padre: string | null
  line: number
}

type ExpectedFile = {
  generatedAt?: string
  codigo_unicos?: number
  nodes: Array<{ codigo: string; denominacion: string; padre: string | null }>
}

const DEFAULT_MD = path.resolve(__dirname, 'jerarquia_completa.md')
const DEFAULT_EXPECTED = path.resolve(__dirname, 'EXPECTED_CANONICAL.json')
const DEFAULT_OUT = path.resolve(__dirname, 'EXPECTED_CANONICAL_EXTENDED.json')

// Alias conocidos desde extracciones previas
const CODE_ALIASES: Record<string, string> = {
  'AQ-IN-CHO-PCHO-EXTE-SCHO': 'AQ-IN-CHO-PCHO-EXTE-SCBO',
  'AQ-IN-CHO-PCHO-EXTE-SDMA': 'AQ-IN-CHO-PCHO-EXTE-SMAQ',
  'AQ-IN-CHO-PCHO-EXTE-TMAT': 'AQ-IN-CHO-PCHO-EXTE-TMAN',
}

function parseArgs(argv: string[]) {
  const mdIdx = argv.indexOf('--md')
  const expectedIdx = argv.indexOf('--expected')
  const outIdx = argv.indexOf('--out')

  const mdPath = mdIdx >= 0 ? argv[mdIdx + 1] : DEFAULT_MD
  const expectedPath = expectedIdx >= 0 ? argv[expectedIdx + 1] : DEFAULT_EXPECTED
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : DEFAULT_OUT

  return {
    mdPath: path.resolve(process.cwd(), mdPath),
    expectedPath: path.resolve(process.cwd(), expectedPath),
    outPath: path.resolve(process.cwd(), outPath),
  }
}

function normCodigo(v: string) {
  const trimmed = v.trim()
  return CODE_ALIASES[trimmed] ?? trimmed
}

function normNombre(v: string) {
  return String(v ?? '').replace(/\s+/g, ' ').trim()
}

function parseMd(mdRaw: string): MdNode[] {
  const nodes: MdNode[] = []
  const lines = mdRaw.split(/\r?\n/)
  const stack: Array<{ indent: number; codigo: string }> = []

  const bulletRe = /^\s*-\s*\*\*(.+?)\*\*\s*(?:\((.+?)\))?\s*$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(bulletRe)
    if (!match) continue

    const leadingSpaces = (line.match(/^\s*/) ?? [''])[0].length
    const indent = Math.floor(leadingSpaces / 2)

    const codigoRaw = String(match[1] ?? '').trim()
    if (!codigoRaw) continue

    const codigo = normCodigo(codigoRaw)
    const denominacion = normNombre(match[2] ?? '')

    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop()
    const padreRaw = stack.length ? stack[stack.length - 1]!.codigo : null
    const padre = padreRaw ? normCodigo(padreRaw) : null

    nodes.push({ codigo, denominacion, padre, line: i + 1 })
    stack.push({ indent, codigo })
  }

  return nodes
}

function loadExpected(expectedPath: string): Map<string, { codigo: string; denominacion: string; padre: string | null }> {
  const raw = fs.readFileSync(expectedPath, 'utf8')
  const parsed = JSON.parse(raw) as ExpectedFile

  const map = new Map<string, { codigo: string; denominacion: string; padre: string | null }>()
  for (const n of parsed.nodes ?? []) {
    const codigo = String(n.codigo ?? '').trim()
    if (!codigo) continue
    map.set(codigo, {
      codigo,
      denominacion: normNombre(n.denominacion ?? ''),
      padre: n.padre ? String(n.padre).trim() : null,
    })
  }
  return map
}

function main() {
  const { mdPath, expectedPath, outPath } = parseArgs(process.argv.slice(2))

  if (!fs.existsSync(mdPath)) {
    console.error(`[merge_md_into_expected] No existe MD: ${mdPath}`)
    process.exit(1)
  }
  if (!fs.existsSync(expectedPath)) {
    console.error(`[merge_md_into_expected] No existe EXPECTED: ${expectedPath}`)
    process.exit(1)
  }

  const expected = loadExpected(expectedPath)

  const mdRaw = fs.readFileSync(mdPath, 'utf8')
  const mdNodes = parseMd(mdRaw)

  // Consolidar MD por código (último gana)
  const mdByCode = new Map<string, MdNode>()
  for (const n of mdNodes) mdByCode.set(n.codigo, n)

  let added = 0
  const unresolvedParents: Array<{ codigo: string; padre: string; line: number }> = []

  // Primero, agregar nodos que no existan en expected
  for (const [codigo, n] of mdByCode.entries()) {
    if (expected.has(codigo)) continue

    const padre = n.padre ?? null
    expected.set(codigo, {
      codigo,
      denominacion: normNombre(n.denominacion),
      padre,
    })
    added++
  }

  // Validar padres (post-merge): padre debe existir o ser null
  for (const [codigo, n] of expected.entries()) {
    const padre = n.padre
    if (padre && !expected.has(padre)) {
      unresolvedParents.push({ codigo, padre, line: mdByCode.get(codigo)?.line ?? 0 })
    }
  }

  // Si hay padres no resueltos, no abortamos: solo reportamos
  if (unresolvedParents.length) {
    unresolvedParents.sort((a, b) => a.codigo.localeCompare(b.codigo))
    console.warn(`[merge_md_into_expected] Advertencia: ${unresolvedParents.length} nodos con padre no encontrado (muestra 20):`)
    for (const x of unresolvedParents.slice(0, 20)) {
      console.warn(`- ${x.codigo} -> padre=${x.padre}${x.line ? ` (MD L${x.line})` : ''}`)
    }
  }

  const mergedNodes = Array.from(expected.values()).sort((a, b) => a.codigo.localeCompare(b.codigo))

  const out: ExpectedFile = {
    generatedAt: new Date().toISOString(),
    codigo_unicos: mergedNodes.length,
    nodes: mergedNodes,
  }

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8')

  console.log('=== merge_md_into_expected ===')
  console.log(`Base EXPECTED: ${expectedPath}`)
  console.log(`MD: ${mdPath}`)
  console.log(`Salida: ${outPath}`)
  console.log(`Agregados: ${added}`)
  console.log(`Total final: ${mergedNodes.length}`)
}

main()

/**
 * Script para extraer contenido de archivos ETT de ejemplo
 * Usa mammoth para leer archivos .docx
 */

import mammoth from 'mammoth'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const EXAMPLES_DIR = path.join(__dirname, '..', 'ett ejemplos')

async function extractDocxContent(filePath) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`📄 Archivo: ${path.basename(filePath)}`)
  console.log('='.repeat(80))
  
  try {
    const result = await mammoth.extractRawText({ path: filePath })
    console.log(result.value)
    return result.value
  } catch (error) {
    console.error(`Error leyendo ${filePath}:`, error.message)
    return null
  }
}

async function main() {
  const files = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.docx'))
  
  console.log(`\n🔍 Encontrados ${files.length} archivos ETT de ejemplo:\n`)
  files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
  
  for (const file of files) {
    const filePath = path.join(EXAMPLES_DIR, file)
    await extractDocxContent(filePath)
  }
}

main().catch(console.error)

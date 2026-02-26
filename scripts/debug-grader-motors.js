/**
 * Diagnóstico: ¿Por qué ARIA solo encuentra 1 motor para la Grader?
 * Simula la misma lógica de chatbot.ts fetchRepuestosSummary()
 */
const admin = require('firebase-admin');
const sa = require('../serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s\-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  console.log('=== BUSCANDO MÁQUINAS CON "grader" ===\n')
  
  const machinesSnap = await db.collection('machines').get()
  const allMachines = machinesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  
  // Detectar máquinas con "grader" (simula la lógica real)
  const matchedMachines = allMachines.filter(m => {
    const normName = normalizeText(m.nombre)
    return normName.includes('grader')
  })
  
  console.log(`Total máquinas: ${allMachines.length}`)
  console.log(`Máquinas que contienen "grader": ${matchedMachines.length}`)
  matchedMachines.forEach(m => {
    console.log(`  - ID: "${m.id}" | Nombre: "${m.nombre}" | Marca: "${m.marca}" | Modelo: "${m.modelo}"`)
  })
  
  // También buscar por marca/modelo
  const graderByBrand = allMachines.filter(m => {
    const normMarca = normalizeText(m.marca || '')
    const normModelo = normalizeText(m.modelo || '')
    return normMarca.includes('grader') || normModelo.includes('grader')
  })
  if (graderByBrand.length > 0) {
    console.log(`\nMáquinas con "grader" en marca/modelo:`)
    graderByBrand.forEach(m => console.log(`  - ID: "${m.id}" | ${m.nombre} | ${m.marca} | ${m.modelo}`))
  }
  
  console.log('\n=== REPUESTOS DE ESTAS MÁQUINAS ===\n')
  
  for (const machine of matchedMachines) {
    const repSnap = await db.collection('machines').doc(machine.id).collection('repuestos').get()
    console.log(`Máquina "${machine.nombre}" (${machine.id}): ${repSnap.size} repuestos`)
    
    // Buscar los que contienen "motor"
    const motorMatches = []
    const motorFails = []
    
    repSnap.docs.forEach(doc => {
      const d = doc.data()
      const text = normalizeText(
        `${d.textoBreve} ${d.descripcion} ${d.codigoSAP} ${d.codigoFabricante} ${d.nombreManual || ''} ${d.ubicacionEnPlanta || ''}`
      )
      
      const hasMotor = text.includes('motor')
      
      if (hasMotor) {
        motorMatches.push({
          id: doc.id,
          textoBreve: d.textoBreve,
          descripcion: d.descripcion,
          codigoSAP: d.codigoSAP,
          codigoFabricante: d.codigoFabricante,
          cantidadPorMaquina: d.cantidadPorMaquina,
          normalizedText: text.slice(0, 120),
        })
      }
      
      // Check si textoBreve contiene "motor" por si hay discrepancia
      if (normalizeText(d.textoBreve || '').includes('motor') && !hasMotor) {
        motorFails.push({ id: doc.id, textoBreve: d.textoBreve })
      }
    })
    
    console.log(`  → Motor matches en texto combinado: ${motorMatches.length}`)
    motorMatches.forEach((m, i) => {
      console.log(`  [${i+1}] textoBreve: "${m.textoBreve}"`)
      console.log(`      descripcion: "${m.descripcion}"`)
      console.log(`      SAP: ${m.codigoSAP} | Fab: ${m.codigoFabricante} | Cant: ${m.cantidadPorMaquina}`)
      console.log(`      normalized: "${m.normalizedText}"`)
    })
    
    if (motorFails.length > 0) {
      console.log(`  ⚠️ Motor en textoBreve pero NO en texto combinado: ${motorFails.length}`)
      motorFails.forEach(f => console.log(`    - ${f.id}: "${f.textoBreve}"`))
    }
  }
  
  // También verificar: ¿hay más máquinas con repuestos que contengan "motor"?
  console.log('\n=== BÚSQUEDA GLOBAL: repuestos con "motor" en TODAS las máquinas ===\n')
  let globalMotorCount = 0
  for (const machine of allMachines) {
    const repSnap = await db.collection('machines').doc(machine.id).collection('repuestos').get()
    let machineMotors = 0
    repSnap.docs.forEach(doc => {
      const d = doc.data()
      if (normalizeText(d.textoBreve || '').includes('motor')) {
        machineMotors++
        globalMotorCount++
      }
    })
    if (machineMotors > 0) {
      console.log(`  ${machine.nombre}: ${machineMotors} repuestos con "motor"`)
    }
  }
  console.log(`\nTotal global de repuestos con "motor" en textoBreve: ${globalMotorCount}`)
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })

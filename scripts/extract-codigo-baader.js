/**
 * Script: Extraer codigoBaader (código fabricante) desde textoBreve de repuestos
 * 
 * Lógica:
 *   - Para repuestos sin codigoBaader o con codigoBaader = "pendiente"
 *   - Extrae el último número de >= 4 dígitos del campo textoBreve
 *   - Actualiza el campo codigoBaader en Firestore
 * 
 * Ejemplo: "SOPORTE SECCION 519437" → codigoBaader = "519437"
 * 
 * Modo DRY RUN por defecto. Pasar --execute para aplicar cambios.
 */

const admin = require('firebase-admin');
const sa = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const EXECUTE = process.argv.includes('--execute');

function extractManufacturerCode(textoBreve) {
  if (!textoBreve) return null;
  // Find all number sequences with at least 4 digits (to avoid false positives)
  const numbers = textoBreve.match(/\b\d{4,}\b/g);
  if (!numbers || numbers.length === 0) return null;
  // Return the last number found (typically the part code)
  return numbers[numbers.length - 1];
}

async function main() {
  console.log(`\n=== MODO: ${EXECUTE ? '🔴 EJECUCIÓN REAL' : '🟡 DRY RUN (usar --execute para aplicar)'} ===\n`);
  
  const machinesSnap = await db.collection('machines').get();
  
  let updates = [];
  let skipped = [];
  let noCode = [];
  let alreadyHasCode = [];
  
  for (const machineDoc of machinesSnap.docs) {
    const repSnap = await db.collection('machines').doc(machineDoc.id).collection('repuestos').get();
    if (repSnap.size === 0) continue;
    
    for (const repDoc of repSnap.docs) {
      const d = repDoc.data();
      const currentCode = (d.codigoBaader || '').trim();
      const textoBreve = d.textoBreve || '';
      
      // Skip if already has a valid code (not "pendiente")
      if (currentCode && currentCode.toLowerCase() !== 'pendiente') {
        alreadyHasCode.push({ machine: machineDoc.id, id: repDoc.id, textoBreve, codigoBaader: currentCode });
        continue;
      }
      
      const extracted = extractManufacturerCode(textoBreve);
      
      if (extracted) {
        updates.push({
          machine: machineDoc.id,
          docId: repDoc.id,
          textoBreve,
          codigoSAP: d.codigoSAP || '',
          oldCode: currentCode,
          newCode: extracted,
          ref: db.collection('machines').doc(machineDoc.id).collection('repuestos').doc(repDoc.id)
        });
      } else {
        noCode.push({ machine: machineDoc.id, id: repDoc.id, textoBreve, codigoSAP: d.codigoSAP });
      }
    }
  }
  
  // Print what will be updated
  console.log(`=== UPDATES TO APPLY: ${updates.length} ===`);
  updates.forEach((u, i) => {
    const oldInfo = u.oldCode ? ` (was: "${u.oldCode}")` : '';
    console.log(`  ${i+1}. [${u.machine}] "${u.textoBreve}" → codigoBaader: "${u.newCode}"${oldInfo}`);
  });
  
  console.log(`\n=== ALREADY HAVE VALID CODE: ${alreadyHasCode.length} ===`);
  alreadyHasCode.forEach(s => {
    console.log(`  ✓ "${s.textoBreve}" → ${s.codigoBaader}`);
  });
  
  console.log(`\n=== CANNOT EXTRACT (no number ≥ 4 digits): ${noCode.length} ===`);
  noCode.forEach(s => {
    console.log(`  ✗ "${s.textoBreve}" | SAP: ${s.codigoSAP} | ${s.machine}`);
  });
  
  console.log('\n=== SUMMARY ===');
  console.log('Will update:', updates.length);
  console.log('Already has valid code:', alreadyHasCode.length);
  console.log('Cannot extract:', noCode.length);
  
  // Execute updates
  if (EXECUTE && updates.length > 0) {
    console.log('\n🔄 Applying updates in batches of 500...');
    
    // Batch write (Firestore limit: 500 per batch)
    const batchSize = 500;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = db.batch();
      const chunk = updates.slice(i, i + batchSize);
      
      for (const u of chunk) {
        batch.update(u.ref, { codigoBaader: u.newCode });
      }
      
      await batch.commit();
      console.log(`  ✅ Batch ${Math.floor(i/batchSize) + 1}: Updated ${chunk.length} repuestos`);
    }
    
    console.log(`\n✅ DONE! Updated ${updates.length} repuestos with codigoBaader.`);
  } else if (!EXECUTE) {
    console.log('\n⚠️  DRY RUN - No changes applied. Run with --execute to apply.');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

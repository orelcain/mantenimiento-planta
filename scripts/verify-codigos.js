const admin = require('firebase-admin');
const sa = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  const machinesSnap = await db.collection('machines').get();
  
  let total = 0, withCode = 0, withoutCode = 0, pendiente = 0;
  
  for (const machineDoc of machinesSnap.docs) {
    const repSnap = await db.collection('machines').doc(machineDoc.id).collection('repuestos').get();
    if (repSnap.size === 0) continue;
    
    let mWith = 0, mWithout = 0, mPendiente = 0;
    
    for (const repDoc of repSnap.docs) {
      const d = repDoc.data();
      total++;
      const code = (d.codigoBaader || '').trim();
      if (!code) {
        withoutCode++;
        mWithout++;
      } else if (code.toLowerCase() === 'pendiente') {
        pendiente++;
        mPendiente++;
      } else {
        withCode++;
        mWith++;
      }
    }
    
    if (repSnap.size > 0) {
      console.log(`${machineDoc.id}: ${repSnap.size} total | ✓ ${mWith} con código | ⏳ ${mPendiente} pendiente | ✗ ${mWithout} sin código`);
    }
  }
  
  console.log('\n=== RESUMEN FINAL ===');
  console.log(`Total repuestos: ${total}`);
  console.log(`✓ Con codigoBaader válido: ${withCode}`);
  console.log(`⏳ Con "pendiente": ${pendiente}`);
  console.log(`✗ Sin código: ${withoutCode}`);
  
  // Show a few samples to verify
  console.log('\n=== MUESTRAS VERIFICACIÓN (baader-200, primeros 5 con código) ===');
  const repSnap = await db.collection('machines').doc('baader-200').collection('repuestos').limit(10).get();
  let count = 0;
  for (const doc of repSnap.docs) {
    const d = doc.data();
    if (d.codigoBaader && d.codigoBaader !== 'pendiente' && count < 5) {
      console.log(`  "${d.textoBreve}" → codigoBaader: ${d.codigoBaader} | SAP: ${d.codigoSAP}`);
      count++;
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

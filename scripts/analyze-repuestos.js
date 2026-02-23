const admin = require('firebase-admin');
const sa = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  const machinesSnap = await db.collection('machines').get();
  console.log('Total machines:', machinesSnap.size);
  
  let totalRepuestos = 0;
  let withCode = 0;
  let withoutCode = 0;
  let samples = [];
  
  for (const machineDoc of machinesSnap.docs) {
    const repSnap = await db.collection('machines').doc(machineDoc.id).collection('repuestos').get();
    if (repSnap.size === 0) continue;
    
    totalRepuestos += repSnap.size;
    let machineWithout = 0;
    
    for (const repDoc of repSnap.docs) {
      const d = repDoc.data();
      if (d.codigoBaader && d.codigoBaader.trim() !== '') {
        withCode++;
      } else {
        withoutCode++;
        machineWithout++;
        if (samples.length < 60) {
          samples.push({ 
            machine: machineDoc.id, 
            id: repDoc.id, 
            textoBreve: d.textoBreve, 
            codigoSAP: d.codigoSAP, 
            codigoBaader: d.codigoBaader || '' 
          });
        }
      }
    }
    console.log('Machine:', machineDoc.id, '- Total:', repSnap.size, '- Without code:', machineWithout);
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('Total repuestos:', totalRepuestos);
  console.log('With codigoBaader:', withCode);
  console.log('Without codigoBaader:', withoutCode);
  console.log('\n=== SAMPLES WITHOUT codigoBaader ===');
  samples.forEach((s, i) => {
    // Try to extract number from textoBreve
    const numbers = s.textoBreve ? s.textoBreve.match(/\d+/g) : null;
    const lastNumber = numbers ? numbers[numbers.length - 1] : 'N/A';
    console.log(`${i+1}. "${s.textoBreve}" | SAP: ${s.codigoSAP} | lastNum: ${lastNumber} | ${s.machine}`);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

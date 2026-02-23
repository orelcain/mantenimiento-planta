const admin = require('firebase-admin');
const sa = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  const machinesSnap = await db.collection('machines').get();
  
  let allWithout = [];
  let allWith = [];
  let noNumber = [];
  
  for (const machineDoc of machinesSnap.docs) {
    const repSnap = await db.collection('machines').doc(machineDoc.id).collection('repuestos').get();
    if (repSnap.size === 0) continue;
    
    for (const repDoc of repSnap.docs) {
      const d = repDoc.data();
      const entry = { 
        machine: machineDoc.id, 
        id: repDoc.id, 
        textoBreve: d.textoBreve || '', 
        codigoSAP: d.codigoSAP || '',
        codigoBaader: d.codigoBaader || '' 
      };
      
      if (d.codigoBaader && d.codigoBaader.trim() !== '') {
        allWith.push(entry);
      } else {
        // Extract last number from textoBreve
        const text = d.textoBreve || '';
        // Match all number sequences (at least 4 digits to avoid false positives like "200" in machine names)
        const numbers = text.match(/\b\d{4,}\b/g);
        if (numbers && numbers.length > 0) {
          entry.extractedCode = numbers[numbers.length - 1];
          allWithout.push(entry);
        } else {
          entry.extractedCode = null;
          noNumber.push(entry);
        }
      }
    }
  }
  
  console.log('=== ALREADY HAVE codigoBaader (first 10) ===');
  allWith.slice(0, 10).forEach(s => {
    console.log(`  "${s.textoBreve}" | codigoBaader: ${s.codigoBaader} | SAP: ${s.codigoSAP}`);
  });
  
  console.log(`\n=== CAN EXTRACT CODE: ${allWithout.length} repuestos ===`);
  
  console.log(`\n=== CANNOT EXTRACT (no number >= 4 digits): ${noNumber.length} repuestos ===`);
  noNumber.forEach(s => {
    console.log(`  "${s.textoBreve}" | SAP: ${s.codigoSAP} | ${s.machine}`);
  });
  
  console.log('\n=== SPECIAL CASES (text after number like "IMAN 42303087 F") ===');
  allWithout.filter(s => {
    const text = s.textoBreve || '';
    // Check if there's text after the last number
    const match = text.match(/\d{4,}\s+[A-Za-z]/);
    return match;
  }).forEach(s => {
    console.log(`  "${s.textoBreve}" -> extracted: ${s.extractedCode}`);
  });

  console.log('\n=== SUMMARY ===');
  console.log('Already have codigoBaader:', allWith.length);
  console.log('Can extract (has number):', allWithout.length);
  console.log('Cannot extract (no number):', noNumber.length);
  console.log('Total:', allWith.length + allWithout.length + noNumber.length);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

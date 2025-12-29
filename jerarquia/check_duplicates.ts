import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function checkDuplicates() {
  console.log('=== ANÁLISIS DE DUPLICADOS ===\n');
  
  // Cargar todos los nodos activos
  const snapshot = await db.collection('hierarchy').where('activo', '==', true).get();
  console.log('Total nodos activos:', snapshot.size);
  
  // Agrupar por código
  const byCode = new Map();
  const byNombre = new Map();
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const codigo = data.codigo || '';
    const nombre = data.nombre || '';
    
    // Por código
    if (codigo) {
      if (!byCode.has(codigo)) {
        byCode.set(codigo, []);
      }
      byCode.get(codigo).push({ id: doc.id, ...data });
    }
    
    // Por nombre
    if (nombre) {
      if (!byNombre.has(nombre)) {
        byNombre.set(nombre, []);
      }
      byNombre.get(nombre).push({ id: doc.id, ...data });
    }
  });
  
  // Detectar duplicados por código
  console.log('\n=== DUPLICADOS POR CÓDIGO ===');
  let dupsCode = 0;
  for (const [codigo, nodos] of byCode.entries()) {
    if (nodos.length > 1) {
      console.log(`\nCódigo: ${codigo} (${nodos.length} copias)`);
      nodos.forEach((n: any, i: number) => {
        console.log(`  [${i+1}] ID: ${n.id}`);
        console.log(`      Nombre: ${n.nombre}`);
        console.log(`      ParentId: ${n.parentId || 'null'}`);
        console.log(`      Nivel: ${n.nivel || '?'}`);
      });
      dupsCode++;
    }
  }
  
  if (dupsCode === 0) {
    console.log('✅ No hay duplicados por código');
  } else {
    console.log(`\n⚠️ Total códigos duplicados: ${dupsCode}`);
  }
  
  // Detectar duplicados por nombre (solo si tienen mismo parentId)
  console.log('\n=== DUPLICADOS POR NOMBRE Y PADRE ===');
  let dupsByNameParent = 0;
  const checked = new Set();
  
  for (const [nombre, nodos] of byNombre.entries()) {
    if (nodos.length > 1) {
      // Agrupar por parentId
      const byParent = new Map();
      nodos.forEach((n: any) => {
        const pid = n.parentId || 'null';
        if (!byParent.has(pid)) {
          byParent.set(pid, []);
        }
        byParent.get(pid).push(n);
      });
      
      // Ver si hay duplicados con mismo padre
      for (const [pid, nodosConMismoPadre] of byParent.entries()) {
        const nodosArray = nodosConMismoPadre as any[];
        if (nodosArray.length > 1) {
          const key = `${nombre}-${pid}`;
          if (!checked.has(key)) {
            checked.add(key);
            console.log(`\nNombre: ${nombre} | Padre: ${pid} (${nodosArray.length} copias)`);
            nodosArray.forEach((n: any, i: number) => {
              console.log(`  [${i+1}] ID: ${n.id}, Código: ${n.codigo}`);
            });
            dupsByNameParent++;
          }
        }
      }
    }
  }
  
  if (dupsByNameParent === 0) {
    console.log('✅ No hay duplicados por nombre+padre');
  } else {
    console.log(`\n⚠️ Total grupos duplicados por nombre+padre: ${dupsByNameParent}`);
  }
  
  // Resumen
  console.log(`\n=== RESUMEN ===`);
  console.log(`Total nodos activos: ${snapshot.size}`);
  console.log(`Códigos únicos: ${byCode.size}`);
  console.log(`Códigos duplicados: ${dupsCode}`);
  console.log(`Grupos nombre+padre duplicados: ${dupsByNameParent}`);
  
  process.exit(0);
}

checkDuplicates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

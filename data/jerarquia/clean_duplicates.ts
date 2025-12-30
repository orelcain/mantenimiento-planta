/**
 * Script para eliminar nodos duplicados
 * Estrategia: Para cada código duplicado, mantener el nodo con parentId correcto
 * (el generado por Firebase en la importación) y eliminar el resto
 */

import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function cleanDuplicates() {
  console.log('=== LIMPIEZA DE DUPLICADOS ===\n');
  
  // Cargar todos los nodos activos
  const snapshot = await db.collection('hierarchy').where('activo', '==', true).get();
  console.log('Total nodos activos antes:', snapshot.size);
  
  // Agrupar por código
  const byCode = new Map<string, any[]>();
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const codigo = data.codigo || '';
    
    if (codigo) {
      if (!byCode.has(codigo)) {
        byCode.set(codigo, []);
      }
      byCode.get(codigo)!.push({ id: doc.id, ...data });
    }
  });
  
  // Identificar duplicados y decidir cuál mantener
  const toDelete: string[] = [];
  let duplicatesProcessed = 0;
  
  for (const [codigo, nodos] of byCode.entries()) {
    if (nodos.length > 1) {
      duplicatesProcessed++;
      console.log(`\nCódigo: ${codigo} (${nodos.length} copias)`);
      
      // Estrategia para elegir cuál mantener:
      // 1. Preferir los que tienen parentId (no null o código con guiones)
      // 2. Dentro de esos, preferir los que NO tienen ID = código (los nuevos)
      // 3. Si empate, mantener el más reciente (mayor timestamp)
      
      const nodosWithValidParent = nodos.filter(n => {
        const pid = n.parentId;
        // Un parentId válido es:
        // - Null (para raíz)
        // - Un ID de 20 caracteres alfanuméricos (Firestore auto-generated)
        // - NO un código como "720004546" o "aq-in-cho-pcho"
        if (pid === null) return true;
        if (typeof pid !== 'string') return false;
        // Si tiene guiones y no es muy largo, probablemente es un código viejo
        if (pid.includes('-') && pid.length < 20) return false;
        // Si es puramente numérico y largo, probablemente es ID=código viejo
        if (/^\d{9,}$/.test(pid)) return false;
        // Si tiene 20 caracteres alfanuméricos, es ID generado
        if (/^[a-zA-Z0-9]{15,}$/.test(pid) && !pid.includes('-')) return true;
        return true;
      });
      
      const nodesToConsider = nodosWithValidParent.length > 0 ? nodosWithValidParent : nodos;
      
      // Ordenar por prioridad: IDs generados primero, luego por timestamp
      nodesToConsider.sort((a, b) => {
        // Prioridad 1: ID generado por Firebase (no es el código)
        const aIsGenerated = a.id !== codigo && a.id.length >= 15 && !/^[\d-]+$/.test(a.id);
        const bIsGenerated = b.id !== codigo && b.id.length >= 15 && !/^[\d-]+$/.test(b.id);
        
        if (aIsGenerated && !bIsGenerated) return -1;
        if (!aIsGenerated && bIsGenerated) return 1;
        
        // Prioridad 2: timestamp más reciente
        const aTime = a.actualizadoEn?._seconds || a.creadoEn?._seconds || 0;
        const bTime = b.actualizadoEn?._seconds || b.creadoEn?._seconds || 0;
        return bTime - aTime;
      });
      
      // El primero es el que mantenemos
      const toKeep = nodesToConsider[0];
      console.log(`  ✅ MANTENER: ID=${toKeep.id}, ParentId=${toKeep.parentId || 'null'}`);
      
      // Los demás se marcan para eliminar
      nodos.forEach(n => {
        if (n.id !== toKeep.id) {
          console.log(`  ❌ ELIMINAR: ID=${n.id}, ParentId=${n.parentId || 'null'}`);
          toDelete.push(n.id);
        }
      });
    }
  }
  
  console.log(`\n=== RESUMEN ===`);
  console.log(`Códigos duplicados procesados: ${duplicatesProcessed}`);
  console.log(`Nodos a eliminar: ${toDelete.length}`);
  
  if (toDelete.length === 0) {
    console.log('\n✅ No hay nodos duplicados para eliminar');
    process.exit(0);
  }
  
  // Confirmar antes de eliminar
  console.log(`\n⚠️  Se eliminarán ${toDelete.length} nodos duplicados.`);
  console.log('Ejecutando eliminación en 3 segundos...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Eliminar en batches
  let batch = db.batch();
  let batchCount = 0;
  let deleted = 0;
  
  for (const id of toDelete) {
    const docRef = db.collection('hierarchy').doc(id);
    batch.delete(docRef);
    batchCount++;
    deleted++;
    
    if (batchCount >= 400) {
      await batch.commit();
      console.log(`[batch] Eliminados ${batchCount} nodos`);
      batch = db.batch();
      batchCount = 0;
    }
  }
  
  if (batchCount > 0) {
    await batch.commit();
    console.log(`[batch] Eliminados ${batchCount} nodos (final)`);
  }
  
  console.log(`\n✅ Eliminación completada: ${deleted} nodos eliminados`);
  
  // Verificar resultado final
  const finalSnapshot = await db.collection('hierarchy').where('activo', '==', true).get();
  console.log(`\nNodos activos después: ${finalSnapshot.size}`);
  console.log(`Nodos eliminados: ${snapshot.size - finalSnapshot.size}`);
  
  process.exit(0);
}

cleanDuplicates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

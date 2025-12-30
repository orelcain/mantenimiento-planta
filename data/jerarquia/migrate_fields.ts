/**
 * Script para migrar/corregir los campos de los nodos importados
 * Convierte:
 *   active -> activo
 *   name -> nombre  
 *   code -> codigo
 *   level -> nivel
 *   order -> orden
 *   parentCode -> parentId (resolviendo el ID del documento padre)
 */

import * as admin from 'firebase-admin';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const COLLECTION = 'hierarchy';

async function migrateNodes() {
  console.log('=== MIGRACIÓN DE CAMPOS DE JERARQUÍA ===\n');
  
  // 1. Cargar todos los nodos
  const snapshot = await db.collection(COLLECTION).get();
  console.log(`[load] Total documentos: ${snapshot.size}`);
  
  // 2. Crear mapa de código -> ID para resolver parentCode
  const codeToId = new Map<string, string>();
  snapshot.forEach(doc => {
    const data = doc.data();
    const code = data.code || data.codigo;
    if (code) {
      codeToId.set(code, doc.id);
    }
  });
  console.log(`[map] Códigos mapeados: ${codeToId.size}`);
  
  // 3. Migrar cada nodo
  let batch = db.batch();
  let batchCount = 0;
  let migrated = 0;
  let skipped = 0;
  let parentNotFound = 0;
  const MAX_BATCH = 400;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const docRef = db.collection(COLLECTION).doc(doc.id);
    
    // Verificar si ya está migrado (tiene campo 'nombre')
    if (data.nombre && data.activo !== undefined) {
      skipped++;
      continue;
    }
    
    // Resolver parentId desde parentCode
    let parentId: string | null = null;
    const parentCode = data.parentCode;
    
    if (parentCode) {
      parentId = codeToId.get(parentCode) || null;
      if (!parentId) {
        console.log(`[warn] Padre no encontrado para código: ${parentCode} (nodo: ${data.code || data.codigo})`);
        parentNotFound++;
      }
    }
    
    // Determinar el nivel basado en el código o usar el existente
    let nivel = data.nivel || data.level || 4; // Default nivel 4 (sistema) para equipos
    
    // Si es un código de área (comienza con AQ-), inferir nivel por estructura
    const code = data.code || data.codigo || '';
    if (code.startsWith('AQ-IN-CHO')) {
      const parts = code.split('-');
      if (parts.length === 3) nivel = 1; // AQ-IN-CHO = Empresa
      else if (parts.length === 4) nivel = 2; // AQ-IN-CHO-ACOP = Área
      else if (parts.length === 5) nivel = 3; // AQ-IN-CHO-ACOP-CAAM = Sub-área
      else if (parts.length === 6) nivel = 4; // AQ-IN-CHO-PCHO-PROC-EVIS = Sistema
    } else if (/^\d{9,}$/.test(code)) {
      // Códigos numéricos son equipos (niveles 4-8)
      nivel = data.nivel || data.level || 4;
    }
    
    // Preparar datos migrados
    const migratedData: any = {
      nombre: data.name || data.nombre || 'Sin nombre',
      codigo: data.code || data.codigo || '',
      nivel: nivel,
      orden: data.order || data.orden || 0,
      activo: data.active ?? data.activo ?? true,
      parentId: parentId,
      creadoEn: data.createdAt || data.creadoEn || admin.firestore.FieldValue.serverTimestamp(),
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    // Eliminar campos viejos si existen
    const updates: any = {
      ...migratedData,
    };
    
    // Marcar campos viejos para eliminar
    if (data.name !== undefined) updates.name = admin.firestore.FieldValue.delete();
    if (data.code !== undefined) updates.code = admin.firestore.FieldValue.delete();
    if (data.level !== undefined) updates.level = admin.firestore.FieldValue.delete();
    if (data.order !== undefined) updates.order = admin.firestore.FieldValue.delete();
    if (data.active !== undefined) updates.active = admin.firestore.FieldValue.delete();
    if (data.parentCode !== undefined) updates.parentCode = admin.firestore.FieldValue.delete();
    if (data.createdAt !== undefined) updates.createdAt = admin.firestore.FieldValue.delete();
    if (data.updatedAt !== undefined) updates.updatedAt = admin.firestore.FieldValue.delete();
    
    batch.update(docRef, updates);
    migrated++;
    batchCount++;
    
    if (batchCount >= MAX_BATCH) {
      await batch.commit();
      console.log(`[batch] Commit: ${batchCount} docs`);
      batch = db.batch();
      batchCount = 0;
    }
  }
  
  // Commit final
  if (batchCount > 0) {
    await batch.commit();
    console.log(`[batch] Commit final: ${batchCount} docs`);
  }
  
  console.log(`\n=== RESULTADO ===`);
  console.log(`Migrados: ${migrated}`);
  console.log(`Ya migrados (skip): ${skipped}`);
  console.log(`Padres no encontrados: ${parentNotFound}`);
  
  process.exit(0);
}

migrateNodes().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

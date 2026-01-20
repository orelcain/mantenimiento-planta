/**
 * Script de migración: Agregar campo categoryId a máquinas existentes
 * 
 * Problema:
 * - Las máquinas creadas antes de implementar categorías no tienen el campo categoryId
 * - El filtrado por categoría no funciona para estas máquinas
 * 
 * Solución:
 * - Agregar categoryId: null a todas las máquinas que no lo tengan
 * - Esto las hará aparecer en "Todas las categorías"
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Inicializar Firebase Admin
const serviceAccountPath = join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/**
 * Agregar categoryId: null a máquinas que no lo tengan
 */
async function migrateMachineCategories() {
  console.log('\n🔧 MIGRACIÓN: Agregar categoryId a máquinas existentes\n');

  try {
    const machinesRef = db.collection('machines');
    const snapshot = await machinesRef.get();

    if (snapshot.empty) {
      console.log('⚠️  No hay máquinas en la colección');
      return;
    }

    console.log(`📋 Encontradas ${snapshot.size} máquinas\n`);

    const batch = db.batch();
    let updated = 0;
    let skipped = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      
      // Si no tiene categoryId, agregarlo como null
      if (data.categoryId === undefined) {
        console.log(`✅ Actualizando: ${data.nombre || doc.id}`);
        batch.update(doc.ref, {
          categoryId: null,
          updatedAt: admin.firestore.Timestamp.now(),
        });
        updated++;
      } else {
        console.log(`⏭️  Ya tiene categoryId: ${data.nombre || doc.id} (${data.categoryId || 'null'})`);
        skipped++;
      }
    });

    if (updated > 0) {
      await batch.commit();
      console.log(`\n✅ Migración completada:`);
      console.log(`   - ${updated} máquinas actualizadas`);
      console.log(`   - ${skipped} máquinas sin cambios`);
    } else {
      console.log('\n✅ Todas las máquinas ya tienen categoryId configurado');
    }

  } catch (error) {
    console.error('❌ Error en migración:', error);
    throw error;
  }
}

/**
 * Main
 */
async function main() {
  try {
    await migrateMachineCategories();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();

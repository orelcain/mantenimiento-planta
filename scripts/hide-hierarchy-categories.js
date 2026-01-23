/**
 * Script para ocultar todas las categorías jerárquicas de motores/bombas
 * Las categorías serán accesibles solo a través del selector jerárquico
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function hideHierarchyCategories() {
  try {
    console.log('🔄 Ocultando categorías jerárquicas...');
    
    // Obtener todas las categorías
    const categoriesSnapshot = await db.collection('machineCategories').get();
    
    let hiddenCount = 0;
    const batch = db.batch();
    
    categoriesSnapshot.docs.forEach((doc) => {
      const category = doc.data();
      const categoryId = doc.id; // El ID del documento en Firebase
      
      // Ocultar todas las categorías que tengan parentId o nivel > 0 (es decir, que sean parte de la jerarquía)
      // o que tengan "motores" o "bombas" en su nombre/id
      if (category.parentId || (category.nivel && category.nivel > 0) || 
          categoryId.includes('motores') || categoryId.includes('bombas') ||
          (category.nombre && (category.nombre.toLowerCase().includes('motores') || 
           category.nombre.toLowerCase().includes('bombas')))) {
        
        const docRef = doc.ref;
        batch.update(docRef, {
          visible: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        hiddenCount++;
        console.log(`  ✓ Ocultada: ${category.nombre} (ID: ${categoryId})`);
      }
    });
    
    await batch.commit();
    console.log(`\n✅ Se ocultaron ${hiddenCount} categorías`);
    console.log('✅ Las categorías ahora solo serán accesibles a través del selector jerárquico');
    
  } catch (error) {
    console.error('❌ Error al ocultar categorías:', error);
    process.exit(1);
  } finally {
    await admin.app().delete();
  }
}

hideHierarchyCategories();

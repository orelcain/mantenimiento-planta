/**
 * Script para importar TODOS los equipos de las páginas 1-10 a Firestore
 *
 * ⚠️ LEGADO (NO USAR): este script escribe el esquema antiguo (active/code/parentCode).
 * Usar en su lugar:
 * - jerarquia/import_hierarchy_admin.ts (esquema actual: activo/codigo/parentId/nivel/path/orden)
 * - jerarquia/reconcile_firestore_to_expected.ts para dejar Firestore igual al mandante.
 * Ejecutar con:
 * $env:GOOGLE_APPLICATION_CREDENTIALS="d:\a\clave privada\mantenimiento-planta-771a3-firebase-adminsdk-fbsvc-c1bee027a1.json"; $env:TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}'; node -r ts-node/register/transpile-only -e "require('./jerarquia/import_all_pages.ts')"
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const COLLECTION = 'hierarchy';

interface Equipo {
  codigo: string;
  denominacion: string;
  padre?: string;
  nivel?: number;
}

// Función para leer todos los archivos JSON de imágenes
function loadAllEquiposFromImages(): Equipo[] {
  const baseDir = path.join(__dirname);
  const allEquipos: Equipo[] = [];
  
  // Cargar equipos del JSON principal (páginas 1-2)
  const mainJsonPath = path.join(baseDir, 'JERARQUIA_COMPLETA_VERIFICADA.json');
  const mainData = JSON.parse(fs.readFileSync(mainJsonPath, 'utf-8'));
  
  // Agregar raíz
  allEquipos.push({
    codigo: mainData.estructura.raiz.codigo,
    denominacion: mainData.estructura.raiz.denominacion,
    nivel: 1
  });
  
  // Agregar áreas nivel 2
  for (const area of mainData.estructura.areas_nivel_2) {
    allEquipos.push({
      codigo: area.codigo,
      denominacion: area.denominacion,
      padre: area.padre,
      nivel: 2
    });
  }
  
  // Agregar equipos de PAGINA_1
  if (mainData.PAGINA_1?.equipos) {
    for (const eq of mainData.PAGINA_1.equipos) {
      allEquipos.push({
        codigo: eq.codigo,
        denominacion: eq.denominacion,
        padre: eq.padre
      });
    }
  }
  
  // Agregar equipos de PAGINA_2
  if (mainData.PAGINA_2?.equipos) {
    for (const eq of mainData.PAGINA_2.equipos) {
      allEquipos.push({
        codigo: eq.codigo,
        denominacion: eq.denominacion,
        padre: eq.padre
      });
    }
  }
  
  console.log(`[loadMain] Cargados ${allEquipos.length} equipos de páginas 1-2`);
  
  // Cargar equipos de imagen_03 a imagen_10
  for (let i = 3; i <= 10; i++) {
    const fileName = `imagen_${i.toString().padStart(2, '0')}_equipos.json`;
    const filePath = path.join(baseDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      console.log(`[load] Archivo no encontrado: ${fileName}`);
      continue;
    }
    
    const imageData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let countFromImage = 0;
    
    if (imageData.areas_y_equipos) {
      for (const area of imageData.areas_y_equipos) {
        // Agregar el área si tiene denominación y no es continuación
        if (area.denominacion && !area.area.includes('(continuación)')) {
          // Solo agregar si no existe ya
          const existingArea = allEquipos.find(e => e.codigo === area.area);
          if (!existingArea) {
            // Determinar el padre basándose en el código del área
            let padre = '';
            const parts = area.area.split('-');
            if (parts.length > 1) {
              padre = parts.slice(0, -1).join('-');
            }
            
            allEquipos.push({
              codigo: area.area,
              denominacion: area.denominacion,
              padre: padre || undefined
            });
            countFromImage++;
          }
        }
        
        // Agregar los equipos
        if (area.equipos) {
          for (const eq of area.equipos) {
            // Verificar que no exista ya
            const exists = allEquipos.find(e => e.codigo === eq.codigo);
            if (!exists) {
              allEquipos.push({
                codigo: eq.codigo,
                denominacion: eq.denominacion,
                padre: eq.padre,
                nivel: eq.nivel
              });
              countFromImage++;
            }
          }
        }
      }
    }
    
    console.log(`[load] ${fileName}: ${countFromImage} nuevos equipos`);
  }
  
  return allEquipos;
}

// Cargar nodos existentes de Firestore
async function loadExistingNodes(): Promise<Map<string, any>> {
  const snapshot = await db.collection(COLLECTION).where('active', '==', true).get();
  const existing = new Map<string, any>();
  
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.code) {
      existing.set(data.code, { id: doc.id, ...data });
    }
  });
  
  console.log(`[loadExisting] ${existing.size} nodos existentes en Firestore`);
  return existing;
}

// Importar todos los nodos
async function importAllNodes(equipos: Equipo[]) {
  const existing = await loadExistingNodes();
  let batch = db.batch();
  let created = 0;
  let updated = 0;
  let batchCount = 0;
  const MAX_BATCH = 400;
  
  for (const eq of equipos) {
    const existingNode = existing.get(eq.codigo);
    
    const nodeData: any = {
      code: eq.codigo,
      name: eq.denominacion,
      parentCode: eq.padre || null,
      active: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (eq.nivel) {
      nodeData.level = eq.nivel;
    }
    
    if (existingNode) {
      // Actualizar existente
      const docRef = db.collection(COLLECTION).doc(existingNode.id);
      batch.update(docRef, nodeData);
      updated++;
    } else {
      // Crear nuevo
      nodeData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      nodeData.order = 0;
      const docRef = db.collection(COLLECTION).doc();
      batch.set(docRef, nodeData);
      created++;
    }
    
    batchCount++;
    
    // Commit batch cada 400 operaciones y crear uno nuevo
    if (batchCount >= MAX_BATCH) {
      await batch.commit();
      console.log(`[batch] Commited ${batchCount} operaciones`);
      batch = db.batch(); // Crear nuevo batch
      batchCount = 0;
    }
  }
  
  // Commit final
  if (batchCount > 0) {
    await batch.commit();
    console.log(`[batch] Commited ${batchCount} operaciones (final)`);
  }
  
  console.log(`[importAllNodes] Creados: ${created}, Actualizados: ${updated}`);
}

// Main
async function main() {
  console.log('=== IMPORTACIÓN COMPLETA DE JERARQUÍA (Páginas 1-10) ===\n');
  
  try {
    // Cargar todos los equipos
    const allEquipos = loadAllEquiposFromImages();
    console.log(`\n[main] Total equipos a procesar: ${allEquipos.length}\n`);
    
    // Importar a Firestore
    await importAllNodes(allEquipos);
    
    console.log('\n[main] ¡Importación finalizada exitosamente!');
    
  } catch (error) {
    console.error('[main] Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();

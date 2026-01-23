/**
 * Script para crear jerarquía de categorías DESDE JERARQUIA_COMPLETA_VERIFICADA.json
 * Respeta la estructura técnica real de la planta
 * 
 * Niveles:
 *   Nivel 0: Raíz (CHONCHI)
 *   Nivel 1: Áreas (ACOPIO, PATIO Y SERVICIOS, etc.)
 *   Nivel 2: Subáreas (CASETA AGUA MAR, ALMACENAMIENTO AGUAS, etc.)
 *   Nivel 3: Equipos (MOTOR, BOMBA, etc.)
 * 
 * Lee: data/jerarquia/JERARQUIA_COMPLETA_VERIFICADA.json
 * Crea: machineCategories (estructura jerárquica)
 * Mapea: plantAssets → machines (con repuestos)
 * 
 * Ejecutar con: node scripts/create-motores-bombas-hierarchy-from-json.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('../serviceAccountKey.json');

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/**
 * Crear o actualizar una categoría
 */
async function createCategory(id, data) {
  const docRef = db.collection('machineCategories').doc(id);
  const existingDoc = await docRef.get();

  if (!existingDoc.exists) {
    await docRef.set({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }
  return false;
}

/**
 * Crear o actualizar una máquina
 */
async function createMachine(id, data) {
  const docRef = db.collection('machines').doc(id);
  const existingDoc = await docRef.get();

  if (!existingDoc.exists) {
    await docRef.set({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }
  return false;
}

/**
 * Normalizar slug
 */
function slugify(text) {
  if (!text) return 'desconocido';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extraer estructura jerárquica del JSON
 */
function extractHierarchy(jsonData) {
  const hierarchy = {};

  // Recorrer todas las páginas
  for (const pageKey in jsonData) {
    if (pageKey.startsWith('PAGINA_')) {
      const page = jsonData[pageKey];
      const equipos = page.equipos || [];

      equipos.forEach(equipo => {
        const codigo = equipo.codigo;
        const denominacion = equipo.denominacion;
        const padre = equipo.padre;

        hierarchy[codigo] = {
          codigo,
          denominacion,
          padre,
          nivel: null, // se calcula después
        };
      });
    }
  }

  // Agregar áreas del nivel 2
  if (jsonData.estructura && jsonData.estructura.areas_nivel_2) {
    jsonData.estructura.areas_nivel_2.forEach(area => {
      hierarchy[area.codigo] = {
        codigo: area.codigo,
        denominacion: area.denominacion,
        padre: area.padre,
        nivel: 1,
      };
    });
  }

  // Raíz (nivel 0)
  if (jsonData.estructura && jsonData.estructura.raiz) {
    const raiz = jsonData.estructura.raiz;
    hierarchy[raiz.codigo] = {
      codigo: raiz.codigo,
      denominacion: raiz.denominacion,
      padre: null,
      nivel: 0,
    };
  }

  return hierarchy;
}

/**
 * Calcular nivel de cada nodo
 */
function calculateLevels(hierarchy) {
  // Asignar niveles basándose en la profundidad
  const visited = new Set();

  function findLevel(codigo, depth = 0) {
    if (visited.has(codigo)) return;
    visited.add(codigo);

    const node = hierarchy[codigo];
    if (!node) return;

    if (node.nivel === null) {
      node.nivel = depth;
    }

    // Buscar hijos
    for (const key in hierarchy) {
      if (hierarchy[key].padre === codigo) {
        findLevel(key, depth + 1);
      }
    }
  }

  // Empezar desde la raíz
  for (const codigo in hierarchy) {
    if (hierarchy[codigo].padre === null || hierarchy[codigo].padre === undefined) {
      findLevel(codigo, 0);
    }
  }

  return hierarchy;
}

/**
 * Main
 */
async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  CREANDO JERARQUÍA DESDE DOCUMENTO TÉCNICO');
  console.log('═'.repeat(70));

  try {
    // 1. Leer jerarquía del JSON
    console.log('\n📖 Leyendo jerarquía técnica...');
    const hierarchyPath = path.join(
      __dirname,
      '../data/jerarquia/JERARQUIA_COMPLETA_VERIFICADA.json'
    );

    if (!fs.existsSync(hierarchyPath)) {
      console.error(`❌ Archivo no encontrado: ${hierarchyPath}`);
      process.exit(1);
    }

    const hierarchyJson = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
    const hierarchy = extractHierarchy(hierarchyJson);
    calculateLevels(hierarchy);

    console.log(`   ✅ ${Object.keys(hierarchy).length} nodos en la jerarquía`);

    // 2. Obtener plantAssets
    console.log('\n📊 Obteniendo equipos (plantAssets)...');
    const snapshot = await db.collection('plantAssets')
      .where('tipo', 'in', ['motor', 'bomba'])
      .get();

    const assets = snapshot.docs.map(doc => doc.data());
    console.log(`   ✅ ${assets.length} equipos encontrados`);

    // 3. Crear estructura en Firestore
    console.log('\n🏗️  Creando categorías...');
    let categoriesCreated = 0;

    // Crear todas las categorías en el orden jerárquico
    for (const codigo in hierarchy) {
      const node = hierarchy[codigo];
      const catId = `jer-${slugify(node.denominacion)}-${slugify(codigo)}`;

      const categoryData = {
        nombre: node.denominacion,
        descripcion: `Nivel ${node.nivel}: ${node.denominacion}`,
        icono: 
          node.nivel === 0 ? 'Factory' :
          node.nivel === 1 ? 'MapPin' :
          node.nivel === 2 ? 'Cog' :
          'Zap',
        orden: 0,
        activa: true,
        parentId: node.padre ? `jer-${slugify(hierarchy[node.padre]?.denominacion)}-${slugify(node.padre)}` : null,
        nivel: node.nivel,
        codigoTecnico: codigo, // Referencia al código técnico
      };

      const created = await createCategory(catId, categoryData);
      if (created) {
        categoriesCreated++;
        const indent = '   '.repeat(node.nivel + 1);
        console.log(`${indent}✅ L${node.nivel}: ${node.denominacion}`);
      }
    }

    // 4. Mapear plantAssets a máquinas
    console.log(`\n🔧 Creando máquinas desde plantAssets...`);
    let machinesCreated = 0;

    for (const asset of assets) {
      const area = asset.area || 'Sin área';
      const subarea = asset.subarea || 'Sin subárea';

      // Buscar la categoría correcta (nivel 2 = subárea)
      let targetCategoryId = null;
      for (const codigo in hierarchy) {
        const node = hierarchy[codigo];
        if (node.nivel === 2 && node.denominacion === subarea) {
          targetCategoryId = `jer-${slugify(node.denominacion)}-${slugify(codigo)}`;
          break;
        }
      }

      if (!targetCategoryId) {
        console.log(`   ⚠️  No se encontró categoría para: ${area} → ${subarea}`);
        continue;
      }

      const machineId = `equipo-${slugify(asset.equipo)}-${asset.id?.substring(0, 8) || 'xxx'}`;
      const machineName = `${asset.equipo}${asset.componente ? ` - ${asset.componente}` : ''}`;

      const machineData = {
        nombre: machineName,
        marca: asset.marca || 'Desconocida',
        modelo: asset.modeloTipo || asset.modeloBomba || 'N/A',
        descripcion: `${asset.tipo.toUpperCase()}: ${asset.descripcionSAP || 'Sin descripción'}`,
        categoryId: targetCategoryId,
        activa: true,
        color: asset.tipo === 'motor' ? '#3b82f6' : '#06b6d4',
        codigoSAP: asset.codigoSAP,
        plantAssetId: asset.id,
        area: area,
        subarea: subarea,
      };

      const created = await createMachine(machineId, machineData);
      if (created) machinesCreated++;
    }

    // 5. Resumen
    console.log('\n' + '═'.repeat(70));
    console.log('✅ JERARQUÍA CREADA EXITOSAMENTE');
    console.log('═'.repeat(70));
    console.log(`\n📊 Resumen:`);
    console.log(`   • Categorías creadas: ${categoriesCreated}`);
    console.log(`   • Máquinas creadas: ${machinesCreated}`);
    console.log(`   • Total equipos mapeados: ${assets.length}`);
    console.log(`\n💡 Flujo en la App:`);
    console.log(`   1. Repuestos → Selecciona categoría`);
    console.log(`   2. Navega por la jerarquía técnica real`);
    console.log(`   3. Selecciona un equipo → Agrega repuestos\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Ejecutar
main();

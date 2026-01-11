/**
 * Script para eliminar TODOS los usuarios anónimos de Firebase Auth EN BATCH
 * 
 * PASO 1: Descargar Service Account Key:
 *   1. Ve a: https://console.firebase.google.com/project/mantenimiento-planta-771a3/settings/serviceaccounts/adminsdk
 *   2. Click "Generar nueva clave privada" 
 *   3. Guarda el archivo JSON en la carpeta raíz del proyecto
 *   4. Renómbralo a: serviceAccountKey.json
 * 
 * PASO 2: Instalar firebase-admin:
 *   npm install firebase-admin
 * 
 * PASO 3: Ejecutar:
 *   node scripts/delete_anonymous_users.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Buscar service account key
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ ERROR: No se encontró serviceAccountKey.json');
  console.log('');
  console.log('📋 PASOS PARA OBTENERLO:');
  console.log('1. Ve a: https://console.firebase.google.com/project/mantenimiento-planta-771a3/settings/serviceaccounts/adminsdk');
  console.log('2. Click en "Generar nueva clave privada"');
  console.log('3. Guarda el archivo en la raíz del proyecto');
  console.log('4. Renómbralo a: serviceAccountKey.json');
  console.log('5. Ejecuta este script nuevamente');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://mantenimiento-planta-771a3-default-rtdb.firebaseio.com'
});

async function deleteAnonymousUsers() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Eliminador MASIVO de Usuarios Anónimos - Firebase ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
  console.log('🔍 Buscando usuarios anónimos...');
  
  let totalDeleted = 0;
  let totalErrors = 0;
  let pageToken;
  
  try {
    do {
      // Listar usuarios en lotes de 1000
      const listResult = await admin.auth().listUsers(1000, pageToken);
      
      // Debug: mostrar info de los primeros usuarios
      if (listResult.users.length > 0) {
        console.log(`\n📋 Total usuarios en este lote: ${listResult.users.length}`);
        console.log('📋 Muestra de primeros 3 usuarios:');
        listResult.users.slice(0, 3).forEach(u => {
          console.log(`  - UID: ${u.uid.substring(0, 25)}...`);
          console.log(`    Email: ${u.email || 'N/A'}`);
          console.log(`    Phone: ${u.phoneNumber || 'N/A'}`);
          console.log(`    Providers: ${u.providerData.length}`);
          console.log(`    Created: ${new Date(u.metadata.creationTime).toLocaleString()}`);
        });
      }
      
      // Filtrar usuarios anónimos (sin email, sin teléfono, sin proveedores)
      const anonymousUsers = listResult.users.filter(user => {
        return user.providerData.length === 0 && !user.email && !user.phoneNumber;
      });
      
      if (anonymousUsers.length > 0) {
        console.log(`📋 Encontrados ${anonymousUsers.length} usuarios anónimos en este lote`);
        
        // Eliminar en paralelo (batches de 100 para evitar rate limits)
        for (let i = 0; i < anonymousUsers.length; i += 100) {
          const batch = anonymousUsers.slice(i, i + 100);
          
          await Promise.all(batch.map(async (user) => {
            try {
              await admin.auth().deleteUser(user.uid);
              totalDeleted++;
              if (totalDeleted % 50 === 0) {
                console.log(`  ✓ Progreso: ${totalDeleted} eliminados...`);
              }
            } catch (error) {
              totalErrors++;
              console.error(`  ✗ Error eliminando ${user.uid}: ${error.message}`);
            }
          }));
          
          // Pequeña pausa entre batches
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      pageToken = listResult.pageToken;
    } while (pageToken);
    
    console.log('');
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║              PROCESO COMPLETADO                    ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`✅ Usuarios eliminados: ${totalDeleted}`);
    if (totalErrors > 0) {
      console.log(`⚠️  Errores: ${totalErrors}`);
    }
    console.log('');
    console.log('🎉 Todos los usuarios anónimos han sido eliminados!');
    console.log('');
    console.log('⚠️  RECUERDA: El firmware v2.13.1 con Database Secret');
    console.log('   YA NO CREARÁ más usuarios anónimos.');
    
  } catch (error) {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Ejecutar
deleteAnonymousUsers();

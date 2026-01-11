/**
 * Script para eliminar TODOS los usuarios anónimos de Firebase Auth
 * 
 * Uso:
 *   firebase login (si no estás logueado)
 *   node scripts/delete_anonymous_users.js
 * 
 * Usa las credenciales de Firebase CLI
 */

const { spawn } = require('child_process');

async function deleteAnonymousUsers() {
  console.log('🔍 Usando Firebase CLI para eliminar usuarios anónimos...');
  console.log('⚠️  Este proceso puede tardar varios minutos');
  console.log('');
  
  // Usar Firebase CLI para obtener lista de usuarios
  const listProcess = spawn('firebase', [
    'auth:export',
    'users.json',
    '--format=json'
  ], {
    cwd: process.cwd(),
    shell: true
  });
  
  listProcess.stdout.on('data', (data) => {
    console.log(data.toString());
  });
  
  listProcess.stderr.on('data', (data) => {
    console.error(data.toString());
  });
  
  listProcess.on('close', async (code) => {
    if (code !== 0) {
      console.error('❌ Error exportando usuarios. ¿Estás logueado? Ejecuta: firebase login');
      process.exit(1);
    }
    
    // Leer archivo de usuarios
    const fs = require('fs');
    if (!fs.existsSync('users.json')) {
      console.log('✅ No hay usuarios para eliminar');
      process.exit(0);
    }
    
    const usersData = JSON.parse(fs.readFileSync('users.json', 'utf8'));
    const users = usersData.users || [];
    
    // Filtrar usuarios anónimos
    const anonymousUsers = users.filter(user => {
      return !user.email && !user.phoneNumber && user.providerUserInfo?.length === 0;
    });
    
    console.log(`📋 Encontrados ${anonymousUsers.length} usuarios anónimos de ${users.length} totales`);
    
    if (anonymousUsers.length === 0) {
      console.log('✅ No hay usuarios anónimos para eliminar');
      fs.unlinkSync('users.json');
      process.exit(0);
    }
    
    // Eliminar en lotes
    let deleted = 0;
    for (const user of anonymousUsers) {
      const deleteProcess = spawn('firebase', [
        'auth:delete',
        user.localId,
        '--force'
      ], {
        cwd: process.cwd(),
        shell: true
      });
      
      await new Promise((resolve) => {
        deleteProcess.on('close', (code) => {
          if (code === 0) {
            deleted++;
            if (deleted % 5 === 0) {
              console.log(`  ✓ Eliminados: ${deleted}/${anonymousUsers.length}`);
            }
          }
          resolve();
        });
      });
    }
    
    console.log(`\n✅ Proceso completado: ${deleted} usuarios eliminados`);
    fs.unlinkSync('users.json');
    process.exit(0);
  });
}

// Ejecutar
deleteAnonymousUsers();

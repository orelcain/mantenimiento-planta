/**
 * Script para sincronizar usuario de Firebase Auth a Firestore
 * Crea el perfil en la colección 'users' si no existe
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const db = admin.firestore();

async function syncUser(uid) {
  try {
    console.log(`\n🔍 Buscando usuario con UID: ${uid}`);
    
    // 1. Obtener usuario de Auth
    const userRecord = await auth.getUser(uid);
    console.log('✅ Usuario encontrado en Auth:');
    console.log('   Email:', userRecord.email);
    console.log('   UID:', userRecord.uid);
    console.log('   Creado:', new Date(userRecord.metadata.creationTime).toLocaleString());
    console.log('   Último acceso:', new Date(userRecord.metadata.lastSignInTime).toLocaleString());
    
    // 2. Verificar si existe en Firestore
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (userDoc.exists) {
      console.log('\n⚠️  El usuario YA EXISTE en Firestore:');
      console.log(JSON.stringify(userDoc.data(), null, 2));
      return;
    }
    
    console.log('\n❌ El usuario NO EXISTE en Firestore');
    console.log('📝 Creando perfil...');
    
    // 3. Crear perfil en Firestore
    const newUserProfile = {
      email: userRecord.email,
      nombre: userRecord.displayName || userRecord.email.split('@')[0],
      apellido: '',
      rol: 'tecnico', // Rol por defecto
      activo: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    await db.collection('users').doc(uid).set(newUserProfile);
    
    console.log('✅ Perfil creado exitosamente en Firestore:');
    console.log(JSON.stringify(newUserProfile, null, 2));
    console.log('\n🎉 ¡Usuario sincronizado! Ahora puede iniciar sesión en la app.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.code === 'auth/user-not-found') {
      console.log('\n💡 El UID no existe en Firebase Authentication.');
      console.log('   Verifica que el UID sea correcto.');
    }
  }
}

// Ejecutar
const uid = process.argv[2];

if (!uid) {
  console.log('❌ Error: Debes proporcionar un UID');
  console.log('\n📖 Uso:');
  console.log('   node sync_auth_user_to_firestore.js <UID>');
  console.log('\n📝 Ejemplo:');
  console.log('   node sync_auth_user_to_firestore.js y2B2X0MqHGWBb5DU02910S4euxp2');
  process.exit(1);
}

syncUser(uid)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

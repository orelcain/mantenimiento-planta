const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

(async () => {
  try {
    console.log('📊 Verificando estructura de tokens FCM en Firestore...\n');
    
    // Verificar usuarios activos
    const usersSnapshot = await db.collection('users').where('activo', '==', true).get();
    console.log(`✅ Usuarios activos en BD: ${usersSnapshot.size}`);
    usersSnapshot.forEach(doc => {
      console.log(`  - ${doc.id}: ${doc.data().nombre || 'Sin nombre'}`);
    });

    console.log('\n📱 Estructura de fcmTokens:');
    // Verificar tokens guardados
    const tokensSnapshot = await db.collection('fcmTokens').get();
    console.log(`Total documentos: ${tokensSnapshot.size}\n`);
    
    let totalTokens = 0;
    let validTokens = 0;
    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      totalTokens++;
      const hasUserId = !!data.userId;
      const hasToken = !!data.token;
      console.log(`Documento ${totalTokens}:`);
      console.log(`  ID: ${doc.id.substring(0, 30)}...`);
      console.log(`  userId: ${data.userId || '❌ FALTA'}`);
      console.log(`  token: ${data.token ? '✅ Tiene' : '❌ FALTA'}`);
      console.log(`  platform: ${data.platform || 'N/A'}`);
      if (hasUserId && hasToken) validTokens++;
      console.log('');
    });
    
    console.log(`\n📈 Resumen:`);
    console.log(`  Total documentos: ${totalTokens}`);
    console.log(`  Documentos válidos (con userId + token): ${validTokens}`);
    
    if (validTokens > 0) {
      console.log('✅ Los tokens están bien guardados, la función puede enviar notificaciones');
    } else if (totalTokens > 0) {
      console.log('⚠️  Hay documentos pero están mal formatados');
    } else {
      console.log('⚠️  No hay tokens - los usuarios aún no han activado notificaciones');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();

const admin = require('firebase-admin');
const https = require('https');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

(async () => {
  try {
    console.log('🚀 Enviando notificación de prueba\n');
    
    // 1. Obtener un admin para simular la autenticación
    const adminsSnapshot = await db.collection('users').where('rol', '==', 'admin').limit(1).get();
    
    if (adminsSnapshot.empty) {
      console.log('❌ No hay usuarios admin');
      process.exit(1);
    }

    const adminDoc = adminsSnapshot.docs[0];
    const adminId = adminDoc.id;
    const adminData = adminDoc.data();
    
    console.log(`✅ Admin encontrado: ${adminData.nombre} (${adminId})`);
    console.log(`📊 Estructura de datos:\n`);

    // 2. Mostrar usuarios activos
    const usersSnapshot = await db.collection('users').where('activo', '==', true).get();
    console.log(`  Usuarios activos: ${usersSnapshot.size}`);
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`    - ${data.nombre} (${doc.id})`);
    });

    // 3. Mostrar tokens
    const tokensSnapshot = await db.collection('fcmTokens').get();
    console.log(`\n  Tokens FCM disponibles: ${tokensSnapshot.size}`);
    
    let validTokens = 0;
    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.token) validTokens++;
    });
    console.log(`  Tokens válidos: ${validTokens}\n`);

    // 4. Obtener custom token para simular auth
    console.log('🔑 Generando token de autenticación...');
    const customToken = await admin.auth().createCustomToken(adminId);
    console.log('✅ Token generado\n');

    // 5. Intercambiar custom token por ID token
    console.log('🔄 Intercambiando por ID token...');
    const response = await new Promise((resolve, reject) => {
      const data = JSON.stringify({
        token: customToken,
        returnSecureToken: true
      });

      const options = {
        hostname: 'identitytoolkit.googleapis.com',
        path: '/v1/accounts:signInWithCustomToken?key=' + serviceAccount.api_key,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject).end(data);
    });

    const idToken = response.idToken;
    console.log('✅ ID token obtenido\n');

    // 6. Llamar la Cloud Function con el token
    console.log('📤 Llamando sendTestNotification...\n');
    
    const projectId = 'mantenimiento-planta-771a3';
    const region = 'us-central1';
    const functionName = 'sendTestNotification';
    
    const callResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: `${region}-${projectId}.cloudfunctions.net`,
        path: `/${functionName}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + idToken
        }
      };

      https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, body });
          }
        });
      }).on('error', reject).end(JSON.stringify({}));
    });

    console.log('✅ Respuesta de la función:');
    console.log(`Status: ${callResponse.status}`);
    console.log(JSON.stringify(callResponse.body, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message || error);
    process.exit(1);
  }
})();

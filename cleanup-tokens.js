const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

(async () => {
  try {
    console.log('🧹 Limpiando tokens duplicados/viejos en Firestore\n');
    
    // Obtener todos los tokens
    const tokensSnapshot = await db.collection('fcmTokens').get();
    const tokensByUser = new Map();
    
    // Agrupar tokens por usuario con timestamp
    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.userId) {
        if (!tokensByUser.has(data.userId)) {
          tokensByUser.set(data.userId, []);
        }
        tokensByUser.get(data.userId).push({
          docId: doc.id,
          token: data.token,
          platform: data.platform,
          updatedAt: data.updatedAt?.toDate?.() || new Date(0),
        });
      }
    });

    console.log(`📊 Usuarios con tokens: ${tokensByUser.size}\n`);

    let tokensToDelete = 0;
    
    // Por cada usuario, mantener solo los 2 tokens más recientes
    for (const [userId, tokens] of tokensByUser.entries()) {
      if (tokens.length > 2) {
        console.log(`User ${userId}: tiene ${tokens.length} tokens`);
        
        // Ordenar por fecha (más recientes primero)
        tokens.sort((a, b) => b.updatedAt - a.updatedAt);
        
        // Eliminar los viejos
        const toDelete = tokens.slice(2);
        console.log(`  Manteniendo: ${tokens[0].platform}, ${tokens[1].platform}`);
        console.log(`  Eliminando: ${toDelete.map(t => t.platform).join(', ')}`);
        
        for (const old of toDelete) {
          await db.collection('fcmTokens').doc(old.docId).delete();
          tokensToDelete++;
          console.log(`    ✅ Eliminado: ${old.docId.substring(0, 30)}...`);
        }
        console.log('');
      }
    }

    console.log(`\n📈 Resumen:`);
    console.log(`  Usuarios procesados: ${tokensByUser.size}`);
    console.log(`  Tokens eliminados: ${tokensToDelete}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();

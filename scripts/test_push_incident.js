const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function pickFirst(collection) {
  const snap = await db.collection(collection).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function main() {
  const [equipment, user] = await Promise.all([
    pickFirst('equipment'),
    pickFirst('users'),
  ]);

  if (!equipment) {
    throw new Error('No hay documentos en la colección equipment');
  }
  if (!user) {
    throw new Error('No hay documentos en la colección users');
  }

  const incident = {
    tipo: 'predictivo',
    titulo: 'Alerta CRÍTICA de IoT (prueba)',
    descripcion: `Prueba de notificación push. Equipo: ${equipment.nombre || equipment.codigo || equipment.id}`,
    equipmentId: equipment.id,
    hierarchyNodeId: equipment.hierarchyNodeId || null,
    zoneId: equipment.zoneId || null,
    prioridad: 'critica',
    status: 'pendiente',
    fotos: [],
    reportadoPor: user.id,
    requiresValidation: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    equipoNombre: equipment.nombre || equipment.codigo || equipment.id,
  };

  const ref = await db.collection('incidents').add(incident);
  console.log('Incidencia de prueba creada:', ref.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

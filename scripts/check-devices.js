const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://mantenimiento-planta-771a3-default-rtdb.firebaseio.com'
});

async function checkDevices() {
  try {
    const snapshot = await admin.database().ref('devices').once('value');
    const devices = snapshot.val();
    
    if (!devices) {
      console.log('No hay dispositivos en Firebase RTDB');
      process.exit(0);
    }
    
    console.log('=== DISPOSITIVOS EN FIREBASE RTDB ===\n');
    
    Object.entries(devices).forEach(([deviceId, data]) => {
      console.log(`📱 Device ID: ${deviceId}`);
      console.log(`   Online: ${data.online ? '🟢 Sí' : '🔴 No'}`);
      console.log(`   Last Seen: ${data.lastSeen ? new Date(data.lastSeen).toLocaleString() : 'N/A'}`);
      console.log(`   IP: ${data.ip || 'N/A'}`);
      console.log(`   Firmware: ${data.firmwareVersion || 'N/A'}`);
      console.log(`   Equipo asignado: ${data.assignedEquipmentId || 'Ninguno'}`);
      console.log(`   AP SSID: ${data.apSsid || 'N/A'}`);
      console.log('');
    });
    
    console.log(`Total: ${Object.keys(devices).length} dispositivo(s)`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkDevices();

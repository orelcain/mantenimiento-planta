/**
 * Script para eliminar usuarios anónimos UNO POR UNO desde Firebase Console
 * Genera comandos que puedes ejecutar manualmente
 */

const readline = require('readline');

console.log('╔════════════════════════════════════════════════════╗');
console.log('║  Eliminador de Usuarios Anónimos - Firebase Auth  ║');
console.log('╚════════════════════════════════════════════════════╝');
console.log('');
console.log('📋 INSTRUCCIONES:');
console.log('');
console.log('1. Abre Firebase Console:');
console.log('   https://console.firebase.google.com/project/mantenimiento-planta-771a3/authentication/users');
console.log('');
console.log('2. Para CADA usuario anónimo (los que no tienen email):');
console.log('   - Click en el usuario');
console.log('   - Click en los 3 puntos (⋮) arriba a la derecha');
console.log('   - Click "Eliminar cuenta"');
console.log('   - Confirma');
console.log('');
console.log('3. Repite para TODOS los usuarios sin email');
console.log('');
console.log('⚠️  IMPORTANTE: El nuevo firmware YA NO CREARÁ más usuarios anónimos');
console.log('   (Usa Database Secret en lugar de Auth anónima)');
console.log('');
console.log('✅ Una vez eliminados, presiona ENTER para continuar...');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('', () => {
  console.log('');
  console.log('✓ Listo! Verifica que no queden usuarios anónimos en Firebase Console');
  console.log('');
  rl.close();
  process.exit(0);
});

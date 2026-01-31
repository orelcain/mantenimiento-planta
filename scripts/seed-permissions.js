/**
 * Script para inicializar los permisos por defecto en Firestore
 * 
 * Uso: node scripts/seed-permissions.js
 * 
 * Este script crea los documentos de roles en /roles/{rolId}
 * con los permisos por defecto del sistema.
 */

const admin = require('firebase-admin')
const path = require('path')
const fs = require('fs')

// ============================================================================
// CONFIGURACIÓN DE FIREBASE
// ============================================================================

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json')

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ No se encontró serviceAccountKey.json')
  console.log('   Asegúrate de tener el archivo en la raíz del proyecto')
  process.exit(1)
}

const serviceAccount = require(serviceAccountPath)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

// ============================================================================
// DEFINICIÓN DE MÓDULOS Y ACCIONES
// ============================================================================

const MODULES = [
  'dashboard',
  'incidencias',
  'equipos',
  'zonas',
  'preventivo',
  'mapa',
  'jerarquia',
  'repuestos',
  'inspecciones',
  'recorridos',
  'fotoevidencia',
  'iot',
  'sensores',
  'ett',
  'configuracion',
  'usuarios',
  'reportes',
]

const ACTIONS = ['ver', 'crear', 'editar', 'eliminar', 'validar', 'asignar', 'ejecutar', 'cerrar', 'exportar', 'configurar']

// ============================================================================
// PERMISOS POR DEFECTO
// ============================================================================

const ADMIN_PERMISSIONS = {}
MODULES.forEach(mod => {
  ADMIN_PERMISSIONS[mod] = { visible: true, actions: ACTIONS }
})

const SUPERVISOR_PERMISSIONS = {
  dashboard: { visible: true, actions: ['ver', 'exportar'] },
  incidencias: { visible: true, actions: ['ver', 'crear', 'editar', 'validar', 'asignar', 'cerrar', 'exportar'] },
  equipos: { visible: true, actions: ['ver', 'crear', 'editar', 'exportar'] },
  zonas: { visible: true, actions: ['ver', 'crear', 'editar'] },
  preventivo: { visible: true, actions: ['ver', 'crear', 'editar', 'ejecutar', 'asignar', 'exportar'] },
  mapa: { visible: true, actions: ['ver'] },
  jerarquia: { visible: true, actions: ['ver', 'editar'] },
  repuestos: { visible: true, actions: ['ver', 'crear', 'editar', 'exportar'] },
  inspecciones: { visible: true, actions: ['ver', 'crear', 'editar', 'ejecutar'] },
  recorridos: { visible: true, actions: ['ver', 'crear', 'editar', 'ejecutar'] },
  fotoevidencia: { visible: true, actions: ['ver', 'crear', 'exportar'] },
  iot: { visible: true, actions: ['ver', 'configurar'] },
  sensores: { visible: true, actions: ['ver', 'exportar'] },
  ett: { visible: true, actions: ['ver', 'crear', 'editar', 'exportar'] },
  configuracion: { visible: false, actions: [] },
  usuarios: { visible: false, actions: [] },
  reportes: { visible: true, actions: ['ver', 'exportar'] },
}

const TECNICO_PERMISSIONS = {
  dashboard: { visible: true, actions: ['ver'] },
  incidencias: { visible: true, actions: ['ver', 'crear', 'cerrar'] },
  equipos: { visible: true, actions: ['ver'] },
  zonas: { visible: true, actions: ['ver'] },
  preventivo: { visible: true, actions: ['ver', 'ejecutar'] },
  mapa: { visible: true, actions: ['ver'] },
  jerarquia: { visible: true, actions: ['ver'] },
  repuestos: { visible: true, actions: ['ver'] },
  inspecciones: { visible: true, actions: ['ver', 'ejecutar'] },
  recorridos: { visible: true, actions: ['ver', 'ejecutar'] },
  fotoevidencia: { visible: true, actions: ['ver', 'crear'] },
  iot: { visible: true, actions: ['ver'] },
  sensores: { visible: true, actions: ['ver'] },
  ett: { visible: true, actions: ['ver'] },
  configuracion: { visible: false, actions: [] },
  usuarios: { visible: false, actions: [] },
  reportes: { visible: true, actions: ['ver'] },
}

const USUARIO_PERMISSIONS = {
  dashboard: { visible: true, actions: ['ver'] },
  incidencias: { visible: true, actions: ['ver', 'crear'] },
  equipos: { visible: true, actions: ['ver'] },
  zonas: { visible: true, actions: ['ver'] },
  preventivo: { visible: false, actions: [] },
  mapa: { visible: true, actions: ['ver'] },
  jerarquia: { visible: false, actions: [] },
  repuestos: { visible: false, actions: [] },
  inspecciones: { visible: false, actions: [] },
  recorridos: { visible: false, actions: [] },
  fotoevidencia: { visible: true, actions: ['ver', 'crear'] },
  iot: { visible: false, actions: [] },
  sensores: { visible: false, actions: [] },
  ett: { visible: false, actions: [] },
  configuracion: { visible: false, actions: [] },
  usuarios: { visible: false, actions: [] },
  reportes: { visible: false, actions: [] },
}

const ROLES_DATA = [
  {
    id: 'admin',
    nombre: 'Administrador',
    descripcion: 'Acceso completo al sistema. Gestión de usuarios, configuración y todos los módulos.',
    permisos: ADMIN_PERMISSIONS,
    esDefault: true,
  },
  {
    id: 'supervisor',
    nombre: 'Supervisor',
    descripcion: 'Gestión de incidencias, equipos y tareas. Puede validar y asignar trabajo.',
    permisos: SUPERVISOR_PERMISSIONS,
    esDefault: true,
  },
  {
    id: 'tecnico',
    nombre: 'Técnico',
    descripcion: 'Ejecuta tareas asignadas, cierra incidencias y realiza inspecciones.',
    permisos: TECNICO_PERMISSIONS,
    esDefault: true,
  },
  {
    id: 'usuario',
    nombre: 'Usuario',
    descripcion: 'Acceso básico. Puede reportar incidencias y ver información general.',
    permisos: USUARIO_PERMISSIONS,
    esDefault: true,
  },
]

// ============================================================================
// FUNCIONES
// ============================================================================

async function seedRoles() {
  console.log('\n🔐 Inicializando permisos por defecto...\n')

  for (const role of ROLES_DATA) {
    const roleRef = db.collection('roles').doc(role.id)
    const existing = await roleRef.get()

    if (existing.exists) {
      console.log(`⚠️  Rol '${role.id}' ya existe, actualizando...`)
    }

    await roleRef.set({
      ...role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'seed-script',
    })

    console.log(`✅ Rol '${role.id}' configurado`)
    
    // Mostrar resumen de permisos
    const visibleModules = Object.entries(role.permisos)
      .filter(([, p]) => p.visible)
      .map(([mod]) => mod)
    console.log(`   └─ ${visibleModules.length} módulos visibles`)
  }

  console.log('\n✨ Permisos inicializados correctamente!\n')
}

// ============================================================================
// EJECUCIÓN
// ============================================================================

seedRoles()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err.message)
    process.exit(1)
  })

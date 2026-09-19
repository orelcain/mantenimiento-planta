/**
 * crear-areas-conjuntos-bitacora — agrega a `hierarchy` las tres áreas que el
 * trabajo real nombra como una unidad y el árbol no tenía.
 *
 * Por qué: se cruzaron los 12 eventos de bitácora con el equipo escrito a mano
 * contra los 702 nodos de la jerarquía y NINGUNO coincidía. Tres de esos
 * nombres son trabajo repetido y legítimo —«CINTAS FILETE», «CINTAS HG» y
 * «LINEA MANUAL HG»— pero no son una máquina con código SAP: son conjuntos.
 * Como área entran al buscador, se vinculan y se pueden contar por turno.
 *
 * Dónde cuelgan (confirmado por Orel el 18-09-2026): **HG es EVISCERADO** y
 * Filete es FILETE. No se asumió: el árbol no tiene ningún área llamada «HG».
 *
 * Son las primeras áreas de NIVEL 5 del árbol (hasta ahora, los hijos de un
 * área de proceso eran siempre equipos). `isBaseStructure: false`, igual que
 * cualquier nodo creado desde la app (useHierarchy.createNode).
 *
 *   node scripts/crear-areas-conjuntos-bitacora.js            ← DRY-RUN
 *   node scripts/crear-areas-conjuntos-bitacora.js --write    ← aplica
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const CLON_PRINCIPAL = 'D:\\a\\APP leventamiento de insidencias en planta';
const REPO = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : CLON_PRINCIPAL;
const credencial = [REPO, CLON_PRINCIPAL]
  .map((b) => path.join(b, 'serviceAccountKey.json'))
  .find((f) => fs.existsSync(f));
admin.initializeApp({ credential: admin.credential.cert(require(credencial)) });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');

const NUEVAS = [
  {
    id: 'aq-in-cho-pcho-proc-file-cint',
    nombre: 'CINTAS FILETE',
    codigo: 'AQ-IN-CHO-PCHO-PROC-FILE-CINT',
    parentId: 'aq-in-cho-pcho-proc-file',
    descripcion: 'Conjunto de cintas de la línea de filete: se montan y desmontan como una unidad para higiene.',
  },
  {
    id: 'aq-in-cho-pcho-proc-evis-cint',
    nombre: 'CINTAS HG',
    codigo: 'AQ-IN-CHO-PCHO-PROC-EVIS-CINT',
    parentId: 'aq-in-cho-pcho-proc-evis',
    descripcion: 'Conjunto de cintas de la línea HG (eviscerado): se montan y desmontan como una unidad para higiene.',
  },
  {
    id: 'aq-in-cho-pcho-proc-evis-lman',
    nombre: 'LINEA MANUAL HG',
    codigo: 'AQ-IN-CHO-PCHO-PROC-EVIS-LMAN',
    parentId: 'aq-in-cho-pcho-proc-evis',
    descripcion: 'Línea de trabajo manual de HG (eviscerado).',
  },
];

async function main() {
  const snap = await db.collection('hierarchy').get();
  const porId = new Map(snap.docs.map((d) => [d.id, d.data()]));
  const codigos = new Set(snap.docs.map((d) => d.data().codigo).filter(Boolean));
  const ultimoOrden = new Map();

  for (const n of NUEVAS) {
    const padre = porId.get(n.parentId);
    if (!padre) {
      console.error(`✗ ${n.nombre}: no existe el padre ${n.parentId}`);
      process.exitCode = 1;
      continue;
    }
    if (porId.has(n.id)) {
      console.log(`· ${n.nombre}: ya existe (${n.id})`);
      continue;
    }
    if (codigos.has(n.codigo)) {
      console.error(`✗ ${n.nombre}: el código ${n.codigo} ya está en uso`);
      process.exitCode = 1;
      continue;
    }

    // `orden` va después del último hermano, como hace la app. El contador en
    // memoria evita que dos nodos nuevos bajo el MISMO padre (CINTAS HG y
    // LINEA MANUAL HG) queden empatados: el snapshot no ve al recién creado.
    const hermanos = snap.docs.map((d) => d.data()).filter((x) => x.parentId === n.parentId);
    const base = hermanos.reduce((m, x) => Math.max(m, Number(x.orden) || 0), 0);
    const orden = Math.max(base, ultimoOrden.get(n.parentId) ?? 0) + 1;
    ultimoOrden.set(n.parentId, orden);
    const doc = {
      nombre: n.nombre,
      codigo: n.codigo,
      nivel: (Number(padre.nivel) || 4) + 1,
      parentId: n.parentId,
      path: [...(padre.path ?? []), n.parentId],
      orden,
      activo: true,
      tipoNodo: 'area',
      descripcion: n.descripcion,
      isBaseStructure: false,
      creadoPor: 'script:crear-areas-conjuntos-bitacora',
      creadoEn: admin.firestore.Timestamp.now(),
      actualizadoEn: admin.firestore.Timestamp.now(),
    };

    console.log(`${WRITE ? '✓' : '·'} ${n.nombre} → ${padre.nombre} (nivel ${doc.nivel}, orden ${orden})`);
    // De a UNO: si falla el segundo, el primero ya quedó bien y se ve cuál faltó.
    if (WRITE) await db.collection('hierarchy').doc(n.id).set(doc);
  }

  if (!WRITE) console.log('\nDRY-RUN: no se escribió nada. Repetir con --write.');
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => {
  console.error(e);
  process.exit(2);
});

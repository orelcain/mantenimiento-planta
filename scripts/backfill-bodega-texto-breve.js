/**
 * backfill-bodega-texto-breve — denormaliza `textoBreve` (nombre de catálogo)
 * en los docs existentes de la colección `bodega`.
 *
 * El doc de bodega solo tenía SAP+stock+ubicación: las cards de la pestaña
 * Bodega dependían del merge con el maestro `repuestos` (~7.700 docs) para
 * mostrar el nombre. Con el nombre denormalizado el doc es auto-descriptivo
 * (cards, exports y functions pueden nombrarlo sin bajar el maestro).
 *
 * Los write-paths de la app (useBodega.denormNombre) mantienen el campo al día
 * en cada creación/edición — este script es para el backlog inicial y para
 * re-sincronizar tras renombres masivos en el catálogo.
 *
 * Idempotente: solo escribe docs sin `textoBreve` o cuyo nombre difiere del
 * catálogo actual. Docs de bodega cuyo SAP no tiene nombre en el catálogo se
 * reportan y se dejan como están.
 *
 *   node scripts/backfill-bodega-texto-breve.js            ← DRY-RUN (no escribe)
 *   node scripts/backfill-bodega-texto-breve.js --write    ← aplica
 *
 * Credenciales: serviceAccountKey.json en la raíz del repo, o ruta explícita
 * en la env SERVICE_ACCOUNT (útil al correr desde un worktree).
 */
const admin = require('firebase-admin');
const path = require('path');
const keyPath = process.env.SERVICE_ACCOUNT || path.join(__dirname, '..', 'serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');

(async () => {
  console.log('Cargando repuestos + bodega…');
  const [repSnap, bodSnap] = await Promise.all([
    db.collection('repuestos').get(),
    db.collection('bodega').get(),
  ]);

  // Nombre de catálogo por SAP (primer nombre no vacío gana — mismo criterio
  // que useBodega.nombrePorSap).
  const nombrePorSap = new Map();
  repSnap.docs.forEach((d) => {
    const x = d.data();
    const sap = (x.codigoSAP || '').trim();
    const nombre = x.textoBreve || x.descripcion || '';
    if (sap && nombre && !nombrePorSap.has(sap)) nombrePorSap.set(sap, nombre);
  });

  const updates = [];
  let yaAlDia = 0;
  const sinNombreEnCatalogo = [];

  bodSnap.docs.forEach((d) => {
    const x = d.data();
    const sap = (x.codigoSAP || d.id).trim();
    const nombre = nombrePorSap.get(sap);
    if (!nombre) { sinNombreEnCatalogo.push(sap); return; }
    if ((x.textoBreve || '') === nombre) { yaAlDia++; return; }
    updates.push({ id: d.id, textoBreve: nombre });
  });

  console.log(`\nDocs de bodega: ${bodSnap.size}`);
  console.log(`Repuestos con nombre en catálogo: ${nombrePorSap.size} SAPs`);
  console.log(`Ya al día (textoBreve idéntico): ${yaAlDia}`);
  console.log(`Sin nombre en catálogo (se dejan igual): ${sinNombreEnCatalogo.length}`);
  if (sinNombreEnCatalogo.length) console.log(`  SAPs: ${sinNombreEnCatalogo.slice(0, 20).join(', ')}${sinNombreEnCatalogo.length > 20 ? '…' : ''}`);
  console.log(`A actualizar: ${updates.length}`);
  if (updates.length) {
    console.log('\nMuestra de lo que se escribiría:');
    updates.slice(0, 5).forEach((u) => console.log(`  ${u.id} → "${u.textoBreve}"`));
  }

  if (!WRITE) {
    console.log('\nDRY-RUN (no se escribió nada). Repite con --write para aplicar.');
    process.exit(0);
  }

  console.log(`\nEscribiendo ${updates.length} docs de bodega…`);
  let done = 0;
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    const chunk = updates.slice(i, i + 400);
    for (const u of chunk) {
      batch.update(db.collection('bodega').doc(u.id), { textoBreve: u.textoBreve });
    }
    await batch.commit();
    done += chunk.length;
    console.log(`  ${done}/${updates.length}`);
  }
  console.log('\nListo.');
  process.exit(0);
})();

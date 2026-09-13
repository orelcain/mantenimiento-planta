const admin = require('firebase-admin');
const fs = require('fs'), path = require('path');
const saPath = "D:/a/APP leventamiento de insidencias en planta/serviceAccountKey.json";
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(saPath,'utf-8'))) });
const db = admin.firestore();
(async () => {
  const COL = process.argv[2];
  const snap = await db.collection(COL).get();
  for (const d of snap.docs) {
    const favs = d.data().repuestoFavs;
    if (Array.isArray(favs) && favs.length) console.log(d.id, JSON.stringify(favs));
  }
  process.exit(0);
})();

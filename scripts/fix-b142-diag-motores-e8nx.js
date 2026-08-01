/**
 * fix-b142-diag-motores-e8nx — corrige el mapeo de motores paso a paso en el
 * diagnóstico "Códigos de error E77x/E8xx" de la Baader 142.
 *
 * El problema: el doc traía DOS mapeos contradictorios. Las causas decían
 * E771–E775 = centraje/cuchilla abridora/... (SM1 = centraje) y la solución decía
 * "X = 1 Cuchilla abridora, = 2 Centraje". Un técnico que va a buscar el motor
 * SM1 por un código E8N1 encuentra una respuesta distinta según qué línea lea.
 *
 * OJO — la contradicción es DEL MANUAL, no de quien curó la ficha: el manual
 * `498_142-Manual de Instrucciones-2005-12-E.pdf` trae las dos versiones en la
 * MISMA pág. 41. Tres fuentes desempatan a favor de SM1 = Centraje:
 *   · pág. 41, códigos E771–E775: B21 → SM1 (centraje), B22 → SM2 (cuchilla abridora)
 *   · pág. 45, pantalla real del HMI: "CENTERING SM1", "SUCTION DEV. SM3"
 *   · pág. 67, lista de componentes: SM1 centraje · SM2 cuchilla hendedora ·
 *     SM3 aspirador · SM4 excavador A · SM5 excavador B
 * La línea "X = 1 Cuchilla abridora / = 2 Centraje" es una errata aislada del
 * fabricante. Se corrige Y se deja anotada, para que quien tenga el manual en la
 * mano no crea que la ficha está equivocada.
 *
 * (SM2 aparece como "cuchilla abridora" en la pág. 41 y "cuchilla hendedora" en la
 * pág. 67 — son el mismo motor, se citan los dos nombres.)
 *
 * Snapshot previo: _snapshots/b142_diag_E77x_pre-fix_2026-08-01.json
 *
 *   node scripts/fix-b142-diag-motores-e8nx.js            ← DRY-RUN
 *   node scripts/fix-b142-diag-motores-e8nx.js --write    ← aplica
 */
const admin = require('firebase-admin');
const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json'))) });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');

const DOC = db.collection('learningContent').doc('baader-142').collection('diagnosis').doc('diag_1779400613052_g5ailew');

const SOLUCION = `Identificar el código en la unidad de control.
E821–E825: pulsar I (marcha de referencia) y otra vez I (arranque).
E77x: revisar/reemplazar el transmisor de rotación del motor indicado (encoder).
E80x/E83x: revisar el interruptor de aproximación y su distancia.

E 8 N X : N = función del motor paso a paso (de 0 a 6)
          X = número del motor paso a paso:
              1 = SM1 Centraje
              2 = SM2 Cuchilla abridora (llamada "hendedora" en la pág. 67)
              3 = SM3 Aspirador
              4 = SM4 Excavador A
              5 = SM5 Excavador B

⚠ El manual (pág. 41) trae DOS versiones de esta tabla y se contradice: en un
recuadro dice "1 = Cuchilla abridora, 2 = Centraje". Esa es una errata del
fabricante. Vale el mapeo de arriba, confirmado por los códigos E771–E775 de esa
misma página (B21 → SM1 centraje), por la pantalla del control (pág. 45:
"CENTERING SM1", "SUCTION DEV. SM3") y por la lista de componentes (pág. 67).

E900–E999 o movimientos incontrolados: desconectar el interruptor principal por al
menos 5 segundos y reiniciar.`;

const CAUSA_0 = 'E771–E775: transmisor de rotación (encoder) defectuoso — E771 = B21/SM1 centraje · E772 = B22/SM2 cuchilla abridora · E773 = B23/SM3 aspirador · E774 = B24/SM4 excavador A · E775 = B25/SM5 excavador B';

(async () => {
  console.log('=== FIX mapeo motores E8NX · baader-142 ' + (WRITE ? '(--WRITE)' : '(DRY-RUN)') + ' ===\n');
  const snap = await DOC.get();
  if (!snap.exists) { console.error('El doc no existe. Abortado.'); process.exit(1); }
  const actual = snap.data();

  const causas = [...actual.possibleCauses];
  if (!/^E771/.test(causas[0])) {
    console.error('La causa 0 no es la de E771–E775; el doc cambió. Abortado para no pisar nada.');
    process.exit(1);
  }
  causas[0] = CAUSA_0;

  console.log('--- SOLUCIÓN: antes ---');
  console.log(actual.solution.split('\n').filter(l => /X ?=|= ?[1-5]/.test(l)).join('\n') || '(sin tabla)');
  console.log('\n--- SOLUCIÓN: después ---');
  console.log(SOLUCION.split('\n').filter(l => /[1-5] = SM/.test(l)).join('\n'));
  console.log('\n--- CAUSA 0: antes ---\n' + actual.possibleCauses[0]);
  console.log('\n--- CAUSA 0: después ---\n' + CAUSA_0);

  if (WRITE) {
    await DOC.set({ ...actual, solution: SOLUCION, possibleCauses: causas, updatedAt: Date.now() });
    console.log('\n✔ Aplicado.');
  } else {
    console.log('\n(DRY-RUN: no se escribió nada. Repetir con --write para aplicar.)');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

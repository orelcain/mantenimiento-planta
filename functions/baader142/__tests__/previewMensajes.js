/**
 * Vista previa de los mensajes que llegarían a Telegram — no es un test, es para
 * MIRAR la redacción antes de soltarla al grupo. Correr con:
 *   node baader142/__tests__/previewMensajes.js
 */
const a = require('../protocoloAlertas')

const base = (o = {}) => ({
  maquina: 'baader-n1', fecha: '2026-08-15', fish: 1000,
  stops: 0, stopc: 0, tclip: 0, tclipc: 0, anusi: 0, anuso: 0,
  e821: 0, e821c: 0, e822: 0, e822c: 0, e823: 0, e823c: 0,
  e824: 0, e824c: 0, e825: 0, e825c: 0, ...o,
})

/** Cómo se ve el HTML de Telegram ya renderizado. */
const plano = (s) =>
  s.replace(/<a href="[^"]*">/g, '').replace(/<\/a>/g, '')
   .replace(/<b>/g, '').replace(/<\/b>/g, '')

const casos = [
  ['1) Caso real 08-08 — primera lectura, excavador B crítico',
    a.evaluarLectura(base({ fish: 1299, e825c: 452, e824c: 3, e822c: 1 }), [])],

  ['2) Semana siguiente — el B empeora y el aspirador empieza a subir',
    a.evaluarLectura(
      base({ fecha: '2026-08-22', fish: 4200, e825c: 1700, e823c: 38, e824c: 5 }),
      [base({ fish: 1299, e825c: 452, e823c: 20 }), base({ fish: 900, e825c: 300, e823c: 9 })])],

  ['3) Tendencia temprana — todavía barato de mirar',
    a.evaluarLectura(
      base({ fecha: '2026-08-29', fish: 3000, e822c: 27 }),
      [base({ fish: 2000, e822c: 12 }), base({ fish: 1500, e822c: 6 })])],

  ['4) Falla dura — paró sin correcciones previas',
    a.evaluarLectura(base({ fecha: '2026-09-05', fish: 3100, e823: 5, e823c: 0 }), [])],

  ['5) Sigue igual que la semana pasada',
    a.evaluarLectura(base({ fish: 2000, e825c: 100 }), [base({ fish: 1000, e825c: 50 })])],
]

for (const [titulo, ev] of casos) {
  console.log('\n' + '='.repeat(64))
  console.log(titulo)
  console.log('='.repeat(64))
  const msg = a.componerAlerta(ev)
  console.log(msg ? plano(msg) : '(sin alerta — no se manda nada)')
}

console.log('\n' + '='.repeat(64))
console.log('6) Recordatorio del viernes — falta registrar dos')
console.log('='.repeat(64))
console.log(plano(a.componerRecordatorio(['baader-n1'], {
  'baader-n1': '2026-08-15', 'baader-n2': '2026-07-25',
})))

console.log('\n' + '='.repeat(64))
console.log('7) Recordatorio con las tres al día')
console.log('='.repeat(64))
const r = a.componerRecordatorio(['baader-n1', 'baader-n2', 'baader-n3'])
console.log(r ? plano(r) : '(no se manda nada — silencio es que están todas)')

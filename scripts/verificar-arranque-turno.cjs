/**
 * Verificador diario del arranque de turno (Shoplogix -> Firestore).
 *
 * Nacio del fix #374 (arranque anticipado): el turno arranca antes de las 08:00
 * y esos ciclos se perdian, o peor, se le sumaban al dia anterior. Este script
 * comprueba todos los dias que siga entrando bien, sin depender de que alguien
 * abra la app.
 *
 * Que revisa, por planta y por turno del dia:
 *   1. ARRANQUE     scheduledStart vs officialSchedule.start del propio doc.
 *                   Es la senal DIRECTA de arranque perdido (mejor que "empieza
 *                   08:00 clavadas", que da falsos positivos en turnos que de
 *                   verdad empiezan a esa hora).
 *   2. FUENTE       contrasta contra shoplogixProbe: si Shoplogix reporta el
 *                   turno arrancando antes de lo guardado, el dano es real.
 *   3. FRESCURA     lastSyncAt reciente => el turno vivo no quedo congelado
 *                   (bug del freeze, julio 2026).
 *   4. COHERENCIA   suma de machines[] del doc padre == suma de la subcoleccion.
 *   5. CALIDAD      dataQualityIssues vacio.
 *
 * Uso:
 *   node scripts/verificar-arranque-turno.cjs [YYYY-MM-DD]
 *   node scripts/verificar-arranque-turno.cjs --probar-aviso
 *
 * Corre solo todos los dias vía el Programador de tareas de Windows (ver
 * `verificar-arranque-turno.cmd`) y avisa por Telegram SOLO si encuentra algo.
 *
 * Salida: reporte por consola + archivo, y exit code
 *   0 = todo bien   1 = hay algo que mirar   2 = el script no pudo correr
 *
 * Necesita del repo (ambos gitignored, se leen en runtime):
 *   serviceAccountKey.json   — credencial de Firestore
 *   functions/.env           — ADMIN_SETUP_KEY y las de Telegram
 */

const fs = require('fs')
const path = require('path')

/** Raiz del repo, derivada de la ubicacion del script: sirve en cualquier clon o worktree. */
const REPO = path.resolve(__dirname, '..')
const admin = require('firebase-admin')
const PLANTAS = ['chonchi', 'yal', 'filete']
const CF = 'https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net'

/**
 * Los reportes se escriben FUERA del repo: son datos de cada corrida, no codigo,
 * y ensuciarian `git status` todos los dias. Se puede redirigir con
 * VERIFICAR_TURNO_REPORTES.
 */
const DIR_REPORTES = process.env.VERIFICAR_TURNO_REPORTES
  || path.join(process.env.USERPROFILE || process.env.HOME || REPO,
    'OneDrive', 'ANTARFOOD', '_HERRAMIENTAS', 'verificar-turno', 'reportes')

/** Tolerancia para "el arranque guardado coincide con el declarado". */
const TOLERANCIA_ARRANQUE_MIN = 5
/** Cuanto puede llevar sin sincronizar un turno EN CURSO antes de sospechar. */
const FRESCURA_MAX_MIN = 25
/** Bajo esto, un Unscheduled es ruido y no se reporta (igual que la app). */
const RUIDO_CICLOS = 50

const hallazgos = []
const lineas = []
const say = (s = '') => { lineas.push(s); console.log(s) }
const problema = (s) => { hallazgos.push(s); say(`  [!!] ${s}`) }
const ok = (s) => say(`  [OK] ${s}`)

/** Reloj de planta (America/Santiago), robusto a horario de verano. */
function ahoraChile() {
  const p = {}
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date())) p[x.type] = x.value
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    texto: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`,
  }
}

/**
 * Offset UTC de Chile (3 en verano, 4 en invierno). Necesario porque todo lo
 * derivado de intervals viaja en wall-clock-as-UTC y los timestamps reales
 * (lastSyncAt, Date.now) en UTC de verdad: compararlos crudos corre el reloj.
 */
function offsetChileHoras(cuando = new Date()) {
  const p = {}
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(cuando)) p[x.type] = x.value
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute)
  return Math.round((cuando.getTime() - wall) / 3600000)
}

/**
 * Dia de turno vigente. La ventana del sync ancla a las 06:00: antes de esa
 * hora seguimos dentro del dia anterior y hay que mirar ESE dateKey.
 */
function diaDeTurno() {
  const n = ahoraChile()
  if (n.hora >= 6) return n.fecha
  const d = new Date(`${n.fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

const aFecha = (t) => (t?.toDate ? t.toDate() : t instanceof Date ? t : typeof t === 'string' ? new Date(t) : null)
const hhmm = (d) => (d ? d.toISOString().slice(11, 16) : '--:--')
const minEntre = (a, b) => Math.round((a.getTime() - b.getTime()) / 60000)

/** Lee una variable de functions/.env. Los secretos nunca van al reporte. */
function env(nombre) {
  const m = fs.readFileSync(`${REPO}/functions/.env`, 'utf8').match(new RegExp(`^${nombre}=(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

function adminKey() {
  const k = env('ADMIN_SETUP_KEY')
  if (!k) throw new Error('ADMIN_SETUP_KEY no esta en functions/.env')
  return k
}

/**
 * Aviso por Telegram — SOLO cuando hay algo que mirar. Un "todo bien" diario se
 * vuelve ruido y a la semana nadie lo lee.
 *
 * Usa el mismo bot y grupo que la app (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID de
 * functions/.env). Nunca tumba la corrida: el reporte en disco ya se escribio.
 */
async function avisarTelegram(texto) {
  try {
    const token = env('TELEGRAM_BOT_TOKEN')
    const chat = env('TELEGRAM_CHAT_ID')
    if (!token || !chat) { console.log('  (sin credenciales de Telegram — aviso omitido)'); return }
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(30000),
    })
    console.log(r.ok ? '  aviso enviado a Telegram' : `  Telegram respondio ${r.status}: ${(await r.text()).slice(0, 160)}`)
  } catch (e) {
    console.log(`  no se pudo avisar por Telegram: ${e.message}`)
  }
}

const escaparHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** shiftSummary del probe: {shiftId: {firstStart, lastEnd, totalCycles}}. */
async function probe(plantSlug, dateKey, key) {
  const r = await fetch(`${CF}/shoplogixProbe?plantSlug=${plantSlug}&dateKey=${dateKey}&key=${key}`,
    { signal: AbortSignal.timeout(120000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()).shiftSummary || {}
}

/** "20260806T074500.000" (wall-clock-as-UTC) -> Date comparable con Firestore. */
function deShoplogix(s) {
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/)
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
}

async function main() {
  // `--probar-aviso` valida el canal de Telegram (token, chat, HTML) sin tener
  // que fabricar una falsa alarma en el grupo.
  if (process.argv.includes('--probar-aviso')) {
    await avisarTelegram(
      `✅ <b>Prueba del verificador de turno</b>\n\n` +
      `El canal funciona. De acá en adelante este bot solo escribe si el arranque ` +
      `del turno NO quedó bien guardado — si no dice nada, está todo en orden.`,
    )
    process.exit(0)
  }

  const dateKey = process.argv[2] || diaDeTurno()
  const n = ahoraChile()
  say(`VERIFICACION DE ARRANQUE DE TURNO`)
  say(`dia de turno: ${dateKey}   ·   corrida: ${n.texto} hora de planta`)
  say('='.repeat(72))

  admin.initializeApp({ credential: admin.credential.cert(require(`${REPO}/serviceAccountKey.json`)) })
  const db = admin.firestore()
  const FP = admin.firestore.FieldPath
  const key = adminKey()

  // Inicio de la ventana del sync para ese dia (WINDOW_START_HOUR = 6, ver #374).
  const [yy, mm, dd] = dateKey.split('-').map(Number)
  const ventanaInicio = new Date(Date.UTC(yy, mm - 1, dd, 6, 0, 0))

  for (const plant of PLANTAS) {
    say(`\n### ${plant.toUpperCase()}`)

    const snap = await db.collection(`shoplogix/${plant}/shifts`)
      .orderBy(FP.documentId()).startAt(dateKey).endAt(`${dateKey}\uf8ff`).get()

    if (snap.empty) {
      problema(`${plant}: no hay NINGUN turno de ${dateKey} en Firestore`)
      continue
    }

    let resumen = {}
    try {
      resumen = await probe(plant, dateKey, key)
    } catch (e) {
      say(`  [--] probe no disponible (${e.message}) — se verifica solo contra Firestore`)
    }

    for (const doc of snap.docs) {
      const v = doc.data()
      const shiftId = v.shiftId || doc.id.slice(11)
      const inicio = aFecha(v.scheduledStart)
      const fin = aFecha(v.scheduledEnd)
      const ciclos = (v.machines || []).reduce((a, m) => a + (m.totalCycles || 0), 0)

      if (shiftId === 'Unscheduled' && ciclos < RUIDO_CICLOS) continue   // ruido: la app tampoco lo muestra

      say(`\n  ${shiftId}  ${hhmm(inicio)}->${hhmm(fin)}  ${ciclos} ciclos`)
      if (!inicio || !fin) { problema(`${plant} ${shiftId}: sin scheduledStart/End`); continue }

      // 1. ARRANQUE — contra el horario oficial que declara Shoplogix.
      const oficial = aFecha(v.officialSchedule?.start)
      if (oficial) {
        const perdidos = minEntre(inicio, oficial)
        if (perdidos > TOLERANCIA_ARRANQUE_MIN) {
          problema(`${plant} ${shiftId}: arranca ${hhmm(inicio)} pero Shoplogix declara ${hhmm(oficial)} — faltan ${perdidos} min de arranque`)
        } else if (perdidos < -TOLERANCIA_ARRANQUE_MIN) {
          ok(`arranque anticipado real capturado: produjo desde ${hhmm(inicio)}, declarado ${hhmm(oficial)}`)
        } else {
          ok(`arranque coincide con lo declarado (${hhmm(oficial)})`)
        }
      } else {
        say(`  [--] sin officialSchedule (normal en dias historicos)`)
      }

      // 2. FUENTE — lo que Shoplogix dice AHORA para ese turno.
      //
      // Solo vale para turnos que arrancan DENTRO de la ventana del dia (desde
      // las 06:00). Un nocturno empieza antes y el probe de hoy solo ve su cola:
      // compararlos daba un "coincide (06:00)" falso para un doc que dice 00:00,
      // y —peor— habria dado OK justo el dia en que esa cola pisara al nocturno.
      // Tampoco sirve el probe de ayer: agrupa por nombre sin separar por
      // continuidad, asi que fusionaria los dos nocturnos. Para esos turnos manda
      // el chequeo 1, que compara contra el horario declarado.
      const p = resumen[shiftId] || resumen[v.rawShiftId]
      if (inicio.getTime() < ventanaInicio.getTime()) {
        say(`  [--] arranca antes de la ventana del dia (${hhmm(ventanaInicio)}): no comparable con el probe — lo cubre el chequeo contra el horario declarado`)
      } else if (p) {
        const realInicio = deShoplogix(p.firstStart)
        if (realInicio) {
          const dif = minEntre(inicio, realInicio)
          if (Math.abs(dif) > TOLERANCIA_ARRANQUE_MIN) {
            problema(`${plant} ${shiftId}: Shoplogix lo tiene desde ${hhmm(realInicio)} y el doc desde ${hhmm(inicio)} — ${Math.abs(dif)} min de diferencia`)
          } else {
            ok(`la ventana coincide con Shoplogix (${hhmm(realInicio)})`)
          }
        }
      }

      // 3. FRESCURA — un turno en curso tiene que estar escribiendose.
      // `fin` viene en wall-clock-as-UTC y Date.now() es UTC real: hay que sumar
      // el offset de Chile (varia con el horario de verano) antes de comparar.
      const ultimo = aFecha(v.lastSyncAt)
      const enCurso = Date.now() < fin.getTime() + offsetChileHoras() * 3600e3
      if (ultimo) {
        const edad = Math.round((Date.now() - ultimo.getTime()) / 60000)
        if (enCurso && edad > FRESCURA_MAX_MIN) {
          problema(`${plant} ${shiftId}: turno en curso pero sin sincronizar hace ${edad} min (¿congelado?)`)
        } else {
          ok(`ultimo sync hace ${edad} min`)
        }
      } else {
        problema(`${plant} ${shiftId}: sin lastSyncAt`)
      }

      // 4. COHERENCIA — el padre tiene que decir lo mismo que la subcoleccion.
      const subs = await doc.ref.collection('machines').get()
      const ciclosSub = subs.docs.reduce((a, m) => a + (m.data().totalCycles || 0), 0)
      if (ciclos !== ciclosSub) {
        problema(`${plant} ${shiftId}: doc padre ${ciclos} ciclos vs subcoleccion ${ciclosSub}`)
      } else {
        ok(`padre y subcoleccion coinciden (${subs.size} ${subs.size === 1 ? 'maquina' : 'maquinas'})`)
      }

      // 5. CALIDAD
      if (Array.isArray(v.dataQualityIssues) && v.dataQualityIssues.length) {
        problema(`${plant} ${shiftId}: dataQualityIssues -> ${JSON.stringify(v.dataQualityIssues).slice(0, 200)}`)
      }
    }
  }

  say('\n' + '='.repeat(72))
  if (hallazgos.length === 0) {
    say('RESULTADO: todo bien. Los turnos arrancaron y se estan guardando completos.')
  } else {
    say(`RESULTADO: ${hallazgos.length} cosa(s) para mirar:`)
    hallazgos.forEach((h, i) => say(`  ${i + 1}. ${h}`))
    say('')
    say('Reparacion (idempotente, reescribe el dia desde Shoplogix):')
    say(`  curl "${CF}/shoplogixBackfillRange?plantSlug=<planta>&from=${dateKey}&to=${dateKey}&key=$ADMIN_SETUP_KEY"`)
  }

  const dir = DIR_REPORTES
  fs.mkdirSync(dir, { recursive: true })
  const archivo = path.join(dir, `${dateKey}${hallazgos.length ? '-REVISAR' : ''}.txt`)
  fs.writeFileSync(archivo, lineas.join('\r\n'), 'utf8')
  say(`\nreporte: ${archivo}`)

  if (hallazgos.length) {
    await avisarTelegram(
      `⚠️ <b>Turno ${dateKey}: revisar el arranque</b>\n\n` +
      hallazgos.map(h => `• ${escaparHtml(h)}`).join('\n') +
      `\n\nReparar (reescribe el día desde Shoplogix):\n` +
      `<code>shoplogixBackfillRange?plantSlug=&lt;planta&gt;&amp;from=${dateKey}&amp;to=${dateKey}</code>\n\n` +
      `<i>Detalle: ${escaparHtml(archivo)}</i>`,
    )
  }

  process.exit(hallazgos.length ? 1 : 0)
}

// Si el verificador se cae, tambien hay que enterarse: un silencio se lee como
// "todo bien" y es justo lo contrario.
main().catch(async e => {
  console.error('El verificador no pudo correr:', e.message)
  await avisarTelegram(
    `🔴 <b>El verificador de turno no pudo correr</b>\n\n${escaparHtml(e.message)}\n\n` +
    `<i>Nadie esta vigilando el arranque hasta que se arregle.</i>`,
  )
  process.exit(2)
})

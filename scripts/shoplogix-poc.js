#!/usr/bin/env node
/**
 * POC Shoplogix — valida acceso a la API sin replicar login.
 *
 * IMPORTANTE: Shoplogix usa 3 cookies juntas (_SLX_*, _SLX_*, SLXPNE).
 * La forma más robusta de copiarlas todas es desde el Request Header real:
 *
 *   1. Logéate en Edge a saas139.shoplogix.com
 *   2. F12 → Red (Network) → filtra por "query.axd"
 *   3. Click en una fila → pestaña "Headers" → sección "Request Headers"
 *   4. Busca la línea "Cookie:" — copia todo el valor (después del ":")
 *      Ejemplo esperado (¡no copies este, copia el tuyo!):
 *        _SLX_2HoO...=uD6D...; _SLX_cDOG...=Z1ys...; SLXPNE=k=eyJhbG...
 *   5. Exporta como variable de entorno en PowerShell:
 *        $env:SHOPLOGIX_COOKIE = "_SLX_2...=uD6D...; _SLX_c...=Z1ys...; SLXPNE=k=eyJ..."
 *   6. Corre este script:
 *        node scripts/shoplogix-poc.js
 *
 * Qué hace:
 *   - GET /web/query.axd?type=tree&format=json → valida jerarquía
 *   - GET /web/query.axd?type=whiteboardproduction para cada Evisceradora de Chonchi
 *     en el rango del turno actual
 *   - Guarda snapshots en scripts/fixtures/shoplogix-*.json para tests futuros
 *
 * Nada de esto se commitea a Firestore ni se pushea a remoto. 100% local.
 *
 * Si este script funciona → procede con Fase 2 (Cloud Function).
 * Si falla con 401/403 → la cookie SLXPNE expiró (expira ~1h después de login);
 * re-logéate y re-copia.
 */

const fs   = require('fs')
const path = require('path')

// ── Config ───────────────────────────────────────────────────────────────────

const BASE = 'https://saas139.shoplogix.com'
const FIXTURES_DIR = path.join(__dirname, 'fixtures')

const MACHINES_CHONCHI = [
  { id: '3cbc4c21-dff2-4136-94d5-42f3dff15a4e', name: 'Evisceradora 1' },
  { id: 'ce16a125-6b05-4ab8-acb7-56a123931cff', name: 'Evisceradora 2' },
  { id: '6f76be97-6d45-47ad-8e9a-7450bc2af68c', name: 'Evisceradora 3' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convierte Date → formato Shoplogix: "YYYYMMDDTHHMMSS.fff"
 * (es UTC; Shoplogix parece trabajar en UTC para los timestamps de query)
 */
function toShoplogixTime(d) {
  const pad = (n, l = 2) => String(n).padStart(l, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}` +
         `.${pad(d.getUTCMilliseconds(), 3)}`
}

/**
 * Calcula rango del turno actual en Chile (UTC-3 o UTC-4 según horario verano).
 * Turno día:   07:00 → 19:00 local
 * Turno noche: 19:00 → 07:00 (del día siguiente) local
 *
 * Para el POC, usamos el turno día de HOY (ventana amplia 09:00→18:00).
 */
function currentShiftWindow() {
  const now = new Date()
  // Redondeamos a hoy 09:00 UTC (~06:00 local Chile) hasta 22:00 UTC (19:00 local)
  // Es conservador — si el turno ya pasó trae data histórica; si está en curso trae parcial.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0))
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 22, 0, 0))
  return { start, end }
}

async function shoplogixGet(type, params, cookie) {
  const url = new URL(`${BASE}/web/query.axd`)
  url.searchParams.set('type', type)
  url.searchParams.set('format', 'json')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Cookie': cookie,
      'Accept': 'application/json, */*',
      'Referer': `${BASE}/whiteboard/`,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)')
    throw new Error(`HTTP ${res.status} ${res.statusText} en ${type} — ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  return data
}

function saveFixture(filename, data) {
  if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true })
  const p = path.join(FIXTURES_DIR, filename)
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
  return p
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const cookie = process.env.SHOPLOGIX_COOKIE
  if (!cookie) {
    console.error('\n❌ Falta SHOPLOGIX_COOKIE en el entorno.\n')
    console.error('   Shoplogix usa 3 cookies (2x _SLX_* + SLXPNE). La forma más robusta:')
    console.error('   DevTools → Network → click en una fila "query.axd" → Headers →')
    console.error('   copia el valor completo de "Cookie:" (incluye las 3 juntas separadas por ";")\n')
    console.error('   Luego en PowerShell:')
    console.error('     $env:SHOPLOGIX_COOKIE = "_SLX_xxx=...; _SLX_yyy=...; SLXPNE=k=eyJ..."\n')
    process.exit(1)
  }

  // Validación: al menos debe contener SLXPNE (la cookie JWT principal)
  const hasSLXPNE = cookie.includes('SLXPNE=')
  const hasSLX    = cookie.includes('_SLX_')
  if (!hasSLXPNE) {
    console.warn('⚠️  La cookie NO contiene "SLXPNE=" — es la cookie JWT principal de auth.')
    console.warn('   El script puede fallar con 401. Asegúrate de copiar el header Cookie completo.\n')
  }
  if (!hasSLX) {
    console.warn('⚠️  La cookie NO contiene ninguna "_SLX_*=" — faltan las cookies de sesión.\n')
  }

  const { start, end } = currentShiftWindow()
  const startStr = toShoplogixTime(start)
  const endStr   = toShoplogixTime(end)

  console.log('\n🔍 Shoplogix POC')
  console.log(`   Rango: ${startStr} → ${endStr}`)
  console.log(`   Máquinas: ${MACHINES_CHONCHI.length}\n`)

  // ── 1. Tree (valida auth) ────────────────────────────────────────────────
  console.log('→ GET query.axd?type=tree')
  let tree
  try {
    tree = await shoplogixGet('tree', {}, cookie)
  } catch (e) {
    console.error(`❌ Error en tree: ${e.message}`)
    console.error('   Probablemente la cookie expiró. Re-logéate y vuelve a copiarla.')
    process.exit(1)
  }
  const treePath = saveFixture(`shoplogix-tree-${Date.now()}.json`, tree)
  console.log(`   ✅ OK — ${JSON.stringify(tree).length} bytes → ${path.basename(treePath)}`)

  // Validación rápida: debe estar AquaChile S.A. en el árbol
  const hasAquaChile = JSON.stringify(tree).includes('AquaChile S.A.')
  const hasChonchi   = JSON.stringify(tree).includes('Planta Chonchi')
  console.log(`   ${hasAquaChile ? '✅' : '❌'} Contiene "AquaChile S.A."`)
  console.log(`   ${hasChonchi   ? '✅' : '❌'} Contiene "Planta Chonchi"`)

  if (!hasAquaChile || !hasChonchi) {
    console.error('\n⚠️  La cookie es válida pero el árbol no contiene los nodos esperados.')
    console.error('   Puede que sea de otra cuenta. Abortando.')
    process.exit(1)
  }

  // ── 2. Production por máquina ────────────────────────────────────────────
  for (const m of MACHINES_CHONCHI) {
    console.log(`\n→ GET whiteboardproduction para "${m.name}"`)
    try {
      const prod = await shoplogixGet('whiteboardproduction', {
        machines: m.id,
        start:    startStr,
        end:      endStr,
        minutes:  '5',
      }, cookie)

      const productionArr = prod?.machines?.[0]?.machineProduction ?? []
      const actualCycles  = productionArr.reduce((a, x) => a + (x.cycles || 0), 0)
      const expectedCycles = productionArr.reduce((a, x) => a + (x.expectedCycles || 0), 0)

      const file = saveFixture(
        `shoplogix-production-${m.name.replace(/\s+/g, '_')}-${Date.now()}.json`,
        prod,
      )

      console.log(`   ✅ ${productionArr.length} intervalos de 5 min`)
      console.log(`      cycles reales: ${actualCycles.toFixed(0)}`)
      console.log(`      cycles esperados: ${expectedCycles.toFixed(0)}`)
      console.log(`      ratio: ${expectedCycles > 0 ? ((actualCycles / expectedCycles) * 100).toFixed(1) : 'n/a'}%`)
      console.log(`      → ${path.basename(file)}`)
    } catch (e) {
      console.error(`   ❌ ${e.message}`)
    }

    // Courtesy delay para no saturar
    await new Promise(r => setTimeout(r, 250))
  }

  // ── 3. Summary (bonus) ───────────────────────────────────────────────────
  console.log(`\n→ GET whiteboardsummary para "Evisceradora 1" (bonus)`)
  try {
    const sum = await shoplogixGet('whiteboardsummary', {
      machines: MACHINES_CHONCHI[0].id,
      start:    startStr,
      end:      endStr,
    }, cookie)
    const file = saveFixture(`shoplogix-summary-Evisceradora_1-${Date.now()}.json`, sum)
    console.log(`   ✅ ${JSON.stringify(sum).length} bytes → ${path.basename(file)}`)
  } catch (e) {
    console.error(`   ⚠️  summary falló (no crítico): ${e.message}`)
  }

  console.log('\n✅ POC completo. Revisa scripts/fixtures/ para los snapshots.')
  console.log('   Si todo OK → podemos proceder con Fase 2 (Cloud Function).\n')
}

main().catch((err) => {
  console.error('\n💥 Error no manejado:', err)
  process.exit(1)
})

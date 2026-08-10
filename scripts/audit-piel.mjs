#!/usr/bin/env node
/**
 * audit-piel.mjs — guardarraíl de la NUEVA PIEL estilo Apple (ratchet).
 *
 * Normas: ARIA_MANTENIMIENTO_PLANTA\docs\NUEVA_PIEL_APPLE_HIG.md (OneDrive)
 * Skill:  /nueva-piel-apple
 *
 * Detecta en apps/pwa/src los anti-patrones prohibidos por la piel nueva:
 *   1. Emojis usados como íconos en JSX          → usar Lucide
 *   2. Clases Tailwind de color crudas           → tokens semánticos
 *   3. Radios fuera de la escala única           → rounded-{ctl|card|panel|full} (tokens)
 *   4. Chips translúcidos bg-*-NNN/NN            → <Pill> o systemFill
 *
 * Modo RATCHET: compara contra scripts/audit-piel.baseline.json.
 *   - Si una métrica AUMENTA → exit 1 (el PR no debe mergearse).
 *   - Si baja → lo celebra y sugiere actualizar la línea base.
 *   - `--update-baseline` reescribe la línea base con los valores actuales.
 *   - `--verbose` lista archivo:línea de cada violación nueva por categoría.
 *
 * La línea base parte del estado actual del código (deuda conocida): el objetivo no es
 * fallar hoy, es impedir que la deuda CREZCA mientras el barrido la va bajando a 0.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps', 'pwa', 'src');
const BASELINE_PATH = join(ROOT, 'scripts', 'audit-piel.baseline.json');

const UPDATE = process.argv.includes('--update-baseline');
const VERBOSE = process.argv.includes('--verbose');

// Excepciones legítimas:
//  - HMIs/simuladores y visor 3D: oscuros a propósito, no siguen la piel.
//  - `components/piel/`: los PRIMITIVOS son el único lugar sancionado donde
//    pueden vivir clases de color semántico. Ese es justamente su trabajo —
//    concentrar la decisión de color en 5 archivos para que los otros 300 no
//    la tomen. Si el resto de la app necesita un color de estado, importa
//    <Pill>/<Button>; no escribe `text-red-600` a mano.
//  - `pages/dev/`: vitrina de desarrollo, no es UI de producción.
const EXCLUDE = [
  /[\\/]hmi[\\/]/i,
  /Hmi[A-Z]?\w*\.tsx$/,
  /Visor3D/i,
  /simulador/i,
  // Módulo de mapa: excluido POR CONSISTENCIA con `audit-theme.mjs`, que ya lo
  // dejaba fuera junto a HMIs y 3D (su editor Leaflet es oscuro a propósito,
  // con grises literales). Contarlo acá inflaba la deuda con archivos que
  // nadie va a migrar — y una métrica que incluye lo que no se va a arreglar
  // deja de servir para decidir.
  /[\\/]components[\\/]map[\\/]/,
  /[\\/]pages[\\/](Map\w*|Mapa\w*)\.tsx$/,
  /[\\/]components[\\/]piel[\\/]/,
  /[\\/]pages[\\/]dev[\\/]/,
  // Editor ETT: es una vista WYSIWYG que replica cómo se verá el documento en
  // WORD — sus grises, azules y el resaltado amarillo de los campos editables
  // son del DOCUMENTO, no del cromo de la app. Misma categoría que los HMIs:
  // migrarlo a los tokens de la piel lo alejaría de lo que se imprime.
  /[\\/]components[\\/]ett[\\/]/,
  /[\\/]pages[\\/]admin[\\/]ETTPage\.tsx$/,
];

const RULES = [
  {
    key: 'emojis',
    label: 'Emojis como íconos en JSX (usar Lucide)',
    // rangos de emoji + símbolos misceláneos; se excluyen ✓✗→ y similares tipográficos
    re: /[\u{1F300}-\u{1FAFF}\u{2B00}-\u{2BFF}\u{FE0F}]|[\u{2600}-\u{26FF}]/gu,
  },
  {
    key: 'coloresCrudos',
    label: 'Clases Tailwind de color crudas (usar tokens)',
    re: /\b(?:text|bg|border|ring|fill|stroke)-(?:red|blue|green|amber|emerald|orange|yellow|purple|violet|indigo|cyan|sky|teal|rose|pink|fuchsia|lime|slate|gray|zinc|stone|neutral)-\d{2,3}\b/g,
  },
  {
    key: 'radiosFueraEscala',
    label: 'Radios fuera de la escala única (usar tokens de radio)',
    re: /\brounded(?:-(?:sm|md|lg|xl|2xl|3xl))?\b(?!-)/g,
  },
  {
    // Constitución §7 (no cards dentro de cards) + §38 (separar con espacio,
    // no con línea). Una sub-superficie se marca con RELLENO **o** con borde,
    // nunca con los dos: eso es el "doble marcado" que produce la sensación de
    // caja dentro de caja. El relleno gana, porque separa sin sumar línea.
    key: 'cajasDobleMarcadas',
    label: 'Cajas con relleno Y borde (elegir uno — §7/§38)',
    re: /(?:bg-(?:muted|card|background)|bg-[a-z0-9-]+\/\[0\.[0-9]+\])\s+rounded-(?:ctl|card|panel)[^"']*?\s+border\s+border-/g,
  },
  {
    key: 'chipsTranslucidos',
    label: 'Chips translúcidos bg-*/NN (usar Pill o systemFill)',
    re: /\b(?:bg|border|text)-[a-z]+-\d{2,3}\/\d{1,3}\b/g,
  },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(tsx|jsx)$/.test(name)) yield p;
  }
}

const counts = Object.fromEntries(RULES.map(r => [r.key, 0]));
const hits = Object.fromEntries(RULES.map(r => [r.key, []]));

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (EXCLUDE.some(re => re.test(rel))) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Un COMENTARIO no es interfaz. Se saltan porque si no la métrica reporta
    // violaciones fantasma: 14 de los 17 emojis que quedaban vivían en comentarios
    // que documentan la UI (a veces citando texto que ya cambió). "Arreglarlos"
    // no mejora ni una pantalla, y el ruido esconde los que sí importan.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const rule of RULES) {
      const m = line.match(rule.re);
      if (m) {
        counts[rule.key] += m.length;
        if (hits[rule.key].length < 400) hits[rule.key].push(`${rel}:${i + 1}  ${m.slice(0, 4).join(' ')}`);
      }
    }
  });
}

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), counts }, null, 2) + '\n');
  console.log('Línea base actualizada:', counts);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error('No existe scripts/audit-piel.baseline.json — correr con --update-baseline primero.');
  process.exit(1);
}

let failed = false;
let improved = false;
console.log('── audit-piel · ratchet de la nueva piel ──────────────────────');
for (const rule of RULES) {
  const now = counts[rule.key];
  const base = baseline.counts[rule.key] ?? 0;
  const delta = now - base;
  const mark = delta > 0 ? '✗ SUBIÓ' : delta < 0 ? '▼ bajó' : '· igual';
  console.log(`${mark.padEnd(8)} ${rule.label}: ${now} (base ${base}${delta ? `, ${delta > 0 ? '+' : ''}${delta}` : ''})`);
  if (delta > 0) {
    failed = true;
    if (VERBOSE) {
      console.log('  Ocurrencias (muestra):');
      hits[rule.key].slice(0, 25).forEach(h => console.log('   ', h));
    }
  }
  if (delta < 0) improved = true;
}
console.log('───────────────────────────────────────────────────────────────');
if (failed) {
  console.error('FALLA: hay MÁS violaciones que en la línea base. La piel nueva prohíbe agregar');
  console.error('emojis-ícono, colores Tailwind crudos, radios fuera de escala o chips translúcidos.');
  console.error('Detalle: node scripts/audit-piel.mjs --verbose · Normas: docs NUEVA_PIEL_APPLE_HIG.md');
  process.exit(1);
}
if (improved) console.log('Bajó la deuda 🎉 — considera `node scripts/audit-piel.mjs --update-baseline` en este mismo PR.');
console.log('OK: la deuda de piel no creció.');

#!/usr/bin/env node
/**
 * verificar-clases-diff.mjs — comprueba que cada clase de color AGREGADA en el diff exista
 * como selector en el CSS del build real (apps/pwa/dist).
 *
 * Por qué existe: una clase que Tailwind no conoce (p. ej. `border-fill-critical` cuando `fill`
 * solo estaba bajo `backgroundColor`) NO da error: simplemente no genera CSS y el elemento queda
 * sin color. Ni tsc ni eslint ni vitest lo ven. Solo el CSS compilado lo delata.
 *
 * Uso (desde la raíz del repo):
 *   cd apps/pwa && npx vite build        # primero, para tener dist/
 *   node scripts/verificar-clases-diff.mjs [--base <ref>] [--dist <carpeta>] [--verbose]
 *
 *   --base   referencia contra la que se calcula el diff (por defecto HEAD: cambios sin commit).
 *            Con una rama ya commiteada: --base origin/main
 *   --dist   carpeta del build (por defecto apps/pwa/dist)
 *
 * Revisa utilidades bg/text/border/ring/fill/stroke/from/via/to/divide/outline/decoration/shadow/
 * accent/caret cuyo color sea un token de la app (ink, fill, cat, grafico, serie, primary, muted,
 * border, foreground, card, background, success, warning, destructive, brand-ink, secondary,
 * accent, popover) o un valor arbitrario con rgb(var(--...)), con variantes (dark:, hover:,
 * pizarra:...) y opacidad (/15, /[0.15]). Sale con código 1 si falta alguna.
 *
 * Límites: no entiende clases armadas por concatenación (`bg-${x}`); y un token puede existir como
 * clase pero no aplicar si otra regla lo pisa (eso lo ve el navegador, no este script).
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'HEAD');
const DIST = arg('--dist', join(ROOT, 'apps', 'pwa', 'dist'));
const VERBOSE = process.argv.includes('--verbose');

const UTIL = 'bg|text|border|ring|fill|stroke|from|via|to|divide|outline|decoration|shadow|accent|caret|ring-offset';
const TOKENS = 'ink-[a-z]+|fill-[a-z]+|cat-\\d-(?:ink|tint)|grafico-[a-z-]+|serie-(?:\\d|otros)|primary(?:-\\d+)?|muted(?:-foreground)?|border|foreground|card|background|success|warning|destructive|brand-ink|secondary|accent|popover';
const OPAC = '(?:\\/(?:\\[[0-9.]+\\]|\\d+))?';
// Nombre de clase completo: variantes* + utilidad-token[/opacidad]  |  utilidad-[rgb(var(--x)/0.15)]
const CLASE = new RegExp(
  `(?<![\\w\\[\\]/-])((?:[a-z0-9-]+:)*(?:${UTIL})-(?:(?:${TOKENS})${OPAC}|\\[rgba?\\(var\\(--[a-z0-9-]+\\)[^\\]\\s'"\`]*\\]))(?![\\w\\[\\]-])`,
  'g',
);

function escapar(clase) { return clase.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c); }

// 1) Clases agregadas en el diff
const diff = execSync(`git diff -U0 ${BASE} -- apps/pwa/src`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const agregadas = new Map(); // clase -> Set(archivo)
let archivo = '';
for (const linea of diff.split('\n')) {
  if (linea.startsWith('+++ ')) { archivo = linea.slice(6); continue; }
  if (!linea.startsWith('+') || linea.startsWith('+++')) continue;
  const txt = linea.slice(1);
  if (/^\s*(\/\/|\*|\/\*)/.test(txt)) continue; // comentarios
  for (const m of txt.matchAll(CLASE)) {
    // `border-border` etc. son válidos; descarta falsos positivos de texto plano evidentes
    const c = m[1];
    if (!agregadas.has(c)) agregadas.set(c, new Set());
    agregadas.get(c).add(archivo);
  }
}

// 2) CSS del build
if (!existsSync(DIST)) { console.error(`No existe ${DIST}. Corre antes: cd apps/pwa && npx vite build`); process.exit(2); }
function* css(dir) {
  for (const n of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, n.name);
    if (n.isDirectory()) yield* css(p); else if (n.name.endsWith('.css')) yield p;
  }
}
let todo = '';
for (const f of css(DIST)) todo += readFileSync(f, 'utf8') + '\n';
if (!todo) { console.error(`No hay .css en ${DIST}`); process.exit(2); }

// 3) Comparación
const faltan = [];
for (const [clase, archivos] of agregadas) {
  const sel = '.' + escapar(clase);
  // El selector puede venir seguido de `:hover`, `,`, ` `, `{`, `>` o `::`; que no sea prefijo de otra clase.
  const i = todo.indexOf(sel);
  let ok = false;
  let desde = 0;
  while (!ok) {
    const j = todo.indexOf(sel, desde);
    if (j < 0) break;
    const sig = todo[j + sel.length] ?? '';
    if (!/[a-zA-Z0-9_\\-]/.test(sig)) ok = true; else desde = j + 1;
  }
  void i;
  if (!ok) faltan.push([clase, [...archivos]]);
  else if (VERBOSE) console.log('ok     ', clase);
}

console.log(`Clases de color agregadas en el diff (${BASE}): ${agregadas.size}`);
if (faltan.length) {
  console.log(`FALTAN en el CSS del build: ${faltan.length}`);
  for (const [c, a] of faltan) console.log(`  ✗ ${c}   ← ${a.slice(0, 3).join(', ')}`);
  process.exit(1);
}
console.log('Faltantes: 0');

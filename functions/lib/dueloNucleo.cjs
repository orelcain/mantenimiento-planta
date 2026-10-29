/* GENERADO por scripts/build-duelo-nucleo.mjs desde apps/pwa/src/pages/monitor/dueloNucleo.ts. NO EDITAR A MANO:
   cambiar la regla en la PWA y correr `node scripts/build-duelo-nucleo.mjs`. */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// apps/pwa/src/pages/monitor/dueloNucleo.ts
var dueloNucleo_exports = {};
__export(dueloNucleo_exports, {
  ANCLA_LUNES: () => ANCLA_LUNES,
  EQUIPOS: () => EQUIPOS,
  FRACCION_SIN_DUELO: () => FRACCION_SIN_DUELO,
  cicloDe: () => cicloDe,
  compararTurnos: () => compararTurnos,
  costoDeMantencionPeriodo: () => costoDeMantencionPeriodo,
  costoMantencion: () => costoMantencion,
  duelosDeTurnos: () => duelosDeTurnos,
  equipoDelTurno: () => equipoDelTurno,
  jornadaDe: () => jornadaDe,
  marcadorDeCiclo: () => marcadorDeCiclo,
  marcadorDePeriodo: () => marcadorDePeriodo,
  modoArranqueDe: () => modoArranqueDe,
  otroEquipo: () => otroEquipo,
  puntajeJornada: () => puntajeJornada,
  rachasPorEquipo: () => rachasPorEquipo,
  recordsDe: () => recordsDe,
  resumenDeStat: () => resumenDeStat,
  resumenesDeStats: () => resumenesDeStats,
  rivalDirecto: () => rivalDirecto,
  semanaIso: () => semanaIso,
  unidadDeMaquinas: () => unidadDeMaquinas
});
module.exports = __toCommonJS(dueloNucleo_exports);

// apps/pwa/src/services/shoplogix/imputacionTaxonomy.ts
var CATEGORIA_META = {
  abastecimiento: { label: "Abastecimiento / Servicios", oficial: "Falla Abastecimiento / Servicios", short: "Abastecimiento" },
  electrica: { label: "Falla El\xE9ctrica", oficial: "Falla El\xE9ctrica", short: "El\xE9ctrica" },
  mecanica: { label: "Falla Mec\xE1nica", oficial: "Falla Mec\xE1nica", short: "Mec\xE1nica" },
  mmpp: { label: "MMPP", oficial: "MMPP", short: "MMPP" },
  operacional: { label: "Operacionales", oficial: "Operacionales", short: "Operacional" },
  programado: { label: "Paros Programados", oficial: "Paros Programados", short: "Programado" }
};
function normalizeReason(raw) {
  return (raw ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[/|>]/g, " / ").replace(/\s+/g, " ").trim();
}
var IMPUTACION_LEAVES = [
  // ── 1. Falla Abastecimiento / Servicios ──────────────────────────────────
  { label: "Agua", categorias: ["abastecimiento"], bucket: "externo", match: ["AGUA"] },
  { label: "Aire", categorias: ["abastecimiento"], bucket: "externo", match: ["AIRE"] },
  { label: "Energ\xEDa", categorias: ["abastecimiento"], bucket: "externo", match: ["ENERGIA"] },
  { label: "Flow Ice", categorias: ["abastecimiento"], bucket: "externo", match: ["FLOW ICE", "FLOWICE"] },
  { label: "Innova", categorias: ["abastecimiento"], bucket: "externo", match: ["INNOVA"] },
  { label: "Insumos / Bodegas", categorias: ["abastecimiento"], bucket: "externo", match: ["INSUMOS / BODEGAS", "INSUMOS", "BODEGAS"] },
  { label: "SAP", categorias: ["abastecimiento"], bucket: "externo", match: ["SAP"] },
  // ── 2/3. Falla Eléctrica y Mecánica ──────────────────────────────────────
  // Inequívocas: viven en una sola categoría.
  { label: "L\xF3gica", categorias: ["electrica"], bucket: "mantencion", equipo: "baader142", match: ["LOGICA", "BAADER 142 / LOGICA"] },
  { label: "Cicl\xF3n", categorias: ["electrica"], bucket: "mantencion", equipo: "auxiliar", match: ["CICLON"] },
  { label: "Correas", categorias: ["mecanica"], bucket: "mantencion", equipo: "baader142", match: ["CORREAS", "CORREA"] },
  { label: "Cuchillos / Guillotinas", categorias: ["mecanica"], bucket: "mantencion", equipo: "baader142", match: ["CUCHILLOS / GUILLOTINAS", "CUCHILLOS", "GUILLOTINAS"] },
  { label: "Pernos / Resortes", categorias: ["mecanica"], bucket: "mantencion", equipo: "baader142", match: ["PERNOS / RESORTES", "PERNOS", "RESORTES"] },
  { label: "Punto Cero", categorias: ["mecanica"], bucket: "mantencion", equipo: "baader142", match: ["PUNTO CERO"] },
  { label: "Knuro", categorias: ["mecanica"], bucket: "mantencion", equipo: "auxiliar", match: ["KNURO"] },
  // Ambiguas: el curso las tiene en eléctrica Y mecánica; el reason plano no
  // dice cuál. Mismo bucket, así que la cascada no sufre — el Pareto sí.
  { label: "Motores", categorias: ["electrica", "mecanica"], bucket: "mantencion", equipo: "baader142", match: ["MOTORES", "MOTOR"] },
  { label: "Balanzas", categorias: ["electrica", "mecanica"], bucket: "mantencion", equipo: "auxiliar", match: ["BALANZAS", "BALANZA"] },
  { label: "Bombas", categorias: ["electrica", "mecanica"], bucket: "mantencion", equipo: "auxiliar", match: ["BOMBAS", "BOMBA"] },
  { label: "Cintas", categorias: ["electrica", "mecanica"], bucket: "mantencion", equipo: "auxiliar", match: ["CINTAS", "CINTA"] },
  { label: "Estaci\xF3n de Calidad", categorias: ["electrica", "mecanica"], bucket: "mantencion", equipo: "auxiliar", match: ["ESTACION DE CALIDAD", "ESTACION CALIDAD"] },
  { label: "Grader", categorias: ["electrica", "mecanica"], bucket: "mantencion", equipo: "auxiliar", match: ["GRADER"] },
  // ── 4. MMPP ──────────────────────────────────────────────────────────────
  { label: "Acumulaci\xF3n rechazo", categorias: ["mmpp"], bucket: "externo", match: ["ACUMULACION RECHAZO", "ACUMULACION DE RECHAZO"] },
  { label: "Atascamiento", categorias: ["mmpp"], bucket: "externo", match: ["ATASCAMIENTO"] },
  { label: "Falta MMPP", categorias: ["mmpp"], bucket: "externo", match: ["FALTA MMPP", "FALTA DE MMPP"] },
  { label: "Materia prima inactiva", categorias: ["mmpp"], bucket: "externo", match: ["MATERIA PRIMA INACTIVA"] },
  // ── 5. Operacionales ─────────────────────────────────────────────────────
  { label: "Ajuste mantenimiento", categorias: ["operacional"], bucket: "mantencion", match: ["AJUSTE MANTENIMIENTO", "AJUSTE MANTENCION"] },
  { label: "Trabajos contratistas / propios", categorias: ["operacional"], bucket: "mantencion", match: ["TRABAJOS CONTRATISTAS / PROPIOS", "TRABAJOS CONTRATISTAS", "TRABAJOS PROPIOS"] },
  { label: "Ajuste operador", categorias: ["operacional"], bucket: "externo", match: ["AJUSTE OPERADOR"] },
  { label: "Cambio lote / MMPP", categorias: ["operacional"], bucket: "externo", match: ["CAMBIO LOTE / MMPP", "CAMBIO DE LOTE"] },
  { label: "Contrastaci\xF3n", categorias: ["operacional"], bucket: "externo", match: ["CONTRASTACION"] },
  { label: "Emergencia / Evacuaci\xF3n", categorias: ["operacional"], bucket: "externo", match: ["EMERGENCIA / EVACUACION", "EMERGENCIA", "EVACUACION"] },
  { label: "Falla operacional", categorias: ["operacional"], bucket: "externo", match: ["FALLA OPERACIONAL"] },
  { label: "Liberaci\xF3n", categorias: ["operacional"], bucket: "externo", match: ["LIBERACION"] },
  { label: "Retraso aseo", categorias: ["operacional"], bucket: "externo", match: ["RETRASO ASEO"] },
  { label: "Tiempo de respuestas", categorias: ["operacional"], bucket: "externo", match: ["TIEMPO DE RESPUESTAS", "TIEMPO DE RESPUESTA"] },
  // ── 6. Paros Programados ─────────────────────────────────────────────────
  { label: "Cambio turno", categorias: ["programado"], bucket: "planificado", match: ["CAMBIO TURNO", "CAMBIO DE TURNO"] },
  { label: "Colaci\xF3n", categorias: ["programado"], bucket: "planificado", match: ["COLACION"] },
  { label: "Detenci\xF3n programada", categorias: ["programado"], bucket: "planificado", match: ["DETENCION PROGRAMADA"] },
  { label: "Ejercicio compensatorio - Paro", categorias: ["programado"], bucket: "planificado", match: ["EJERCICIO COMPENSATORIO - PARO", "EJERCICIO COMPENSATORIO"] },
  { label: "Reuni\xF3n inicio turno", categorias: ["programado"], bucket: "planificado", match: ["REUNION INICIO TURNO", "REUNION DE INICIO DE TURNO"] },
  { label: "Cumplimiento cuota", categorias: ["programado"], bucket: "externo", match: ["CUMPLIMIENTO CUOTA"] },
  /*
   * ── EXTENSIÓN · Filete / Baader 200 ─────────────────────────────────────
   *
   * El curso V12 se escribió para la Baader 142 de Yal: sus hojas mecánicas
   * nombran los componentes de ESA máquina. Filete tiene una Baader 200, que
   * manda otros nombres, y por eso 154 min de fallas mecánicas de los últimos
   * 12 turnos caían en "sin imputar" — justo los minutos que Mantención
   * necesita poder mostrar como suyos, y medir para ver si bajan.
   *
   * Verificado contra Firestore (shoplogix/filete/shifts, 12 turnos al 14-08):
   * CUCHILLERIA DORSAL 80 min · RASCADOR 47 · PUNZON 13 · Equipo Auxiliar/GEA 14.
   *
   * ⚠ Van marcadas `extension` a propósito: no son del curso. Decisión de Orel
   * el 14-08. Si algún día la V13 las incorpora, se les saca la marca.
   */
  { label: "Cuchiller\xEDa dorsal", categorias: ["mecanica"], bucket: "mantencion", equipo: "baader200", extension: "filete-baader200", match: ["CUCHILLERIA DORSAL"] },
  { label: "Cuchiller\xEDa rascador", categorias: ["mecanica"], bucket: "mantencion", equipo: "baader200", extension: "filete-baader200", match: ["CUCHILLERIA RASCADOR"] },
  { label: "Cuchiller\xEDa punz\xF3n", categorias: ["mecanica"], bucket: "mantencion", equipo: "baader200", extension: "filete-baader200", match: ["CUCHILLERIA PUNZON"] },
  // Cualquier otra cuchillería de la 200 que aparezca: mejor "cuchillería sin
  // detalle" que "sin imputar". Va DESPUÉS de las tres anteriores porque el
  // match por substring respeta el orden del array.
  { label: "Cuchiller\xEDa", categorias: ["mecanica"], bucket: "mantencion", equipo: "baader200", extension: "filete-baader200", match: ["CUCHILLERIA"] },
  // GEA: la descamadora auxiliar de Filete. No es ninguna de las auxiliares del
  // curso (Ciclón, Knuro, Balanzas, Bombas, Cintas, Estación de Calidad, Grader).
  { label: "GEA", categorias: ["electrica", "mecanica"], bucket: "mantencion", equipo: "auxiliar", extension: "filete-baader200", match: ["EQUIPO AUXILIAR / GEA", "GEA"] },
  /*
   * Filete anota `ACUMULACION` a secas (164 min / 38 eventos en 29 turnos de
   * jul-ago 2026); Chonchi usa `ACUMULACION RECHAZO` y Yal no usa ninguna.
   * Caia en "sin clasificar" — justo la pata de MMPP de Filete.
   *
   * Va como hoja propia y no como alias de "Acumulacion rechazo": desde el
   * reason plano no se puede afirmar que la acumulacion de Filete sea de
   * rechazo. Mismo bucket (`externo`), asi que la cascada no cambia; lo que se
   * evita es ponerle a un dato una etiqueta mas especifica de la que tiene.
   */
  { label: "Acumulaci\xF3n", categorias: ["mmpp"], bucket: "externo", equipo: "baader200", extension: "filete-baader200", match: ["ACUMULACION"] }
];
var NO_TAXONOMIA = [
  { match: ["PLANNED DOWNTIME"], bucket: "fuera-turno" }
];
function matchImputacion(rawReason) {
  const r = normalizeReason(rawReason);
  if (!r) return { leaf: null, bucket: null, ambigua: false };
  for (const n of NO_TAXONOMIA) {
    if (n.match.some((m) => r === m || r.includes(m))) return { leaf: null, bucket: n.bucket, ambigua: false };
  }
  for (const leaf of IMPUTACION_LEAVES) {
    if (leaf.match.some((m) => r === m)) {
      return { leaf, bucket: leaf.bucket, ambigua: leaf.categorias.length > 1 };
    }
  }
  for (const leaf of IMPUTACION_LEAVES) {
    if (leaf.match.some((m) => r.includes(m))) {
      return { leaf, bucket: leaf.bucket, ambigua: leaf.categorias.length > 1 };
    }
  }
  return { leaf: null, bucket: null, ambigua: false };
}
function categoriaLabel(leaf) {
  if (!leaf || leaf.categorias.length === 0) return "Sin clasificar";
  return leaf.categorias.map((c) => CATEGORIA_META[c].short).join(" o ");
}
var TOTAL_HOJAS_CURSO = IMPUTACION_LEAVES.filter((l) => !l.extension).reduce((n, l) => n + l.categorias.length, 0);
var TOTAL_CAUSALES = IMPUTACION_LEAVES.filter((l) => !l.extension).length;

// apps/pwa/src/services/shoplogix/monitorEventos.ts
function duenoDe(reason) {
  const m = matchImputacion(reason);
  const categoria = m.leaf ? categoriaLabel(m.leaf) : null;
  const extension = Boolean(m.leaf?.extension);
  if (m.bucket === "mantencion") return { dueno: "mantencion", categoria, extension };
  if (m.bucket === "externo") return { dueno: "externo", categoria, extension };
  return { dueno: "sin-imputar", categoria, extension };
}

// apps/pwa/src/pages/monitor/dueloSerie.ts
var UMBRAL_SOSTENIDA = 0.9;
function sumaDeLinea(s) {
  if (!s?.maquinas?.length) return null;
  const largo = Math.min(...s.maquinas.map((m) => m.cycles.length));
  if (!(largo > 0)) return null;
  const suma = Array.from({ length: largo }, (_, i) => s.maquinas.reduce((a, m) => a + (m.cycles[i] ?? 0), 0));
  const completo = s.maquinas.every((m) => m.esperado != null && m.esperado > 0);
  return { suma, esperado: completo ? s.maquinas.reduce((a, m) => a + (m.esperado ?? 0), 0) : null };
}
var CINCO_MIN = 3e5;
var MIN_MS = 6e4;
var VENTANA_ARRANQUE_MIN = 5;
function arranqueDeTurno(e) {
  if (!Number.isFinite(e.inicioPlanMs)) return null;
  const base = sumaDeLinea(e.serie);
  const desdeMs = Date.parse(e.serie?.desde ?? "");
  if (base && Number.isFinite(desdeMs)) {
    const i0 = Math.max(0, Math.ceil((e.inicioPlanMs - desdeMs) / MIN_MS));
    if (e.modo === "primera-pieza") {
      for (let i = i0; i < base.suma.length; i++) if (base.suma[i] > 0) return Math.max(0, Math.round((desdeMs + i * MIN_MS - e.inicioPlanMs) / MIN_MS));
      return null;
    }
    if (base.esperado == null) return null;
    const meta = UMBRAL_SOSTENIDA * base.esperado * VENTANA_ARRANQUE_MIN;
    let ventana = 0;
    for (let i = i0; i < base.suma.length; i++) {
      ventana += base.suma[i];
      if (i - i0 >= VENTANA_ARRANQUE_MIN) ventana -= base.suma[i - VENTANA_ARRANQUE_MIN];
      if (i - i0 >= VENTANA_ARRANQUE_MIN - 1 && ventana >= meta) {
        return Math.max(0, Math.round((desdeMs + (i - VENTANA_ARRANQUE_MIN + 1) * MIN_MS - e.inicioPlanMs) / MIN_MS));
      }
    }
    return null;
  }
  if (e.modo !== "primera-pieza") return null;
  for (const p of e.tramos ?? []) {
    const t = Date.parse(p?.t ?? "");
    if (!Number.isFinite(t) || (p.pieces ?? 0) <= 0) continue;
    if (t + CINCO_MIN <= e.inicioPlanMs) continue;
    return Math.max(0, Math.round((t - e.inicioPlanMs) / MIN_MS));
  }
  return null;
}

// apps/pwa/src/pages/monitor/repartoSemanal.ts
function lunesDe(dateKey) {
  const d = /* @__PURE__ */ new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
var EQUIPO_NOMBRE = { baader142: "Baader 142", baader200: "Baader 200" };
function equipoDe(reason) {
  const m = matchImputacion(reason);
  if (m.bucket !== "mantencion" || !m.leaf) return null;
  const e = m.leaf.equipo;
  return e === "baader142" || e === "baader200" ? EQUIPO_NOMBRE[e] : m.leaf.label;
}
var cero = () => ({ mantencion: 0, externo: 0, "sin-imputar": 0 });
function finDeParada(t, seg) {
  const [h, m, s] = t.split(":").map(Number);
  if (h == null || m == null || !Number.isFinite(h) || !Number.isFinite(m)) return t.slice(0, 5);
  const total = Math.round((h * 3600 + m * 60 + (s && Number.isFinite(s) ? s : 0) + seg) / 60) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
var duenoDeCausa = (reason) => {
  const d = duenoDe(reason);
  return { dueno: d.dueno === "programado" ? "sin-imputar" : d.dueno, categoria: d.categoria };
};
function repartoDeTurno(t) {
  const out = {
    shiftDocId: t.shiftDocId,
    dateKey: t.dateKey,
    shiftId: t.shiftId,
    piezas: t.total || 0,
    min: cero(),
    pz: cero(),
    causas: [],
    paradas: null
  };
  const rec = t.recoverable ?? [];
  const sumaMaquina = rec.reduce((a, c) => a + (c.min || 0), 0);
  if (sumaMaquina > 0 && t.recoverableMin != null && t.recoverableMin >= 0) {
    const factor = t.recoverableMin / sumaMaquina;
    const ritmo = t.producingMin > 0 ? (t.total || 0) / t.producingMin : 0;
    for (const c of rec) {
      const linMin = (c.min || 0) * factor;
      if (!(linMin > 0)) continue;
      const { dueno, categoria } = duenoDeCausa(c.reason);
      out.min[dueno] += linMin;
      out.pz[dueno] += linMin * ritmo;
      out.causas.push({
        causa: c.reason,
        dueno,
        categoria,
        equipo: equipoDe(c.reason),
        min: linMin,
        pz: linMin * ritmo,
        count: c.count || 0
      });
    }
    out.causas.sort((a, b) => b.min - a.min);
  }
  if (t.paradas) {
    const maquinas = t.porMaquina ?? [];
    out.paradas = [];
    for (const p of t.paradas) {
      const c = rec[p.c];
      if (!c || typeof p.t !== "string" || !(p.s > 0)) continue;
      out.paradas.push({
        causa: c.reason,
        dueno: duenoDeCausa(c.reason).dueno,
        inicio: p.t.slice(0, 5),
        fin: finDeParada(p.t, p.s),
        seg: p.s,
        maquinas: (p.m ?? []).map((i) => maquinas[i]?.n).filter((n) => Boolean(n))
      });
    }
  }
  return out;
}

// apps/pwa/src/pages/monitor/ritmoVivo.ts
function normalizar(s) {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}
function unidadDeMaquinas(maquinas) {
  const f = (re) => maquinas.some((m) => re.test(`${m.model ?? ""}`)) || maquinas.some((m) => re.test(`${m.name ?? ""}`));
  if (f(/\b142\b/)) return "carros";
  if (f(/\b200\b/)) return "silletas";
  return null;
}
function etiquetaMaquina(nombre) {
  const t = nombre.trim();
  const m = new RegExp("^(\\p{L}{2})\\p{L}{6,}[\\s\\-_]*(\\d+)$", "u").exec(t);
  if (m) return `${m[1][0].toUpperCase()}${m[1][1].toLowerCase()} ${m[2]}`;
  return t.length > 10 ? `${t.slice(0, 9)}\u2026` : t;
}

// apps/pwa/src/pages/monitor/duelo.ts
var EQUIPOS = ["rebolledo", "cardenas"];
var ANCLA_LUNES = "2026-10-26";
var FRACCION_SIN_DUELO = 0.6;
var DIA_MS = 864e5;
var otroEquipo = (e) => e === "rebolledo" ? "cardenas" : "rebolledo";
var esEquipoId = (v) => v === "rebolledo" || v === "cardenas";
function esNocheDesdeHora(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return !(h >= 5 && h < 17);
}
function semanasDesdeAncla(dateKey) {
  const lunes = Date.parse(`${lunesDe(dateKey)}T12:00:00Z`);
  const ancla = Date.parse(`${ANCLA_LUNES}T12:00:00Z`);
  if (!Number.isFinite(lunes)) return 0;
  return Math.round((lunes - ancla) / (7 * DIA_MS));
}
function jornadaDe(dateKey, esNoche, h0, shiftDocId) {
  if (!esNoche) return dateKey;
  const m = /^(\d{1,2}):(\d{2})/.exec(h0 ?? "");
  const arrancaPasadaMedianoche = m ? Number(m[1]) < 5 : shiftDocId != null && /(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s*$/.test(normalizar(shiftDocId.slice(11)));
  if (arrancaPasadaMedianoche) return dateKey;
  const t = Date.parse(`${dateKey}T12:00:00Z`);
  return Number.isFinite(t) ? new Date(t + DIA_MS).toISOString().slice(0, 10) : dateKey;
}
function equipoDelTurno(shiftDocId, esNoche, overrides, h0) {
  const corregido = overrides?.[shiftDocId];
  if (esEquipoId(corregido)) return corregido;
  const diaEsRebolledo = (semanasDesdeAncla(jornadaDe(shiftDocId.slice(0, 10), esNoche, h0, shiftDocId)) % 2 + 2) % 2 === 0;
  return esNoche === diaEsRebolledo ? "cardenas" : "rebolledo";
}
function cicloDe(dateKey) {
  const indice = Math.floor(semanasDesdeAncla(dateKey) / 2);
  const dia = (n) => new Date(Date.parse(`${ANCLA_LUNES}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
  return { indice, inicio: dia(indice * 14), fin: dia(indice * 14 + 13) };
}
function armarResumen(e) {
  const rp = repartoDeTurno(e.stat);
  const fallaMin = rp.min.mantencion;
  const win = e.stat.windowMin;
  const dispMin = win != null ? Math.max(0, win - (e.stat.plannedMin ?? 0) - fallaMin) : null;
  const nMaq = Math.max(1, e.duelo.alim.length);
  return {
    shiftDocId: e.shiftDocId,
    dateKey: e.dateKey,
    jornada: jornadaDe(e.dateKey, e.esNoche, e.h0, e.shiftDocId),
    h0: e.h0,
    shiftId: e.shiftId,
    esNoche: e.esNoche,
    equipo: equipoDelTurno(e.shiftDocId, e.esNoche, e.overrides, e.h0),
    cerrado: e.cerrado,
    piezas: e.piezas,
    dispMin,
    fallasN: rp.causas.filter((c) => c.dueno === "mantencion").reduce((a, c) => a + c.count, 0),
    fallaMin,
    piezasMant: rp.pz.mantencion,
    ritmo: e.stat.producingMin > 0 ? e.piezas / e.stat.producingMin : null,
    microMinH: e.duelo.mic != null && dispMin != null && dispMin > 0 ? e.duelo.mic / nMaq / (dispMin / 60) : null,
    arranqueMin: e.arranque ? e.arranque.min : e.duelo.ini ?? null,
    arranqueModo: e.arranque?.modo ?? "primera-pieza",
    iniProdMin: e.duelo.ini ?? null,
    ultimaHoraPz: e.duelo.uh ?? null,
    puestos: e.duelo.alim.map((p) => ({ clave: normalizar(p.n), etiqueta: etiquetaMaquina(p.n), llenado: p.f ?? null }))
  };
}
var modoArranqueDe = (unidad) => unidad === "carros" ? "ritmo90" : "primera-pieza";
function arranqueDeStat(t, o) {
  const inicioPlanMs = Date.parse(`${t.dateKey}T${t.duelo?.h0 ?? ""}:00Z`);
  const fino = arranqueDeTurno({ modo: o.modo, inicioPlanMs, serie: o.serie });
  return { modo: o.modo, min: fino ?? (o.modo === "primera-pieza" ? t.duelo?.ini ?? null : null) };
}
function resumenDeStat(t, overrides, arranque) {
  const esNoche = esNocheDesdeHora(t.duelo?.h0);
  if (!t.duelo || esNoche == null) return null;
  return armarResumen({
    shiftDocId: t.shiftDocId,
    dateKey: t.dateKey,
    h0: t.duelo.h0 ?? null,
    shiftId: t.shiftId,
    esNoche,
    cerrado: true,
    piezas: t.total || 0,
    stat: t,
    duelo: t.duelo,
    overrides,
    ...arranque ? { arranque: arranqueDeStat(t, arranque) } : {}
  });
}
function comparar(a, b, mejor, decimales = 0) {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return "sin-dato";
  const f = 10 ** decimales;
  const ra = Math.round(a * f);
  const rb = Math.round(b * f);
  if (ra === rb) return "empate";
  return (mejor === "mayor" ? ra > rb : ra < rb) ? "a" : "b";
}
function combinar(x, y) {
  if (x === "sin-dato" || y === "sin-dato") return "sin-dato";
  if (x === "pendiente" || y === "pendiente") return "pendiente";
  if (x === y) return x;
  if (x === "empate") return y;
  if (y === "empate") return x;
  return "empate";
}
function compararTurnos(a, b, opciones) {
  const cerrado = a.cerrado;
  if (a.dispMin != null && b.dispMin != null && cerrado) {
    const chico = Math.min(a.dispMin, b.dispMin);
    const grande = Math.max(a.dispMin, b.dispMin);
    if (grande > 0 && chico / grande < FRACCION_SIN_DUELO) {
      return { sinDuelo: true, cerrado, motivo: `Uno de los turnos tuvo menos del ${Math.round(FRACCION_SIN_DUELO * 100)} % de los minutos del otro`, kpis: [], puestos: [], puntosA: 0, puntosB: 0, puntosPosibles: 0, ganador: "sin-duelo" };
    }
  }
  const enVivo = !cerrado ? opciones?.carreraEnVivo ?? null : null;
  const carreraA = enVivo ? enVivo.a : a.piezas + a.piezasMant;
  const carreraB = enVivo ? enVivo.b : b.piezas + b.piezasMant;
  const carrera = {
    id: "carrera",
    rotulo: "Carrera",
    nota: enVivo ? "Piezas a igual tiempo de turno. El punto se confirma al cierre, sumando las piezas que las fallas t\xE9cnicas le quitaron a cada equipo." : "Piezas del turno m\xE1s las que las fallas t\xE9cnicas le quitaron al equipo.",
    filas: [{ rotulo: enVivo ? "Hechas a esta hora" : "Piezas con Mantenci\xF3n sumada", a: carreraA, b: carreraB, unidad: "pz", decimales: 0, mejor: "mayor", ganador: comparar(carreraA, carreraB, "mayor") }],
    ganador: !cerrado && !enVivo ? "pendiente" : comparar(carreraA, carreraB, "mayor")
  };
  const ritmo = {
    id: "ritmo",
    rotulo: "Ritmo andando",
    nota: "Piezas por minuto sobre los minutos con piezas.",
    filas: [{ rotulo: "Ritmo", a: a.ritmo, b: b.ritmo, unidad: "pz/min", decimales: 1, mejor: "mayor", ganador: comparar(a.ritmo, b.ritmo, "mayor", 1) }],
    ganador: comparar(a.ritmo, b.ritmo, "mayor", 1)
  };
  const microVivo = !cerrado ? opciones?.microEnVivo ?? null : null;
  const microA = microVivo ? microVivo.a : a.microMinH;
  const microB = microVivo ? microVivo.b : b.microMinH;
  const micro = {
    id: "micro",
    rotulo: "Menos micro detenciones",
    nota: microVivo ? "Minutos de micro detenci\xF3n por hora de producci\xF3n, por m\xE1quina, hasta el mismo minuto de los dos turnos (clasificaci\xF3n oficial de Shoplogix)." : "Minutos de micro detenci\xF3n por hora disponible, por m\xE1quina (clasificaci\xF3n oficial de Shoplogix).",
    filas: [{ rotulo: "Micro detenci\xF3n", a: microA, b: microB, unidad: "min/h", decimales: 1, mejor: "menor", ganador: comparar(microA, microB, "menor", 1) }],
    ganador: comparar(microA, microB, "menor", 1)
  };
  const ganaArranque = comparar(a.arranqueMin, b.arranqueMin, "menor");
  const ganaCierre = !cerrado ? "pendiente" : comparar(a.ultimaHoraPz, b.ultimaHoraPz, "mayor");
  const al90 = a.arranqueModo === "ritmo90";
  const arranque = {
    id: "arranque",
    rotulo: "Arranque y cierre",
    nota: `${al90 ? "Minutos desde el inicio planificado hasta el 90 % del ritmo esperado" : "Minutos desde el inicio planificado hasta la primera pieza"} y piezas de la \xFAltima hora. Gana quien gana los dos.`,
    filas: [
      { rotulo: al90 ? "Hasta el 90 % del ritmo" : "Hasta la primera pieza", a: a.arranqueMin, b: b.arranqueMin, unidad: "min", decimales: 0, mejor: "menor", ganador: ganaArranque },
      { rotulo: "Piezas de la \xFAltima hora", a: a.ultimaHoraPz, b: b.ultimaHoraPz, unidad: "pz", decimales: 0, mejor: "mayor", ganador: ganaCierre }
    ],
    ganador: combinar(ganaArranque, ganaCierre)
  };
  const puestos = [];
  for (const pa of a.puestos) {
    const pb = b.puestos.find((x) => x.clave === pa.clave);
    if (!pb) continue;
    puestos.push({ clave: pa.clave, etiqueta: pa.etiqueta, a: pa.llenado, b: pb.llenado, ganador: comparar(pa.llenado, pb.llenado, "mayor") });
  }
  const kpis = [carrera, ritmo, micro, arranque];
  const todos = [...kpis.map((k) => k.ganador), ...puestos.map((p) => p.ganador)];
  const puntosA = todos.filter((r) => r === "a").length;
  const puntosB = todos.filter((r) => r === "b").length;
  const puntosPosibles = todos.filter((r) => r !== "sin-dato").length;
  return {
    sinDuelo: false,
    cerrado,
    motivo: null,
    kpis,
    puestos,
    puntosA,
    puntosB,
    puntosPosibles,
    ganador: !cerrado ? "pendiente" : puntosA === puntosB ? "empate" : puntosA > puntosB ? "a" : "b"
  };
}
var KPI_FIRMES = ["carrera", "ritmo", "micro"];
function puntajeJornada(m) {
  if (!m || m.sinDuelo) return null;
  if (m.cerrado) return { firmes: { a: m.puntosA, b: m.puntosB }, enJuego: 0, detalleEnJuego: [], cerrada: true };
  const firmes = { a: 0, b: 0 };
  const detalleEnJuego = [];
  const adelante = (r) => r === "a" || r === "b" ? r : null;
  for (const k of m.kpis) {
    if (KPI_FIRMES.includes(k.id)) {
      if (k.ganador === "a") firmes.a += 1;
      else if (k.ganador === "b") firmes.b += 1;
      else if (k.ganador === "pendiente") detalleEnJuego.push({ indicador: k.id, rotulo: k.rotulo, quienVaAdelante: adelante(k.filas[0]?.ganador) });
    } else if (k.ganador !== "sin-dato") {
      detalleEnJuego.push({ indicador: k.id, rotulo: k.rotulo, quienVaAdelante: adelante(k.filas[0]?.ganador) });
    }
  }
  for (const p of m.puestos) {
    if (p.ganador === "sin-dato") continue;
    detalleEnJuego.push({ indicador: "alimentacion", rotulo: `Alimentaci\xF3n ${p.etiqueta}`, puesto: p.etiqueta, quienVaAdelante: adelante(p.ganador) });
  }
  return { firmes, enJuego: detalleEnJuego.length, detalleEnJuego, cerrada: false };
}
var antes = (x, y) => x.jornada < y.jornada || x.jornada === y.jornada && (x.esNoche !== y.esNoche ? x.esNoche : x.shiftDocId < y.shiftDocId);
function rivalDirecto(turno, candidatos) {
  return candidatos.find((c) => c.shiftDocId !== turno.shiftDocId && c.jornada === turno.jornada && c.esNoche !== turno.esNoche && c.equipo !== turno.equipo) ?? null;
}
function duelosDeTurnos(resumenes) {
  const orden = [...resumenes].sort((x, y) => antes(x, y) ? -1 : antes(y, x) ? 1 : 0);
  return orden.map((resumen) => {
    const rival = rivalDirecto(resumen, orden);
    return { resumen, rival, marcador: rival ? compararTurnos(resumen, rival) : null };
  });
}
var porEquipo = (v) => ({ rebolledo: v, cardenas: v });
function marcadorDeCiclo(duelos, indice, hoyIndice) {
  const base = Date.parse(`${ANCLA_LUNES}T12:00:00Z`);
  const inicio = new Date(base + indice * 14 * DIA_MS).toISOString().slice(0, 10);
  const fin = new Date(base + (indice * 14 + 13) * DIA_MS).toISOString().slice(0, 10);
  const out = { inicio, fin, puntos: porEquipo(0), ganados: porEquipo(0), jugados: porEquipo(0), vigente: indice === hoyIndice };
  for (const d of duelos) {
    if (!d.marcador || d.marcador.sinDuelo || cicloDe(d.resumen.jornada).indice !== indice) continue;
    const e = d.resumen.equipo;
    out.puntos[e] += d.marcador.puntosA;
    out.jugados[e] += 1;
    if (d.marcador.ganador === "a") out.ganados[e] += 1;
  }
  return out;
}
function rachasPorEquipo(duelos) {
  const out = { rebolledo: { actual: 0, mejor: 0 }, cardenas: { actual: 0, mejor: 0 } };
  for (const d of duelos) {
    const m = d.marcador;
    if (!m || m.sinDuelo || m.ganador === "pendiente") continue;
    const r = out[d.resumen.equipo];
    if (m.ganador === "a") {
      r.actual += 1;
      r.mejor = Math.max(r.mejor, r.actual);
    } else r.actual = 0;
  }
  return out;
}
var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function semanaIso(lunes) {
  const t = Date.parse(`${lunes}T12:00:00Z`);
  if (!Number.isFinite(t)) return 0;
  const jueves = new Date(t + 3 * DIA_MS);
  const ene1 = Date.UTC(jueves.getUTCFullYear(), 0, 1, 12);
  return Math.floor((jueves.getTime() - ene1) / (7 * DIA_MS)) + 1;
}
var claveDe = (tipo, dateKey) => tipo === "semana" ? lunesDe(dateKey) : dateKey.slice(0, 7);
function marcadorDePeriodo(duelos, tipo, clave, hoyKey) {
  const out = {
    tipo,
    clave,
    etiqueta: "",
    inicio: "",
    fin: "",
    vigente: claveDe(tipo, hoyKey) === clave,
    puntos: porEquipo(0),
    ganados: porEquipo(0),
    empatados: porEquipo(0),
    perdidos: porEquipo(0),
    turnos: porEquipo(0),
    piezasProm: { rebolledo: null, cardenas: null },
    ganador: null
  };
  if (tipo === "semana") {
    out.etiqueta = `Semana ${semanaIso(clave)}`;
    out.inicio = clave;
    out.fin = new Date(Date.parse(`${clave}T12:00:00Z`) + 6 * DIA_MS).toISOString().slice(0, 10);
  } else {
    const [y, mm] = clave.split("-").map(Number);
    out.etiqueta = `${MESES[(mm ?? 1) - 1] ?? clave} ${y}`;
    out.inicio = `${clave}-01`;
    out.fin = new Date(Date.UTC(y ?? 1970, mm ?? 1, 0, 12)).toISOString().slice(0, 10);
  }
  const sumaPz = porEquipo(0);
  let conDuelo = 0;
  for (const d of duelos) {
    if (claveDe(tipo, d.resumen.jornada) !== clave) continue;
    const e = d.resumen.equipo;
    if (d.resumen.cerrado && d.resumen.piezas > 0) {
      out.turnos[e] += 1;
      sumaPz[e] += d.resumen.piezas;
    }
    const m = d.marcador;
    if (!m || m.sinDuelo || m.ganador === "pendiente" || m.ganador === "sin-duelo") continue;
    conDuelo += 1;
    out.puntos[e] += m.puntosA;
    if (m.ganador === "a") out.ganados[e] += 1;
    else if (m.ganador === "b") out.perdidos[e] += 1;
    else out.empatados[e] += 1;
  }
  for (const e of EQUIPOS) out.piezasProm[e] = out.turnos[e] > 0 ? sumaPz[e] / out.turnos[e] : null;
  if (conDuelo > 0) out.ganador = out.puntos.rebolledo === out.puntos.cardenas ? "empate" : out.puntos.rebolledo > out.puntos.cardenas ? "rebolledo" : "cardenas";
  return out;
}
function recordsDe(duelos) {
  const out = [];
  const mejor = (id, rotulo, unidad, decimales, valor, filtro = () => true) => {
    let top = null;
    for (const d of duelos) {
      if (!filtro(d)) continue;
      const v = valor(d);
      if (v != null && Number.isFinite(v) && (!top || v > top.v)) top = { v, d };
    }
    if (top) out.push({ id, rotulo, valor: top.v, unidad, decimales, equipo: top.d.resumen.equipo, dateKey: top.d.resumen.jornada });
  };
  mejor("piezas-dia", "M\xE1s piezas en un turno de d\xEDa", "pz", 0, (d) => d.resumen.piezas, (d) => !d.resumen.esNoche);
  mejor("piezas-noche", "M\xE1s piezas en un turno de noche", "pz", 0, (d) => d.resumen.piezas, (d) => d.resumen.esNoche);
  mejor("ritmo", "Mejor ritmo andando", "pz/min", 1, (d) => d.resumen.ritmo);
  mejor("puntos", "M\xE1s puntos en un turno", "pt", 0, (d) => d.marcador && !d.marcador.sinDuelo ? d.marcador.puntosA : null);
  return out;
}
var ddmm = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
function costoDeMantencionPeriodo(resumenes, hoy, periodo) {
  const ciclo = cicloDe(hoy.jornada);
  const delPeriodo = resumenes.filter((r) => periodo === "hoy" ? r.jornada === hoy.jornada : cicloDe(r.jornada).indice === ciclo.indice);
  return {
    periodo,
    etiqueta: periodo === "hoy" ? `jornada ${ddmm(hoy.jornada)}` : `ciclo ${ddmm(ciclo.inicio)} al ${ddmm(ciclo.fin)}`,
    inicio: periodo === "hoy" ? hoy.jornada : ciclo.inicio,
    fin: periodo === "hoy" ? hoy.jornada : ciclo.fin,
    equipos: costoMantencion(delPeriodo)
  };
}
function costoMantencion(resumenes) {
  const vacio = () => ({ turnos: 0, fallasN: 0, fallaMin: 0, piezasPerdidas: 0, minPorFalla: null });
  const out = { rebolledo: vacio(), cardenas: vacio() };
  for (const r of resumenes) {
    const c = out[r.equipo];
    c.turnos += 1;
    c.fallasN += r.fallasN;
    c.fallaMin += r.fallaMin;
    c.piezasPerdidas += r.piezasMant;
  }
  for (const e of EQUIPOS) out[e].minPorFalla = out[e].fallasN > 0 ? out[e].fallaMin / out[e].fallasN : null;
  return out;
}
function resumenesDeStats(stats, overrides, modo, series) {
  return stats.map((s) => resumenDeStat(s, overrides, { modo, serie: series?.find((x) => x.shiftDocId === s.shiftDocId) })).filter((r) => r != null);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ANCLA_LUNES,
  EQUIPOS,
  FRACCION_SIN_DUELO,
  cicloDe,
  compararTurnos,
  costoDeMantencionPeriodo,
  costoMantencion,
  duelosDeTurnos,
  equipoDelTurno,
  jornadaDe,
  marcadorDeCiclo,
  marcadorDePeriodo,
  modoArranqueDe,
  otroEquipo,
  puntajeJornada,
  rachasPorEquipo,
  recordsDe,
  resumenDeStat,
  resumenesDeStats,
  rivalDirecto,
  semanaIso,
  unidadDeMaquinas
});

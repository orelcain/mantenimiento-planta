/**
 * Registry de máquinas upstream — Planta Chonchi y Planta Yal.
 *
 * Contiene los UUIDs de las Baaders 142 (Evisceradoras) de cada planta,
 * capturados desde el endpoint `query.axd?type=tree`.
 *
 * UUIDs documentados en docs/SHOPLOGIX_API.md §2.
 */

import type { UpstreamMachineInfo } from './types';

export type PlantSlug = 'chonchi' | 'yal';

/**
 * Las 3 Baader 142 de Planta Chonchi (Eviscerados, areaid 3650).
 * Flujo: Marel HG → Baader 142 × 3 + Knuro → Grader.
 */
export const CHONCHI_EVISCERADORAS: readonly UpstreamMachineInfo[] = [
  {
    machineid: '3cbc4c21-dff2-4136-94d5-42f3dff15a4e',
    name: 'Evisceradora 1',
    type: 'baader_142',
    role: 'upstream',
    order: 1,
  },
  {
    machineid: 'ce16a125-6b05-4ab8-acb7-56a123931cff',
    name: 'Evisceradora 2',
    type: 'baader_142',
    role: 'upstream',
    order: 1,
  },
  {
    machineid: '6f76be97-6d45-47ad-8e9a-7450bc2af68c',
    name: 'Evisceradora 3',
    type: 'baader_142',
    role: 'upstream',
    order: 1,
  },
] as const;

/**
 * Las 3 Baader 142 de Planta Yal (Eviscerados YAL, areaid 3651).
 */
export const YAL_EVISCERADORAS: readonly UpstreamMachineInfo[] = [
  {
    machineid: 'fbf9e673-7fdf-47d4-a1cb-af3777fa8eb4',
    name: 'YAL Evisceradora 1',
    type: 'baader_142',
    role: 'upstream',
    order: 1,
  },
  {
    machineid: 'f7d8838a-0aff-4d80-a676-a4e35b3a4c00',
    name: 'YAL Evisceradora 2',
    type: 'baader_142',
    role: 'upstream',
    order: 1,
  },
  {
    machineid: '54eea655-3c62-4d3d-8e3b-11b3962e988b',
    name: 'YAL Evisceradora 3',
    type: 'baader_142',
    role: 'upstream',
    order: 1,
  },
] as const;

/** Mapa plantSlug → lista de máquinas */
export const PLANT_MACHINES: Readonly<Record<PlantSlug, readonly UpstreamMachineInfo[]>> = {
  chonchi: CHONCHI_EVISCERADORAS,
  yal:     YAL_EVISCERADORAS,
};

/** Todas las máquinas de todas las plantas (para búsqueda global). */
const ALL_MACHINES: readonly UpstreamMachineInfo[] = [
  ...CHONCHI_EVISCERADORAS,
  ...YAL_EVISCERADORAS,
];

/** Busca info de una máquina por machineid (cualquier planta). */
export function findMachineInfo(machineid: string): UpstreamMachineInfo | undefined {
  return ALL_MACHINES.find(m => m.machineid === machineid);
}

/** Lista de UUIDs de las Evisceradoras Chonchi (conveniencia para queries batch). */
export const EVISCERADORAS_IDS: readonly string[] =
  CHONCHI_EVISCERADORAS.map(m => m.machineid);

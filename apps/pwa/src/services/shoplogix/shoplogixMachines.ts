/**
 * Registry de máquinas upstream de Planta Chonchi.
 *
 * Contiene los UUIDs de las 3 Baaders 142 (Evisceradoras 1, 2, 3) capturados
 * desde el endpoint `query.axd?type=tree`.
 *
 * Para más máquinas (YAL, Magallanes), agregar entradas acá. Los UUIDs están
 * documentados en docs/SHOPLOGIX_API.md §2.
 */

import type { UpstreamMachineInfo } from './types';

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

/** Busca info de una máquina por machineid. */
export function findMachineInfo(machineid: string): UpstreamMachineInfo | undefined {
  return CHONCHI_EVISCERADORAS.find(m => m.machineid === machineid);
}

/** Lista de UUIDs de las 3 Evisceradoras (conveniencia para queries batch). */
export const EVISCERADORAS_IDS: readonly string[] =
  CHONCHI_EVISCERADORAS.map(m => m.machineid);

/**
 * Registry de máquinas upstream — Planta Chonchi y Planta Yal.
 * Mirror del archivo apps/pwa/src/services/shoplogix/shoplogixMachines.ts
 * (mantener en sync manualmente).
 *
 * IDs de referencia: docs/SHOPLOGIX_API.md
 */

const CHONCHI_EVISCERADORAS = Object.freeze([
  { machineid: '3cbc4c21-dff2-4136-94d5-42f3dff15a4e', name: 'Evisceradora 1', type: 'baader_142' },
  { machineid: 'ce16a125-6b05-4ab8-acb7-56a123931cff', name: 'Evisceradora 2', type: 'baader_142' },
  { machineid: '6f76be97-6d45-47ad-8e9a-7450bc2af68c', name: 'Evisceradora 3', type: 'baader_142' },
])

const YAL_EVISCERADORAS = Object.freeze([
  { machineid: 'fbf9e673-7fdf-47d4-a1cb-af3777fa8eb4', name: 'YAL Evisceradora 1', type: 'baader_142' },
  { machineid: 'f7d8838a-0aff-4d80-a676-a4e35b3a4c00', name: 'YAL Evisceradora 2', type: 'baader_142' },
  { machineid: '54eea655-3c62-4d3d-8e3b-11b3962e988b', name: 'YAL Evisceradora 3', type: 'baader_142' },
])

/** Mapa plantSlug → lista de máquinas a sincronizar */
const PLANT_MACHINES = Object.freeze({
  chonchi: CHONCHI_EVISCERADORAS,
  yal:     YAL_EVISCERADORAS,
})

module.exports = { CHONCHI_EVISCERADORAS, YAL_EVISCERADORAS, PLANT_MACHINES }

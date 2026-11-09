import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Agente { id: string; status: string; priority: number; capabilities: string[] }

const { registro } = vi.hoisted(() => ({ registro: { agentes: [] as Agente[] } }))

vi.mock('../aiAgents', () => ({
  getAllAgents: () => registro.agentes,
  getAgentsForCapability: (cap: string) => registro.agentes
    .filter(a => a.status === 'online' && a.capabilities.includes(cap))
    .sort((a, b) => b.priority - a.priority),
  callAgent: vi.fn(),
  callAgentStream: vi.fn(),
  addMissionLog: vi.fn(),
  isAgentAvailable: vi.fn(),
  getAgentsConfig: vi.fn(),
}))

import { armarCadena, detalleError } from '../ariaOrchestrator'

const gemini = { id: 'gemini', status: 'online', priority: 90, capabilities: ['general', 'vision'] }
const deepseek = { id: 'deepseek', status: 'online', priority: 50, capabilities: ['general'] }
const qwen = { id: 'qwen', status: 'online', priority: 80, capabilities: ['general'] }
const gptOss = { id: 'gpt-oss', status: 'online', priority: 70, capabilities: ['general', 'speed'] }

describe('armarCadena', () => {
  beforeEach(() => { registro.agentes = [gemini, deepseek, qwen, gptOss] })

  it('un saludo prefiere al rápido y conserva respaldo sin repetir agentes', () => {
    expect(armarCadena('speed')).toEqual(['gpt-oss', 'gemini', 'qwen', 'deepseek'])
  })

  it('las demás capacidades no reciben agentes que no las tienen', () => {
    expect(armarCadena('vision')).toEqual(['gemini'])
  })

  it('respeta el agente forzado y las exclusiones', () => {
    expect(armarCadena('speed', { forceAgent: 'qwen' })[0]).toBe('qwen')
    expect(armarCadena('speed', { excludeAgents: ['gpt-oss'] })).toEqual(['gemini', 'qwen', 'deepseek'])
  })

  it('si nadie tiene la capacidad, ordena el último recurso por prioridad', () => {
    expect(armarCadena('code')).toEqual(['gemini', 'qwen', 'gpt-oss', 'deepseek'])
  })
})

describe('detalleError', () => {
  it('incluye el código y el estado HTTP del proxy', () => {
    const err = Object.assign(new Error('falló'), { code: 'functions/internal', details: { status: 503 } })
    expect(detalleError(err)).toBe('functions/internal · HTTP 503 · falló')
  })
})

import { describe, it, expect } from 'vitest';
import { matchCommentToState, matchCommentsToStates } from '../shoplogixCommentMatch';
import type { UpstreamMachineState, UpstreamShiftComment } from '../types';

function mkState(overrides: Partial<UpstreamMachineState> = {}): UpstreamMachineState {
  return {
    startAt: new Date('2026-07-07T20:00:00Z'),
    endAt: new Date('2026-07-07T20:05:00Z'),
    durationSec: 300,
    type: 'downtime',
    name: 'Detencion',
    reason: 'FALTA MMPP',
    color: '#ff0000',
    isCurrent: false,
    ...overrides,
  };
}

function mkComment(overrides: Partial<UpstreamShiftComment> = {}): UpstreamShiftComment {
  return {
    key: 'k1',
    text: 'algo pasó',
    startAt: new Date('2026-07-07T20:00:00Z'),
    endAt: new Date('2026-07-07T21:00:00Z'),
    reasonField: 'reason',
    reasonValue: 'FALTA MMPP',
    ...overrides,
  };
}

describe('matchCommentToState', () => {
  it('sin states devuelve null (huérfano real)', () => {
    expect(matchCommentToState(mkComment(), [])).toBeNull();
  });

  it('un solo state con la misma reason matchea directo', () => {
    const state = mkState();
    expect(matchCommentToState(mkComment(), [state])).toBe(state);
  });

  it('con 2 states de la MISMA reason, gana el de mayor solape temporal', () => {
    const far = mkState({
      startAt: new Date('2026-07-07T10:00:00Z'),
      endAt: new Date('2026-07-07T10:05:00Z'),
    });
    const overlapping = mkState({
      startAt: new Date('2026-07-07T20:30:00Z'),
      endAt: new Date('2026-07-07T20:45:00Z'),
    });
    const comment = mkComment({
      startAt: new Date('2026-07-07T20:00:00Z'),
      endAt: new Date('2026-07-07T21:00:00Z'),
    });
    expect(matchCommentToState(comment, [far, overlapping])).toBe(overlapping);
  });

  it('sin solape entre candidatos, gana el más cercano en el tiempo', () => {
    const near = mkState({
      startAt: new Date('2026-07-07T19:00:00Z'),
      endAt: new Date('2026-07-07T19:05:00Z'),
    });
    const distant = mkState({
      startAt: new Date('2026-07-07T05:00:00Z'),
      endAt: new Date('2026-07-07T05:05:00Z'),
    });
    // Comentario puntual (start===end) fuera de ambos rangos, más cerca de "near".
    const comment = mkComment({
      startAt: new Date('2026-07-07T19:10:00Z'),
      endAt: new Date('2026-07-07T19:10:00Z'),
    });
    expect(matchCommentToState(comment, [distant, near])).toBe(near);
  });

  it('reasonValue vacío considera TODOS los states como candidatos', () => {
    const state = mkState({ reason: 'CUALQUIERA' });
    const comment = mkComment({ reasonValue: '' });
    expect(matchCommentToState(comment, [state])).toBe(state);
  });

  it('reasonValue que no matchea NINGÚN state cae a todos los states (no descarta el comentario)', () => {
    const state = mkState({ reason: 'OTRA COSA' });
    const comment = mkComment({ reasonValue: 'FALTA MMPP' });
    expect(matchCommentToState(comment, [state])).toBe(state);
  });

  it('el match de reason es case-insensitive y con trim', () => {
    const state = mkState({ reason: '  falta mmpp  ' });
    const comment = mkComment({ reasonValue: 'FALTA MMPP' });
    expect(matchCommentToState(comment, [state])).toBe(state);
  });
});

describe('matchCommentsToStates', () => {
  it('empareja cada comentario independientemente y preserva el orden', () => {
    const s1 = mkState({ reason: 'A', startAt: new Date('2026-07-07T10:00:00Z'), endAt: new Date('2026-07-07T10:05:00Z') });
    const s2 = mkState({ reason: 'B', startAt: new Date('2026-07-07T11:00:00Z'), endAt: new Date('2026-07-07T11:05:00Z') });
    const c1 = mkComment({ key: 'c1', reasonValue: 'A', startAt: s1.startAt, endAt: s1.endAt });
    const c2 = mkComment({ key: 'c2', reasonValue: 'B', startAt: s2.startAt, endAt: s2.endAt });
    const result = matchCommentsToStates([c1, c2], [s1, s2]);
    expect(result).toEqual([
      { comment: c1, state: s1 },
      { comment: c2, state: s2 },
    ]);
  });
});

import { describe, it, expect } from 'vitest';
import { parseShoplogixTime, toShoplogixTime, safeParseShoplogixTime } from '../shoplogixTime';

describe('parseShoplogixTime', () => {
  it('parsea timestamp Shoplogix válido a Date UTC', () => {
    const d = parseShoplogixTime('20260226T090000.000');
    expect(d.toISOString()).toBe('2026-02-26T09:00:00.000Z');
  });

  it('mantiene milisegundos', () => {
    const d = parseShoplogixTime('20260226T091734.933');
    expect(d.toISOString()).toBe('2026-02-26T09:17:34.933Z');
  });

  it('lanza en formato inválido', () => {
    expect(() => parseShoplogixTime('2026-02-26T09:00:00Z')).toThrow();
    expect(() => parseShoplogixTime('')).toThrow();
    expect(() => parseShoplogixTime('abc')).toThrow();
  });
});

describe('toShoplogixTime', () => {
  it('serializa Date a formato Shoplogix', () => {
    const d = new Date('2026-02-26T09:00:00.000Z');
    expect(toShoplogixTime(d)).toBe('20260226T090000.000');
  });

  it('es inverso de parseShoplogixTime', () => {
    const orig = '20260226T181500.123';
    expect(toShoplogixTime(parseShoplogixTime(orig))).toBe(orig);
  });

  it('lanza en Date inválido', () => {
    expect(() => toShoplogixTime(new Date('invalid'))).toThrow();
  });
});

describe('safeParseShoplogixTime', () => {
  it('retorna Date en input válido', () => {
    const d = safeParseShoplogixTime('20260226T090000.000');
    expect(d).toBeInstanceOf(Date);
  });

  it('retorna null en input inválido/vacío (no lanza)', () => {
    expect(safeParseShoplogixTime('')).toBeNull();
    expect(safeParseShoplogixTime(null)).toBeNull();
    expect(safeParseShoplogixTime(undefined)).toBeNull();
    expect(safeParseShoplogixTime('nope')).toBeNull();
  });
});

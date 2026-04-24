/**
 * Helpers de tiempo para Shoplogix.
 *
 * Shoplogix usa formato "YYYYMMDDTHHMMSS.fff" (UTC) para start/end en queries
 * y responses. Todas las conversiones pasan por acá.
 */

import type { ShoplogixTimestamp } from './types';

const RE_SLX_TIMESTAMP = /^\d{8}T\d{6}\.\d{3}$/;

/**
 * Parsea un timestamp Shoplogix a Date (UTC).
 * "20260226T090000.000" → new Date("2026-02-26T09:00:00.000Z")
 */
export function parseShoplogixTime(s: ShoplogixTimestamp): Date {
  if (!s || !RE_SLX_TIMESTAMP.test(s)) {
    throw new Error(`Timestamp Shoplogix inválido: ${JSON.stringify(s)}`);
  }
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` +
              `T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}.${s.slice(16, 19)}Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) throw new Error(`Fecha inválida tras parsear: ${iso}`);
  return d;
}

/**
 * Serializa un Date a formato Shoplogix (UTC).
 * new Date("2026-02-26T09:00:00.000Z") → "20260226T090000.000"
 */
export function toShoplogixTime(d: Date): ShoplogixTimestamp {
  if (isNaN(d.getTime())) throw new Error('Date inválido para serializar a Shoplogix time');
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}` +
         `.${pad(d.getUTCMilliseconds(), 3)}`;
}

/** Safe parse — retorna null en vez de lanzar. */
export function safeParseShoplogixTime(s: ShoplogixTimestamp | null | undefined): Date | null {
  if (!s) return null;
  try {
    return parseShoplogixTime(s);
  } catch {
    return null;
  }
}

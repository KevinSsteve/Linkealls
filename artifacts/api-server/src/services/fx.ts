/**
 * Kz → USD conversion for campaign budgets.
 *
 * The owner always pays in Kwanzas; Linkealls funds the house ad accounts in
 * USD. The effective rate (base rate + margin) is locked at payment time and
 * stored on the campaign for audit — never recomputed later.
 *
 * Config (env):
 *  - FX_AOA_PER_USD      base market rate (default 950)
 *  - FX_MARGIN_PCT       margin applied on top of the base rate (default 10)
 */

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Effective AOA-per-USD rate including margin. Higher rate ⇒ fewer USD per Kz. */
export function effectiveAoaPerUsd(): number {
  const base = envNumber("FX_AOA_PER_USD", 950);
  const marginPct = envNumber("FX_MARGIN_PCT", 10);
  return Math.round(base * (1 + marginPct / 100) * 10000) / 10000;
}

/** Convert an AOA amount to USD at the given rate, 2 decimals, floor (never over-fund). */
export function aoaToUsd(amountAoa: number, rateAoaPerUsd: number): number {
  return Math.floor((amountAoa / rateAoaPerUsd) * 100) / 100;
}

/**
 * Campaign funding amount in WHOLE USD (Zernio budgets are whole units).
 * Floored so the quoted/funded amount is exactly what the gateway receives —
 * the owner sees this number before paying; no hidden rounding at publish.
 */
export function aoaToWholeUsd(amountAoa: number, rateAoaPerUsd: number): number {
  return Math.floor(amountAoa / rateAoaPerUsd);
}

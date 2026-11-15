/**
 * Quick cash amounts for the checkout: the exact total, then the next "round"
 * amounts a customer is likely to hand over (next 5, 10, 20, 50, 100, …).
 */
import { round2 } from './calc.js';

export function quickCashAmounts(total, max = 4) {
  const t = round2(total);
  if (!(t > 0)) return [];
  const out = [t];
  for (const step of [1, 5, 10, 20, 50, 100, 200, 500, 1000]) {
    const v = Math.ceil(t / step) * step;
    if (v > t && !out.includes(v)) out.push(v);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

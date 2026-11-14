/**
 * Barcode helpers, including GS1 parsing for pharmaceutical packs.
 *
 * Medicine packs commonly carry a GS1 DataMatrix such as
 *   01 05012345678900 17 271231 10 BATCH42 21 SERIAL
 * (AI 01 = GTIN-14, 17 = expiry YYMMDD, 10 = batch/lot, 21 = serial).
 * We extract the GTIN so it can be matched against the product's EAN-13/UPC.
 */

const GS = String.fromCharCode(29);
const FIXED = { '01': 14, '17': 6, '11': 6, '15': 6 };
const VARIABLE = new Set(['10', '21']);

export function parseGS1(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(/^\]d2|^\]C1|^\]Q3/, '');
  s = s.replace(/\(([0-9]{2})\)/g, (_, ai) => `${GS}${ai}`).replace(new RegExp(`^${GS}`), '');
  if (!/^01\d{14}/.test(s)) return null;
  const out = {};
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }
    const ai = s.slice(i, i + 2);
    i += 2;
    if (FIXED[ai]) {
      out[ai] = s.slice(i, i + FIXED[ai]);
      i += FIXED[ai];
    } else if (VARIABLE.has(ai)) {
      const end = s.indexOf(GS, i);
      out[ai] = end === -1 ? s.slice(i) : s.slice(i, end);
      i = end === -1 ? s.length : end + 1;
    } else {
      break; // unknown AI: stop, we already have what we need
    }
  }
  const exp = out['17'];
  return {
    gtin: out['01'],
    batch: out['10'] || null,
    serial: out['21'] || null,
    expiry: exp ? `20${exp.slice(0, 2)}-${exp.slice(2, 4)}-${exp.slice(4, 6) === '00' ? '28' : exp.slice(4, 6)}` : null,
  };
}

/** All codes a scan could match: raw, GTIN-14, EAN-13 and UPC-A variants. */
export function candidateCodes(raw) {
  const set = new Set();
  const clean = String(raw || '').trim();
  if (!clean) return [];
  set.add(clean);
  const gs1 = parseGS1(clean);
  const digits = gs1?.gtin || (/^\d{8,14}$/.test(clean) ? clean : null);
  if (digits) {
    set.add(digits);
    const stripped = digits.replace(/^0+/, '');
    set.add(stripped);
    if (stripped.length <= 13) set.add(stripped.padStart(13, '0'));
    if (stripped.length <= 12) set.add(stripped.padStart(12, '0'));
    set.add(digits.padStart(14, '0'));
  }
  return [...set];
}

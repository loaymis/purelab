/**
 * UUID v4 that also works on insecure origins (e.g. http://192.168.x.x LAN),
 * where crypto.randomUUID() is unavailable but getRandomValues() is.
 */
export function uuid() {
  if (globalThis.crypto?.randomUUID && globalThis.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function randomCode(len = 3) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(len));
  return [...b].map((x) => alphabet[x % alphabet.length]).join('');
}

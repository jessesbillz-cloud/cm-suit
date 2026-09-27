// Small crypto helpers shared by auth, access links and inbound email. Web Crypto only.

const encoder = new TextEncoder();

async function digest(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
}

/** SHA-256 as lowercase hex. Access-link tokens are stored this way (access_links.token_hash). */
export async function sha256Hex(input: string): Promise<string> {
  return Array.from(await digest(input), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time string comparison. Both sides are hashed first so neither the length nor the position of the first
 * difference leaks through timing.
 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Random URL-safe token. 32 bytes → 43 characters. */
export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Decodes standard base64 (Postmark attachment content). Throws on invalid input. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decodes a base64url segment (JWT payload) to text. Throws on invalid input. */
export function base64UrlToText(seg: string): string {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(seg.length / 4) * 4, '=');
  return new TextDecoder().decode(base64ToBytes(b64));
}

// Small crypto helpers shared by auth, access links, inbound email and signed records. Web Crypto only.

const encoder = new TextEncoder();

async function digest(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 as lowercase hex. Access-link tokens are stored this way (access_links.token_hash). */
export async function sha256Hex(input: string): Promise<string> {
  return hex(await digest(input));
}

/** SHA-256 of raw bytes as lowercase hex (files.sha256). */
export async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))));
}

/** JSON with object keys sorted at every level: the same content always hashes the same. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** SPEC §6.9 content hash of a signed record: sha256 hex of its canonical JSON. The ONE way records are hashed. */
export function contentHash(content: unknown): Promise<string> {
  return sha256Hex(canonicalJson(content));
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

/** HMAC-SHA256 of `message` (UTF-8) keyed by raw `keyBytes`, as standard base64 (Svix webhook signatures). */
export async function hmacSha256Base64(keyBytes: Uint8Array, message: string): Promise<string> {
  // Copy into a fresh ArrayBuffer-backed view (WebCrypto's BufferSource type).
  const key = await crypto.subtle.importKey('raw', new Uint8Array(keyBytes), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  let s = '';
  for (const b of sig) s += String.fromCharCode(b);
  return btoa(s);
}

/** Random URL-safe token. 32 bytes → 43 characters. */
export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Decodes standard base64 (webhook signing secrets, JWT segments). Throws on invalid input. */
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

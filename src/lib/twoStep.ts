// Two-step login helpers with no I/O: the code box, the key shown for manual entry, and the QR image source.

/** Digits only; exactly six of them, else null. */
export function normalizeTotpCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}

/** 'ABCDEFGHIJ' -> 'ABCD EFGH IJ': the TOTP key in groups of four, the way authenticator apps print it. */
export function groupKey(secret: string): string {
  return secret.replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') ?? '';
}

const RAW_SVG_PREFIX = 'data:image/svg+xml;utf-8,';

/**
 * supabase-js hands back the QR as `data:image/svg+xml;utf-8,<svg ...>` with the SVG text unencoded. A raw `#` or
 * `%` inside would cut the URL short in an <img>, so the SVG is percent-encoded before it is used as a source.
 */
export function qrImageSrc(qrCode: string): string {
  if (!qrCode.startsWith(RAW_SVG_PREFIX)) return qrCode;
  const svg = qrCode.slice(RAW_SVG_PREFIX.length);
  if (!svg.trimStart().startsWith('<')) return qrCode;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

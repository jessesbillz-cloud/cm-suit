// The files of requests copied from My Daily Reports (0112): each queued link is fetched only from MDR's public storage
// host (MDR_PUBLIC_HOST, refused when unset), at most 250 MB, typed by its own bytes. Pure apart from the env read, so
// the checks are unit-tested (mdrFiles_test.ts).
import { env } from './env.ts';
import { HttpError } from './http.ts';
import { safeName, sniff } from './requestFiles.ts';

export const MAX_MDR_FILE_BYTES = 250 * 1024 * 1024;

/** A link the function must not fetch: marked refused for good, never retried. */
export class MdrRefused extends Error {}

/** MDR's storage host. Unset or not a plain host name: the request is refused (CLAUDE.md rule 4). */
export function mdrHost(): string {
  const host = env('MDR_PUBLIC_HOST').trim().toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) throw new HttpError(500, 'Server misconfigured: MDR_PUBLIC_HOST is not a host name');
  return host;
}

/** The link, if it is a public object on MDR's storage host over https. Anything else is refused. */
export function mdrSourceUrl(raw: string, host: string): URL {
  if (!URL.canParse(raw)) throw new MdrRefused('Not a link');
  const u = new URL(raw);
  if (u.protocol !== 'https:') throw new MdrRefused('Not https');
  if (u.hostname !== host || u.port !== '' || u.username !== '' || u.password !== '') throw new MdrRefused('Not MDR\'s storage');
  if (!u.pathname.startsWith('/storage/v1/object/public/') || u.pathname.includes('/../')) {
    throw new MdrRefused('Not a public MDR file');
  }
  return u;
}

/** The name as MDR stored it: the link's last part, decoded when it decodes cleanly. */
export function mdrNameOf(u: URL): string {
  const last = u.pathname.split('/').pop() ?? '';
  return /%(?![0-9A-Fa-f]{2})/.test(last) ? last : decodeURIComponent(last);
}

/** Type and name by the bytes: a photo or PDF keeps its true extension, anything else is stored as plain bytes. */
export function typed(bytes: Uint8Array, name: string): { mime: string; name: string } {
  const kind = sniff(bytes);
  if (kind) return { mime: kind.mime, name: safeName(name, kind.ext) };
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase() ?? 'bin';
  return { mime: 'application/octet-stream', name: safeName(name, ext) };
}

/** The body, refused past `max` bytes (the announced length first, then what actually arrives). */
export async function readCapped(res: Response, max = MAX_MDR_FILE_BYTES): Promise<Uint8Array> {
  const said = Number(res.headers.get('content-length') ?? '');
  if (Number.isFinite(said) && said > max) throw new MdrRefused('Over 250 MB');
  if (!res.body) throw new Error('Empty response');
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new MdrRefused('Over 250 MB');
    }
    parts.push(value);
  }
  if (size === 0) throw new Error('Empty file');
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

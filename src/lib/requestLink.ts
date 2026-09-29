// The request link's and the hub's addresses (SPEC §6.4 #4), and the copy kept on the device that made them.
// The server keeps only a hash, so a link can be shown again only where it was made: this device keeps it under an
// `app:` key (cleared at sign-out, SPEC §6.6), and only while the server says the link that works now was made at that
// same moment. Made elsewhere, rotated or undone since: the copy is dropped and the screen offers "New link".
import { z } from 'zod';

function root(origin: string, basePath: string): string {
  return `${origin}${basePath.replace(/\/+$/, '')}`;
}

/** The job's request link: /r/<job>?t=<token>. */
export function requestLinkUrl(origin: string, basePath: string, projectId: string, token: string): string {
  return `${root(origin, basePath)}/r/${encodeURIComponent(projectId)}?t=${encodeURIComponent(token)}`;
}

/** The inspector's hub: /h/<hub>?t=<token>. */
export function hubUrl(origin: string, basePath: string, hubId: string, token: string): string {
  return `${root(origin, basePath)}/h/${encodeURIComponent(hubId)}?t=${encodeURIComponent(token)}`;
}

/** The link as printed under the QR code: no scheme. */
export function shortLinkText(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

const rememberedSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  made_at: z.string().min(1),
  /** The hub's id (hub links only). */
  id: z.string().min(1).optional(),
});
type RememberedLink = z.infer<typeof rememberedSchema>;

export const requestLinkKey = (projectId: string): string => `app:request-link:${projectId}`;
export const HUB_LINK_KEY = 'app:request-hub';

function sameMoment(a: string, b: string): boolean {
  const x = Date.parse(a);
  return Number.isFinite(x) && x === Date.parse(b);
}

/**
 * This device's copy of a link, if it is the one that works now (`madeAt` = when the server says it was made).
 * Read-only: a stale copy is simply not shown, and the next "New link" overwrites it.
 */
export function rememberedLink(key: string, madeAt: string | null): RememberedLink | null {
  const raw = window.localStorage.getItem(key);
  if (raw === null || madeAt === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn('ignoring an unreadable saved link', e);
    return null;
  }
  const hit = rememberedSchema.safeParse(parsed);
  return hit.success && sameMoment(hit.data.made_at, madeAt) ? hit.data : null;
}

export function rememberLink(key: string, link: RememberedLink): void {
  window.localStorage.setItem(key, JSON.stringify(link));
}

export function forgetLink(key: string): void {
  window.localStorage.removeItem(key);
}

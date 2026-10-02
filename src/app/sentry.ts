// What goes to Sentry never carries a link's secret. The request link, the hub and the access and delivery links hold
// their token in the address (?t=, with the hub's id in ?h=), Supabase's sign-in puts tokens in the fragment
// (#access_token=...), and a personal sign-in link is /k/<key>. Error events and breadcrumbs (navigation from/to, fetch
// and xhr urls, messages, the page url and its Referer) go through scrubText in every string, before they leave the page
// (main.tsx: beforeSend, beforeBreadcrumb). Pure, unit-tested in sentry.test.ts.
import type { Breadcrumb, ErrorEvent } from '@sentry/react';

/** A query or fragment value that is a secret: t and h, or any name that reads like a token. */
const SECRET_NAME = /^(t|h)$|token|secret|code|key|sig|pass|otp|jwt|auth/i;
const PARAM_SOURCE = String.raw`([?&#;])([^=&#?;\s"'<>]+)=([^&#;\s"'<>]*)`;
const KEY_PATH_SOURCE = String.raw`(/k/)[^/?#\s"'<>]+`;
const MAX_DEPTH = 12;

/** Every secret query or fragment value, and a sign-in key in the path, becomes "[redacted]" (in URLs or free text). */
export function scrubText(s: string): string {
  return s
    .replace(new RegExp(PARAM_SOURCE, 'g'), (whole: string, sep: string, name: string) =>
      SECRET_NAME.test(name) ? `${sep}${name}=[redacted]` : whole,
    )
    .replace(new RegExp(KEY_PATH_SOURCE, 'g'), '$1[redacted]');
}

function scrubValue(v: unknown, depth: number): unknown {
  if (typeof v === 'string') return scrubText(v);
  if (v === null || typeof v !== 'object' || depth > MAX_DEPTH) return v;
  if (Array.isArray(v)) return v.map((x: unknown) => scrubValue(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = scrubValue(x, depth + 1);
  return out;
}

/** beforeSend: a copy of the event with every string scrubbed. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  return scrubValue(event, 0) as ErrorEvent;
}

/** beforeBreadcrumb: a copy of the breadcrumb with every string scrubbed. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  return scrubValue(crumb, 0) as Breadcrumb;
}

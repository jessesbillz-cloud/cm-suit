// Links a read bid to the sub directory by company name (SPEC §11.6): the extraction's bidder name against the org's
// subs, both normalized (lower case, no punctuation, no Inc/LLC/Corp/Co/Company). An exact match wins; otherwise one
// name may be a prefix of the other, but only when exactly one sub fits. Anything less certain stays unlinked.

interface NamedSub {
  id: string;
  company: string;
}

const SUFFIXES = new Set(['inc', 'incorporated', 'llc', 'corp', 'corporation', 'co', 'company', 'ltd']);

/** "Sample Drywall Co., Inc." -> "sample drywall". Exported for tests. */
export function normalizeCompany(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '');
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1] ?? '')) words.pop();
  return words.join(' ');
}

export function matchSub(bidderName: string | null, subs: readonly NamedSub[]): NamedSub | null {
  if (bidderName === null) return null;
  const wanted = normalizeCompany(bidderName);
  if (wanted === '') return null;
  const normalized = subs.map((s) => ({ sub: s, name: normalizeCompany(s.company) }));
  const exact = normalized.find((n) => n.name === wanted);
  if (exact) return exact.sub;
  const close = normalized.filter((n) => n.name !== '' && (n.name.startsWith(`${wanted} `) || wanted.startsWith(`${n.name} `)));
  return close.length === 1 ? (close[0]?.sub ?? null) : null;
}

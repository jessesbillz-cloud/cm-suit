// The ONE filename builder (SPEC §8.3, CLAUDE.md rule 11). Pattern tokens in braces:
//   {#}, {##}, {###} ...   the record number, zero-padded to the count of '#'
//   {MM-DD-YYYY}, {YYYY-MM-DD}, {MM.DD.YY} ...   the record date (any mix of Y/M/D runs and - . _ or space)
//   {Project}, {Author} ...   a named value; matched exactly, then case-insensitively
// A token without a value throws: a filename is never silently cut short.

interface FilenameValues {
  /** The record number (assigned by the database; never computed in the browser). */
  number?: number;
  /** The record date as yyyy-MM-dd, already in the project time zone (see lib/dates todayInZone). */
  date?: string;
  /** Named values, e.g. { Project: 'Sample Job A', Author: 'Pat Q' }. */
  fields?: Readonly<Record<string, string>>;
}

const TOKEN_RE = /\{([^{}]+)\}/g;
const NUMBER_RE = /^#+$/;
const DATE_RE = /^(Y{2}|Y{4}|M{1,2}|D{1,2})([-._ ](Y{2}|Y{4}|M{1,2}|D{1,2}))*$/;
const ILLEGAL_RE = /[/\\:*?"<>|]/g;

function formatNumber(token: string, n: number | undefined): string {
  if (n === undefined) throw new Error('Missing the number for {#}');
  if (!Number.isInteger(n) || n < 0) throw new Error(`Bad number ${String(n)}`);
  return String(n).padStart(token.length, '0');
}

function formatDate(token: string, date: string | undefined): string {
  const m = date === undefined ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Missing or malformed date for {${token}} (expected yyyy-MM-dd)`);
  const [, y = '', mo = '', d = ''] = m;
  return token.replace(/Y{4}|Y{2}|M{1,2}|D{1,2}/g, (part) => {
    if (part === 'YYYY') return y;
    if (part === 'YY') return y.slice(2);
    if (part === 'MM') return mo;
    if (part === 'M') return String(Number(mo));
    if (part === 'DD') return d;
    return String(Number(d));
  });
}

function lookupField(token: string, fields: Readonly<Record<string, string>> | undefined): string {
  const src = fields ?? {};
  const exact = src[token];
  if (exact !== undefined) return exact;
  const key = Object.keys(src).find((k) => k.toLowerCase() === token.toLowerCase());
  const loose = key === undefined ? undefined : src[key];
  if (loose === undefined) throw new Error(`Missing a value for {${token}}`);
  return loose;
}

/** Builds a safe filename (no path separators or characters Windows rejects). The extension is kept as written. */
export function buildFilename(pattern: string, values: FilenameValues): string {
  const raw = pattern.replace(TOKEN_RE, (_whole, inner: string) => {
    const token = inner.trim();
    if (NUMBER_RE.test(token)) return formatNumber(token, values.number);
    if (DATE_RE.test(token)) return formatDate(token, values.date);
    return lookupField(token, values.fields);
  });
  const clean = raw.replace(ILLEGAL_RE, '-').replace(/\s+/g, ' ').trim();
  if (clean === '') throw new Error('The filename pattern produced an empty name');
  return clean;
}

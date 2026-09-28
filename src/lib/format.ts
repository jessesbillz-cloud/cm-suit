// Small display formatters shared by the UI.

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  let v = n;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${i === 0 ? String(v) : v.toFixed(v < 10 ? 1 : 0)} ${UNITS[i] ?? 'B'}`;
}

/** 'file.uploaded' / 'project_admin' -> 'File uploaded' / 'Project admin'. Labels come from data, not code. */
/** Short trade words that are always written in capitals. */
const ACRONYMS = new Set(['ir', 'irs', 'rfi', 'rfis', 'cn', 'dsa', 'ofs', 'pdf', 'csi', 'dir', 'cslb', 'pw', 'ccd', 'ccds']);

export function humanize(key: string): string {
  const words = key
    .replace(/[._]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w));
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Dollars as printed on a bid. Only pricing views call this (money lives in pricing tables, CLAUDE.md rule 3). */
export function formatMoney(n: number): string {
  return MONEY.format(n);
}

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
export function humanize(key: string): string {
  const words = key.replace(/[._]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

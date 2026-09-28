// e2e mock of a company's logo: the picked image kept as a data URL in sessionStorage (never module state).
import { delay } from './store';

const KEY = 'e2e-mock-org-logos';

function readAll(): Record<string, string> {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? {} : (JSON.parse(raw) as Record<string, string>);
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The image could not be read.'));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('The image could not be read.'));
    };
    reader.readAsDataURL(blob);
  });
}

export async function logo(orgId: string): Promise<{ path: string | null; url: string | null }> {
  await delay();
  const url = readAll()[orgId] ?? null;
  return { path: url === null ? null : `org/${orgId}/logo`, url };
}

export async function setLogo(orgId: string, blob: Blob | null): Promise<void> {
  await delay();
  const others = Object.fromEntries(Object.entries(readAll()).filter(([id]) => id !== orgId));
  const next = blob === null ? others : { ...others, [orgId]: await asDataUrl(blob) };
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
}

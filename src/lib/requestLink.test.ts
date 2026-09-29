import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetLink, hubUrl, rememberLink, rememberedLink, requestLinkKey, requestLinkUrl, shortLinkText } from './requestLink';

const TOKEN = 'Ab-_'.repeat(10) + 'xyz';
const JOB = '3f2b9c4e-1d2a-4b7c-9e8f-0a1b2c3d4e5f';

/** A tiny in-memory localStorage for the node test environment. */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => {
      m.clear();
    },
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
}

describe('request link addresses', () => {
  it('builds the job link and the hub link under the app path', () => {
    expect(requestLinkUrl('https://app.example.test', '/cm-suit/', JOB, TOKEN)).toBe(`https://app.example.test/cm-suit/r/${JOB}?t=${TOKEN}`);
    expect(requestLinkUrl('https://app.example.test', '/', JOB, TOKEN)).toBe(`https://app.example.test/r/${JOB}?t=${TOKEN}`);
    expect(hubUrl('https://app.example.test', '', 'hub-1', TOKEN)).toBe(`https://app.example.test/h/hub-1?t=${TOKEN}`);
  });
  it('prints the link without its scheme', () => {
    expect(shortLinkText(`https://app.example.test/r/${JOB}?t=${TOKEN}`)).toBe(`app.example.test/r/${JOB}?t=${TOKEN}`);
  });
});

describe('the copy kept on this device', () => {
  const g = globalThis as { window?: { localStorage: Storage } };
  beforeEach(() => {
    g.window = { localStorage: fakeStorage() };
  });
  afterEach(() => {
    delete g.window;
  });

  it('shows the saved link only while it is the one that works now', () => {
    const key = requestLinkKey(JOB);
    expect(key).toBe(`app:request-link:${JOB}`);
    rememberLink(key, { token: TOKEN, made_at: '2026-09-29T15:00:00.123456+00:00' });
    expect(rememberedLink(key, '2026-09-29T15:00:00.123Z')?.token).toBe(TOKEN);
    expect(rememberedLink(key, '2026-09-29T15:05:00+00:00')).toBeNull();
    expect(rememberedLink(key, null)).toBeNull();
    forgetLink(key);
    expect(rememberedLink(key, '2026-09-29T15:00:00.123Z')).toBeNull();
  });

  it('ignores anything unreadable or malformed', () => {
    g.window?.localStorage.setItem('app:x', '{not json');
    expect(rememberedLink('app:x', '2026-09-29T15:00:00Z')).toBeNull();
    g.window?.localStorage.setItem('app:y', JSON.stringify({ token: 'short', made_at: '2026-09-29T15:00:00Z' }));
    expect(rememberedLink('app:y', '2026-09-29T15:00:00Z')).toBeNull();
  });
});

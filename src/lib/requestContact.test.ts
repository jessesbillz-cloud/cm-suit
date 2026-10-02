import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONTACT_KEY, EMPTY_CONTACT, contactReady, forgetContact, rememberContact, rememberedContact } from './requestContact';

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

const SAMPLE = { name: 'Sample Foreman', company: 'Sample Framing', phone: '555 010 2030', email: '' };

describe('the contact this device remembers', () => {
  const g = globalThis as { window?: { localStorage: Storage } };
  beforeEach(() => {
    g.window = { localStorage: fakeStorage() };
  });
  afterEach(() => {
    delete g.window;
  });

  it('starts empty, remembers what was sent (trimmed), and forgets on "Not you?"', () => {
    expect(rememberedContact()).toEqual(EMPTY_CONTACT);
    rememberContact({ ...SAMPLE, name: '  Sample Foreman ' });
    expect(rememberedContact()).toEqual(SAMPLE);
    forgetContact();
    expect(rememberedContact()).toEqual(EMPTY_CONTACT);
  });

  it('ignores an unreadable or malformed copy', () => {
    g.window?.localStorage.setItem(CONTACT_KEY, '{not json');
    expect(rememberedContact()).toEqual(EMPTY_CONTACT);
    g.window?.localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: 3 }));
    expect(rememberedContact()).toEqual(EMPTY_CONTACT);
  });
});

describe('ready to send', () => {
  it('needs a name, a company and a phone or an email', () => {
    expect(contactReady(SAMPLE)).toBe(true);
    expect(contactReady({ ...SAMPLE, phone: '', email: 'foreman@example.test' })).toBe(true);
    expect(contactReady({ ...SAMPLE, phone: ' ', email: '' })).toBe(false);
    expect(contactReady({ ...SAMPLE, name: '' })).toBe(false);
    expect(contactReady({ ...SAMPLE, company: ' ' })).toBe(false);
  });
});

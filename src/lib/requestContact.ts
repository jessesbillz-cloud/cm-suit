// Who is asking on the public request page (SPEC §6.4 #4): name, company, phone and email, remembered on this device
// like MDR's request page, so the next request from the same phone is prefilled. "Not you?" forgets it. Kept under an
// `app:` key (cleared at sign-out, SPEC §6.6); never sent anywhere but with a request.
import { z } from 'zod';
import type { Contact } from '../data/requestNoLogin.types';

export const CONTACT_KEY = 'app:request-contact';

const contactSchema = z.object({
  name: z.string().max(120),
  company: z.string().max(120),
  phone: z.string().max(30),
  email: z.string().max(320),
});

export const EMPTY_CONTACT: Contact = { name: '', company: '', phone: '', email: '' };

/** The contact this device remembers, or the empty one. An unreadable copy is ignored (and replaced on the next send). */
export function rememberedContact(): Contact {
  const raw = window.localStorage.getItem(CONTACT_KEY);
  if (raw === null) return EMPTY_CONTACT;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn('ignoring an unreadable saved contact', e);
    return EMPTY_CONTACT;
  }
  const hit = contactSchema.safeParse(parsed);
  return hit.success ? hit.data : EMPTY_CONTACT;
}

export function rememberContact(c: Contact): void {
  window.localStorage.setItem(
    CONTACT_KEY,
    JSON.stringify({ name: c.name.trim(), company: c.company.trim(), phone: c.phone.trim(), email: c.email.trim() }),
  );
}

export function forgetContact(): void {
  window.localStorage.removeItem(CONTACT_KEY);
}

/** Ready to send: a name, a company, and a phone or an email. */
export function contactReady(c: Contact): boolean {
  return c.name.trim() !== '' && c.company.trim() !== '' && (c.phone.trim() !== '' || c.email.trim() !== '');
}

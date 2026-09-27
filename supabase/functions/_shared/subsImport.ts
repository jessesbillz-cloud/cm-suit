// A GC's master sub list (SPEC §11.2) turned into one directory entry per company. Pure: no I/O, no npm imports, so
// subsImport_test.ts runs offline. import-subs reads the file (ExcelJS or parseCsv), calls subsFromTable, and sends
// the result to the import_subs RPC, which merges it with the directory using the same contact rule as mergeContacts.
//
// The list has one row per company per bid package. Known headers are mapped (case, spaces, punctuation and "#"
// ignored); every other column is kept in `extra` under its header. "Scope Detail" is kept per package code.

export interface SubContact {
  name: string;
  email: string;
  phone: string;
  title: string;
}

export interface ImportSub {
  company: string;
  trades: string[];
  contacts: SubContact[];
  city: string;
  zip: string;
  region: string;
  cslb_number: string;
  license_classes: string;
  dir_number: string;
  certifications: string;
  notes: string;
  extra: Record<string, unknown>;
}

export interface ImportPlan {
  /** False when no header row with a Company column was found in the first rows. */
  headerFound: boolean;
  /** Data rows with any content. */
  rows: number;
  /** Rows with content but no company. */
  skipped: number;
  subs: ImportSub[];
}

type Field =
  | 'package' | 'package_name' | 'company' | 'contact' | 'phone_office' | 'phone_mobile' | 'email' | 'city' | 'zip'
  | 'region' | 'other_contacts' | 'other_phones' | 'other_emails' | 'scope_detail' | 'also_listed' | 'license'
  | 'license_class' | 'dir' | 'certifications' | 'notes';

const HEADERS: Record<string, Field> = {
  bidpackage: 'package', package: 'package', packagecode: 'package',
  bidpackagename: 'package_name', packagename: 'package_name',
  company: 'company', companyname: 'company',
  contact: 'contact', contactname: 'contact',
  phoneoffice: 'phone_office', officephone: 'phone_office', phone: 'phone_office',
  phonemobile: 'phone_mobile', mobilephone: 'phone_mobile', mobile: 'phone_mobile', cell: 'phone_mobile',
  email: 'email', emailaddress: 'email',
  city: 'city', zip: 'zip', zipcode: 'zip', region: 'region',
  othercontacts: 'other_contacts', otherphones: 'other_phones', otheremails: 'other_emails',
  scopedetailfromsource: 'scope_detail', scopedetail: 'scope_detail',
  alsolistedunder: 'also_listed',
  calicensenumber: 'license', calicense: 'license', licensenumber: 'license', license: 'license', cslbnumber: 'license',
  cslb: 'license', cslblicensenumber: 'license',
  licenseclass: 'license_class', licenseclasses: 'license_class',
  dirnumber: 'dir', dir: 'dir', dirregistrationnumber: 'dir',
  certifications: 'certifications', certification: 'certifications',
  notes: 'notes',
};

/** How far down the sheet the header row may be. */
const HEADER_SCAN = 20;
const MAX_CONTACTS = 100;
const MAX_EXTRA_KEY = 100;
const MAX_EXTRA_VALUE = 2000;
const SCOPE_KEY = 'Scope Detail (from source)';

export function headerKey(h: string): string {
  return h.toLowerCase().replace(/#/g, 'number').replace(/[^a-z0-9]/g, '');
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** The grouping key: case and spacing don't matter (the database matches on lower(company) too). */
export function companyKey(s: string): string {
  return collapse(s).slice(0, 200).toLowerCase();
}

/** Package codes like 09A anywhere in the text ("09a", "09A Drywall; 09B"), uppercased. */
export function packageCodes(s: string): string[] {
  return [...s.matchAll(/\b(\d{2}[A-Za-z])\b/g)].map((m) => m[1].toUpperCase());
}

/** Last 10 digits: "(760) 555-0101" and "1-760-555-0101" are the same phone. */
export function phoneDigits(s: string): string {
  return s.replace(/[^0-9]/g, '').slice(-10);
}

function cleanEmail(s: string): string {
  return s.trim().replace(/^mailto:/i, '').toLowerCase().slice(0, 320);
}

function cleanContact(c: SubContact): SubContact {
  return {
    name: c.name.trim().slice(0, 200),
    email: cleanEmail(c.email),
    phone: c.phone.trim().slice(0, 60),
    title: c.title.trim().slice(0, 100),
  };
}

function sameContact(e: SubContact, n: SubContact): boolean {
  const eName = e.name.trim().toLowerCase();
  const nName = n.name.toLowerCase();
  const eEmail = e.email.trim().toLowerCase();
  const eDigits = phoneDigits(e.phone);
  const nDigits = phoneDigits(n.phone);
  if (n.email !== '' && eEmail === n.email) return true;
  const namesFit = eName === '' || nName === '' || eName === nName;
  const emailsFit = eEmail === '' || n.email === '' || eEmail === n.email;
  return namesFit && emailsFit && ((nDigits !== '' && eDigits === nDigits) || (nName !== '' && eName === nName));
}

/**
 * Incoming contacts merged into existing ones: a match (same email; or name and email don't conflict and the phone or
 * the name matches) only fills its empty fields, anything else is appended. Mirrors merge_sub_contacts (0018).
 */
export function mergeContacts(existing: readonly SubContact[], incoming: readonly SubContact[]): SubContact[] {
  const out = existing.map((c) => ({ ...c }));
  for (const raw of incoming.slice(0, 200)) {
    const n = cleanContact(raw);
    if (n.name === '' && n.email === '' && n.phone === '') continue;
    const hit = out.find((e) => sameContact(e, n));
    if (!hit) {
      if (out.length < MAX_CONTACTS) out.push(n);
      continue;
    }
    if (hit.name.trim() === '' && n.name !== '') hit.name = n.name;
    if (hit.email.trim() === '' && n.email !== '') hit.email = n.email;
    if (hit.phone.trim() === '' && n.phone !== '') hit.phone = n.phone;
    if (hit.title.trim() === '' && n.title !== '') hit.title = n.title;
  }
  return out;
}

/** "Ann; Bob", one per line, or "a@x.com, b@x.com". Phones never split on spaces (they contain them). */
function splitList(s: string, kind: 'names' | 'phones' | 'emails'): string[] {
  const re = kind === 'emails' ? /[\s;,|]+/ : kind === 'phones' ? /[;\n\r|,]|\s\/\s/ : /[;\n\r|]|\s\/\s/;
  let parts = s.split(re).map((p) => p.trim()).filter((p) => p !== '');
  if (kind === 'names' && parts.length === 1 && parts[0].includes(',')) {
    parts = parts[0].split(',').map((p) => p.trim()).filter((p) => p !== '');
  }
  return parts;
}

/** The cell text of an ExcelJS value (string, number, date, rich text, hyperlink, formula result), without ExcelJS. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return o.richText.map((r) => cellText((r as { text?: unknown } | null)?.text)).join('');
    if ('result' in o) return cellText(o.result);
    if ('formula' in o || 'sharedFormula' in o || 'error' in o) return '';
    if ('text' in o) return cellText(o.text);
  }
  return '';
}

/** RFC 4180 CSV: quoted fields, "" inside quotes, commas and line breaks inside quotes, CRLF or LF, a leading BOM. */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch !== '"') {
        const next = s.indexOf('"', i);
        const end = next === -1 ? s.length : next;
        field += s.slice(i, end);
        i = end;
      } else if (s[i + 1] === '"') {
        field += '"';
        i += 2;
      } else {
        quoted = false;
        i += 1;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
      i += 1;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (quoted) throw new Error('The CSV has a quote that is never closed.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

interface Columns {
  byField: Map<Field, number>;
  extras: { index: number; header: string }[];
}

function mapColumns(header: readonly string[]): Columns {
  const byField = new Map<Field, number>();
  const extras: Columns['extras'] = [];
  header.forEach((raw, index) => {
    const text = collapse(raw);
    if (text === '') return;
    const field = HEADERS[headerKey(text)];
    if (field !== undefined && !byField.has(field)) byField.set(field, index);
    else extras.push({ index, header: text.slice(0, MAX_EXTRA_KEY) });
  });
  return { byField, extras };
}

function findHeader(table: readonly (readonly string[])[]): number {
  return table.slice(0, HEADER_SCAN).findIndex((r) => r.some((c) => HEADERS[headerKey(collapse(c))] === 'company'));
}

interface Acc {
  sub: ImportSub;
  trades: Set<string>;
  classes: string[];
  certs: string[];
  notes: string[];
  extra: Map<string, string[]>;
  scope: Record<string, string>;
}

function addDistinct(list: string[], value: string): void {
  const v = collapse(value);
  if (v !== '' && !list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
}

function rowContacts(get: (f: Field) => string): SubContact[] {
  const out: SubContact[] = [];
  const emails = splitList(get('email'), 'emails');
  const mobile = get('phone_mobile').trim();
  const office = get('phone_office').trim();
  out.push({ name: get('contact'), email: emails[0] ?? '', phone: mobile !== '' ? mobile : office, title: '' });
  if (mobile !== '' && office !== '' && phoneDigits(mobile) !== phoneDigits(office)) {
    out.push({ name: '', email: '', phone: office, title: 'Office' });
  }
  for (const e of emails.slice(1)) out.push({ name: '', email: e, phone: '', title: '' });
  const names = splitList(get('other_contacts'), 'names');
  const phones = splitList(get('other_phones'), 'phones');
  const others = splitList(get('other_emails'), 'emails');
  const n = Math.max(names.length, phones.length, others.length);
  for (let i = 0; i < n; i += 1) out.push({ name: names[i] ?? '', email: others[i] ?? '', phone: phones[i] ?? '', title: '' });
  return out;
}

function newAcc(company: string): Acc {
  return {
    sub: {
      company, trades: [], contacts: [], city: '', zip: '', region: '', cslb_number: '', license_classes: '',
      dir_number: '', certifications: '', notes: '', extra: {},
    },
    trades: new Set(), classes: [], certs: [], notes: [], extra: new Map(), scope: {},
  };
}

function addRow(acc: Acc, get: (f: Field) => string, row: readonly string[], cols: Columns): void {
  const s = acc.sub;
  const own = packageCodes(get('package'));
  for (const c of [...own, ...packageCodes(get('also_listed'))]) acc.trades.add(c);
  s.contacts = mergeContacts(s.contacts, rowContacts(get));
  const fill = (key: 'city' | 'zip' | 'region' | 'cslb_number' | 'dir_number', f: Field, max: number) => {
    if (s[key] === '') s[key] = collapse(get(f)).replace(/^#\s*/, '').slice(0, max);
  };
  fill('city', 'city', 100);
  fill('zip', 'zip', 20);
  fill('region', 'region', 100);
  fill('cslb_number', 'license', 40);
  fill('dir_number', 'dir', 40);
  addDistinct(acc.classes, get('license_class'));
  addDistinct(acc.certs, get('certifications'));
  addDistinct(acc.notes, get('notes'));
  const scope = collapse(get('scope_detail'));
  const scopeKey = own[0] ?? '-';
  if (scope !== '' && acc.scope[scopeKey] === undefined) acc.scope[scopeKey] = scope.slice(0, MAX_EXTRA_VALUE);
  for (const x of cols.extras) {
    const list = acc.extra.get(x.header) ?? [];
    addDistinct(list, row[x.index] ?? '');
    acc.extra.set(x.header, list);
  }
}

function finish(acc: Acc): ImportSub {
  const extra: Record<string, unknown> = {};
  for (const [k, values] of acc.extra) if (values.length > 0) extra[k] = values.join('; ').slice(0, MAX_EXTRA_VALUE);
  if (Object.keys(acc.scope).length > 0) extra[SCOPE_KEY] = acc.scope;
  return {
    ...acc.sub,
    trades: [...acc.trades].sort(),
    license_classes: acc.classes.join(', ').slice(0, 200),
    certifications: acc.certs.join(', ').slice(0, 500),
    notes: acc.notes.join('\n').slice(0, 4000),
    extra,
  };
}

/** Finds the header row, maps the columns and groups the rows by company (first spelling wins). */
export function subsFromTable(table: readonly (readonly string[])[]): ImportPlan {
  const at = findHeader(table);
  if (at === -1) return { headerFound: false, rows: 0, skipped: 0, subs: [] };
  const cols = mapColumns(table[at]);
  const byKey = new Map<string, Acc>();
  let rows = 0;
  let skipped = 0;
  for (const row of table.slice(at + 1)) {
    if (!row.some((c) => c.trim() !== '')) continue;
    rows += 1;
    const get = (f: Field): string => {
      const i = cols.byField.get(f);
      return i === undefined ? '' : (row[i] ?? '');
    };
    const company = collapse(get('company')).slice(0, 200);
    if (company === '') {
      skipped += 1;
      continue;
    }
    const key = companyKey(company);
    const acc = byKey.get(key) ?? newAcc(company);
    byKey.set(key, acc);
    addRow(acc, get, row, cols);
  }
  return { headerFound: true, rows, skipped, subs: [...byKey.values()].map(finish) };
}

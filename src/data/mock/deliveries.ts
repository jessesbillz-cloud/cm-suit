// Synthetic deliveries for the e2e mock: a few "Sample" deliveries on Sample Job A around today, the job's company
// list, the link and the monthly review. State lives in sessionStorage (its own key), like the rest of the mock.
import { fromZonedInput, todayInZone } from '../../lib/dates';
import { byTime, findOverlap, shiftDay } from '../../lib/deliveries';
import { conflictError } from '../errors';
import { FunctionError } from '../functions';
import type { CompanyOption, DeliveryInput, DeliveryRow, HistoryLine, LinkBoard, LinkReceipt, LinkState, ReviewRow } from '../deliveries.types';
import { mockUser } from './index';
import { delay } from './store';

const KEY = 'e2e-mock-deliveries';
const TZ = 'America/Los_Angeles';
const JOB = 'job-a';
/** What the mock hands out as "the" link token (43 url-safe characters, like the real ones). */
const MOCK_LINK_TOKEN = 'sample-link-token-sample-link-token-sample1';

interface State {
  rows: DeliveryRow[];
  companies: string[];
  history: (HistoryLine & { delivery_id: string })[];
  reviews: (ReviewRow & { project_id: string })[];
  link: LinkState;
}

function startsAt(date: string, time: string | null): string | null {
  return time === null ? null : fromZonedInput(`${date}T${time}`, TZ);
}

function seedRow(n: number, date: string, time: string | null, duration: number, company: string, description: string): DeliveryRow {
  return {
    id: `mock-delivery-${String(n)}`,
    project_id: JOB,
    number: n,
    delivery_date: date,
    starts_at: startsAt(date, time),
    duration_min: duration,
    description,
    standby: false,
    posted_name: 'Sample Super',
    via_link: false,
    created_by: 'mock-someone',
    created_at: '2026-09-25T15:00:00Z',
    file_ids: [],
    deleted_at: null,
    deleted_name: null,
    version: 1,
    company,
  };
}

function seed(): State {
  const today = todayInZone(TZ);
  return {
    rows: [
      seedRow(1, today, '07:00', 60, 'Sample Concrete Co', 'Sample slab pour'),
      seedRow(2, today, null, 30, 'Sample Lumber', 'Sample blocking'),
      seedRow(3, shiftDay(today, 2), '09:00', 90, 'Sample Steel Co', 'Sample joists'),
    ],
    companies: ['Sample Concrete Co', 'Sample Steel Co', 'Sample Lumber', 'Sample Builders'],
    history: [],
    reviews: [],
    link: { active: false, since: null },
  };
}

function read(): State {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? seed() : (JSON.parse(raw) as State);
}

function write(update: (s: State) => State): State {
  const next = update(read());
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

function live(s: State, projectId: string): DeliveryRow[] {
  return s.rows.filter((r) => r.project_id === projectId && r.deleted_at === null);
}

export async function list(projectId: string, from: string, to: string): Promise<DeliveryRow[]> {
  await delay();
  return live(read(), projectId)
    .filter((r) => r.delivery_date >= from && r.delivery_date <= to)
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date) || byTime(a, b));
}

export async function get(id: string): Promise<DeliveryRow | null> {
  await delay();
  return read().rows.find((r) => r.id === id) ?? null;
}

export async function companies(projectId: string): Promise<CompanyOption[]> {
  await delay();
  const s = read();
  const rows = live(s, projectId);
  return s.companies
    .map((name) => ({ name, uses: rows.filter((r) => r.company.toLowerCase() === name.toLowerCase()).length }))
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
}

function add(projectId: string, input: DeliveryInput, name: string, viaLink: boolean): DeliveryRow {
  const s = read();
  const start = startsAt(input.date, input.time);
  const sameDay = live(s, projectId).filter((r) => r.delivery_date === input.date);
  const n = Math.max(0, ...s.rows.map((r) => r.number)) + 1;
  const row: DeliveryRow = {
    ...seedRow(n, input.date, input.time, input.duration_min, input.company, input.description),
    project_id: projectId,
    starts_at: start,
    standby: findOverlap(sameDay, { starts_at: start, duration_min: input.duration_min }) !== null,
    posted_name: name,
    via_link: viaLink,
    created_by: viaLink ? null : mockUser().id,
    created_at: new Date().toISOString(),
  };
  const known = s.companies.some((c) => c.toLowerCase() === input.company.toLowerCase());
  write((cur) => ({
    ...cur,
    rows: [...cur.rows, row],
    companies: known ? cur.companies : [...cur.companies, input.company],
    history: [...cur.history, { delivery_id: row.id, at: row.created_at, action: 'delivery.create', actor_name: name, details: {} }],
  }));
  return row;
}

export async function post(projectId: string, input: DeliveryInput): Promise<string> {
  await delay();
  return add(projectId, input, 'Sample PM', false).id;
}

export async function update(row: DeliveryRow, input: DeliveryInput): Promise<number> {
  await delay();
  const current = read().rows.find((r) => r.id === row.id);
  if (current?.version !== row.version) throw conflictError();
  const start = startsAt(input.date, input.time);
  write((s) => {
    const others = live(s, row.project_id).filter((r) => r.delivery_date === input.date);
    const standby = findOverlap(others, { starts_at: start, duration_min: input.duration_min }, row.id) !== null;
    const next: DeliveryRow = {
      ...current,
      company: input.company,
      delivery_date: input.date,
      starts_at: start,
      duration_min: input.duration_min,
      description: input.description,
      standby,
      version: current.version + 1,
    };
    return {
      ...s,
      rows: s.rows.map((r) => (r.id === row.id ? next : r)),
      history: [...s.history, { delivery_id: row.id, at: new Date().toISOString(), action: 'delivery.update', actor_name: 'Sample PM', details: {} }],
    };
  });
  return current.version + 1;
}

export async function setDeleted(id: string, name: string | null): Promise<void> {
  await delay();
  write((s) => ({
    ...s,
    rows: s.rows.map((r) =>
      r.id === id ? { ...r, deleted_at: name === null ? null : new Date().toISOString(), deleted_name: name, version: r.version + 1 } : r,
    ),
    history: [
      ...s.history,
      { delivery_id: id, at: new Date().toISOString(), action: name === null ? 'delivery.restore' : 'delivery.delete', actor_name: 'Sample PM', details: {} },
    ],
  }));
}

export async function history(id: string): Promise<HistoryLine[]> {
  await delay();
  return read()
    .history.filter((h) => h.delivery_id === id)
    .map(({ at, action, actor_name, details }) => ({ at, action, actor_name, details }));
}

export async function reviews(projectId: string, month: string): Promise<ReviewRow[]> {
  await delay();
  return read().reviews.filter((r) => r.project_id === projectId && r.month === month);
}

export async function review(projectId: string, month: string, name: string, company: string): Promise<void> {
  await delay();
  write((s) =>
    s.reviews.some((r) => r.project_id === projectId && r.month === month)
      ? s
      : {
          ...s,
          reviews: [
            ...s.reviews,
            { id: `mock-review-${month}`, project_id: projectId, month, name, company, created_at: new Date().toISOString(), created_by: mockUser().id },
          ],
        },
  );
}

export async function linkState(): Promise<LinkState> {
  await delay();
  return read().link;
}

export async function rotate(): Promise<string> {
  await delay();
  write((s) => ({ ...s, link: { active: true, since: new Date().toISOString() } }));
  return MOCK_LINK_TOKEN;
}

export async function undoRotate(): Promise<void> {
  await delay();
  write((s) => ({ ...s, link: { active: false, since: null } }));
}

function checkToken(token: string): void {
  if (token !== MOCK_LINK_TOKEN) {
    throw new FunctionError(404, 'not_found', 'This delivery link is not active. Ask the superintendent for the current one.', null, null);
  }
}

export async function linkBoard(projectId: string, token: string, from: string, to: string): Promise<LinkBoard> {
  checkToken(token);
  const rows = await list(projectId, from, to);
  return {
    project_name: 'Sample Job A',
    timezone: TZ,
    companies: (await companies(projectId)).map((c) => c.name),
    deliveries: rows.map(({ number, delivery_date, starts_at, duration_min, company, description, standby }) => ({
      number, delivery_date, starts_at, duration_min, company, description, standby,
    })),
  };
}

function toReceipt(r: DeliveryRow): LinkReceipt {
  const { id, number, delivery_date, starts_at, duration_min, company, description, standby, posted_name, created_at } = r;
  return { id, number, delivery_date, starts_at, duration_min, company, description, standby, posted_name, posted_at: created_at };
}

export async function linkPost(projectId: string, token: string, name: string, input: DeliveryInput): Promise<LinkReceipt> {
  checkToken(token);
  await delay();
  return toReceipt(add(projectId, input, name, true));
}

export async function linkReceipt(token: string, id: string): Promise<LinkReceipt> {
  checkToken(token);
  await delay();
  const r = read().rows.find((x) => x.id === id && x.via_link && x.deleted_at === null);
  if (!r) throw new FunctionError(404, 'not_found', 'That receipt is not available.', null, null);
  return toReceipt(r);
}

export async function folder(projectId: string): Promise<string> {
  await delay();
  return `${projectId}-delivery-tickets`;
}

export async function attach(id: string, fileId: string): Promise<void> {
  await delay();
  write((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id && !r.file_ids.includes(fileId) ? { ...r, file_ids: [...r.file_ids, fileId] } : r)) }));
}

// Mock revs from the request link with no login (0057) for e2e and the preview, on the mock revs (mock/revs,
// mock/revRequests; the fire marshal's sample job job-s), with the database's rules in short form: the walls with their
// status only (failed shows as open); the revs request from the link (the visitor's contact, 1 to 3 items on walls of
// one list, passed and N/A cells skipped, colors by item order, the map on the first wall's sheet, no member behind it);
// and a request's map by its receipt (the visitor draws until there is a result; a sheet only from the request's walls).
// The map PDF is server-only: render answers as mock/revRequests does, download saves the synthetic sheet.
import { FunctionError } from '../functions';
import type { Tables } from '../database.types';
import type { IrRequest } from '../inspections.types';
import type { LinkKey } from '../requestLink.types';
import type { PublicMap, PublicOfsInput, PublicRevsAnswer, Submitted } from '../requestNoLogin.types';
import { liveSetup, parseArea, type IrStroke } from '../revs.types';
import { addUploadedFile } from './api';
import { addLinkRequest, folder, formContext } from './inspections';
import { jobFor } from './requestLink';
import { jobName, receiptRequest, refuse, submitted } from './requestNoLogin';
import { mapContext, renderMap as renderOnServer, status as cellStatuses } from './revRequests';
import { read, write } from './revs';
import { sheetUrl as sampleSheet } from './sheet';
import { delay } from './store';

type Cell = Tables<'ir_rev_items'>;

const NONE: PublicRevsAnswer = { lists: [], revs: [], items: [], areas: [], status: [] };

export async function revs(key: LinkKey): Promise<PublicRevsAnswer> {
  await delay();
  jobFor(key);
  if (!(await formContext(key.projectId)).ofs) return NONE;
  const s = read();
  const mine = <T extends { project_id: string }>(rows: T[]) => rows.filter((r) => r.project_id === key.projectId);
  const live = liveSetup({ lists: mine(s.lists), revs: mine(s.revs), items: mine(s.items), areas: mine(s.areas).map(parseArea), marks: mine(s.marks) });
  return {
    lists: live.lists.map((l) => ({ id: l.id, name: l.name, phase: l.phase, position: l.position })),
    revs: live.revs.map((r) => ({ id: r.id, list_id: r.list_id, number: r.number, name: r.name })),
    items: live.items.map((i) => ({ id: i.id, rev_id: i.rev_id, name: i.name, company: i.company, position: i.position })),
    areas: live.areas.map((a) => ({ id: a.id, list_id: a.list_id, level: a.level, name: a.name, sheet_file_id: a.sheet_file_id, position: a.position })),
    status: (await cellStatuses(key.projectId)).map((c) => ({
      area_id: c.area_id, item_id: c.item_id, status: c.status === 'failed' ? 'open' : c.status,
    })),
  };
}

/** link_request_submit_ofs in short form. */
export async function submitOfs(key: LinkKey, v: PublicOfsInput): Promise<Submitted> {
  await delay();
  jobFor(key);
  if (!(await formContext(key.projectId)).ofs) throw refuse(400, 'OFS is off for this job.');
  if (v.contact.name.trim() === '' || (v.contact.phone.trim() === '' && v.contact.email.trim() === '')) throw refuse(400, 'Add a phone or an email.');
  if (v.itemIds.length < 1 || v.itemIds.length > 3) throw refuse(400, 'Pick 1 to 3 items.');
  if (v.areaIds.length < 1) throw refuse(400, 'Pick 1 to 200 walls.');
  if (v.files.length > 3) throw refuse(400, 'Up to 3 photos or PDFs.');
  const s = read();
  const areas = s.areas.filter((a) => v.areaIds.includes(a.id) && a.project_id === key.projectId && a.deleted_at === null);
  const items = s.items.filter((i) => v.itemIds.includes(i.id) && i.project_id === key.projectId && i.deleted_at === null);
  const revOf = (i: Tables<'rev_items'>) => s.revs.find((r) => r.id === i.rev_id);
  const lists = new Set([...areas.map((a) => a.list_id), ...items.map((i) => revOf(i)?.list_id)]);
  if (lists.size !== 1 || areas.length !== v.areaIds.length || items.length !== v.itemIds.length) {
    throw refuse(400, 'Pick the walls and items from one list.');
  }
  if (v.sheetFileId !== null && !areas.some((a) => a.sheet_file_id === v.sheetFileId)) throw refuse(400, 'Pick a sheet of these walls.');
  const done = new Set((await cellStatuses(key.projectId)).filter((c) => c.status === 'na' || c.status === 'passed').map((c) => `${c.area_id}|${c.item_id}`));
  const open = areas.flatMap((a) => items.map((i) => ({ a, i }))).filter(({ a, i }) => !done.has(`${a.id}|${i.id}`));
  if (open.length === 0) throw refuse(400, 'Already passed.');
  const used = items
    .filter((i) => open.some((c) => c.i.id === i.id))
    .sort((x, y) => (revOf(x)?.number ?? 0) - (revOf(y)?.number ?? 0) || x.position - y.position);
  const walls = areas.filter((a) => open.some((c) => c.a.id === a.id)).sort((x, y) => x.level.localeCompare(y.level) || x.position - y.position);
  const text = `${[...new Set(walls.map((a) => a.level))].sort().join(', ')} · ${used.map((i) => i.name).join(' & ')} · ${walls.map((a) => a.name).join(', ')}`;
  const files = [];
  for (const f of v.files) files.push(await addUploadedFile(key.projectId, folder(key.projectId), f.name, f.type, f.size));
  const row = await addLinkRequest(
    {
      p_project_id: key.projectId, p_company: v.contact.company.trim(), p_request_date: v.date, p_kind: 'ofs', p_items: text,
      p_start_time: v.startTime, p_duration_kind: v.durationKind, p_duration_min: v.durationMin, p_special_kind_id: null,
      p_attachment_ids: files.map((f) => f.id),
    },
    { name: v.contact.name.trim(), phone: v.contact.phone.trim(), email: v.contact.email.trim() },
  );
  const now = new Date().toISOString();
  const cells: Cell[] = open.map(({ a, i }, k) => ({
    id: `mock-ir-rev-item-${row.id}-${String(k)}`, created_at: now, updated_at: now, created_by: null, version: 1, org_id: row.org_id,
    project_id: row.project_id, request_id: row.id, area_id: a.id, item_id: i.id, color: used.indexOf(i) + 1, result: null,
    result_note: null, result_at: null, result_by: null,
  }));
  const sheet = v.sheetFileId ?? walls.find((a) => a.sheet_file_id !== null)?.sheet_file_id ?? null;
  write((x) => ({
    ...x,
    cells: [...x.cells, ...cells],
    maps: [...x.maps, {
      request_id: row.id, org_id: row.org_id, project_id: row.project_id, created_at: now, updated_at: now, updated_by: null,
      version: 1, sheet_file_id: sheet, page: 1, strokes: [], map_file_id: null, content_hash: null, signed: false, stale: true,
    }],
  }));
  return submitted(key.projectId, row, null);
}

/** The visitor draws until the inspector records a result (link_request_map_editor). */
function editor(q: IrRequest, mine: Cell[]): boolean {
  return q.requested_by === null && q.result === null && mine.every((c) => c.result === null);
}

/** The request's walls' sheets, labelled by their levels. */
function sheetsOf(mine: Cell[]): PublicMap['sheets'] {
  const by = new Map<string, Set<string>>();
  for (const a of read().areas.filter((x) => mine.some((c) => c.area_id === x.id) && x.sheet_file_id !== null)) {
    const levels = by.get(a.sheet_file_id ?? '') ?? new Set<string>();
    levels.add(a.level);
    by.set(a.sheet_file_id ?? '', levels);
  }
  return [...by.entries()]
    .map(([fileId, levels]) => ({ file_id: fileId, label: [...levels].sort().join(', ') }))
    .sort((x, y) => x.label.localeCompare(y.label));
}

/** link_request_map_view in short form: null when the request has no map. */
async function view(q: IrRequest): Promise<PublicMap | null> {
  if (!read().maps.some((m) => m.request_id === q.id)) return null;
  const ctx = await mapContext(q.id);
  const mine = read().cells.filter((c) => c.request_id === q.id);
  return {
    number: ctx.number, ofs_number: ctx.ofs_number, phase: ctx.phase, request_date: ctx.request_date, what: ctx.what,
    sheet_file_id: ctx.sheet_file_id, page: ctx.page, strokes: ctx.strokes, legend: ctx.legend, result: ctx.result,
    signed: ctx.signed_at !== null, version: ctx.version, has_map: ctx.map_file_id !== null, stale: ctx.stale,
    can_edit: ctx.signed_at === null && q.status !== 'withdrawn' && editor(q, mine), sheets: sheetsOf(mine),
  };
}

export async function map(projectId: string, receipt: string): Promise<{ map: PublicMap | null }> {
  await delay();
  return { map: await view(await receiptRequest(projectId, receipt)) };
}

/** link_request_map_save in short form (its refusals as the function answers them). */
export async function saveMap(
  projectId: string,
  receipt: string,
  v: { version: number; strokes: IrStroke[]; sheetFileId: string | null; page: number | null },
): Promise<{ map: PublicMap | null }> {
  await delay();
  const q = await receiptRequest(projectId, receipt);
  const s = read();
  const m = s.maps.find((x) => x.request_id === q.id);
  if (!m) throw refuse(400, 'This request has no map.');
  const mine = s.cells.filter((c) => c.request_id === q.id);
  if (!editor(q, mine)) throw new FunctionError(403, 'forbidden', 'The map is final.', null, null);
  if (q.signed_at !== null) throw refuse(400, 'This IR is signed.');
  if (m.version !== v.version) throw new FunctionError(409, 'conflict', 'Try again.', null, null);
  if (v.strokes.some((st) => st.c > Math.max(0, ...mine.map((c) => c.color)))) throw refuse(400, "Use the request's colors.");
  if (v.sheetFileId !== null && v.sheetFileId !== m.sheet_file_id && !sheetsOf(mine).some((x) => x.file_id === v.sheetFileId)) {
    throw refuse(400, 'Pick a sheet of these walls.');
  }
  const sheet = v.sheetFileId ?? m.sheet_file_id;
  if (sheet === null && v.strokes.length > 0) throw refuse(400, 'Pick the sheet first.');
  const next: Tables<'ir_maps'> = {
    ...m, sheet_file_id: sheet, page: v.page ?? m.page, strokes: v.strokes, stale: true, version: m.version + 1,
    updated_at: new Date().toISOString(), updated_by: null,
  };
  write((x) => ({ ...x, maps: x.maps.map((r) => (r.request_id === next.request_id ? next : r)) }));
  return { map: await view(q) };
}

export async function sheetUrl(projectId: string, receipt: string): Promise<string> {
  await delay();
  const q = await receiptRequest(projectId, receipt);
  if (!read().maps.some((m) => m.request_id === q.id && m.sheet_file_id !== null)) throw refuse(400, 'Pick the sheet first.');
  return sampleSheet();
}

export async function renderMap(projectId: string, receipt: string): Promise<{ map: PublicMap | null }> {
  await delay();
  const q = await receiptRequest(projectId, receipt);
  await renderOnServer(q.id);
  return { map: await view(q) };
}

/** The map PDF's filename as the server names it ("IR {#} Map {Project} {MM-DD-YYYY}.pdf"); the synthetic sheet stands in. */
export async function downloadMap(projectId: string, receipt: string): Promise<{ url: string; filename: string }> {
  await delay();
  const q = await receiptRequest(projectId, receipt);
  await renderOnServer(q.id);
  const [y, mo, d] = q.request_date.split('-');
  return { url: sampleSheet(), filename: `IR ${String(q.number)} Map ${jobName(projectId)} ${mo ?? ''}-${d ?? ''}-${y ?? ''}.pdf` };
}

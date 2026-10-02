// Import a GC's master sub list (.xlsx or .csv) into the org's sub directory (SPEC §11.2).
//
// Order: requireUser → read the multipart form (10 MB cap) → requireCapability(project_id, 'bids.manage') → the job's
// org AS THE CALLER → parse the file → group rows by company (_shared/subsImport.ts) → import_subs RPC AS THE CALLER,
// which re-checks the caller may manage that org's directory and merges (safe to repeat). No service key.
//
// Body: multipart/form-data with `project_id` and `file`. Answer: { rows, companies, added, updated, unchanged }.
import ExcelJS from 'npm:exceljs@4.4.0';
import { handle, HttpError, ok } from '../_shared/http.ts';
import { type Db, must, rpc } from '../_shared/db.ts';
import { requireCapability, requireUser } from '../_shared/auth.ts';
import { readForm, uuid } from '../_shared/validate.ts';
import { cellText, type ImportSub, parseCsv, subsFromTable } from '../_shared/subsImport.ts';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** The file plus the form's boundaries and the project_id field. */
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;
const MAX_ROWS = 20_000;
const MAX_COLUMNS = 200;
/** Companies per import_subs call: each call is one short transaction, and repeating a call is harmless. */
const BATCH = 500;
const MAIN_SHEET = 'master bid list';
const TOO_LARGE = 'File too large (10 MB max)';

interface Counts { added: number; updated: number; unchanged: number }

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function sheetTable(ws: ExcelJS.Worksheet, maxRows: number): string[][] {
  if (ws.rowCount > MAX_ROWS + 50) throw new HttpError(400, `Too many rows (${MAX_ROWS} max)`);
  const rows: string[][] = [];
  const last = Math.min(ws.rowCount, maxRows);
  for (let r = 1; r <= last; r += 1) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= Math.min(row.cellCount, MAX_COLUMNS); c += 1) cells.push(cellText(row.getCell(c).value));
    rows.push(cells);
  }
  return rows;
}

/** The "Master Bid List" sheet, else the first sheet whose first rows have a Company column. */
async function readXlsx(data: ArrayBuffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    // ExcelJS types load() with its own "Buffer"; it hands the data to JSZip, which takes an ArrayBuffer as is.
    await wb.xlsx.load(data as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
  } catch (e) {
    throw new HttpError(400, 'Could not read the workbook', e instanceof Error ? e.message : String(e));
  }
  const named = wb.worksheets.find((ws) => ws.name.trim().toLowerCase() === MAIN_SHEET);
  if (named) return sheetTable(named, MAX_ROWS + 50);
  for (const ws of wb.worksheets) {
    if (subsFromTable(sheetTable(ws, 20)).headerFound) return sheetTable(ws, MAX_ROWS + 50);
  }
  return [];
}

function readCsv(bytes: Uint8Array): string[][] {
  const text = new TextDecoder('utf-8').decode(bytes);
  try {
    return parseCsv(text);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Could not read the CSV');
  }
}

async function readTable(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  if (name.endsWith('.xlsx')) {
    if (!isZip(bytes)) throw new HttpError(400, 'That .xlsx file is not a workbook');
    return readXlsx(data);
  }
  if (name.endsWith('.csv')) return readCsv(bytes);
  throw new HttpError(400, 'Use an .xlsx or .csv file');
}

async function importAll(client: Db, orgId: string, subs: ImportSub[]): Promise<Counts> {
  const total: Counts = { added: 0, updated: 0, unchanged: 0 };
  for (let i = 0; i < subs.length; i += BATCH) {
    const rows = await rpc<Counts[]>(client, 'import_subs', { p_org_id: orgId, p_rows: subs.slice(i, i + BATCH) });
    const c = rows[0];
    if (!c) throw new HttpError(500, 'import_subs returned no counts');
    total.added += c.added;
    total.updated += c.updated;
    total.unchanged += c.unchanged;
  }
  return total;
}

Deno.serve(handle(async (req) => {
  const { client } = await requireUser(req);
  const form = await readForm(req, MAX_BODY_BYTES, TOO_LARGE);
  const projectId = uuid.safeParse(form.get('project_id'));
  if (!projectId.success) throw new HttpError(400, 'project_id is missing or not a uuid');
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Attach the list as `file`');
  if (file.size > MAX_FILE_BYTES) throw new HttpError(400, TOO_LARGE);

  await requireCapability(client, projectId.data, 'bids.manage');
  const project = must(
    await client.from('projects').select('org_id').eq('id', projectId.data).maybeSingle(),
    'project lookup',
  ) as { org_id: string } | null;
  if (!project) throw new HttpError(404, 'Job not found');

  const table = await readTable(file);
  if (table.length > MAX_ROWS + 50) throw new HttpError(400, `Too many rows (${MAX_ROWS} max)`);
  const plan = subsFromTable(table);
  if (!plan.headerFound) throw new HttpError(400, 'No Company column found');
  if (plan.subs.length === 0) throw new HttpError(400, 'No companies found');

  const counts = await importAll(client, project.org_id, plan.subs);
  return ok(req, { rows: plan.rows, companies: plan.subs.length, ...counts });
}));

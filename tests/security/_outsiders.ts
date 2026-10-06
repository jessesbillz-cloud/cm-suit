/// <reference types="node" />
// Role probe, outside people (0090, Jesse Oct 5): the fire marshal reads an OFS request sent to OFS and nothing of the
// GC's regular (IOR) or special requests, not their photos or files, not the job's site photos, and the special
// inspection report on an OFS request only once that request is sent to OFS. The sub, the special inspector and the
// foreman read the job's plans but not its site photos; the owner's rep (inside) reads both. The calendar offers the
// fire marshal no special inspections. Called by role-probe.ts with its seeded job and signed-in clients.
import { type Client, type Report, rowsOf } from './_lib';

export type OutsiderProbeUser = 'fire' | 'inspector' | 'sub' | 'project_admin' | 'special_inspector' | 'foreman' | 'owner_rep';

export interface OutsiderProbe {
  report: Report;
  service: Client;
  projectId: string;
  orgId: string;
  run: string;
  as: (key: OutsiderProbeUser) => Client;
  idOf: (key: OutsiderProbeUser) => string;
}

type Res = { data: unknown; error: { message: string } | null };

function rows(res: Res, what: string): Record<string, unknown>[] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return rowsOf(res.data);
}

function field(row: Record<string, unknown> | undefined, key: string, what: string): string {
  const v = row?.[key];
  if (typeof v !== 'string') throw new Error(`${what}: no ${key}`);
  return v;
}

function num(row: Record<string, unknown> | undefined, key: string, what: string): number {
  const v = row?.[key];
  if (typeof v !== 'number') throw new Error(`${what}: no ${key}`);
  return v;
}

export async function checkOutsiders(p: OutsiderProbe): Promise<void> {
  const { report } = p;
  const project = rows(await p.service.from('projects').select('settings').eq('id', p.projectId), 'project settings')[0];
  const settings = (project?.['settings'] ?? {}) as Record<string, unknown>;
  rows(await p.service.from('projects').update({ settings: { ...settings, ir_ofs_allowed: true } }).eq('id', p.projectId).select('id'), 'OFS on');

  const folderOf = async (kind: string): Promise<string> =>
    field(rows(await p.service.from('folders').select('id').eq('project_id', p.projectId).eq('kind', kind).is('parent_id', null), `${kind} folder`)[0], 'id', `${kind} folder`);
  const plans = await folderOf('plans');
  const photos = await folderOf('photos');
  const reports = await folderOf('reports');
  const attach = (await p.service.rpc('ir_folder_make', { p_project_id: p.projectId, p_which: 'attachments' })).data;
  if (typeof attach !== 'string') throw new Error('ir_folder_make returned no folder');

  const file = async (folder: string, name: string, by: OutsiderProbeUser): Promise<string> =>
    field(rows(await p.service.from('files').insert({
      org_id: p.orgId, project_id: p.projectId, folder_id: folder, storage_path: `probe/${p.run}/${name}`, original_name: name,
      mime: name.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf', created_by: p.idOf(by), scan_status: 'clean', upload_complete: true,
    }).select('id'), `file ${name}`)[0], 'id', name);
  const plan = await file(plans, `probe-plan-${p.run}.pdf`, 'project_admin');
  const photo = await file(photos, `probe-site-${p.run}.jpg`, 'project_admin');
  const siLoose = await file(reports, `probe-si-loose-${p.run}.pdf`, 'project_admin');
  const iorPhoto = await file(attach, `probe-ior-${p.run}.jpg`, 'inspector');
  const specialPhoto = await file(attach, `probe-special-${p.run}.jpg`, 'inspector');
  const siOfs = await file(attach, `probe-si-ofs-${p.run}.pdf`, 'sub');

  const kind = rows(await p.service.from('ir_special_kinds').select('id').eq('active', true).limit(1), 'special kind')[0];
  const day = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
  const ask = async (who: OutsiderProbeUser, k: string, items: string, files: string[]): Promise<Record<string, unknown>> =>
    rows(await p.as(who).rpc('ir_submit', {
      p_project_id: p.projectId, p_company: `Probe ${who}`, p_request_date: day, p_kind: k, p_items: `${items} ${p.run}`,
      p_notice_ack: true, p_start_time: '10:00', p_duration_min: 60,
      p_special_kind_id: k === 'special' ? field(kind, 'id', 'special kind') : null, p_attachment_ids: files,
      p_special_required: k === 'ofs' ? true : null,
    }), `ir_submit ${k}`)[0] ?? {};
  const ior = field(await ask('inspector', 'ior', 'Probe IOR', [iorPhoto]), 'id', 'IOR');
  const special = field(await ask('inspector', 'special', 'Probe special', [specialPhoto]), 'id', 'special');
  const ofsRow = await ask('sub', 'ofs', 'Probe OFS', [siOfs]);
  const ofs = field(ofsRow, 'id', 'OFS');

  const reads = async (who: OutsiderProbeUser, table: string, id: string): Promise<boolean> =>
    rows(await p.as(who).from(table).select('id').eq('id', id), `${table} as ${who}`).length === 1;

  // Before the OFS request reaches OFS, the fire marshal reads none of it.
  report.check('outsiders', 'fire marshal: OFS request at the GC not readable', !(await reads('fire', 'inspection_requests', ofs)));
  report.check('outsiders', 'fire marshal: SI report on it not readable yet', !(await reads('fire', 'files', siOfs)));

  // The GC confirms, the inspector sends it to OFS.
  const gc = rows(await p.as('project_admin').rpc('ir_gc_decide', {
    p_request_id: ofs, p_version: num(ofsRow, 'version', 'OFS'), p_approve: true,
  }), 'ir_gc_decide')[0];
  rows(await p.as('inspector').rpc('ir_send_ofs', { p_request_id: ofs, p_version: num(gc, 'version', 'gc step') }), 'ir_send_ofs');

  report.check('outsiders', 'fire marshal: reads the OFS request sent to OFS', await reads('fire', 'inspection_requests', ofs));
  report.check('outsiders', 'fire marshal: no regular (IOR) request', !(await reads('fire', 'inspection_requests', ior)));
  report.check('outsiders', 'fire marshal: no special inspection request', !(await reads('fire', 'inspection_requests', special)));
  report.check('outsiders', 'fire marshal: the SI report on the OFS request, once sent', await reads('fire', 'files', siOfs));
  report.check('outsiders', 'fire marshal: no SI report nobody linked or shared', !(await reads('fire', 'files', siLoose)));
  report.check('outsiders', 'fire marshal: no IOR or special request photos',
    !(await reads('fire', 'files', iorPhoto)) && !(await reads('fire', 'files', specialPhoto)));
  report.check('outsiders', 'fire marshal: reads the plans', await reads('fire', 'files', plan));
  const dl = await p.as('fire').rpc('authorize_download', { p_file_id: photo, p_variant: 'original' });
  report.check('outsiders', 'fire marshal: no download of a site photo', dl.error !== null, dl.error ? dl.error.message : 'allowed');
  const viaReq = await p.as('fire').rpc('authorize_ir_file', { p_request_id: ior, p_file_id: iorPhoto });
  report.check('outsiders', 'fire marshal: no IOR photo through the request', viaReq.error !== null, viaReq.error ? viaReq.error.message : 'allowed');
  const cal = rows(await p.as('fire').rpc('calendar_inspections', { p_project_id: p.projectId, p_from: day, p_to: day }), 'calendar as fire');
  report.check('outsiders', 'fire marshal: the calendar shows OFS inspections only',
    cal.length > 0 && cal.every((r) => r['kind'] === 'ofs'), cal.map((r) => String(r['kind'])).join(', '));
  const kinds = rows(await p.as('fire').rpc('my_calendar_kinds', { p_project_id: p.projectId }), 'calendar kinds as fire')[0]?.['kinds'];
  report.check('outsiders', 'fire marshal: no special inspections type on the calendar',
    Array.isArray(kinds) && !kinds.includes('special_inspections') && kinds.includes('inspections'), JSON.stringify(kinds));

  for (const who of ['sub', 'special_inspector', 'foreman'] as const) {
    report.check('outsiders', `${who}: reads the plans, not the site photos`, (await reads(who, 'files', plan)) && !(await reads(who, 'files', photo)));
  }
  report.check('outsiders', 'owner\'s rep (inside): reads the site photos and every request',
    (await reads('owner_rep', 'files', photo)) && (await reads('owner_rep', 'inspection_requests', ior)) && (await reads('owner_rep', 'inspection_requests', special)));
}

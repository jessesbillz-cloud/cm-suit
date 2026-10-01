/// <reference types="node" />
// Role probe, RFIs (0038): a draft is seen only by its originator and the PM / PE side; nobody else reaches it through
// the log or the detail; only PM / PE save the route; the PDF record is service-only; the company logo bucket takes
// uploads from the company's admins only. Called by role-probe.ts with its seeded job and signed-in clients.
import { type Client, type Report, rowsOf } from './_lib';

export type RfiProbeUser =
  | 'sub' | 'pm' | 'pe' | 'project_admin' | 'architect' | 'inspector' | 'special_inspector' | 'estimator' | 'foreman'
  | 'superintendent' | 'owner_rep' | 'viewer' | 'bidder' | 'bidder2' | 'admin-b';

export interface RfiProbe {
  report: Report;
  service: Client;
  projectId: string;
  orgId: string;
  run: string;
  as: (key: RfiProbeUser) => Client;
}

function rows(res: { data: unknown; error: { message: string } | null }, what: string): Record<string, unknown>[] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return rowsOf(res.data);
}

export async function checkRfis(p: RfiProbe): Promise<void> {
  const { report } = p;
  rows(await p.service.from('projects').update({ modules: ['bids', 'files', 'calendar', 'rfis'] }).eq('id', p.projectId), 'rfis on');
  const draft = rows(await p.as('sub').rpc('rfi_create', {
    p_project_id: p.projectId, p_title: `Probe RFI ${p.run}`, p_question: 'Probe question',
  }), 'rfi_create')[0];
  const id = draft?.['id'];
  if (typeof id !== 'string') throw new Error('rfi_create returned no id');
  report.check('rfis', 'draft has no number', draft?.['number'] === null, JSON.stringify(draft?.['number']));

  const sees = async (key: RfiProbeUser) =>
    rows(await p.as(key).from('rfis').select('id').eq('id', id), `rfis as ${key}`).length === 1;
  for (const key of ['sub', 'pm', 'pe', 'project_admin'] as const) {
    report.check('rfis', `${key}: sees the draft`, await sees(key));
  }
  const hidden = ['architect', 'inspector', 'special_inspector', 'estimator', 'foreman', 'superintendent', 'owner_rep', 'viewer',
    'bidder', 'bidder2', 'admin-b'] as const;
  for (const key of hidden) {
    report.check('rfis', `${key}: draft hidden`, !(await sees(key)));
  }
  for (const key of ['architect', 'bidder', 'viewer'] as const) {
    const list = rows(await p.as(key).rpc('rfi_list', { p_project_id: p.projectId }), `rfi_list as ${key}`);
    report.check('rfis', `${key}: log has no draft`, !list.some((r) => r['id'] === id), `${list.length} rows`);
    const detail = await p.as(key).rpc('rfi_detail', { p_rfi_id: id });
    report.check('rfis', `${key}: detail refused`, detail.error !== null, detail.error ? detail.error.message : 'returned');
    const steps = rows(await p.as(key).rpc('rfi_progress', { p_project_id: p.projectId }), `rfi_progress as ${key}`);
    report.check('rfis', `${key}: route strip has no draft`, !steps.some((r) => r['rfi_id'] === id), `${steps.length} rows`);
  }

  const answer = await p.as('architect').rpc('rfi_answer', { p_rfi_id: id, p_version: 1, p_answer: 'probe' });
  report.check('rfis', 'architect cannot answer a draft', answer.error !== null);
  const route = await p.as('sub').rpc('rfi_save_settings', {
    p_project_id: p.projectId, p_version: 0, p_answer_days: 7, p_impact_days: 7, p_route: [],
  });
  report.check('rfis', 'sub cannot save the route', route.error !== null);
  const pdf = await p.as('pm').rpc('rfi_attach_pdf', { p_rfi_id: id, p_file_id: id, p_content_hash: '0'.repeat(64) });
  report.check('rfis', 'pm cannot record a PDF (service only)', pdf.error !== null);
  for (const key of ['sub', 'bidder', 'admin-b'] as const) {
    const up = await p.as(key).storage.from('org-logos')
      .upload(`org/${p.orgId}/logo`, new Blob(['probe'], { type: 'image/png' }), { upsert: false });
    report.check('rfis', `${key}: cannot upload the GC's logo`, up.error !== null, up.error ? up.error.message : 'uploaded');
  }
}

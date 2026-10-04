/// <reference types="node" />
// Role probe, Requirements own lines (0073): a sub reads only the lines of the company its own membership carries (not
// another company's, not one with no company), through the table and the list; a requester with the same company reads
// nothing (no capability); the sub writes only its evidence on its own line (not the status, not the picker, not a
// save, not another company's line) and the spec reader answers it nothing; the foreman still reads the register.
// Called by role-probe.ts with its seeded job and signed-in clients.
import { randomUUID } from 'node:crypto';
import { type Client, type Report, rowsOf } from './_lib';

export type RequirementsOwnProbeUser = 'sub' | 'foreman' | 'pm' | 'requester' | 'viewer' | 'bidder';

export interface RequirementsOwnProbe {
  report: Report;
  service: Client;
  projectId: string;
  run: string;
  as: (key: RequirementsOwnProbeUser) => Client;
  idOf: (key: RequirementsOwnProbeUser) => string;
}

function rows(res: { data: unknown; error: { message: string } | null }, what: string): Record<string, unknown>[] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return rowsOf(res.data);
}

function rowId(row: Record<string, unknown> | undefined, what: string): string {
  const id = row?.['id'];
  if (typeof id !== 'string') throw new Error(`${what} returned no id`);
  return id;
}

export async function checkRequirementsOwn(p: RequirementsOwnProbe): Promise<void> {
  const { report } = p;
  // Two sub companies on the job: the sub's (and the requester's), and the foreman's.
  const orgs = rows(await p.service.from('orgs').insert([
    { name: `Probe sub co ${p.run}`, kind: 'sub', created_by: p.idOf('sub') },
    { name: `Probe other co ${p.run}`, kind: 'sub', created_by: p.idOf('foreman') },
  ]).select('id, created_by'), 'insert sub orgs');
  const mineOrg = rowId(orgs.find((o) => o['created_by'] === p.idOf('sub')), 'sub org');
  const otherOrg = rowId(orgs.find((o) => o['created_by'] === p.idOf('foreman')), 'other org');
  for (const [key, org] of [['sub', mineOrg], ['requester', mineOrg], ['foreman', otherOrg]] as const) {
    rows(await p.service.from('project_members').update({ member_org_id: org })
      .eq('project_id', p.projectId).eq('user_id', p.idOf(key)).select('id'), `company of ${key}`);
  }

  const add = async (title: string, company: string | null): Promise<string> =>
    rowId(rows(await p.as('pm').rpc('requirement_save', {
      p_project_id: p.projectId, p_id: null, p_version: null, p_key: randomUUID(), p_kind: 'warranty', p_title: title,
      p_details: '', p_spec_section: '', p_spec_title: '', p_spec_ref: '', p_responsible: 'Probe', p_required: 'yes',
      p_notice_days: null, p_lead_days: null, p_activity_code: '', p_activity_name: '', p_trigger_date: null,
      p_company_org_id: company,
    }), 'requirement_save')[0], 'requirement_save');
  const mine = await add(`Probe own line ${p.run}`, mineOrg);
  const theirs = await add(`Probe other line ${p.run}`, otherOrg);
  const nobodys = await add(`Probe unlinked line ${p.run}`, null);

  const seen = async (key: RequirementsOwnProbeUser): Promise<unknown[]> =>
    rows(await p.as(key).from('requirements').select('id').eq('project_id', p.projectId), `requirements as ${key}`).map((r) => r['id']);
  const sub = await seen('sub');
  report.check('requirements', 'sub: reads its own company\'s line', sub.includes(mine), `${sub.length} rows`);
  report.check('requirements', 'sub: no other company\'s line, none with no company',
    !sub.includes(theirs) && !sub.includes(nobodys) && sub.length === 1, `${sub.length} rows`);
  for (const key of ['requester', 'viewer', 'bidder'] as const) {
    const got = await seen(key);
    report.check('requirements', `${key}: reads no line`, got.length === 0, `${got.length} rows`);
  }
  const foreman = await seen('foreman');
  report.check('requirements', 'foreman: reads the register (0069)', [mine, theirs, nobodys].every((id) => foreman.includes(id)), `${foreman.length} rows`);

  const list = rows(await p.as('sub').rpc('requirements_list', { p_project_id: p.projectId }), 'requirements_list as sub');
  const only = list.length === 1 ? list[0] : undefined;
  report.check('requirements', 'sub: the list is its own line, marked its own', only?.['id'] === mine && only['mine'] === true, `${list.length} rows`);
  const sections = rows(await p.as('sub').rpc('requirements_spec_sections', { p_project_id: p.projectId }), 'spec sections as sub');
  report.check('requirements', 'sub: the spec reader answers nothing', sections.length === 0, `${sections.length} rows`);

  const refused: [string, string, Record<string, unknown>][] = [
    ['sets no status on its own line', 'requirement_set_status', { p_id: mine, p_version: 1, p_status: 'done' }],
    ['removes nothing', 'requirement_remove', { p_id: mine, p_removed: true }],
    ['does not list the companies', 'requirement_companies', { p_project_id: p.projectId }],
    ['adds no drafts', 'requirements_add_drafts', { p_project_id: p.projectId, p_model: 'probe', p_source_file_id: null, p_drafts: [] }],
    ['adds no evidence on another company\'s line', 'requirement_evidence_own', { p_id: theirs, p_version: 1, p_note: 'probe', p_file_id: null }],
    ['adds no evidence on a line with no company', 'requirement_evidence_own', { p_id: nobodys, p_version: 1, p_note: 'probe', p_file_id: null }],
  ];
  for (const [what, fn, args] of refused) {
    const res = await p.as('sub').rpc(fn, args);
    report.check('requirements', `sub: ${what}`, res.error !== null, res.error ? res.error.message : 'returned');
  }
  const asRequester = await p.as('requester').rpc('requirement_evidence_own', { p_id: mine, p_version: 1, p_note: 'probe', p_file_id: null });
  report.check('requirements', 'requester: adds no evidence (same company, no capability)', asRequester.error !== null);
  const own = await p.as('sub').rpc('requirement_evidence_own', { p_id: mine, p_version: 1, p_note: 'Probe evidence', p_file_id: null });
  report.check('requirements', 'sub: adds evidence on its own line', own.error === null, own.error ? own.error.message : 'saved');
}

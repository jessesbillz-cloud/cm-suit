// Mock reads of the OFS request flow (0091): the attestation wording a member sees before sending, and a request's chain
// as ir_ofs_chain answers it (names from the sample people), for whoever may read the request.
import type { OfsChain, OfsStep } from '../inspections.ofs';
import { MOCK_PEOPLE } from './fixtures';
import { readable, serverList } from './inspections';
import { wording } from './ofsRules';
import { delay } from './store';

/** ir_ofs_attest_text */
export async function attestText(projectId: string): Promise<string> {
  await delay();
  return wording(projectId);
}

function nameOf(userId: string | null): string | null {
  if (userId === null) return null;
  return MOCK_PEOPLE.find((p) => p.user_id === userId)?.full_name ?? 'Sample Fire Marshal';
}

function step(by: string | null, at: string | null): OfsStep | null {
  return at === null ? null : { name: nameOf(by), at };
}

/** ir_ofs_chain */
export async function chain(requestId: string): Promise<OfsChain | null> {
  const r = readable(requestId);
  if (r.kind !== 'ofs') return null;
  const job = await serverList(r.project_id, (x) => x.kind === 'ofs');
  const atGc = r.status === 'gc_review' || r.status === 'returned';
  return {
    attest: r.ofs_attest_at === null ? null : { name: nameOf(r.ofs_attest_by) ?? r.requester_name, at: r.ofs_attest_at, text: r.ofs_attest_text ?? '' },
    gc: atGc ? null : step(r.gc_by, r.gc_at),
    ready: step(r.ofs_ready_by, r.ofs_ready_at),
    si: r.ofs_si_at === null ? null : { name: nameOf(r.ofs_si_by), at: r.ofs_si_at, file_id: r.ofs_si_file_id, file_name: null },
    sent: step(r.ofs_sent_by, r.ofs_sent_at),
    special_required: r.special_required,
    next_number: Math.max(0, ...job.map((x) => x.ofs_number ?? 0)) + 1,
  };
}

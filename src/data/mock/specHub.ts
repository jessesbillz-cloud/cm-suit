// e2e mock of the RFIs a spec section's page reads (data/specHub): the RFIs this person may see, by the RFI mock's own
// rule, with their references; voided ones stay out. Newest first.
import type { RfiRef } from '../specHub';
import { me, read, visible } from './rfis';
import { delay } from './store';

export async function rfiRefs(projectId: string): Promise<RfiRef[]> {
  await delay();
  const s = read();
  const m = me();
  return s.rfis
    .filter((r) => r.project_id === projectId && r.status !== 'void' && visible(s, r, m))
    .map((r) => ({ id: r.id, number: r.number, status: r.status, title: r.title, refs: r.refs, pdf_file_id: r.pdf_file_id, created_at: r.created_at }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

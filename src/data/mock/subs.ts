// Synthetic sub directory for the e2e mock: a handful of "Sample" companies in the mock company's org and a little
// history on Sample Job A. Reads only; directory writes are not simulated (notInMock).
import type { SubHistoryRow, SubRow } from '../subs.types';
import { delay } from './store';

const ORG = 'org-sample';

function sub(id: string, company: string, trades: string[], rest: Partial<SubRow> = {}): SubRow {
  return {
    id,
    org_id: ORG,
    company,
    trades,
    contacts: [],
    city: null,
    zip: null,
    region: null,
    cslb_number: null,
    cslb_status: null,
    cslb_checked_at: null,
    license_classes: null,
    dir_number: null,
    certifications: null,
    notes: '',
    version: 1,
    ...rest,
  };
}

const SUBS: SubRow[] = [
  sub('sub-1', 'Sample Concrete Co', ['03A'], {
    contacts: [{ name: 'Sample Person One', email: 'one@example.test', phone: '555-0101', title: 'Estimator' }],
    city: 'Sample City',
    cslb_number: '100001',
    cslb_status: 'active',
    cslb_checked_at: '2026-09-20T17:00:00Z',
  }),
  sub('sub-2', 'Sample Drywall Inc', ['09A', '09B'], {
    contacts: [{ name: 'Sample Person Two', email: 'two@example.test', phone: '555-0102', title: '' }],
    city: 'Sample Town',
    cslb_number: '100002',
  }),
  sub('sub-3', 'Sample Steel Works', ['05A'], {
    contacts: [{ name: 'Sample Person Three', email: 'three@example.test', phone: '', title: '' }],
    city: 'Sample City',
    cslb_number: '100003',
    cslb_status: 'expired',
    cslb_checked_at: '2026-09-21T17:00:00Z',
  }),
  sub('sub-4', 'Sample Paint and Coatings', ['09C'], { city: 'Sample Village' }),
  sub('sub-5', 'Sample Site Services', ['01B', '03A'], {
    contacts: [{ name: '', email: 'bids@example.test', phone: '555-0105', title: 'Office' }],
  }),
];

export async function list(orgId: string): Promise<SubRow[]> {
  await delay();
  return SUBS.filter((s) => s.org_id === orgId);
}

export async function history(subId: string): Promise<SubHistoryRow[]> {
  await delay();
  if (subId !== 'sub-1') return [];
  return [
    { id: 2, at: '2026-09-24T18:00:00Z', kind: 'submitted', job: 'Sample Job A' },
    { id: 1, at: '2026-09-22T16:00:00Z', kind: 'invited', job: 'Sample Job A' },
  ];
}

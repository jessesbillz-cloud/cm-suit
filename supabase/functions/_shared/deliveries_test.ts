// `deno test supabase/functions/_shared/deliveries_test.ts` — the delivery link's request and answer whitelist.
import { boardAnswer, DeliveryBoardBody, receiptAnswer } from './deliveries.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const TOKEN = 'A'.repeat(43);
const PROJECT = '00000000-0000-4000-8000-000000000001';
const ROW = {
  number: 3,
  delivery_date: '2026-10-05',
  starts_at: '2026-10-05T14:00:00+00:00',
  duration_min: 60,
  company: 'Sample Concrete Co',
  description: 'Slab pour',
  standby: true,
};

Deno.test('board answer: only board fields survive', () => {
  const out = boardAnswer({
    project_name: 'Sample Job',
    timezone: 'America/Los_Angeles',
    companies: ['Sample Concrete Co'],
    deliveries: [{ ...ROW, id: PROJECT, created_by: PROJECT, posted_name: 'Sample Person', file_ids: [PROJECT], email: 'x@example.test' }],
    org_id: PROJECT,
  });
  check(JSON.stringify(Object.keys(out).sort()) === JSON.stringify(['companies', 'deliveries', 'project_name', 'timezone']), 'top-level keys');
  const keys = Object.keys(out.deliveries[0] ?? {}).sort();
  check(
    JSON.stringify(keys) === JSON.stringify(['company', 'delivery_date', 'description', 'duration_min', 'number', 'standby', 'starts_at']),
    `delivery keys: ${keys.join(',')}`,
  );
  check(!JSON.stringify(out).includes(PROJECT) && !JSON.stringify(out).includes('@'), 'no ids or emails');
});

Deno.test('board answer: a changed contract fails loudly', () => {
  let threw = false;
  try {
    boardAnswer({ project_name: 'x', timezone: 'x', companies: [], deliveries: [{ ...ROW, standby: 'yes' }] });
  } catch {
    threw = true;
  }
  check(threw, 'standby must be a boolean');
});

Deno.test('receipt answer: board fields plus id, name and time; nothing else', () => {
  const out = receiptAnswer({ ...ROW, id: PROJECT, posted_name: 'Sample Driver', posted_at: '2026-10-01T15:00:00+00:00', created_by: null });
  check(!('created_by' in out) && out.posted_name === 'Sample Driver' && out.id === PROJECT, 'receipt shape');
});

Deno.test('request: each action is strict and bounded', () => {
  const board = DeliveryBoardBody.safeParse({ action: 'board', project_id: PROJECT, token: TOKEN, from: '2026-10-01', to: '2026-10-21' });
  check(board.success, 'board request');
  const post = DeliveryBoardBody.safeParse({
    action: 'post', project_id: PROJECT, token: TOKEN, name: ' Sample Driver ', company: 'Sample Crane', date: '2026-10-05',
    time: null, duration_min: 30, description: 'Crane mats',
  });
  check(post.success && post.data.action === 'post' && post.data.name === 'Sample Driver', 'post request, trimmed, TBD time');
  const bad = [
    { action: 'board', project_id: PROJECT, token: 'short', from: '2026-10-01', to: '2026-10-21' },
    { action: 'board', project_id: PROJECT, token: TOKEN, from: '10/01/2026', to: '2026-10-21' },
    { action: 'board', project_id: PROJECT, token: TOKEN, from: '2026-10-01', to: '2026-10-21', extra: 1 },
    { action: 'post', project_id: PROJECT, token: TOKEN, name: '  ', company: 'x', date: '2026-10-05', time: '7:00', duration_min: 30, description: 'x' },
    { action: 'post', project_id: PROJECT, token: TOKEN, name: 'x', company: 'x', date: '2026-10-05', time: '24:00', duration_min: 30, description: 'x' },
    { action: 'post', project_id: PROJECT, token: TOKEN, name: 'x', company: 'x', date: '2026-10-05', time: null, duration_min: 1, description: 'x' },
    { action: 'receipt', project_id: PROJECT, token: TOKEN, delivery_id: 'nope' },
    { action: 'delete', project_id: PROJECT, token: TOKEN },
  ];
  for (const b of bad) check(!DeliveryBoardBody.safeParse(b).success, `refused: ${JSON.stringify(b)}`);
});

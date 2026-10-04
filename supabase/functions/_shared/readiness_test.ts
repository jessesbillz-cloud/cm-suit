// `deno test --config supabase/functions/deno.json supabase/functions/_shared/readiness_test.ts` — the checklist's one
// definition, as the request link and the map PDF read it.
import { isReadiness, READINESS_ITEMS, readinessLines } from './readiness.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const ALL = { previous: 'yes', trade: 'na', gc: 'yes', ior: 'yes', special: 'na' };

Deno.test('readiness: the five items, as the database checks them (ir_readiness_ok)', () => {
  check(READINESS_ITEMS.map((i) => i.key).join(',') === 'previous,trade,gc,ior,special', 'keys in order');
  check(isReadiness(ALL), 'all five, yes or N/A');
  check(!isReadiness({ ...ALL, ior: 'no' }), 'no "no"');
  check(!isReadiness({ previous: 'yes', trade: 'yes', gc: 'yes', ior: 'yes' }), 'none left out');
  check(!isReadiness({ ...ALL, more: 'yes' }), 'nothing more');
  check(!isReadiness('yes'), 'an object');
});

Deno.test('readiness: lines for the map', () => {
  const lines = readinessLines(ALL as Parameters<typeof readinessLines>[0]);
  check(lines.length === 5, 'five lines');
  check(lines[1]?.label === 'Trade contractor inspection complete' && lines[1]?.answer === 'N/A', 'trade N/A');
});

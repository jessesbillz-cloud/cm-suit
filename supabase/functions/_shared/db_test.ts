// `deno test supabase/functions/_shared/db_test.ts` — what a public endpoint tells a visitor about a database error.
import { publicDbError } from './db.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

Deno.test('public endpoints: our own plain refusals pass, without details', () => {
  const e = publicDbError({ code: '22023', message: 'Enter your company.', details: 'some detail' }, 'rpc link_request_join');
  check(e.status === 400 && e.message === 'Enter your company.' && e.details === undefined, '22023 keeps its words only');
  const r = publicDbError({ code: '42501', message: 'Your access to this job has ended. Ask the inspector.' }, 'rpc');
  check(r.status === 403 && r.message === 'Your access to this job has ended. Ask the inspector.', 'our 42501 passes');
});

Deno.test('public endpoints: Postgres never speaks to a visitor', () => {
  const fk = publicDbError({
    code: '23503',
    message: 'insert or update on table "project_members" violates foreign key constraint "project_members_org_id_fkey"',
    details: 'Key (org_id)=(00000000-0000-4000-8000-000000000001) is not present in table "orgs".',
  }, 'rpc link_request_join');
  check(fk.status === 400 && fk.message === 'This request could not be completed.' && fk.details === undefined,
    'a foreign key error says nothing about tables or keys');
  const perm = publicDbError({ code: '42501', message: 'permission denied for table profiles' }, 'profile fill');
  check(perm.status === 403 && perm.message === 'Not allowed', 'Postgres\' own permission error is generic');
  const bad = publicDbError({ code: '22P02', message: 'invalid input syntax for type uuid: "x"' }, 'rpc');
  check(bad.status === 400 && !bad.message.includes('uuid'), 'a cast error is generic');
  const down = publicDbError({ code: '57014', message: 'canceling statement due to statement timeout' }, 'rpc');
  check(down.status === 500, 'a server failure stays a 500 (logged with an ID by handle(), generic to the caller)');
});

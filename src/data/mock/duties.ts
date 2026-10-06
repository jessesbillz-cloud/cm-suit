// Mock duties for e2e (0091 project_duties): who sends the job's OFS requests, kept in sessionStorage (its own key),
// with the database's rules: the owner or CM picks the company (default the GC), that company's admin picks the person.
// A company is the name the people list shows (people_display).
import { conflictError } from '../errors';
import type { Duty, DutyChange } from '../inspections.ofs';
import { MOCK_PEOPLE } from './fixtures';
import { mockUser } from './index';
import { forbidden, refuse } from './irRules';
import { delay } from './store';

const KEY = 'e2e-mock-duties';
/** The sample jobs' GC (the job's own company). */
const GC = 'Sample Builders';
/** Personas that pick neither the company nor the person (role_permissions has no duties.* row for them). */
const NO_DUTY_RIGHTS: readonly string[] = ['sub', 'inspector', 'ahj', 'foreman', 'requester', 'visitor', 'bidder', 'anon'];

interface Stored {
  company: string | null;
  person: string | null;
  version: number;
}

function readAll(): Record<string, Stored> {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? {} : (JSON.parse(raw) as Record<string, Stored>);
}

function stored(projectId: string): Stored | null {
  return readAll()[projectId] ?? null;
}

function persona(userId: string): string {
  return userId.replace(/^mock-user-/, '');
}

/** duty_member_company: the person's company as the people list names it (the default persona is the GC's). */
function companyOf(userId: string): string {
  return MOCK_PEOPLE.find((p) => p.user_id === userId)?.company ?? GC;
}

function companyOfDuty(projectId: string): string {
  return stored(projectId)?.company ?? GC;
}

/** duty_holder: the person picked, while active on the job. */
export function holder(projectId: string): string | null {
  const person = stored(projectId)?.person ?? null;
  return person !== null && MOCK_PEOPLE.some((p) => p.user_id === person && p.status === 'active') ? person : null;
}

function view(projectId: string): Duty[] {
  const me = mockUser().id;
  const rights = !NO_DUTY_RIGHTS.includes(persona(me));
  const company = companyOfDuty(projectId);
  const pick = rights && companyOf(me).toLowerCase() === company.toLowerCase();
  const active = MOCK_PEOPLE.filter((p) => p.status === 'active' && p.user_id !== null && p.company !== '');
  const person = holder(projectId);
  return [
    {
      duty: 'ofs_requests',
      company,
      person_id: person,
      person_name: MOCK_PEOPLE.find((p) => p.user_id === person)?.full_name ?? null,
      version: stored(projectId)?.version ?? null,
      can_assign: rights,
      can_pick: pick,
      companies: rights ? [...new Set(active.map((p) => p.company))].sort() : [],
      people: pick
        ? active.filter((p) => p.company.toLowerCase() === company.toLowerCase()).map((p) => ({ id: p.user_id ?? '', name: p.full_name }))
        : [],
    },
  ];
}

/** project_duties_view */
export async function duties(projectId: string): Promise<Duty[]> {
  await delay();
  return view(projectId);
}

/** duty_set_company / duty_set_person */
export async function setDuty(v: DutyChange): Promise<Duty[]> {
  await delay();
  const [d] = view(v.projectId);
  if (!d) throw forbidden();
  const now = stored(v.projectId);
  let next: Stored;
  if ('company' in v) {
    if (!d.can_assign) throw forbidden();
    const company = d.companies.find((c) => c.toLowerCase() === v.company.trim().toLowerCase());
    if (company === undefined) throw refuse('Pick a company on this job.');
    if ((now?.version ?? null) !== v.duty.version) throw conflictError();
    next = { company, person: company === d.company ? (now?.person ?? null) : null, version: (now?.version ?? 0) + 1 };
  } else {
    if (!d.can_pick) throw forbidden();
    if (v.personId !== null && !d.people.some((p) => p.id === v.personId)) throw refuse(`Pick someone from ${d.company ?? GC}.`);
    if ((now?.version ?? null) !== v.duty.version) throw conflictError();
    next = { company: now?.company ?? GC, person: v.personId, version: (now?.version ?? 0) + 1 };
  }
  window.sessionStorage.setItem(KEY, JSON.stringify({ ...readAll(), [v.projectId]: next }));
  return view(v.projectId);
}

// Synthetic Safety fixtures for the e2e mock (migration 0060): the built-in starter talks as the database seeds them
// (this app's own outlines; a few points each here), and two past meetings on Sample Job A.
import type { Topic } from '../safety.types';

type Seed = [slug: string, category: string, title: string, source: string, url: string, points: string[], questions: string[]];

const DIR = 'https://www.dir.ca.gov/title8/';
const OSHA = 'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/';

const SEEDS: Seed[] = [
  ['fall-protection', 'falls', 'Fall protection', '8 CCR 1670', `${DIR}1670.html`, [
    'Plan how you will be protected from a fall before the work starts, not once you are at the edge.',
    'Cal/OSHA protection starts at 7.5 feet in most construction work; know what applies to your task today.',
    "Guardrails and covers come first; a harness is for work that guardrails can't protect.",
    'Tie off only to an anchor rated for it, at or above your D-ring when you can.',
    'Have a rescue plan: someone hanging in a harness needs help within minutes.',
  ], ['Where on this job today could someone fall 7.5 feet or more?', 'Who gets a hanging worker down, and with what?']],
  ['ladders', 'falls', 'Ladders', '8 CCR 1675', `${DIR}1675.html`, [
    'Pick the right ladder: tall enough, rated for you and your load, and fiberglass near anything electrical.',
    'Set an extension ladder 1 foot out for every 4 feet up, 3 feet above the landing, and tie it off.',
    'Keep three points of contact going up and down; carry tools on a belt or hoist them up.',
    'Never stand on the top cap or top step of a stepladder.',
    'Keep your belt buckle between the rails. Climb down and move the ladder instead of reaching.',
  ], ['Which ladders on site today are the wrong type or height for the work?', 'When is a lift or a scaffold the right tool?']],
  ['scaffolds', 'falls', 'Scaffolds', '8 CCR 1637', `${DIR}1637.html`, [
    'A competent person checks the scaffold before each shift.',
    'Look for the tag before you climb. A red tag or no tag means stay off.',
    'Platforms fully planked, with guardrails and toe boards on every open side.',
    'Climb the built-in ladder or stair, never the cross braces.',
    'Only the crew trained for it builds, moves or changes a scaffold.',
  ], ['Who on our crew may change the scaffold?', 'What would make you stop and get off a scaffold?']],
  ['heat-illness', 'health', 'Heat illness', '8 CCR 3395', `${DIR}3395.html`, [
    'Drink water often, about a quart an hour on hot days, before you feel thirsty.',
    'Shade goes up when it reaches 80 degrees; take a cool-down rest in it whenever you need one.',
    'Above 95 degrees the high-heat steps apply: buddy checks, more breaks, and the crew stays in contact.',
    'New and returning workers need about two weeks to adjust; keep a close eye on them.',
    'Know the signs: headache, dizziness, cramps, confusion, heavy sweating or none at all.',
    'Speak up at the first sign. Heat stroke is an emergency: call 911 and cool the person down.',
    "Know the job's address and how to bring an ambulance in.",
  ], ['Where are the water and the shade on this job today?', 'What would you do if a coworker started acting confused in the heat?']],
  ['silica', 'health', 'Silica dust', '8 CCR 1532.3', `${DIR}1532_3.html`, [
    'Cutting, grinding or drilling concrete, block, stone, tile or brick throws silica dust.',
    "Use water at the blade, or a shroud with a HEPA vacuum, the way the tool's control method calls for.",
    'No dry sweeping and no compressed air on the dust.',
    'Keep other people out of the dust, and work upwind when you can.',
    "Wash up before you eat, and don't take dusty clothes home.",
  ], ['Which tasks today make silica dust?', 'Is the water feed or the vacuum working on every saw?']],
  ['electrical-lockout', 'electrical', 'Electrical safety and lockout', '29 CFR 1926.417', `${OSHA}1926.417`, [
    'Every cord and tool on temporary power runs through a GFCI; test it before you use it.',
    'Keep yourself, equipment and material at least 10 feet from overhead power lines.',
    'Treat every circuit as live until it is locked out, tagged and tested dead.',
    'Each worker puts on their own lock, and only the person who put a lock on takes it off.',
    'Only qualified electricians work on or near energized parts.',
  ], ['What will we lock out today, and who holds the keys?', 'Where are the overhead and buried lines on this site?']],
  ['excavation-trenching', 'excavation', 'Excavation and trenching', '8 CCR 1541.1', `${DIR}1541_1.html`, [
    'Call 811 before digging so buried lines are marked.',
    'A trench 5 feet or deeper needs sloping, shoring or a shield.',
    'A competent person checks the excavation every day and after rain.',
    'Keep spoils and equipment at least 2 feet back from the edge.',
    'In a trench 4 feet or deeper, keep a ladder within 25 feet of everyone in it.',
  ], ['Who is our competent person for excavations today?', 'What signs tell you a trench wall is about to give way?']],
  ['struck-by', 'equipment', 'Struck-by hazards', '29 CFR 1926.601', `${OSHA}1926.601`, [
    'Wear a high-visibility vest around traffic and moving equipment.',
    'Make eye contact with the operator before you walk near a machine.',
    'Stay out of the swing radius, and never walk under a suspended load.',
    'Secure tools and material at height with toe boards, nets or tethers.',
    'Wear eye and face protection for nailing, cutting and grinding.',
  ], ['Where do people and equipment cross paths on site today?', 'How is the area below overhead work kept clear?']],
  ['caught-between', 'equipment', 'Caught-in and caught-between', '29 CFR 1926.300(b)', `${OSHA}1926.300`, [
    'Never stand between moving equipment and a wall, a truck or stacked material.',
    'Keep the guards on belts, gears, chains and other moving parts.',
    'Lock out a machine before you clear a jam, clean it or fix it.',
    'Never step into an unprotected trench.',
    'Block raised loads and equipment before you work under them.',
  ], ["Where are the pinch points in today's tasks?", 'Which machines need lockout before anyone reaches in?']],
  ['ppe', 'site', 'Personal protective equipment', '29 CFR 1926.95', `${OSHA}1926.95`, [
    'Hard hat, safety glasses, high-visibility vest and work boots are the start for everyone on site.',
    'Add what the task needs: face shield, hearing protection, gloves, respirator or harness.',
    'Check your gear before each use.',
    'Match gloves to the job: cut, chemical and electrical gloves are not interchangeable.',
    'Protective gear is the last line of defense.',
  ], ['What extra gear does your task need today?', "Is anyone's gear worn out or missing?"]],
  ['housekeeping', 'site', 'Housekeeping', '29 CFR 1926.25', `${OSHA}1926.25`, [
    'Clean as you go: clutter causes trips, cuts and fires.',
    'Keep walkways, stairs, exits and ladders clear.',
    'Pull or bend over the nails in scrap lumber.',
    'Coil cords and hoses out of walkways, or run them overhead.',
    'Leave your area at the end of the day cleaner than you found it.',
  ], ['Which areas need the most cleanup right now?', 'Where do cords and hoses cross walkways?']],
  ['hand-power-tools', 'equipment', 'Hand and power tools', '29 CFR 1926.302', `${OSHA}1926.302`, [
    'Use the right tool for the job, and keep it in good shape.',
    'Keep guards in place. Never pin back a saw guard.',
    'Unplug the tool or shut off the air before changing a blade or bit.',
    'Only trained, certified operators use powder-actuated tools.',
    "Don't carry a tool by its cord or hose.",
  ], ['Which tools on our crew need repair or replacing?', 'Who here is trained on the powder-actuated tool?']],
  ['fire-hot-work', 'fire', 'Fire prevention and hot work', '29 CFR 1926.352', `${OSHA}1926.352`, [
    'Before welding, cutting, grinding or torch work, check the area.',
    'Move anything that burns out of the way, or cover it with fire-resistant blankets.',
    'A fire watch stays during the work and afterward.',
    'Keep a charged extinguisher within reach, and know how to use it.',
    'Store fuel and gas cylinders upright, capped and secured.',
  ], ['Where is hot work happening today, and who is the fire watch?', 'Where is the nearest extinguisher?']],
  ['hazard-communication', 'health', 'Hazard communication and SDS', '8 CCR 5194', `${DIR}5194.html`, [
    'Every chemical on site has a Safety Data Sheet (SDS). Know where they are.',
    'Read the label before you use a product.',
    "Any container you pour into gets a label with the product's name and its hazards.",
    'The SDS tells you the protective gear, the first aid and how to handle a spill.',
    'Report spills and exposures right away.',
  ], ['What chemicals will you use today?', 'Where are the SDSs for this job?']],
  ['lifting-back', 'health', 'Lifting and back safety', '8 CCR 1509', `${DIR}1509.html`, [
    'Size up the load before you lift.',
    'Get help, or a cart, dolly or lift, for anything heavy or awkward.',
    'Keep the load close, bend your knees and lift with your legs.',
    "Don't twist while you carry; turn with your feet.",
    'Report a strain early, before it becomes an injury.',
  ], ['What heavy or awkward items will we move today?', 'Which tasks could use a team lift or equipment instead?']],
];

export const STARTER_TOPICS: Topic[] = SEEDS.map(([slug, category, title, source, url, points, questions]) => ({
  id: `mock-topic-${slug}`,
  org_id: null,
  slug,
  category,
  title,
  language: 'en',
  points,
  questions,
  source,
  source_url: url,
  file_id: null,
  version: 1,
}));

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const TZ = 'America/Los_Angeles';

/** A meeting as the mock keeps it: the screen's row plus its token (the database keeps only the hash). */
export interface StoredMeeting {
  id: string;
  project_id: string;
  number: number;
  kind: 'tailgate' | 'meeting';
  held_on: string;
  topic_id: string | null;
  title: string;
  notes: string;
  points: string[];
  questions: string[];
  source: string | null;
  source_url: string | null;
  file_id: string | null;
  leader_id: string;
  leader_name: string;
  location: string;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  closed_by: string | null;
  token: string | null;
  token_made_at: string | null;
  pdf_file_id: string | null;
  version: number;
}

export interface StoredSignin {
  id: string;
  meeting_id: string;
  name: string;
  company: string;
  trade: string;
  via: 'link' | 'member';
  person_id: string | null;
  signed_at: string | null;
  created_at: string;
  signature: [number, number][][] | null;
  removed: boolean;
}

/** A synthetic signature: a few loops across the pad, a little different per person. */
function sampleSignature(seed: number): [number, number][][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const x = 0.08 + (i / 40) * 0.7;
    pts.push([Math.round(x * 1000) / 1000, Math.round((0.5 + 0.25 * Math.sin(i / (2 + (seed % 3)))) * 1000) / 1000]);
  }
  return [pts, [[0.8, 0.35], [0.9, 0.62]]];
}

const CREW: [string, string, string][] = [
  ['Sample Laborer', 'Sample Builders', 'Laborer'],
  ['Sample Framer', 'Sample Framing Co', 'Framer'],
  ['Sample Taper', 'Sample Drywall', 'Taper'],
  ['Sample Electrician', 'Sample Electric', 'Electrician'],
  ['Sample Plumber', 'Sample Plumbing', 'Plumber'],
];

/** Two past meetings on Sample Job A (a tailgate and a precon), closed, with their sheets; and this morning's tailgate on
 *  the GC job. */
export function seedMeetings(now: number, today: (at: Date) => string): { meetings: StoredMeeting[]; signins: StoredSignin[] } {
  const ladders = STARTER_TOPICS.find((t) => t.slug === 'ladders');
  const at = (days: number, hours = 0) => new Date(now - days * DAY + hours * HOUR).toISOString();
  const base = { project_id: 'job-a', file_id: null, leader_id: 'mock-user-super', leader_name: 'Sample Super', status: 'closed' as const,
    closed_by: 'mock-user-super', token: null, token_made_at: null, version: 3 };
  const meetings: StoredMeeting[] = [
    { ...base, id: 'mock-meeting-1', number: 1, kind: 'tailgate', held_on: today(new Date(now - 9 * DAY)), topic_id: ladders?.id ?? null,
      title: 'Ladders', notes: '', points: ladders?.points ?? [], questions: ladders?.questions ?? [], source: ladders?.source ?? null,
      source_url: ladders?.source_url ?? null, location: 'North gate', opened_at: at(9), closed_at: at(9, 0.4), pdf_file_id: 'mock-safety-sheet-1' },
    { ...base, id: 'mock-meeting-2', number: 2, kind: 'meeting', held_on: today(new Date(now - 3 * DAY)), topic_id: null,
      title: 'Precon with the framer', notes: 'Scope, sequence and the north wall layout.', points: [], questions: [], source: null,
      source_url: null, location: 'Trailer', opened_at: at(3), closed_at: at(3, 1), pdf_file_id: 'mock-safety-sheet-2' },
  ];
  const signins: StoredSignin[] = [
    ...CREW.map(([name, company, trade], i): StoredSignin => ({
      id: `mock-signin-1-${String(i + 1)}`, meeting_id: 'mock-meeting-1', name, company, trade, via: 'link', person_id: null,
      signed_at: at(9, 0.1 + i * 0.02), created_at: at(9, 0.1 + i * 0.02), signature: sampleSignature(i), removed: false,
    })),
    ...CREW.slice(1, 4).map(([name, company, trade], i): StoredSignin => ({
      id: `mock-signin-2-${String(i + 1)}`, meeting_id: 'mock-meeting-2', name, company, trade, via: 'link', person_id: null,
      signed_at: at(3, 0.2 + i * 0.02), created_at: at(3, 0.2 + i * 0.02), signature: sampleSignature(i + 2), removed: false,
    })),
  ];
  const gc = gcJobToday(now, today);
  return { meetings: [...meetings, gc.meeting], signins: [...signins, ...gc.signins] };
}

const GC_CREW: [string, string, string][] = [
  ['Sample Laborer', 'Sample Builders', 'Laborer'],
  ['Sample Framer One', 'Sample Framing Co', 'Framer'],
  ['Sample Framer Two', 'Sample Framing Co', 'Framer'],
  ['Sample Framer Three', 'Sample Framing Co', 'Framer'],
  ['Sample Electrician', 'Sample Electric', 'Electrician'],
  ['Sample Apprentice', 'Sample Electric', 'Electrician'],
];

/** This morning's tailgate on the GC job (data/mock/gcJobs), closed, six signed in: what its dailies fill in. */
function gcJobToday(now: number, today: (at: Date) => string): { meeting: StoredMeeting; signins: StoredSignin[] } {
  const heat = STARTER_TOPICS.find((t) => t.slug === 'heat-illness');
  const at = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const meeting: StoredMeeting = {
    id: 'mock-meeting-g1', project_id: 'job-g', number: 1, kind: 'tailgate', held_on: today(new Date(now)), topic_id: heat?.id ?? null,
    title: 'Heat illness', notes: '', points: heat?.points ?? [], questions: heat?.questions ?? [], source: heat?.source ?? null,
    source_url: heat?.source_url ?? null, file_id: null, leader_id: 'mock-user-super', leader_name: 'Sample Super', location: 'Gate 2',
    status: 'closed', opened_at: at(40), closed_at: at(25), closed_by: 'mock-user-super', token: null, token_made_at: null,
    pdf_file_id: 'mock-safety-sheet-g1', version: 3,
  };
  const signins = GC_CREW.map(([name, company, trade], i): StoredSignin => ({
    id: `mock-signin-g1-${String(i + 1)}`, meeting_id: meeting.id, name, company, trade, via: 'link', person_id: null,
    signed_at: at(38 - i), created_at: at(38 - i), signature: sampleSignature(i), removed: false,
  }));
  return { meeting, signins };
}

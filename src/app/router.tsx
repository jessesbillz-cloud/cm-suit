// Code-based routes (TanStack Router). App flow goes through the router only (CLAUDE.md rule 10).
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { STAGES } from '../lib/jobs';
import { isTool, type Tool } from '../lib/layout';
import { EmptyState } from '../ui/States';
import {
  AllBidsRoute,
  AllBoardRoute,
  AllCalendarRoute,
  AllPermitsRoute,
  AllSettingsRoute,
  AllTimesheetsRoute,
  ProjectToolRoute,
} from './frame/FrameRoute';
import { HomeRedirect } from './HomeRedirect';
import {
  AccessLinkPage,
  HubPage,
  KeyLoginPage,
  MeetingSigninPage,
  NewJobPage,
  PublicDeliveriesPage,
  RequestLinkPage,
  RequestStatusPage,
  ShareLinkPage,
  SignInPage,
} from './lazyPages';
import { RootLayout } from './RootLayout';

interface ToolSearch {
  /** Files: the folder being viewed. */
  folder?: string;
  /** "Open in new window": render the item alone. */
  window?: '1';
  /** Bids: the sub-view (coverage, packages, subs, received, leveling, summary, questions, addenda). */
  view?: string;
  /** Bids leveling: the package whose grid is showing. */
  pkg?: string;
  /** Calendar, inspections, deliveries: the day being looked at (yyyy-MM-dd, the job's calendar day); absent = today. */
  day?: string;
  /** Logs: the sort ("column.asc|desc") and the search box, shared by the list and the reading pane's arrow keys. */
  sort?: string;
  q?: string;
  /** Inspections > new request from Revs (0056): the walls and items to prefill, comma-separated ids. */
  areas?: string;
  items?: string;
  /** Revs plan (0059): the level shown, the wall to center on, the wall being placed on the plan. */
  level?: string;
  wall?: string;
  place?: string;
  /** Schedule look-ahead (0062): the window ('2m'; absent = 3 weeks). */
  range?: string;
  /** Requirements (0069, 0073): All's grouping (section or company; absent = by kind). */
  by?: 'section' | 'company';
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

const ID_LIST = /^[0-9a-z-]{1,64}(,[0-9a-z-]{1,64}){0,199}$/;

function idList(v: unknown): string | undefined {
  const t = str(v);
  return t && ID_LIST.test(t) ? t : undefined;
}

function parseToolSearch(s: Record<string, unknown>): ToolSearch {
  const folder = str(s['folder']);
  const areas = idList(s['areas']);
  const items = idList(s['items']);
  const view = str(s['view']);
  const pkg = str(s['pkg']);
  const day = str(s['day']);
  const win = s['window'] === '1' || s['window'] === 1;
  const sort = str(s['sort']);
  const q = str(s['q']);
  const level = str(s['level']);
  const wall = idList(s['wall']);
  const place = idList(s['place']);
  const range = str(s['range']);
  const by = s['by'];
  return {
    ...(folder ? { folder } : {}),
    ...(view ? { view } : {}),
    ...(pkg ? { pkg } : {}),
    ...(win ? { window: '1' as const } : {}),
    ...(day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? { day } : {}),
    ...(sort ? { sort } : {}),
    ...(q ? { q } : {}),
    ...(areas ? { areas } : {}),
    ...(items ? { items } : {}),
    ...(level && level.length <= 40 ? { level } : {}),
    ...(wall && !wall.includes(',') ? { wall } : {}),
    ...(place && !place.includes(',') ? { place } : {}),
    ...(range === '2m' ? { range } : {}),
    ...(by === 'section' || by === 'company' ? { by } : {}),
  };
}

function parseAccessSearch(s: Record<string, unknown>): { t?: string } {
  const t = str(s['t']);
  return t ? { t } : {};
}

/** New job: a stage to prefill (e.g. "prospect" from the bids pipeline) and the tool the new job opens in. */
function parseNewJobSearch(s: Record<string, unknown>): { stage?: string; tool?: Tool } {
  const stage = str(s['stage']);
  const tool = str(s['tool']);
  return {
    ...(stage && STAGES.some((x) => x.value === stage) ? { stage } : {}),
    ...(tool && isTool(tool) ? { tool } : {}),
  };
}

/** The bids pipeline across jobs: the sort ("column.asc|desc") and the stages shown ("prospect,bidding"). */
function parsePipelineSearch(s: Record<string, unknown>): { sort?: string; stages?: string } {
  const sort = str(s['sort']);
  const stages = str(s['stages']);
  return { ...(sort ? { sort } : {}), ...(stages ? { stages } : {}) };
}

function NotFound() {
  return <EmptyState title="That page does not exist." hint="Use the job picker or the rail to get where you were going." />;
}

const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFound });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomeRedirect });
const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signin', component: SignInPage });
const newJobRoute = createRoute({ getParentRoute: () => rootRoute, path: '/new-job', validateSearch: parseNewJobSearch, component: NewJobPage });
const accessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/a/$linkId',
  validateSearch: parseAccessSearch,
  component: AccessLinkPage,
});
const shareRoute = createRoute({ getParentRoute: () => rootRoute, path: '/s/$shareLinkId', component: ShareLinkPage });
/** Personal sign-in link, testing only (docs/decisions.md 0036). */
const keyLoginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/k/$key', component: KeyLoginPage });

const toolRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$projectId/$tool',
  validateSearch: parseToolSearch,
  component: ProjectToolRoute,
});
// The item renders inside the frame (right column / full screen), so this child has no component of its own.
const toolItemRoute = createRoute({ getParentRoute: () => toolRoute, path: '$itemId' });

const allBoardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/all/board',
  validateSearch: parseToolSearch,
  component: AllBoardRoute,
});
const allBoardItemRoute = createRoute({ getParentRoute: () => allBoardRoute, path: '$itemId' });

const allCalendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/all/calendar',
  validateSearch: parseToolSearch,
  component: AllCalendarRoute,
});
const allCalendarItemRoute = createRoute({ getParentRoute: () => allCalendarRoute, path: '$itemId' });
/** The job's delivery link (SPEC §6.4 #3): token, view (post, tv), picked day, receipt. */
function parseDeliveryLinkSearch(s: Record<string, unknown>): { t?: string; view?: string; day?: string; r?: string } {
  const t = str(s['t']);
  const view = str(s['view']);
  const day = str(s['day']);
  const r = str(s['r']);
  return { ...(t ? { t } : {}), ...(view ? { view } : {}), ...(day ? { day } : {}), ...(r ? { r } : {}) };
}
const deliveryLinkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/d/$projectId',
  validateSearch: parseDeliveryLinkSearch,
  component: PublicDeliveriesPage,
});

/** The job's inspection request link (SPEC §6.4 #4): its token, and the hub's id when opened from a hub. */
function parseRequestLinkSearch(s: Record<string, unknown>): { t?: string; h?: string } {
  const t = str(s['t']);
  const h = str(s['h']);
  return { ...(t ? { t } : {}), ...(h ? { h } : {}) };
}
const requestLinkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/r/$projectId',
  validateSearch: parseRequestLinkSearch,
  component: RequestLinkPage,
});
/** A request sent with no login, by its private status link (0055): the tracker and the result line. */
const requestStatusRoute = createRoute({ getParentRoute: () => rootRoute, path: '/r/$projectId/s/$receipt', component: RequestStatusPage });
/** A meeting's sign-in page (SPEC §6.4 #8, 0060): the QR on a tailgate or job meeting's screen; its token. */
const meetingSigninRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/m/$meetingId',
  validateSearch: parseAccessSearch,
  component: MeetingSigninPage,
});
/** One link for all the jobs a person takes inspection requests on. */
const hubRoute = createRoute({ getParentRoute: () => rootRoute, path: '/h/$hubId', validateSearch: parseAccessSearch, component: HubPage });

const allBidsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/all/bids',
  validateSearch: parsePipelineSearch,
  component: AllBidsRoute,
});
const allSettingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/all/settings', component: AllSettingsRoute });

/** Timesheets (all my jobs): the month (?day=yyyy-MM-01), the company (?org=) and "open in new window". */
function parseTimesheetsSearch(s: Record<string, unknown>): { day?: string; org?: string; window?: '1' } {
  const day = str(s['day']);
  const org = str(s['org']);
  return {
    ...(day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? { day } : {}),
    ...(org ? { org } : {}),
    ...(s['window'] === '1' || s['window'] === 1 ? { window: '1' as const } : {}),
  };
}
const allTimesheetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/all/timesheets',
  validateSearch: parseTimesheetsSearch,
  component: AllTimesheetsRoute,
});
const allTimesheetsItemRoute = createRoute({ getParentRoute: () => allTimesheetsRoute, path: '$itemId' });

/** The official's permit caseload across all my jobs (0052): the filter (?view=) and "open in new window". */
const allPermitsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/all/permits',
  validateSearch: parseToolSearch,
  component: AllPermitsRoute,
});
const allPermitsItemRoute = createRoute({ getParentRoute: () => allPermitsRoute, path: '$itemId' });

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  newJobRoute,
  accessRoute,
  shareRoute,
  keyLoginRoute,
  toolRoute.addChildren([toolItemRoute]),
  allBoardRoute.addChildren([allBoardItemRoute]),
  allCalendarRoute.addChildren([allCalendarItemRoute]),
  deliveryLinkRoute,
  requestLinkRoute,
  hubRoute,
  allBidsRoute,
  allSettingsRoute,
  allTimesheetsRoute.addChildren([allTimesheetsItemRoute]),
  allPermitsRoute.addChildren([allPermitsItemRoute]),
  requestStatusRoute,
  meetingSigninRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: false, basepath: __BASE_PATH__ });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

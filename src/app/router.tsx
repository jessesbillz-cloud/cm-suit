// Code-based routes (TanStack Router). App flow goes through the router only (CLAUDE.md rule 10).
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AccessLink } from '../features/auth/AccessLink';
import { KeyLogin } from '../features/auth/KeyLogin';
import { ShareLink } from '../features/auth/ShareLink';
import { SignIn } from '../features/auth/SignIn';
import { NewJobPage } from '../features/setup/NewJobPage';
import { PublicDeliveries } from '../features/deliveries/PublicDeliveries';
import { STAGES } from '../lib/jobs';
import { isTool, type Tool } from '../lib/layout';
import { EmptyState } from '../ui/States';
import { AllBidsRoute, AllBoardRoute, AllCalendarRoute, AllSettingsRoute, ProjectToolRoute } from './frame/FrameRoute';
import { HomeRedirect } from './HomeRedirect';
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
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function parseToolSearch(s: Record<string, unknown>): ToolSearch {
  const folder = str(s['folder']);
  const view = str(s['view']);
  const pkg = str(s['pkg']);
  const day = str(s['day']);
  const win = s['window'] === '1' || s['window'] === 1;
  const sort = str(s['sort']);
  const q = str(s['q']);
  return {
    ...(folder ? { folder } : {}),
    ...(view ? { view } : {}),
    ...(pkg ? { pkg } : {}),
    ...(win ? { window: '1' as const } : {}),
    ...(day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? { day } : {}),
    ...(sort ? { sort } : {}),
    ...(q ? { q } : {}),
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
const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signin', component: SignIn });
const newJobRoute = createRoute({ getParentRoute: () => rootRoute, path: '/new-job', validateSearch: parseNewJobSearch, component: NewJobPage });
const accessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/a/$linkId',
  validateSearch: parseAccessSearch,
  component: AccessLink,
});
const shareRoute = createRoute({ getParentRoute: () => rootRoute, path: '/s/$shareLinkId', component: ShareLink });
/** Personal sign-in link, testing only (docs/decisions.md 0036). */
const keyLoginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/k/$key', component: KeyLogin });

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
  component: PublicDeliveries,
});

const allBidsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/all/bids',
  validateSearch: parsePipelineSearch,
  component: AllBidsRoute,
});
const allSettingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/all/settings', component: AllSettingsRoute });

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
  allBidsRoute,
  allSettingsRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: false, basepath: __BASE_PATH__ });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

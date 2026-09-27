// Code-based routes (TanStack Router). App flow goes through the router only (CLAUDE.md rule 10).
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AccessLink } from '../features/auth/AccessLink';
import { ShareLink } from '../features/auth/ShareLink';
import { SignIn } from '../features/auth/SignIn';
import { EmptyState } from '../ui/States';
import { AllBoardRoute, ProjectToolRoute } from './frame/FrameRoute';
import { HomeRedirect } from './HomeRedirect';
import { RootLayout } from './RootLayout';

interface ToolSearch {
  /** Files: the folder being viewed. */
  folder?: string;
  /** "Open in new window": render the item alone. */
  window?: '1';
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function parseToolSearch(s: Record<string, unknown>): ToolSearch {
  const folder = str(s['folder']);
  const win = s['window'] === '1' || s['window'] === 1;
  return { ...(folder ? { folder } : {}), ...(win ? { window: '1' as const } : {}) };
}

function parseAccessSearch(s: Record<string, unknown>): { t?: string } {
  const t = str(s['t']);
  return t ? { t } : {};
}

function NotFound() {
  return <EmptyState title="That page does not exist." hint="Use the job picker or the rail to get where you were going." />;
}

const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFound });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomeRedirect });
const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signin', component: SignIn });
const accessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/a/$linkId',
  validateSearch: parseAccessSearch,
  component: AccessLink,
});
const shareRoute = createRoute({ getParentRoute: () => rootRoute, path: '/s/$shareLinkId', component: ShareLink });

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

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  accessRoute,
  shareRoute,
  toolRoute.addChildren([toolItemRoute]),
  allBoardRoute.addChildren([allBoardItemRoute]),
]);

export const router = createRouter({ routeTree, defaultPreload: false });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Pages outside the frame load on first use: sign-in, first-time setup and new job, and the public links (access,
// share, delivery, request, a request's status, hub, a meeting's sign-in, testing sign-in). A signed-in person never
// downloads them; someone opening a link downloads only that page. Until a page's code is in, the usual loading line
// shows.
import { Suspense, type ComponentType } from 'react';
import { lazyRouteComponent } from '@tanstack/react-router';
import { LoadingState } from '../ui/States';

export const SignIn = lazyRouteComponent(() => import('../features/auth/SignIn').then((m) => ({ default: m.SignIn })));
export const SetupFlow = lazyRouteComponent(() => import('../features/setup/SetupFlow').then((m) => ({ default: m.SetupFlow })));
const NewJob = lazyRouteComponent(() => import('../features/setup/NewJobPage').then((m) => ({ default: m.NewJobPage })));
const AccessLink = lazyRouteComponent(() => import('../features/auth/AccessLink').then((m) => ({ default: m.AccessLink })));
const ShareLink = lazyRouteComponent(() => import('../features/auth/ShareLink').then((m) => ({ default: m.ShareLink })));
const KeyLogin = lazyRouteComponent(() => import('../features/auth/KeyLogin').then((m) => ({ default: m.KeyLogin })));
const PublicDeliveries = lazyRouteComponent(() =>
  import('../features/deliveries/PublicDeliveries').then((m) => ({ default: m.PublicDeliveries })),
);
const RequestLink = lazyRouteComponent(() =>
  import('../features/inspections/RequestLinkPage').then((m) => ({ default: m.RequestLinkPage })),
);
const Hub = lazyRouteComponent(() => import('../features/inspections/HubPage').then((m) => ({ default: m.HubPage })));
const RequestStatus = lazyRouteComponent(() =>
  import('../features/inspections/RequestStatusPage').then((m) => ({ default: m.RequestStatusPage })),
);
const MeetingSignin = lazyRouteComponent(() => import('../features/safety/SignInPage').then((m) => ({ default: m.SignInPage })));

function Page({ part: Part }: { part: ComponentType }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <Part />
    </Suspense>
  );
}

export function SignInPage() {
  return <Page part={SignIn} />;
}

export function NewJobPage() {
  return <Page part={NewJob} />;
}

export function AccessLinkPage() {
  return <Page part={AccessLink} />;
}

export function ShareLinkPage() {
  return <Page part={ShareLink} />;
}

export function KeyLoginPage() {
  return <Page part={KeyLogin} />;
}

export function PublicDeliveriesPage() {
  return <Page part={PublicDeliveries} />;
}

export function RequestLinkPage() {
  return <Page part={RequestLink} />;
}

export function HubPage() {
  return <Page part={Hub} />;
}

export function RequestStatusPage() {
  return <Page part={RequestStatus} />;
}

export function MeetingSigninPage() {
  return <Page part={MeetingSignin} />;
}

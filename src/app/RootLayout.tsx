// The auth gate. Public entry points (/a/..., /s/..., the delivery link /d/..., the request link /r/... and hub /h/...,
// a meeting's sign-in /m/..., the testing sign-in link /k/...) render for anyone; everything else needs a session, and a
// signed-out visitor sees the sign-in screen in place.
import { Suspense } from 'react';
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { useSession } from '../data/auth';
import { LoadingState } from '../ui/States';
import { SignIn } from './lazyPages';

function isPublicPath(path: string): boolean {
  return ['/a/', '/s/', '/d/', '/r/', '/h/', '/m/', '/k/'].some((p) => path.startsWith(p));
}

export function RootLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const session = useSession();

  if (isPublicPath(path)) return <Outlet />;
  if (session.status === 'loading') return <LoadingState label="Starting" />;
  if (session.status === 'signed_out') {
    return (
      <Suspense fallback={<LoadingState label="Starting" />}>
        <SignIn />
      </Suspense>
    );
  }
  if (path === '/signin') return <Navigate to="/" replace />;

  return (
    <>
      {session.inviteError ? (
        <div role="alert" className="bg-danger-soft px-4 py-2 text-center text-sm text-danger">
          {session.inviteError}
        </div>
      ) : null}
      <Outlet />
    </>
  );
}

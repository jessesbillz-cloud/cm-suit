// Holds the auth session for the whole app. After every SIGNED_IN it binds pending invites (accept_invites).
import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { SessionContext, acceptInvites, type SessionState } from './auth';
import { messageOf } from './errors';
import { isMock, mockUser } from './mock';
import { qk } from './keys';

function initialState(): SessionState {
  if (isMock()) return { status: 'signed_in', user: mockUser(), inviteError: null };
  return { status: 'loading', user: null, inviteError: null };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(initialState);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isMock()) return undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      setState((prev) => ({
        status: user ? 'signed_in' : 'signed_out',
        user: user ? { id: user.id, email: user.email ?? '' } : null,
        inviteError: user ? prev.inviteError : null,
      }));
      if (event !== 'SIGNED_IN') return;
      // supabase-js: don't await other Supabase calls inside this callback (it holds the auth lock). Defer.
      window.setTimeout(() => {
        acceptInvites()
          .then(async (n) => {
            setState((prev) => ({ ...prev, inviteError: null }));
            if (n > 0) await queryClient.invalidateQueries({ queryKey: qk.myProjects });
          })
          .catch((e: unknown) => {
            setState((prev) => ({ ...prev, inviteError: `Could not add your new jobs: ${messageOf(e)}` }));
          });
      }, 0);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

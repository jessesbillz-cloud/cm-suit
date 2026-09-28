// /k/<key>: a personal sign-in link (testing only, docs/decisions.md 0036). Signs its owner in with no email and no
// code, then opens All my jobs. The key leaves the address bar as soon as the page opens it.
import { useEffect, useRef, useState } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { signInWithKey } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { LoadingState } from '../../ui/States';
import { PublicPage } from './PublicPage';

const route = getRouteApi('/k/$key');

export function KeyLogin() {
  const { key } = route.useParams();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    signInWithKey(key)
      .then(() => navigate({ to: '/', replace: true }))
      .catch((e: unknown) => {
        setProblem(messageOf(e));
      });
  }, [key, navigate]);

  if (problem) {
    return (
      <PublicPage title="Link not active">
        <p className="text-sm text-danger">{problem}</p>
      </PublicPage>
    );
  }
  return (
    <PublicPage title="Signing in">
      <LoadingState label="Signing in" />
    </PublicPage>
  );
}

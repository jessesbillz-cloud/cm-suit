// The centered card used by sign-in, access links and share links.
import type { ReactNode } from 'react';
import { FUTURE_NAME } from '../../lib/brand';
import { Card } from '../../ui/Card';

export function PublicPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-page px-4 py-10">
      <p className="mb-4 text-sm font-semibold tracking-wide text-ink-2">{FUTURE_NAME}</p>
      <Card className="w-full max-w-sm" title={title}>
        {children}
      </Card>
    </main>
  );
}

// The centered page used by sign-in, access links, share links and the first-run setup: the product mark over one
// white card on the near-white page.
import type { ReactNode } from 'react';
import { FUTURE_NAME } from '../../lib/brand';
import { Card } from '../../ui/Card';
import { BrandMark } from '../../ui/BrandMark';

interface PublicShellProps {
  children: ReactNode;
  /** Forms with two columns (setup) take a wider column. */
  wide?: boolean | undefined;
}

export function PublicShell({ children, wide = false }: PublicShellProps) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-page px-4 py-10">
      <div className={`flex w-full flex-col gap-6 ${wide ? 'max-w-xl' : 'max-w-sm'}`}>
        <div className="flex items-center justify-center gap-2.5">
          <BrandMark size="lg" />
          <span className="text-base font-semibold tracking-[-0.01em] text-ink">{FUTURE_NAME}</span>
        </div>
        {children}
      </div>
    </main>
  );
}

export function PublicPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PublicShell>
      <Card className="w-full">
        {/* An error banner sits flush in the card (ui/States gives it a margin for list screens). */}
        <div className="flex flex-col gap-4 p-2 [&>[role=alert]]:m-0">
          <h1 className="break-words text-xl font-semibold leading-7 tracking-[-0.01em] text-ink">{title}</h1>
          {children}
        </div>
      </Card>
    </PublicShell>
  );
}

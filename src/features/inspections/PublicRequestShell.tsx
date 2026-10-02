// The public request pages' frame (the request form, the receipt, the status link): the product mark, the job's name and
// one short line, then the page's cards in one column. Phone first: 16px gutters, nothing side by side that would
// shrink a tap target.
import type { ReactNode } from 'react';
import { FUTURE_NAME } from '../../lib/brand';
import { BrandMark } from '../../ui/BrandMark';

interface PublicRequestShellProps {
  title: string;
  meta?: string | undefined;
  children: ReactNode;
}

export function PublicRequestShell({ title, meta, children }: PublicRequestShellProps) {
  return (
    <main className="min-h-[100dvh] bg-page">
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-6 pt-5">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <BrandMark size="md" />
            <span className="text-sm font-semibold text-ink">{FUTURE_NAME}</span>
          </div>
          <div>
            <h1 className="break-words text-2xl font-semibold leading-8 tracking-[-0.01em] text-ink" data-testid="public-job">
              {title}
            </h1>
            {meta ? <p className="text-sm text-ink-2">{meta}</p> : null}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

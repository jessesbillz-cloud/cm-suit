// One part of a report being written (weather, work log, notes, photos): a white card on the editor's page, a 15px
// title with an optional count, the part's own buttons on the right.
import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  count?: number | undefined;
  actions?: ReactNode | undefined;
  children?: ReactNode | undefined;
  testId?: string | undefined;
}

export function Section({ title, count, actions, children, testId }: SectionProps) {
  return (
    <section className="rounded-card bg-card shadow-card" data-testid={testId}>
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
        <h3 className="text-[15px] font-semibold leading-6 text-ink">
          {title}
          {count !== undefined && count > 0 ? <span className="ml-2 font-medium tabular-nums text-ink-3">{count}</span> : null}
        </h3>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}

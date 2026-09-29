// The top of every tool's main area: the tool's icon and name, one short line of what's in it right now
// ("6 open · 1 late"), and the tool's one or two actions on the right (the primary one is the accent button).
// Views (Segmented) sit on the second row when a tool has them. One look for every tool.
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from './Icon';

interface PageHeaderProps {
  title: string;
  icon?: LucideIcon | undefined;
  /** One short line: counts or the state that matters now. Never a sentence of help. */
  meta?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  /** The tool's views (a Segmented control) or filters. */
  below?: ReactNode | undefined;
}

export function PageHeader({ title, icon, meta, actions, below }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {icon ? (
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-accent shadow-card sm:flex">
              <Icon icon={icon} size={20} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em] text-ink">{title}</h1>
            {meta ? <p className="text-sm text-ink-2">{meta}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {below}
    </div>
  );
}

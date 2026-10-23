// The top of every tool's main area: the tool's icon and name, one short line of what's in it right now
// ("6 open · 1 late"), and the tool's one or two actions on the right (the primary one is the accent button).
// Views (Segmented) sit on the second row when a tool has them. One look for every tool: the title in the display face,
// the icon on a black square with the accent line, a hard ink rule under the title row (Jesse, Oct 23).
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from './Icon';

/** A section's heading inside a page (Walls, History, OFS schedule): the display face over a hard ink rule. */
export const SECTION_HEAD = 'heading border-b-2 border-ink px-1 pb-1 text-[17px] font-semibold leading-6 text-ink';

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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-ink pb-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {icon ? (
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-md border-b-[3px] border-accent bg-rail text-white shadow-tile sm:flex">
              <Icon icon={icon} size={20} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="heading text-[26px] font-semibold leading-8 text-ink">{title}</h1>
            {meta ? <p className="text-sm text-ink-2">{meta}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {below}
    </div>
  );
}

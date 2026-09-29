// A delivery in the right column (or full screen on a phone): a title row with at most one action, then the content.
// The same header look as the reading pane, so every opened item reads alike.
import type { ReactNode } from 'react';
import { Truck } from 'lucide-react';
import { Icon } from '../../ui/Icon';

interface ItemFrameProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function ItemFrame({ title, action, children }: ItemFrameProps) {
  return (
    <article className="flex flex-col">
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon icon={Truck} size={16} />
        </span>
        <h1 className="min-w-0 flex-1 break-words text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">{title}</h1>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </article>
  );
}

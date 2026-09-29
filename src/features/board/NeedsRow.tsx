// One "Needs you" row, for waiting RFIs and tasks alike: the kind's icon on the accent tint, the title, one meta line,
// and the chip or button on the right (under the text on a phone). A row that opens its record is one big button.
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { KindSquare } from './KindSquare';

interface NeedsRowProps {
  testId: string;
  reason?: string | undefined;
  icon: LucideIcon;
  title: ReactNode;
  meta: string;
  end: ReactNode;
  /** The whole row opens the record; `end` must then hold no button. */
  onOpen?: (() => void) | undefined;
}

const ROW = 'flex min-h-[52px] w-full items-start gap-3 px-4 py-3 text-left';

export function NeedsRow({ testId, reason, icon, title, meta, end, onOpen }: NeedsRowProps) {
  const body = (
    <>
      <KindSquare icon={icon} accent />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span className="min-w-0 flex-1 self-stretch">
          <span className="block break-words text-sm leading-5 text-ink">{title}</span>
          {meta === '' ? null : <span className="mt-0.5 block text-[12px] leading-4 text-ink-2">{meta}</span>}
        </span>
        <span className="shrink-0">{end}</span>
      </span>
    </>
  );
  return (
    <li data-testid={testId} data-reason={reason}>
      {onOpen ? (
        <button type="button" className={`${ROW} transition-colors hover:bg-page/60`} onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div className={ROW}>{body}</div>
      )}
    </li>
  );
}

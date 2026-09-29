// The directory list: one line per sub (company and main contact, trades, city, license + chip). Rows render in pages
// that grow as the end comes into view, so a 1,600-row list scrolls smoothly. Text wraps; nothing is cut off.
import { useEffect, useRef } from 'react';
import type { SubRow } from '../../data/subs.types';
import { Button } from '../../ui/Button';
import { StatusChip } from '../../ui/StatusChip';
import { OPEN_BAR, ROW_HOVER, ROW_OPEN } from './rowStyles';
import { licenseChip, mainContact } from './subs';

function SubLine({ s, selected, onOpen }: { s: SubRow; selected: boolean; onOpen: (id: string) => void }) {
  const c = mainContact(s);
  const contact = c ? [c.name, c.phone, c.email].filter((x) => x.trim() !== '').join(' · ') : '';
  const chip = licenseChip(s.cslb_status);
  return (
    <li>
      <button
        type="button"
        data-testid="sub-row"
        aria-current={selected ? 'true' : undefined}
        className={`grid min-h-[52px] w-full grid-cols-[minmax(0,1fr)_6rem_7rem_7.5rem] items-center gap-3 px-4 py-2.5 text-left text-sm ${selected ? `${ROW_OPEN} ${OPEN_BAR}` : ROW_HOVER}`}
        onClick={() => {
          onOpen(s.id);
        }}
      >
        <span className="min-w-0 break-words">
          <span className="block font-medium text-ink">{s.company}</span>
          {contact !== '' ? <span className="block break-words text-xs text-ink-2">{contact}</span> : null}
        </span>
        <span className="break-words text-xs tabular-nums text-ink-2">{s.trades.join(' ')}</span>
        <span className="break-words text-xs text-ink-2">{s.city ?? ''}</span>
        <span className="flex flex-col items-end gap-1 text-xs tabular-nums text-ink-2">
          {s.cslb_number ?? ''}
          {chip ? <StatusChip status={chip.status} label={chip.label} /> : null}
        </span>
      </button>
    </li>
  );
}

/** "Show more", pressed automatically when it scrolls into view. */
function MoreRows({ onMore }: { onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onMore();
    });
    seen.observe(el);
    return () => {
      seen.disconnect();
    };
  }, [onMore]);
  return (
    <div ref={ref} className="flex justify-center p-3">
      <Button size="sm" variant="quiet" onClick={onMore}>
        Show more
      </Button>
    </div>
  );
}

interface SubListProps {
  rows: readonly SubRow[];
  shown: number;
  onMore: () => void;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function SubList({ rows, shown, onMore, selectedId, onOpen }: SubListProps) {
  return (
    <>
      <ul className="divide-y divide-line">
        {rows.slice(0, shown).map((s) => (
          <SubLine key={s.id} s={s} selected={s.id === selectedId} onOpen={onOpen} />
        ))}
      </ul>
      {rows.length > shown ? <MoreRows onMore={onMore} /> : null}
    </>
  );
}

// One group on a spec section's page: its name and count, then its rows, newest first. A row opens the file (its pane
// beside the page) or the RFI in the RFI tool. Nothing shows for an empty group.
import { FileQuestion } from 'lucide-react';
import { formatInZone } from '../../lib/dates';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { rfiLabel, statusChip } from '../rfis/model';
import type { HubRfiRow } from './hubItems';

interface HubGroupProps {
  label: string;
  testId: string;
  items: readonly HubRfiRow[];
  timeZone: string | null;
  selectedFileId: string | null;
  onOpenFile: (fileId: string) => void;
  onOpenRfi: (rfiId: string) => void;
}

const ROW = 'flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-page/60';

export function HubGroup({ label, testId, items, timeZone, selectedFileId, onOpenFile, onOpenRfi }: HubGroupProps) {
  if (items.length === 0) return null;
  const day = (at: string) => (timeZone === null ? '' : formatInZone(at, timeZone, 'MMM d, yyyy'));
  return (
    <section data-testid={testId} className="border-b border-line last:border-b-0">
      <h3 className="flex items-center gap-2 bg-card-head px-4 py-2 text-[13px] font-semibold text-ink-2">
        {label}
        <span data-testid="spec-hub-count" className="tabular-nums text-ink-3">
          {items.length}
        </span>
      </h3>
      <ul className="divide-y divide-line">
        {items.map((it) => {
          if (it.kind === 'rfi') {
            const r = it.rfi;
            const chip = statusChip(r.status);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  data-testid="spec-hub-row"
                  className={ROW}
                  onClick={() => {
                    onOpenRfi(r.id);
                  }}
                >
                  <Icon icon={FileQuestion} size={16} className="shrink-0 text-ink-2" />
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{rfiLabel(r.number)}</span>
                  <span className="min-w-0 flex-1 font-medium text-ink wrap-anywhere">{r.title}</span>
                  <StatusChip status={chip.status} label={chip.label} />
                  <span className="hidden w-[5.75rem] shrink-0 text-right text-xs tabular-nums text-ink-3 sm:block">{day(r.created_at)}</span>
                </button>
              </li>
            );
          }
          const f = it.file;
          const selected = f.id === selectedFileId;
          return (
            <li key={f.id}>
              <button
                type="button"
                data-testid="spec-hub-row"
                aria-current={selected ? 'true' : undefined}
                className={`${ROW} ${selected ? 'bg-accent-soft/60' : ''}`}
                onClick={() => {
                  onOpenFile(f.id);
                }}
              >
                <Icon icon={fileIcon(f.original_name, f.mime)} size={16} className="shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1 font-medium text-ink wrap-anywhere">{f.original_name}</span>
                <span className="w-[5.75rem] shrink-0 text-right text-xs tabular-nums text-ink-3">{day(f.created_at)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

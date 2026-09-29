// One form on the checklist: name with its legal reference in small gray, the attached file with a one-click
// download, the due day, and the status chip. The row opens the form on the right.
import { Download, Paperclip } from 'lucide-react';
import type { BidFormItem } from '../../data/bidForms';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import type { Chip } from './model';
import { OPEN_BAR, ROW_HOVER, ROW_OPEN } from './rowStyles';

interface FormRowProps {
  item: BidFormItem;
  chip: Chip;
  selected: boolean;
  downloading: boolean;
  onOpen: (id: string) => void;
  onDownload: (fileId: string, size: number) => void;
}

export function FormRow({ item, chip, selected, downloading, onOpen, onDownload }: FormRowProps) {
  const due = item.due_on !== null && item.status === 'to_do' ? formatDay(item.due_on, 'MMM d') : null;
  // The whole row opens the form; the name is a button so the keyboard reaches it (its click bubbles up here).
  // Desktop: name | file | due | chip in columns. Phone: name, due and chip on one line, the file under them.
  return (
    <li
      data-testid={`form-row-${item.name}`}
      aria-current={selected ? 'true' : undefined}
      className={`flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:flex-nowrap ${selected ? `${ROW_OPEN} ${OPEN_BAR} cursor-pointer` : ROW_HOVER}`}
      onClick={() => {
        onOpen(item.id);
      }}
    >
      <button type="button" className="min-w-0 flex-1 text-left">
        <span className="block break-words font-medium text-ink">{item.name}</span>
        {item.reference !== '' ? <span className="block break-words text-xs text-ink-2">{item.reference}</span> : null}
      </button>
      <span
        className={`order-last min-w-0 basis-full items-center gap-1.5 sm:order-none sm:flex sm:w-60 sm:flex-none sm:basis-auto ${item.file ? 'flex' : 'hidden'}`}
      >
        {item.file ? (
          <>
            <Icon icon={Paperclip} size={14} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 break-words text-xs text-ink-2">{item.file.original_name}</span>
            <Button
              size="sm"
              variant="quiet"
              icon={Download}
              aria-label={`Download ${item.file.original_name}`}
              data-testid={`form-download-${item.name}`}
              loading={downloading}
              onClick={(e) => {
                e.stopPropagation();
                if (item.file) onDownload(item.file.id, item.file.size);
              }}
            />
          </>
        ) : null}
      </span>
      <span className={`shrink-0 text-right text-xs tabular-nums text-ink-2 sm:block sm:w-14 ${due === null ? 'hidden' : ''}`}>{due}</span>
      <span className="flex shrink-0 justify-end sm:w-20">
        <StatusChip status={chip.status} label={chip.label} />
      </span>
    </li>
  );
}

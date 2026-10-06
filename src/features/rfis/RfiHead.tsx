// The RFI pane's header (Jesse, Sep 30): what it is (number, status), the WHOLE title, who asked and when, and exactly
// three actions: open it alone in its own window, download its PDF, and View PDF (its pages in the app's file viewer;
// an eye, not the arrows: the arrows are the right column's own Full screen). The PDF buttons wait, with a short reason, until there is something to print.
import { Download, ExternalLink, Eye, FileQuestion, type LucideIcon } from 'lucide-react';
import type { RfiDetail } from '../../data/rfis.types';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { rfiLabel, statusChip } from './model';
import { pdfWait } from './progress';

interface RfiHeadProps {
  detail: RfiDetail;
  /** The title to show (the pane keeps the one it opened with while it is being edited). */
  title: string;
  timeZone: string;
  /** Leave out where there are no windows (the phone, or already alone in one). */
  onOpenWindow?: (() => void) | undefined;
  onDownload: () => void;
  downloading: boolean;
  onView: () => void;
  /** Bigger targets on the phone. */
  isPhone: boolean;
}

interface ActionProps {
  icon: LucideIcon;
  label: string;
  testId: string;
  onClick: () => void;
  loading?: boolean | undefined;
  /** Why it can't be pressed yet. */
  wait?: string | null | undefined;
  size: 'sm' | 'md';
}

function Action({ icon, label, testId, onClick, loading = false, wait = null, size }: ActionProps) {
  return (
    // The reason sits on a wrapper: a disabled button shows no hover title in every browser.
    <span title={wait ?? label} className="inline-flex">
      <Button
        size={size}
        variant="quiet"
        icon={icon}
        aria-label={wait === null ? label : `${label}: ${wait}`}
        data-testid={testId}
        loading={loading}
        disabled={wait !== null}
        onClick={onClick}
      />
    </span>
  );
}

function asked(d: RfiDetail, tz: string): string {
  return d.rfi.sent_at === null ? d.originator_name : `${d.originator_name} · Asked ${formatInZone(d.rfi.sent_at, tz, 'MMM d, yyyy')}`;
}

export function RfiHead({ detail, title, timeZone, onOpenWindow, onDownload, downloading, onView, isPhone }: RfiHeadProps) {
  const chip = statusChip(detail.rfi.status);
  const wait = pdfWait(detail.rfi);
  const size = isPhone ? 'md' : 'sm';
  return (
    <header className="border-b border-line px-5 pb-3.5 pt-3">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
        <Icon icon={FileQuestion} size={16} className="text-accent" />
        <span data-testid="rfi-label">{rfiLabel(detail.rfi.number)}</span>
        <span className="ml-1" data-testid="rfi-status">
          <StatusChip status={chip.status} label={chip.label} />
        </span>
        <span className="ml-auto flex items-center gap-0.5" data-testid="rfi-head-actions">
          {onOpenWindow ? <Action icon={ExternalLink} label="Open in new window" testId="rfi-pop-out" onClick={onOpenWindow} size={size} /> : null}
          <Action icon={Download} label="Download PDF" testId="rfi-pdf" onClick={onDownload} loading={downloading} wait={wait} size={size} />
          <Action icon={Eye} label="View PDF" testId="rfi-full-screen" onClick={onView} wait={wait} size={size} />
        </span>
      </div>
      <h1 className="mt-1 break-words text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink" data-testid="rfi-title-text">
        {title}
      </h1>
      <p className="mt-0.5 text-[13px] text-ink-2">{asked(detail, timeZone)}</p>
    </header>
  );
}

// The permit's approved set, for everyone who reads permits (migration 0053): the current stamped sheets, each one
// click to View in the file viewer (its pages, arrows through the set, Download there too) and one to download
// (lib/saveFile, the original filename), and the superseded sets under them, greyed. For the official, "Stamp and issue" (or, once issued, the quieter "Stamp
// revision") opens the stamp flow; the database says which (permit_approved.stamp).
import { Download, Eye, FileText, Stamp } from 'lucide-react';
import { downloadFile } from '../../data/download';
import { useApprovedViewUrl } from '../../data/permitStamp.mutations';
import { usePermitApproved } from '../../data/permitStamp.queries';
import type { ApprovedSet as ApprovedSetRow, StampMode } from '../../data/permitStamp.types';
import { formatBytes } from '../../lib/format';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { useFileViewer, type ViewerItem } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { LoadingState } from '../../ui/States';
import { useDownload } from '../files/useDownload';
import { stampLabel } from './stamp';

const HEADING = 'text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-ink-3';

interface SetCardProps {
  permitId: string;
  set: ApprovedSetRow;
  timeZone: string;
  isPhone: boolean;
}

function SetCard({ permitId, set, timeZone, isPhone }: SetCardProps) {
  const download = useDownload();
  const viewUrl = useApprovedViewUrl();
  const viewer = useFileViewer();
  // A stamped sheet is a PDF the server made; the viewer walks this set's sheets.
  const items: ViewerItem[] = set.files.map((f) => ({
    id: f.file_id,
    name: f.name,
    kind: 'pdf',
    url: () => viewUrl(permitId, f.file_id),
    download: () => downloadFile(f.file_id, f.size),
  }));
  const old = set.superseded_at !== null;
  const size = isPhone ? 'md' : 'sm';
  const when = formatInZone(old && set.superseded_at ? set.superseded_at : set.stamped_at, timeZone, 'MMM d, yyyy');
  return (
    <div
      className={`rounded-lg border border-line ${old ? 'bg-card-head text-ink-3' : 'bg-card'}`}
      data-testid={old ? 'permit-approved-old' : 'permit-approved-current'}
    >
      <p className="px-3 pt-2 text-[12.5px] leading-5 text-ink-3">
        {old ? `Superseded ${when}` : `Stamped ${when} · ${set.stamped_by_name}`}
        {set.note ? ` · ${set.note}` : ''}
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {set.files.map((f, i) => (
          <li key={f.file_id} className="flex items-center gap-2 px-3 py-1.5" data-testid="permit-approved-file">
            <Icon icon={FileText} size={16} className={old ? 'shrink-0' : 'shrink-0 text-accent'} />
            <span className={`min-w-0 flex-1 break-words text-[13.5px] leading-5 ${old ? '' : 'text-ink'}`}>{f.name}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{formatBytes(f.size)}</span>
            <Button
              size={size}
              variant="quiet"
              icon={Eye}
              aria-label={`View ${f.name}`}
              title="View"
              data-testid="permit-approved-view"
              onClick={() => {
                viewer.open(items, i);
              }}
            />
            <Button
              size={size}
              variant="quiet"
              icon={Download}
              aria-label={`Download ${f.name}`}
              title="Download"
              data-testid="permit-approved-download"
              loading={download.pendingId === f.file_id}
              onClick={() => {
                download.start(f.file_id, f.size);
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ApprovedSetProps {
  permitId: string;
  timeZone: string;
  isPhone: boolean;
  onStamp: (mode: StampMode) => void;
}

export function ApprovedSet({ permitId, timeZone, isPhone, onStamp }: ApprovedSetProps) {
  const approved = usePermitApproved(permitId);
  if (approved.isPending) {
    return (
      <section className="flex flex-col gap-1.5" data-testid="permit-approved" aria-busy>
        <h2 className={HEADING}>Approved set</h2>
        <LoadingState label="Loading the approved set" />
      </section>
    );
  }
  if (approved.isError) {
    return (
      <section className="flex flex-col gap-1.5" data-testid="permit-approved">
        <h2 className={HEADING}>Approved set</h2>
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          The approved set did not load.
          <Button size="sm" variant="quiet" onClick={() => void approved.refetch()}>
            Retry
          </Button>
        </p>
      </section>
    );
  }
  const { stamp, sets } = approved.data;
  if (sets.length === 0 && stamp === null) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="permit-approved">
      <div className="flex items-center justify-between gap-2">
        <h2 className={HEADING}>Approved set</h2>
        {stamp ? (
          <Button
            variant={stamp === 'issue' ? 'primary' : 'secondary'}
            size={isPhone ? 'md' : 'sm'}
            icon={Stamp}
            data-testid="permit-stamp"
            onClick={() => {
              onStamp(stamp);
            }}
          >
            {stampLabel(stamp)}
          </Button>
        ) : null}
      </div>
      {sets.map((s) => (
        <SetCard key={s.set_no} permitId={permitId} set={s} timeZone={timeZone} isPhone={isPhone} />
      ))}
    </section>
  );
}

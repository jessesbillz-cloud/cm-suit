// Received bids (SPEC §11.4, §11.6), shown only once bids are open. The office drops files or a whole folder here
// (or uses "Add bids"); each file lands in "Bids received" and becomes a receipt. "Read all" drafts findings for
// every unread bid. Rows: package code, bidder (sub, else what the reading found, else the file name), receipt, time.
import { useRef, useState, type DragEvent } from 'react';
import { ScanText, Upload } from 'lucide-react';
import { useReadAll } from '../../data/bidIntake';
import {
  useBidExtractions,
  useBidPackages,
  useBidSubmissions,
  useFindingsAccess,
  usePricingAccess,
  useReceivedFiles,
  useSubNames,
} from '../../data/bids.queries';
import type { SubmissionRow } from '../../data/bids.types';
import { useLevelingBoard } from '../../data/leveling.queries';
import { messageOf } from '../../data/errors';
import { useFolders, useOrgSettings, usePeopleDisplay } from '../../data/queries';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { TOOL_META } from '../../ui/tools';
import { useToast } from '../../ui/Toast';
import { collectDrop } from '../files/collectDrop';
import { UploadList } from '../files/UploadList';
import { BidList } from './BidList';
import { IntakePicks } from './IntakePicks';
import { bidderName, isUnread, readChip } from './model';
import { useIntake } from './useIntake';
import { StepUp } from '../auth/StepUp';

interface ReceivedViewProps {
  projectId: string;
  orgId: string;
  tz: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

function progressText(p: { done: number; total: number; failed: number; lastError: string | null }): string {
  if (p.done < p.total) return `Reading ${String(p.done + 1)} of ${String(p.total)}`;
  if (p.failed === 0) return `${String(p.total)} read`;
  return `${String(p.total - p.failed)} read, ${String(p.failed)} not: ${p.lastError ?? 'unknown error'}`;
}

export function ReceivedView({ projectId, orgId, tz, selectedId, onOpen }: ReceivedViewProps) {
  const subs = useBidSubmissions(projectId, true);
  const packages = useBidPackages(projectId);
  const people = usePeopleDisplay(projectId);
  const folders = useFolders(projectId);
  const folderId = folders.data?.find((f) => f.kind === 'bids_received')?.id ?? null;
  const files = useReceivedFiles(projectId, folderId);
  const extractions = useBidExtractions(projectId, true);
  const board = useLevelingBoard(projectId, true);
  const subNames = useSubNames(orgId);
  const pricing = usePricingAccess(projectId);
  const findings = useFindingsAccess(projectId);
  const readAll = useReadAll();
  const intake = useIntake({ projectId, folderId, packages: packages.data, files: files.data, submissions: subs.data });
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const canAdd = pricing.data === 'yes' && intake.ready;
  const canRead = findings.data === 'yes';
  const aiSettings = useOrgSettings(orgId);
  const aiOn = aiSettings.data?.ai_bid_reading === true;
  const twoFactor = pricing.data === 'two_factor' || findings.data === 'two_factor';

  const code = (id: string) => packages.data?.find((p) => p.id === id)?.code ?? '';
  // The package the bid is under now: leveling may have moved it from the one it was filed under.
  const packageOf = (s: SubmissionRow) => board.data?.find((r) => r.submission_id === s.id)?.package_id ?? s.package_id;
  const extractionOf = (s: SubmissionRow) => extractions.data?.find((x) => x.submission_id === s.id);
  const fileOf = (s: SubmissionRow) => files.data?.find((f) => f.id === s.file_id);
  const who = (s: SubmissionRow): string => {
    if (s.member_id !== null) return bidderName(people.data?.find((x) => x.member_id === s.member_id));
    const sub = s.sub_id === null ? undefined : subNames.data?.find((x) => x.id === s.sub_id);
    return sub?.company ?? extractionOf(s)?.bidder_name ?? fileOf(s)?.original_name ?? 'Received bid';
  };
  const unread = (subs.data ?? []).filter((s) => isUnread(extractionOf(s), fileOf(s)?.text_status));

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!canAdd) return;
    collectDrop(e.dataTransfer)
      .then(intake.add)
      .catch((err: unknown) => {
        toast.show({ tone: 'error', message: `Could not read what was dropped: ${messageOf(err)}` });
      });
  };

  const actions = (
    <>
      {readAll.progress ? <span className="text-sm text-ink-2" data-testid="bids-read-progress">{progressText(readAll.progress)}</span> : null}
      {canRead && aiOn ? (
        <Button
          size="sm"
          icon={ScanText}
          data-testid="bids-read-all"
          loading={readAll.isRunning}
          disabled={unread.length === 0}
          onClick={() => {
            void readAll.start(projectId, orgId, unread);
          }}
        >
          Read all
        </Button>
      ) : null}
      {canAdd ? (
        <>
          <Button
            size="sm"
            variant="primary"
            icon={Upload}
            data-testid="bids-add"
            onClick={() => {
              input.current?.click();
            }}
          >
            Add bids
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            data-testid="bids-add-input"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = '';
              if (picked.length > 0) intake.add(picked);
            }}
          />
        </>
      ) : null}
    </>
  );

  return (
    // No header bar at all when there is nothing to put in it.
    <Card actions={readAll.progress !== null || (canRead && aiOn) || canAdd ? actions : undefined} padded={false}>
      {twoFactor ? (
        <div className="px-4 pt-3">
          <StepUp />
        </div>
      ) : null}
      <div
        data-testid="bids-drop"
        className={`min-h-40 ${dragging ? 'bg-accent-soft outline-dashed outline-2 -outline-offset-4 outline-accent' : ''}`}
        onDragOver={(e) => {
          if (!canAdd) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        {packages.data ? <IntakePicks picks={intake.picks} packages={packages.data} onPick={intake.pick} /> : null}
        {folderId !== null ? <UploadList folderId={folderId} /> : null}
        {subs.isPending ? <LoadingState label="Loading bids" /> : null}
        {subs.isError ? <ErrorState error={subs.error} onRetry={() => void subs.refetch()} /> : null}
        {files.isError ? <ErrorState error={files.error} onRetry={() => void files.refetch()} /> : null}
        {extractions.isError ? <ErrorState error={extractions.error} onRetry={() => void extractions.refetch()} /> : null}
        {subs.data?.length === 0 ? (
          <EmptyState title="No bids received." icon={TOOL_META.bids.icon} hint={canAdd ? 'Drop bid files or a folder here.' : undefined} />
        ) : null}
        {subs.data && subs.data.length > 0 ? (
          <BidList
            testId="received"
            selectedId={selectedId}
            onOpen={onOpen}
            rows={subs.data.map((s) => {
              const chip = readChip(extractionOf(s), fileOf(s)?.text_status);
              return {
                id: s.id,
                lead: code(packageOf(s)),
                title: `${who(s)} · #${String(s.receipt_number)}`,
                chips: (
                  <>
                    {s.version_no > 1 ? <span className="text-xs text-ink-2">v{s.version_no}</span> : null}
                    {s.is_late ? <StatusChip status="postponed" label="Late" /> : null}
                    {canRead ? <StatusChip status={chip.status} label={chip.label} /> : null}
                  </>
                ),
                meta: formatInZone(s.received_at, tz, 'MMM d h:mm a'),
              };
            })}
          />
        ) : null}
      </div>
    </Card>
  );
}

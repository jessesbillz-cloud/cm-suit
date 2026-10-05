// One permit in the right column (full screen on the phone, or alone in its own window), the substance at once with no
// extra taps (Jesse, Sep 30): the number and the whole title, its facts, the approved set (the stamped sheets, and the
// official's "Stamp and issue", which opens the stamp flow in place of the page), the tracker with the days at each
// stage and the official's moves, its review cycles with their comments and answers, the inspections for it and its
// rev lists (how many walls are done, a tap opens Revs). The stage history shows in the full view (its own window, the
// right column at full width, or the phone).
import { useState } from 'react';
import { usePermitDetail } from '../../data/permits.queries';
import type { StampMode } from '../../data/permitStamp.types';
import { PaneSection } from '../../ui/ReadingPane';
import { ErrorState, LoadingState } from '../../ui/States';
import { ApprovedSet } from './ApprovedSet';
import { PermitHistory } from './PermitExtras';
import { PermitEdit } from './PermitEdit';
import { PermitFacts, PermitHead } from './PermitHead';
import { PermitInspections } from './PermitInspections';
import { PermitMoves } from './PermitMoves';
import { PermitReviews } from './PermitReviews';
import { PermitRevs } from './PermitRevs';
import { PermitSteps } from './PermitSteps';
import { StampFlow } from './StampFlow';

interface PermitPaneProps {
  itemId: string;
  /** Opened from the caseload (All my jobs): name the job. */
  showJob: boolean;
  /** The full view: its own window, the right column at full width, or the phone. */
  full: boolean;
  isPhone: boolean;
  onOpenWindow?: (() => void) | undefined;
}

export function PermitPane({ itemId, showJob, full, isPhone, onOpenWindow }: PermitPaneProps) {
  const detail = usePermitDetail(itemId);
  const [editing, setEditing] = useState(false);
  // The official's stamp flow, in place of the page while it is open.
  const [stamping, setStamping] = useState<StampMode | null>(null);

  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  if (detail.isPending) return <LoadingState label="Loading the permit" />;

  const d = detail.data;
  const now = new Date();
  return (
    <article className="flex h-full flex-col" data-testid="permit-pane">
      <PermitHead detail={d} showJob={showJob} onOpenWindow={onOpenWindow} isPhone={isPhone} />
      <div className="flex flex-1 flex-col gap-4 overflow-auto px-5 py-4 text-sm leading-6 text-ink">
        {stamping ? (
          <StampFlow
            detail={d}
            mode={stamping}
            isPhone={isPhone}
            onClose={() => {
              setStamping(null);
            }}
          />
        ) : editing ? (
          <PermitEdit
            key={d.permit.version}
            detail={d}
            onDone={() => {
              setEditing(false);
            }}
          />
        ) : (
          <PermitFacts
            detail={d}
            now={now}
            onEdit={
              d.can.manage
                ? () => {
                    setEditing(true);
                  }
                : undefined
            }
          />
        )}
        {stamping ? null : (
          <>
            <ApprovedSet permitId={d.permit.id} timeZone={d.timezone} isPhone={isPhone} onStamp={setStamping} />
            <PaneSection title="Stages" testId="permit-tracker">
              {/* Alone in its own window (desktop) there is room for one row; the right column and a phone take two. */}
              <PermitSteps steps={d.steps} timeZone={d.timezone} size="sm" layout={full && !isPhone ? 'one' : 'split'} />
              <PermitMoves detail={d} />
            </PaneSection>
            <PermitReviews detail={d} />
            <PermitInspections detail={d} />
            <PermitRevs projectId={d.permit.project_id} permitId={d.permit.id} />
            {full ? <PermitHistory events={d.events} timeZone={d.timezone} /> : null}
          </>
        )}
      </div>
    </article>
  );
}

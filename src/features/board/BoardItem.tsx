// A board line opened in the right column (or full screen on the phone, or its own window) shows THE RECORD the line
// is about, never the line again: what it is, which job, when, its facts, and its actions (download here, or open it
// where it lives through lib/entityTarget). My tasks about it get Done in place when "Needs you" isn't on screen
// beside it. Arrow keys walk the board.
import { useMemo, type JSX } from 'react';
import { MessagesSquare } from 'lucide-react';
import { useOpenTarget } from '../../app/frame/useOpenTarget';
import { useActivity, useBoardFeed, useMyProjects, usePeopleDisplay, useTasks } from '../../data/queries';
import type { ActivityRow } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { commentEntity, entityTarget } from '../../lib/entityTarget';
import { humanize } from '../../lib/format';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { EntityPane, Facts, type ItemFrame, type KindProps } from './EntityPane';
import { AddendumEntity, AnswerEntity, QuestionEntity } from './kinds/BidEntities';
import { CorrectionEntity } from './kinds/CorrectionEntity';
import { DailyEntity } from './kinds/DailyEntity';
import { DeliveryEntity } from './kinds/DeliveryEntity';
import { FileEntity } from './kinds/FileEntity';
import { InspectionEntity } from './kinds/InspectionEntity';
import { RfiEntity } from './kinds/RfiEntity';
import { useProjectZones } from './zones';

interface BoardItemProps {
  activityId: string;
  /** The board the item was opened from (null = all my jobs): prev/next walk that list. */
  boardProjectId: string | null;
  onNavigate: (activityId: string) => void;
  onOpenWindow?: (() => void) | undefined;
  /** Its full view (full width, its own window, the phone): my tasks about the record, with Done, and its comments. Off
   *  beside the board, whose "Needs you" already shows the tasks. */
  showTasks: boolean;
}

type Kind = (props: KindProps) => JSX.Element;

/** activity.entity_type -> the pane that shows that record. */
const KINDS: Record<string, Kind> = {
  file: FileEntity,
  inspection_request: InspectionEntity,
  delivery: DeliveryEntity,
  correction: CorrectionEntity,
  daily_report: DailyEntity,
  addendum: AddendumEntity,
  bid_question: QuestionEntity,
  published_answer: AnswerEntity,
  rfi: RfiEntity,
};

/** A line about nothing the board can show (a member joined, a note): its own words, who, and Open when a tool owns it. */
function OtherEntity({ frame, line }: { frame: ItemFrame; line: ActivityRow }) {
  const people = usePeopleDisplay(frame.projectId);
  const by = people.data?.find((p) => p.user_id !== null && p.user_id === line.actor_user_id)?.full_name ?? null;
  return (
    <EntityPane frame={frame} label={humanize(line.kind)} title={line.summary}>
      <Facts rows={[['By', by]]} />
    </EntityPane>
  );
}

function useNeighbors(boardProjectId: string | null, activityId: string) {
  const feed = useBoardFeed(boardProjectId);
  return useMemo(() => {
    const ids = (feed.data?.pages.flat() ?? []).map((l) => l.id);
    const i = ids.indexOf(activityId);
    return { prev: i > 0 ? ids[i - 1] : undefined, next: i >= 0 ? ids[i + 1] : undefined };
  }, [feed.data, activityId]);
}

export function BoardItem({ activityId, boardProjectId, onNavigate, onOpenWindow, showTasks }: BoardItemProps) {
  const item = useActivity(activityId);
  const { prev, next } = useNeighbors(boardProjectId, activityId);
  const projects = useMyProjects();
  const tasks = useTasks(item.data?.project_id ?? boardProjectId);
  const zoneOf = useProjectZones();
  const openTarget = useOpenTarget();

  if (item.isPending) return <LoadingState />;
  if (item.isError) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
  if (item.data === null) return <EmptyState title="This line is no longer on your board." />;

  const a = item.data;
  const zone = zoneOf(a.project_id);
  const jobName = projects.data?.find((p) => p.project_id === a.project_id)?.name ?? '';
  const target = entityTarget(a.entity_type, a.entity_id);
  // The record takes comments where it lives (lib/entityTarget's one mapping): the same thread shows here.
  const commentType = target && target.itemId !== null ? commentEntity(target.tool) : null;
  const comments =
    showTasks && commentType !== null && commentType === a.entity_type && target?.itemId
      ? { projectId: a.project_id, entityType: commentType, entityId: target.itemId }
      : null;
  const frame: ItemFrame = {
    projectId: a.project_id,
    zone,
    meta: [jobName, formatInZone(a.created_at, zone, 'EEE, MMM d, h:mm a')].filter((s) => s !== '').join(' · '),
    icon: target ? TOOL_META[target.tool].icon : MessagesSquare,
    open: target
      ? {
          label: `Open in ${TOOL_META[target.tool].label}`,
          // Back in the top bar returns to this line (Jesse, Oct 5: "it doesn't allow me to get back to that original view").
          go: (extra) => {
            openTarget(a.project_id, target, { ...extra, back: '1' });
          },
        }
      : null,
    tasks: showTasks
      ? (tasks.data ?? []).filter((t) => a.entity_type !== null && t.entity_type === a.entity_type && t.entity_id === a.entity_id)
      : [],
    comments,
    onPrev: prev
      ? () => {
          onNavigate(prev);
        }
      : undefined,
    onNext: next
      ? () => {
          onNavigate(next);
        }
      : undefined,
    onOpenWindow,
  };

  const Pane = a.entity_type === null ? undefined : KINDS[a.entity_type];
  if (Pane && a.entity_id) return <Pane frame={frame} id={a.entity_id} />;
  return <OtherEntity frame={frame} line={a} />;
}

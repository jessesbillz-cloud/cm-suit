// One meeting (beside the list; the phone's full screen): which meeting, open or closed, the day, who leads it, where;
// while open and mine to lead, the big QR for the crew; what to read out; who signed in (live while open); the job's
// people to tick in; and the one action at the bottom (Close, then Download sheet).
import { useProject } from '../../data/queries';
import { useSafetyMeeting, useSafetyRoster } from '../../data/safety.queries';
import type { Meeting } from '../../data/safety.types';
import { formatDay } from '../../lib/dates';
import { meetingLabel } from '../../lib/safety';
import { ErrorState, LoadingState } from '../../ui/States';
import { MeetingActions } from './MeetingActions';
import { MeetingQr } from './MeetingQr';
import { MeetingStatus } from './MeetingsView';
import { Roster } from './Roster';
import { TickIn } from './TickIn';
import { TopicOutline } from './TopicOutline';

interface MeetingPaneProps {
  projectId: string;
  meetingId: string;
}

function Head({ meeting }: { meeting: Meeting }) {
  const facts = [formatDay(meeting.held_on, 'EEE, MMM d'), meeting.leader_name, meeting.location].filter((x) => x.trim() !== '');
  return (
    <header className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3" data-testid="safety-meeting-label">
          {meetingLabel(meeting.kind, meeting.number)}
        </span>
        <MeetingStatus status={meeting.status} />
      </div>
      <h1 className="break-words text-[19px] font-semibold leading-7 tracking-[-0.01em] text-ink" data-testid="safety-meeting-title">
        {meeting.title}
      </h1>
      <p className="text-[13px] text-ink-2">{facts.join(' · ')}</p>
    </header>
  );
}

function pdfOf(m: Meeting): { fileId: string } | { topicId: string } | null {
  if (m.file_id) return { fileId: m.file_id };
  return m.topic_file && m.topic_id ? { topicId: m.topic_id } : null;
}

export function MeetingPane({ projectId, meetingId }: MeetingPaneProps) {
  const meeting = useSafetyMeeting(projectId, meetingId);
  const open = meeting.data ? meeting.data.status === 'open' : null;
  const roster = useSafetyRoster(projectId, meetingId, open);
  const project = useProject(projectId);
  if (meeting.isError) return <ErrorState error={meeting.error} onRetry={() => void meeting.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (meeting.isPending || project.isPending) return <LoadingState label="Loading the meeting" />;
  const m = meeting.data;
  const job = project.data;
  const lead = open === true && m.can_lead;
  const lines = roster.data ?? [];

  return (
    <div className="flex min-h-full flex-col" data-testid="safety-meeting" data-status={m.status}>
      <div className="flex flex-1 flex-col gap-5 px-5 py-4">
        <Head meeting={m} />
        {lead ? <MeetingQr projectId={projectId} meeting={m} jobName={job.name} /> : null}
        <TopicOutline projectId={projectId} outline={m} pdf={pdfOf(m)} />
        {roster.isError ? <ErrorState error={roster.error} onRetry={() => void roster.refetch()} className="m-0" /> : null}
        {roster.isPending ? <LoadingState label="Loading who signed in" /> : null}
        {roster.isSuccess ? (
          <Roster projectId={projectId} lines={lines} timeZone={job.timezone} canRemove={lead} />
        ) : null}
        {lead && roster.isSuccess ? <TickIn projectId={projectId} meetingId={m.id} lines={lines} /> : null}
      </div>
      <MeetingActions projectId={projectId} meeting={m} />
    </div>
  );
}

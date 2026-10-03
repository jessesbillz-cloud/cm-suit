// The Safety tool's right column (the phone's full screen): a new meeting (whoever may lead one), a new topic (whoever
// keeps the library), a library topic (`topic-<id>`), or a meeting. What shows is decided by has_capability.
import type { ReactNode } from 'react';
import { useCapability, useProject } from '../../data/queries';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { MeetingPane } from './MeetingPane';
import { NEW_ITEM, NEW_TOPIC_ITEM, topicIdOf, topicItemId } from './model';
import { NewMeeting } from './NewMeeting';
import { TopicForm } from './TopicForm';
import { TopicPane } from './TopicPane';
import { useSafetyNav } from './useSafetyNav';

interface SafetyItemProps {
  projectId: string;
  itemId: string;
  isPhone: boolean;
}

function Needs({ projectId, cap, what, children }: { projectId: string; cap: string; what: string; children: (orgId: string) => ReactNode }) {
  const can = useCapability(projectId, cap);
  const project = useProject(projectId);
  const failed = can.isError ? can : project.isError ? project : null;
  if (failed) return <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  if (can.isPending || !project.data) return <LoadingState />;
  if (!can.data) {
    return (
      <Card>
        <EmptyState title={`You can't ${what} on this job.`} />
      </Card>
    );
  }
  return children(project.data.org_id);
}

export function SafetyItem({ projectId, itemId }: SafetyItemProps) {
  const nav = useSafetyNav(projectId);
  if (itemId === NEW_ITEM) {
    return (
      <Needs projectId={projectId} cap="safety.run" what="start meetings">
        {(orgId) => <NewMeeting projectId={projectId} orgId={orgId} onStarted={(id) => { nav.open(id, true); }} />}
      </Needs>
    );
  }
  if (itemId === NEW_TOPIC_ITEM) {
    return (
      <Needs projectId={projectId} cap="safety.manage" what="add topics">
        {(orgId) => <TopicForm projectId={projectId} orgId={orgId} topic={null} onSaved={(id) => { nav.open(topicItemId(id), true); }} />}
      </Needs>
    );
  }
  const topicId = topicIdOf(itemId);
  if (topicId !== null) {
    return <TopicItem projectId={projectId} topicId={topicId} onClose={nav.close} />;
  }
  return <MeetingPane key={itemId} projectId={projectId} meetingId={itemId} />;
}

function TopicItem({ projectId, topicId, onClose }: { projectId: string; topicId: string; onClose: () => void }) {
  const manage = useCapability(projectId, 'safety.manage');
  return (
    <Needs projectId={projectId} cap="safety.read" what="see the library">
      {(orgId) => <TopicPane key={topicId} projectId={projectId} orgId={orgId} topicId={topicId} canManage={manage.data === true} onClose={onClose} />}
    </Needs>
  );
}

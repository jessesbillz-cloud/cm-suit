// The right column for the bids tool: what opens depends on the sub-view (from the URL) and the row id.
import { AddendumPane } from './AddendumPane';
import { InviteBiddersForm } from './InviteBiddersForm';
import { LevelingPane } from './LevelingPane';
import { INVITE_ITEM } from './model';
import { PackageForm } from './PackageForm';
import { PackageInvites } from './PackageInvites';
import { QuestionPane } from './QuestionPane';
import { SubmissionPane } from './SubmissionPane';
import { useBidsNav } from './useBidsNav';

interface BidsItemProps {
  projectId: string;
  itemId: string;
}

export function BidsItem({ projectId, itemId }: BidsItemProps) {
  const { view } = useBidsNav(projectId);
  if (itemId === INVITE_ITEM) return <InviteBiddersForm projectId={projectId} />;
  switch (view) {
    case 'coverage':
      return <PackageInvites key={itemId} projectId={projectId} packageId={itemId} />;
    case 'packages':
      return <PackageForm key={itemId} projectId={projectId} packageId={itemId} />;
    case 'questions':
      return <QuestionPane key={itemId} projectId={projectId} questionId={itemId} />;
    case 'addenda':
      return <AddendumPane key={itemId} projectId={projectId} addendumId={itemId} />;
    case 'received':
      return <SubmissionPane key={itemId} projectId={projectId} submissionId={itemId} />;
    case 'leveling':
      return <LevelingPane key={itemId} projectId={projectId} submissionId={itemId} />;
    case 'summary':
      // Summary rows open the leveling grid for that package; nothing opens on the right.
      return null;
  }
}

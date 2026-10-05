// The right column for the bids tool: what opens depends on the sub-view (from the URL) and the row id.
import { AddendumPane } from './AddendumPane';
import { AddFormPane } from './AddFormPane';
import { AddSubForm } from './AddSubForm';
import { InviteBiddersForm } from './InviteBiddersForm';
import { FormPane } from './FormPane';
import { NEW_FORM_ITEM } from './forms';
import { LevelingPane } from './LevelingPane';
import { INVITE_ITEM, NEW_SUB_ITEM } from './model';
import { PackageForm } from './PackageForm';
import { PackageInvites } from './PackageInvites';
import { QuestionPane } from './QuestionPane';
import { SubmissionPane } from './SubmissionPane';
import { SubPane } from './SubPane';
import { useBidsNav } from './useBidsNav';

interface BidsItemProps {
  projectId: string;
  itemId: string;
}

export function BidsItem({ projectId, itemId }: BidsItemProps) {
  const { view, pkg, open } = useBidsNav(projectId);
  if (itemId === INVITE_ITEM) return <InviteBiddersForm key={pkg ?? ''} projectId={projectId} packageId={pkg} />;
  switch (view) {
    case 'coverage':
      return <PackageInvites key={itemId} projectId={projectId} packageId={itemId} />;
    case 'packages':
      return <PackageForm key={itemId} projectId={projectId} packageId={itemId} />;
    case 'subs':
      return itemId === NEW_SUB_ITEM ? (
        <AddSubForm projectId={projectId} onAdded={open} />
      ) : (
        <SubPane key={itemId} projectId={projectId} subId={itemId} />
      );
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
    case 'forms':
      return itemId === NEW_FORM_ITEM ? (
        <AddFormPane projectId={projectId} />
      ) : (
        <FormPane key={itemId} projectId={projectId} itemId={itemId} />
      );
  }
}

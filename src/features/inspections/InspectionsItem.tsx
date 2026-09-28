// The right column for inspections: a new request, blocked time, or one request.
import { BlockForm } from './BlockForm';
import { BLOCK_ITEM, NEW_ITEM } from './model';
import { RequestForm } from './RequestForm';
import { RequestPane } from './RequestPane';

interface InspectionsItemProps {
  projectId: string;
  itemId: string;
  onOpenWindow?: (() => void) | undefined;
}

export function InspectionsItem({ projectId, itemId, onOpenWindow }: InspectionsItemProps) {
  if (itemId === NEW_ITEM) return <RequestForm projectId={projectId} />;
  if (itemId === BLOCK_ITEM) return <BlockForm projectId={projectId} />;
  return <RequestPane key={itemId} projectId={projectId} requestId={itemId} onOpenWindow={onOpenWindow} />;
}

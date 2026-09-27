// Dailies (SPEC §13.1). The tool's entry point in the main area; replaced by the dailies build.
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';

interface DailiesToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

export function DailiesTool({ projectId }: DailiesToolProps) {
  return (
    <Card key={projectId} title="Dailies">
      <EmptyState title="Nothing here yet." />
    </Card>
  );
}

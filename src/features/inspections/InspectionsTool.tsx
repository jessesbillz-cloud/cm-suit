// Inspections (SPEC §13.2). The tool's entry point in the main area; replaced by the inspections build.
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';

interface InspectionsToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

export function InspectionsTool({ projectId }: InspectionsToolProps) {
  return (
    <Card key={projectId} title="Inspections">
      <EmptyState title="Nothing here yet." />
    </Card>
  );
}

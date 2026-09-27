// Corrections (SPEC §13.4). The tool's entry point in the main area; replaced by the corrections build.
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';

interface CorrectionsToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

export function CorrectionsTool({ projectId }: CorrectionsToolProps) {
  return (
    <Card key={projectId} title="Corrections">
      <EmptyState title="Nothing here yet." />
    </Card>
  );
}

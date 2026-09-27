// Deliveries (SPEC §13.3). The tool's entry point in the main area; replaced by the deliveries build.
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';

interface DeliveriesToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

export function DeliveriesTool({ projectId }: DeliveriesToolProps) {
  return (
    <Card key={projectId} title="Deliveries">
      <EmptyState title="Nothing here yet." />
    </Card>
  );
}

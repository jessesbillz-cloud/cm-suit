// Calendar (SPEC §7.6, §12.3). The tool's entry point in the main area; replaced by the calendar build.
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';

interface CalendarToolProps {
  projectId: string | null;
  itemId: string | null;
  isPhone: boolean;
}

export function CalendarTool({ projectId }: CalendarToolProps) {
  return (
    <Card title="Calendar">
      <EmptyState title={projectId === null ? 'Nothing yet.' : 'Nothing here yet.'} />
    </Card>
  );
}

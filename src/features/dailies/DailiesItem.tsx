// The right column (full screen on the phone) for the dailies tool: the setup, or one report.
import { useIsPhone } from '../../app/frame/useIsPhone';
import { SETUP_ITEM } from './model';
import { ReportScreen } from './ReportScreen';
import { SetupForm } from './SetupForm';

interface DailiesItemProps {
  projectId: string;
  itemId: string;
}

export function DailiesItem({ projectId, itemId }: DailiesItemProps) {
  const isPhone = useIsPhone();
  if (itemId === SETUP_ITEM) return <SetupForm projectId={projectId} />;
  return <ReportScreen key={itemId} projectId={projectId} reportId={itemId} isPhone={isPhone} />;
}

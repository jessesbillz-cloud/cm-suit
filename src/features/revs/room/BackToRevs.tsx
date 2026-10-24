// Back from a room's page to the inspection cards, on that room's level (a desktop's: a phone's screen has its own Back).
import { ChevronLeft } from 'lucide-react';
import { Icon } from '../../../ui/Icon';
import { useRevsNav } from '../useRevsNav';

export function BackToRevs({ projectId, canManage, level }: { projectId: string; canManage: boolean; level: string | undefined }) {
  const nav = useRevsNav(projectId, canManage);
  return (
    <button
      type="button"
      className="-ml-1 flex h-8 items-center gap-0.5 self-start text-sm font-medium text-accent"
      data-testid="rev-room-back"
      onClick={() => {
        nav.close(level);
      }}
    >
      <Icon icon={ChevronLeft} size={16} />
      Inspection cards
    </button>
  );
}

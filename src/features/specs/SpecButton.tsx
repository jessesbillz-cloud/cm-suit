// "Spec 09 29 00" on a submittal (Jesse, Oct 12: "There's no reason I should have to go through three or four locations
// to look up the spec section associated with a submittal"): one click opens the spec book at that section's first
// page. SpecButton sits in a pane's footer; SpecViewerBar sits over the submittal's pages in the full-screen viewer.
import { BookOpen } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useOpenSpec } from './useOpenSpec';

interface SpecButtonProps {
  projectId: string;
  section: string;
}

export function SpecButton({ projectId, section }: SpecButtonProps) {
  const open = useOpenSpec(projectId);
  return (
    <Button
      icon={BookOpen}
      data-testid="spec-button"
      onClick={() => {
        open({ section });
      }}
    >
      Spec {section}
    </Button>
  );
}

export function SpecViewerBar({ projectId, section }: SpecButtonProps) {
  const open = useOpenSpec(projectId);
  return (
    <div className="flex shrink-0 border-b border-white/10 px-2 py-2 md:px-4">
      <button
        type="button"
        data-testid="spec-button"
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        onClick={() => {
          open({ section });
        }}
      >
        <Icon icon={BookOpen} size={18} />
        Spec {section}
      </button>
    </div>
  );
}

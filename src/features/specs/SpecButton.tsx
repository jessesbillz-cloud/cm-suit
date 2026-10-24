// "Spec 09 29 00" on a submittal (Jesse, Oct 12: "There's no reason I should have to go through three or four locations
// to look up the spec section associated with a submittal"): one click opens the section in the spec reader, its text
// with its submittals, RFIs and CCDs under it (0118). SpecButton sits in a pane's footer; SpecViewerBar sits over the
// submittal's pages in the full-screen viewer, which is outside the router, so its caller hands it the action.
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

const DARK =
  'inline-flex h-10 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';

interface ViewerBarProps {
  section: string;
  onSpec: () => void;
}

export function SpecViewerBar({ section, onSpec }: ViewerBarProps) {
  return (
    <div className="flex shrink-0 gap-2 border-b border-white/10 px-2 py-2 md:px-4">
      <button type="button" data-testid="spec-button" className={DARK} onClick={onSpec}>
        <Icon icon={BookOpen} size={18} />
        Spec {section}
      </button>
    </div>
  );
}

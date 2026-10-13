// "Spec 09 29 00" on a submittal (Jesse, Oct 12: "There's no reason I should have to go through three or four locations
// to look up the spec section associated with a submittal"): one click opens the spec book at that section's first
// page. Beside it, Related opens the section's page in Files: its submittals, RFIs and CCDs (Jesse, Oct 12: "click a
// spec section and say show me all the RFIs and submittals associated with this"). SpecButton sits in a pane's footer;
// SpecViewerBar sits over the submittal's pages in the full-screen viewer, which is outside the router, so its caller
// hands it both actions.
import { BookOpen, Layers } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useOpenSpec } from './useOpenSpec';
import { useSpecHub } from './useSpecHub';

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

/** Related: the section's page in Files. */
export function SpecHubButton({ projectId, section }: SpecButtonProps) {
  const hub = useSpecHub(projectId);
  return (
    <Button
      icon={Layers}
      data-testid="spec-hub-open"
      aria-label={`Submittals and RFIs for ${section}`}
      title={`Submittals and RFIs for ${section}`}
      onClick={() => {
        hub(section);
      }}
    >
      Related
    </Button>
  );
}

const DARK =
  'inline-flex h-10 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';

interface ViewerBarProps {
  section: string;
  onSpec: () => void;
  onHub: () => void;
}

export function SpecViewerBar({ section, onSpec, onHub }: ViewerBarProps) {
  return (
    <div className="flex shrink-0 gap-2 border-b border-white/10 px-2 py-2 md:px-4">
      <button type="button" data-testid="spec-button" className={DARK} onClick={onSpec}>
        <Icon icon={BookOpen} size={18} />
        Spec {section}
      </button>
      <button
        type="button"
        data-testid="spec-hub-open"
        className={DARK}
        aria-label={`Submittals and RFIs for ${section}`}
        title={`Submittals and RFIs for ${section}`}
        onClick={onHub}
      >
        <Icon icon={Layers} size={18} />
        Related
      </button>
    </div>
  );
}

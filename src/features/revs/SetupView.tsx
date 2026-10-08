// Setup (revs.manage): the job's room pictures and old OFS IRs (added here, linked at once, 0094), then its lists, each
// pasted once from OSFM's legend, with its revs, items and walls, all editable in place with Undo. New list and Add
// walls open in the right column (full screen on the phone).
import { Plus } from 'lucide-react';
import type { RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { ListCard } from './ListCard';
import { RevFiles } from './room/RevFiles';
import { useSetupActions } from './useSetupActions';

interface SetupViewProps {
  projectId: string;
  setup: RevSetup;
  isPhone: boolean;
  onNewList: () => void;
}

export function SetupView({ projectId, setup, isPhone, onNewList }: SetupViewProps) {
  const actions = useSetupActions(projectId);
  if (setup.lists.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={TOOL_META.revs.icon}
          title="No lists yet."
          action={
            <Button variant="primary" icon={Plus} onClick={onNewList}>
              New list
            </Button>
          }
        />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="rev-setup">
      <RevFiles projectId={projectId} listIds={setup.lists.map((l) => l.id)} />
      {setup.lists.map((l) => (
        <ListCard key={l.id} projectId={projectId} list={l} setup={setup} actions={actions} isPhone={isPhone} />
      ))}
    </div>
  );
}

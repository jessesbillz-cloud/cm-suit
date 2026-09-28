// The holder's edit (a reviewer, or the PM / PE before issue): the same fields as writing it, saved as they type.
// Done saves what is left and goes back to reading.
import { Check } from 'lucide-react';
import type { RfiFileRef, RfiRow } from '../../data/rfis.types';
import { Button } from '../../ui/Button';
import { SaveState } from '../../ui/SaveState';
import { RfiEditor } from './RfiEditor';
import { useRfiDraft } from './useRfiDraft';

interface RfiEditProps {
  row: RfiRow;
  photos: readonly RfiFileRef[];
  isPhone: boolean;
  onDone: () => void;
}

export function RfiEdit({ row, photos, isPhone, onDone }: RfiEditProps) {
  const draft = useRfiDraft(row.project_id, row);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-accent/25 p-3" data-testid="rfi-edit-form">
      <RfiEditor draft={draft} photos={photos} isPhone={isPhone} autoFocus={false} />
      {draft.problem !== null ? (
        <p role="alert" className="text-sm text-danger">
          {draft.problem}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        <SaveState pending={draft.saving} saved={draft.justSaved} problem={null} />
        <Button
          variant="primary"
          icon={Check}
          disabled={draft.photos.busy}
          data-testid="rfi-edit-done"
          onClick={() => {
            void draft.flush().then(({ problem }) => {
              if (problem === null) onDone();
            });
          }}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

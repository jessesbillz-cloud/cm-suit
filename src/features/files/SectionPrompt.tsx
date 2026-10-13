// Before files go up into Submittals with no spec section in their names (Jesse, Oct 12: hard naming, "as long as the
// spec number is in the title"): one short list, a section for each, or one for all. Upload names each
// "<section>_<their name>"; Cancel or Escape sends nothing.
import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../../ui/Button';
import { SectionInput } from './SectionInput';
import { typedSection, type Unnamed } from './submittalNames';

interface SectionPromptProps {
  projectId: string;
  items: readonly Unnamed[];
  onDone: (keys: Map<number, string>) => void;
  onCancel: () => void;
}

export function SectionPrompt({ projectId, items, onDone, onCancel }: SectionPromptProps) {
  const [values, setValues] = useState<ReadonlyMap<number, string>>(() => new Map(items.map((i) => [i.at, i.offered])));
  const [same, setSame] = useState(false);
  const first = items[0];
  const valueOf = (at: number) => (same && first ? values.get(first.at) : values.get(at)) ?? '';
  const keys = new Map<number, string>();
  for (const i of items) {
    const key = typedSection(valueOf(i.at));
    if (key !== null) keys.set(i.at, key);
  }
  const ready = keys.size === items.length;
  const shown = same && first ? [first] : items;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Spec section"
        data-testid="section-prompt"
        className="flex max-h-[85dvh] w-full max-w-lg flex-col gap-3 rounded-card bg-card p-5 shadow-pop"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onDone(keys);
        }}
      >
        <h2 className="text-[15px] font-semibold text-ink">Spec section</h2>
        {items.length > 1 ? (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              data-testid="section-prompt-same"
              className="h-4 w-4 accent-accent"
              checked={same}
              onChange={(e) => {
                setSame(e.target.checked);
              }}
            />
            Same for all
          </label>
        ) : null}
        <ul className="-mx-1 flex min-h-0 flex-col gap-2 overflow-auto px-1 py-1">
          {shown.map((i, n) => (
            <li key={i.at} className="flex items-start gap-3">
              <span className="min-w-0 flex-1 pt-2.5 text-sm text-ink wrap-anywhere">
                {same ? `${String(items.length)} files` : i.name}
              </span>
              <SectionInput
                projectId={projectId}
                label={same ? 'Spec section for all' : `Spec section for ${i.name}`}
                testId="section-prompt-input"
                autoFocus={n === 0}
                value={valueOf(i.at)}
                onChange={(v) => {
                  setValues((was) => {
                    const next = new Map(was);
                    next.set(i.at, v);
                    return next;
                  });
                }}
              />
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onCancel} data-testid="section-prompt-cancel">
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={Upload} disabled={!ready} data-testid="section-prompt-upload">
            Upload
          </Button>
        </div>
      </form>
    </div>
  );
}

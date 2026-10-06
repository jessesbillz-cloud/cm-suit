// The day's inspections on the report (content.inspections): requests received, the day's inspections and their IR
// results, filled in by themselves (irLines.ts, and Generate IR). Each line can be edited (then it stays as written)
// or removed, with Undo; a removed line doesn't come back.
import { X } from 'lucide-react';
import type { DailyContent } from '../../lib/dailies';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { Section } from './Section';
import { INPUT } from './styles';

type Lines = DailyContent['inspections'];

interface InspectionsListProps {
  items: Lines;
  locked: boolean;
  edit: (change: (c: DailyContent) => DailyContent) => void;
}

/** About one row per 70 characters, one to five rows. */
function rowsFor(text: string): number {
  return Math.min(5, Math.max(1, Math.ceil(text.length / 70), text.split('\n').length));
}

export function InspectionsList({ items, locked, edit }: InspectionsListProps) {
  const toast = useToast();
  if (items.length === 0) return null;

  function setLines(change: (lines: Lines) => Lines) {
    edit((c) => ({ ...c, inspections: change(c.inspections) }));
  }

  function remove(i: number) {
    const line = items[i];
    if (!line) return;
    setLines((lines) => lines.filter((l) => l.ref !== line.ref));
    toast.show({
      message: 'Line removed.',
      action: {
        label: 'Undo',
        onClick: () => {
          setLines((lines) => (lines.some((l) => l.ref === line.ref) ? lines : [...lines.slice(0, i), line, ...lines.slice(i)]));
        },
      },
    });
  }

  return (
    <Section title="Inspections" count={items.length} testId="daily-inspections">
      <ul className="flex flex-col gap-2">
        {items.map((line, i) => (
          <li key={line.ref} className="flex items-start gap-2" data-testid="daily-inspection">
            <textarea
              aria-label={`Inspection line ${String(i + 1)}`}
              rows={rowsFor(line.text)}
              maxLength={4000}
              className={`min-w-0 flex-1 py-1.5 leading-6 ${INPUT}`}
              value={line.text}
              disabled={locked}
              onChange={(e) => {
                const text = e.target.value;
                setLines((lines) => lines.map((l) => (l.ref === line.ref ? { ...l, text } : l)));
              }}
            />
            {locked ? null : (
              <button
                type="button"
                aria-label={`Remove inspection line ${String(i + 1)}`}
                data-testid="daily-inspection-remove"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-page hover:text-danger"
                onClick={() => {
                  remove(i);
                }}
              >
                <Icon icon={X} size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// The note sections (general, safety, materials, equipment, QC), each with "Carry over" to the next report.
// Field Mode shows just these under the big photo button.
import { NOTE_SECTIONS, type DailyContent, type NoteKey } from '../../lib/dailies';
import { CheckField } from '../../ui/Fields';

const INPUT = 'rounded-md border border-line bg-card px-2.5 py-2 text-sm text-ink outline-none focus:border-accent disabled:bg-page';

interface NotesFieldsProps {
  content: DailyContent;
  locked: boolean;
  onNote: (key: NoteKey, text: string) => void;
  onCarry: (key: NoteKey, carry: boolean) => void;
  /** Field Mode: taller boxes for dictation. */
  roomy?: boolean | undefined;
}

export function NotesFields({ content, locked, onNote, onCarry, roomy }: NotesFieldsProps) {
  return (
    <section className="flex flex-col gap-3">
      {NOTE_SECTIONS.map((s) => (
        <div key={s.key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`note-${s.key}`} className="text-sm font-semibold text-ink">
              {s.label}
            </label>
            <CheckField
              label="Carry over"
              checked={content.carry_sections.includes(s.key)}
              disabled={locked}
              onChange={(carry) => {
                onCarry(s.key, carry);
              }}
            />
          </div>
          <textarea
            id={`note-${s.key}`}
            data-testid={`note-${s.key}`}
            rows={roomy ? 5 : 3}
            maxLength={20000}
            className={INPUT}
            value={content.notes[s.key]}
            disabled={locked}
            onChange={(e) => {
              onNote(s.key, e.target.value);
            }}
          />
        </div>
      ))}
    </section>
  );
}

// The note sections (general, safety, materials, equipment, QC), each with "Carry over" to the next report, under the
// setup's standing note. Field Mode shows just these under the big photo button.
import { NOTE_SECTIONS, type DailyContent, type NoteKey } from '../../lib/dailies';
import { CheckField } from '../../ui/Fields';
import { Section } from './Section';
import { INPUT } from './styles';

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
    <Section title="Notes">
      <div className="flex flex-col gap-4">
        {content.standing_note.trim() !== '' ? (
          <p className="whitespace-pre-wrap break-words rounded-md bg-page px-3 py-2 text-sm text-ink-2">{content.standing_note}</p>
        ) : null}
        {NOTE_SECTIONS.map((s) => (
          <div key={s.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`note-${s.key}`} className="text-[13px] font-semibold text-ink">
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
              className={`py-2 leading-6 ${INPUT}`}
              value={content.notes[s.key]}
              disabled={locked}
              onChange={(e) => {
                onNote(s.key, e.target.value);
              }}
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

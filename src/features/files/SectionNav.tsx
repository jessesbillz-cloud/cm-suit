// The sections of Files with their file counts (0097): a list in the left card on a desktop, one select on a phone.
// To sort's count is red while something waits in it.
import type { FileSection } from '../../data/fileSections';
import { FIELD_CONTROL } from '../../ui/Fields';
import { SECTION_LABEL, sectionKind } from './sections';

interface SectionNavProps {
  sections: readonly FileSection[];
  /** The section on screen (its folder). */
  current: string;
  isPhone: boolean;
  onPick: (folderId: string) => void;
}

const labelOf = (s: FileSection) => {
  const k = sectionKind(s);
  return k === null ? s.kind : SECTION_LABEL[k];
};

export function SectionNav({ sections, current, isPhone, onPick }: SectionNavProps) {
  if (isPhone) {
    return (
      <select
        aria-label="Section"
        data-testid="section-select"
        className={`${FIELD_CONTROL} w-full`}
        value={current}
        onChange={(e) => {
          onPick(e.target.value);
        }}
      >
        {sections.map((s) => (
          <option key={s.folder_id} value={s.folder_id}>
            {`${labelOf(s)} (${String(s.file_count)})`}
          </option>
        ))}
      </select>
    );
  }
  return (
    <ul aria-label="Sections" className="flex flex-col gap-0.5 py-1">
      {sections.map((s) => {
        const active = s.folder_id === current;
        const waiting = s.kind === 'unsorted' && s.file_count > 0;
        return (
          <li key={s.folder_id}>
            <button
              type="button"
              aria-current={active ? 'true' : undefined}
              data-testid="section"
              className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                active ? 'bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-page'
              }`}
              onClick={() => {
                onPick(s.folder_id);
              }}
            >
              <span data-testid="section-name" className="min-w-0 flex-1 wrap-anywhere">
                {labelOf(s)}
              </span>
              <span data-testid="section-count" className={`shrink-0 text-xs tabular-nums ${waiting ? 'font-semibold text-danger' : 'text-ink-3'}`}>
                {s.file_count}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// Hours on a submitted report (MDR's prompt after submit): 0 / 2 / 4 / 6 / 8 in one tap, or another number. Saved on
// the report through set_daily_hours (the author only, version-checked). Used after Submit in Dailies and on a day
// in the Hours tool.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSetDailyHours } from '../../data/hours.mutations';
import { FIELD_CONTROL } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { PRESET_HOURS, parseHours } from './model';

interface HoursPromptProps {
  projectId: string;
  reportId: string;
  /** The report's current version (the save's version check). */
  version: number;
  /** The hours on the report now, or null before any are entered. */
  hours: number | null;
}

const CHIP = 'inline-flex h-11 min-w-11 items-center justify-center rounded-lg px-3 text-[15px] font-medium tabular-nums transition-colors';
const ON = 'bg-accent text-white shadow-primary';
const OFF = 'border border-line-strong bg-card text-ink shadow-control hover:border-ink-3/60 hover:bg-card-head';

export function HoursPrompt({ projectId, reportId, version, hours }: HoursPromptProps) {
  const save = useSetDailyHours(projectId);
  const preset = hours !== null && (PRESET_HOURS as readonly number[]).includes(hours);
  const [other, setOther] = useState(hours !== null && !preset ? String(hours) : '');
  const [problem, setProblem] = useState<string | null>(null);

  function set(next: number) {
    if (next === hours || save.isPending) return;
    setProblem(null);
    save.mutate(
      { reportId, version, hours: next },
      {
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  function commitOther() {
    if (other.trim() === '') return;
    const n = parseHours(other);
    if (n === null) {
      setProblem('0 to 24 hours, in tenths.');
      return;
    }
    set(n);
  }

  return (
    <div className="flex flex-col gap-2" data-testid="hours-prompt">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
        Hours worked
        {hours !== null && !save.isPending ? (
          <span className="inline-flex items-center gap-1 text-xs font-normal text-ink-3" data-testid="hours-saved">
            <Icon icon={Check} size={13} />
            Saved
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESET_HOURS.map((h) => (
          <button
            key={h}
            type="button"
            aria-pressed={hours === h}
            disabled={save.isPending}
            data-testid={`hours-chip-${String(h)}`}
            className={`${CHIP} ${hours === h ? ON : OFF}`}
            onClick={() => {
              setOther('');
              set(h);
            }}
          >
            {h}
          </button>
        ))}
        <input
          type="text"
          inputMode="decimal"
          aria-label="Other hours"
          placeholder="Other"
          value={other}
          disabled={save.isPending}
          data-testid="hours-other"
          className={`${FIELD_CONTROL} h-11 w-20 text-center tabular-nums ${hours !== null && !preset ? 'border-accent ring-[3px] ring-accent/20' : ''}`}
          onChange={(e) => {
            setOther(e.target.value);
          }}
          onBlur={commitOther}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitOther();
          }}
        />
      </div>
      {problem !== null ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

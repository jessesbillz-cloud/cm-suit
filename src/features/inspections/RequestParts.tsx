// The request form's plain fields: the company (prefilled, any of the job's), the items typed (a request without
// walls to pick), and the bar with Request, held at the bottom. Request is never a silent grey button: until the
// request can go the bar says the first thing missing, and a tap on Request jumps to it (RequestForm).
import { Send } from 'lucide-react';
import { Button } from '../../ui/Button';

const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';
const INPUT = 'rounded-md border border-line-strong bg-card px-2.5 text-sm font-normal text-ink outline-none focus:border-accent';

interface CompanyFieldProps {
  value: string;
  companies: readonly string[];
  onChange: (company: string) => void;
}

export function CompanyField({ value, companies, onChange }: CompanyFieldProps) {
  return (
    <label className={LABEL}>
      Company
      <input
        className={`h-9 ${INPUT}`}
        list="ir-companies"
        value={value}
        placeholder="Required"
        aria-required
        aria-invalid={value.trim() === ''}
        data-testid="ir-company"
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      <datalist id="ir-companies">
        {companies.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </label>
  );
}

export function ItemsText({ value, onChange }: { value: string; onChange: (items: string) => void }) {
  return (
    <label className={LABEL}>
      Items to inspect
      <textarea
        rows={4}
        className={`py-2 ${INPUT}`}
        value={value}
        data-testid="ir-items"
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

interface SubmitBarProps {
  /** The first thing still missing, in a few words; null: ready to go. */
  missing: string | null;
  /** Request was tapped while something is missing: the words turn red. */
  flagged: boolean;
  sending: boolean;
}

export function SubmitBar({ missing, flagged, sending }: SubmitBarProps) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_16px_-12px_rgba(16,24,40,.25)]">
      <span className={`min-w-0 text-sm ${missing !== null && flagged ? 'font-medium text-danger' : 'text-ink-2'}`} data-testid="ir-submit-hint" aria-live="polite">
        {missing ?? 'A request, not a booking.'}
      </span>
      {/* Not disabled while something is missing (the tap jumps to it); it looks faded until then. */}
      <Button
        type="submit"
        variant="primary"
        icon={Send}
        className={`h-11 shrink-0 px-6 text-base ${missing !== null ? 'opacity-60' : ''}`}
        data-waiting={missing !== null ? 'true' : undefined}
        loading={sending}
        data-testid="ir-submit"
      >
        Request
      </Button>
    </div>
  );
}

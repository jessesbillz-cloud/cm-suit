// The request form's plain fields: the company (prefilled, any of the job's), the items typed (a request without
// walls to pick), and the bar with Request, held at the bottom.
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

export function SubmitBar({ ready, sending }: { ready: boolean; sending: boolean }) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_16px_-12px_rgba(16,24,40,.25)]">
      <span className="text-sm text-ink-2">A request, not a booking.</span>
      <Button
        type="submit"
        variant="primary"
        icon={Send}
        className="h-11 px-6 text-base"
        disabled={!ready}
        loading={sending}
        data-testid="ir-submit"
      >
        Request
      </Button>
    </div>
  );
}

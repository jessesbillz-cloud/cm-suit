// CSLB license, manual-assisted (SPEC §11.2): the number and class, a link to the CSLB detail page, then the result as
// read there. The database stamps when it was recorded. No scraping.
import { ExternalLink } from 'lucide-react';
import { CSLB_RESULTS, type CslbResult } from '../../data/subs.types';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { cslbUrl, licenseChip } from './subs';

const RESULT_LABELS: Record<CslbResult, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
  expired: 'Expired',
};

interface LicenseCheckProps {
  number: string;
  classes: string;
  onNumber: (v: string) => void;
  onClasses: (v: string) => void;
  onBlur: () => void;
  status: string | null;
  checkedAt: string | null;
  tz: string;
  onRecord: (status: CslbResult) => void;
}

export function LicenseCheck(p: LicenseCheckProps) {
  const url = cslbUrl(p.number);
  const chip = licenseChip(p.status);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <TextField label="License #" value={p.number} onChange={p.onNumber} onBlur={p.onBlur} testId="sub-license" />
        <TextField label="Class" value={p.classes} onChange={p.onClasses} onBlur={p.onBlur} />
      </div>
      {url !== null ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          Check license
          <Icon icon={ExternalLink} size={14} />
        </a>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {CSLB_RESULTS.map((r) => (
          <Button
            key={r}
            size="sm"
            aria-pressed={p.status === r}
            disabled={url === null}
            data-testid={`cslb-${r}`}
            onClick={() => {
              p.onRecord(r);
            }}
          >
            {RESULT_LABELS[r]}
          </Button>
        ))}
      </div>
      {chip !== null && p.checkedAt !== null ? (
        <p className="flex items-center gap-2 text-xs text-ink-2">
          <StatusChip status={chip.status} label={chip.label} />
          Checked {formatInZone(p.checkedAt, p.tz, 'MMM d, yyyy')}
        </p>
      ) : null}
    </div>
  );
}

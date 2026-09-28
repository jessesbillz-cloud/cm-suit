// The reading pane's one flat view: status, trade and location, photos, description, spec tags, the notice, the
// latest step (what the inspector reads before deciding), and the actions this person's capabilities allow.
import { useState } from 'react';
import { Download, Pencil } from 'lucide-react';
import type { CorrectionHistoryRow, CorrectionRow, CorrectionStep } from '../../data/corrections.types';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { StatusChip } from '../../ui/StatusChip';
import { useDownload } from '../files/useDownload';
import { EditCorrection } from './EditCorrection';
import { HISTORY_LABELS, STEP_LABELS, canEdit, latestStep, statusChip, stepsFor, type Caps } from './model';
import { PhotoStrip } from './PhotoStrip';
import { StepForm } from './StepForm';

type Mode = { kind: 'read' } | { kind: 'edit' } | { kind: 'step'; step: CorrectionStep };

interface CorrectionBodyProps {
  row: CorrectionRow;
  history: readonly CorrectionHistoryRow[];
  caps: Caps;
  userId: string;
  nameOf: (userId: string | null) => string;
  timeZone: string;
  isPhone: boolean;
}

function Notice({ row }: { row: CorrectionRow }) {
  const download = useDownload();
  if (row.notice_ref === '' && row.notice_file_id === null) return null;
  const fileId = row.notice_file_id;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink-2">Notice</span>
      {row.notice_ref !== '' ? <span className="break-words text-ink">{row.notice_ref}</span> : null}
      {fileId !== null ? (
        <Button
          size="sm"
          icon={Download}
          loading={download.pendingId === fileId}
          onClick={() => {
            download.start(fileId);
          }}
        >
          Notice file
        </Button>
      ) : null}
    </p>
  );
}

interface LatestProps {
  projectId: string;
  step: CorrectionHistoryRow;
  nameOf: (userId: string | null) => string;
  timeZone: string;
}

function Latest({ projectId, step, nameOf, timeZone }: LatestProps) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-line p-3" data-testid="cn-latest">
      <p className="text-sm text-ink">
        <span className="font-medium">{HISTORY_LABELS[step.action]}</span>
        <span className="text-ink-2">
          {' '}
          &middot; {nameOf(step.actor_user_id)} &middot; {formatInZone(step.created_at, timeZone, 'MMM d, h:mm a')}
        </span>
      </p>
      {step.note !== '' ? <p className="whitespace-pre-wrap break-words text-sm text-ink">{step.note}</p> : null}
      <PhotoStrip projectId={projectId} ids={step.photo_ids} timeZone={timeZone} />
    </section>
  );
}

export function CorrectionBody({ row, history, caps, userId, nameOf, timeZone, isPhone }: CorrectionBodyProps) {
  const [mode, setMode] = useState<Mode>({ kind: 'read' });
  const chip = statusChip(row.status);
  const latest = latestStep(history);
  const steps = stepsFor(row.status, caps);
  const editable = canEdit(row, userId, caps);
  const where = [row.trade, row.location].filter((v) => v !== '').join(' · ');
  const read = () => {
    setMode({ kind: 'read' });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="cn-status">
          <StatusChip status={chip.status} label={chip.label} />
        </span>
        {where !== '' ? <span className="text-sm text-ink-2">{where}</span> : null}
      </div>

      {mode.kind === 'edit' ? (
        <EditCorrection row={row} onDone={read} />
      ) : (
        <>
          <PhotoStrip projectId={row.project_id} ids={row.photo_ids} timeZone={timeZone} />
          {row.description !== '' ? <p className="whitespace-pre-wrap break-words">{row.description}</p> : null}
          {row.spec_tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Spec tags">
              {row.spec_tags.map((t) => (
                <li key={t} className="rounded border border-line bg-page px-1.5 py-0.5 text-xs text-ink-2">
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
          <Notice row={row} />
        </>
      )}

      {latest ? <Latest projectId={row.project_id} step={latest} nameOf={nameOf} timeZone={timeZone} /> : null}

      {mode.kind === 'step' ? <StepForm row={row} step={mode.step} isPhone={isPhone} onDone={read} /> : null}

      {mode.kind === 'read' && (steps.length > 0 || editable) ? (
        <div className="flex flex-wrap gap-2">
          {steps.map((s) => (
            <Button
              key={s}
              variant={s === 'ready' || s === 'signed_off' ? 'primary' : 'secondary'}
              data-testid={`cn-step-${s}`}
              onClick={() => {
                setMode({ kind: 'step', step: s });
              }}
            >
              {STEP_LABELS[s]}
            </Button>
          ))}
          {editable ? (
            <Button
              variant="quiet"
              icon={Pencil}
              data-testid="cn-edit"
              onClick={() => {
                setMode({ kind: 'edit' });
              }}
            >
              Edit
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

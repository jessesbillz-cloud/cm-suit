// The official stamps the plans and issues the permit (migration 0053), in the permit's right column: pick the PDFs,
// sign ("Stamp and issue"; the ONE SignButton runs the email code when the server asks), watch each file stamp, done.
// No Undo: a signed legal record (CLAUDE.md rule 16). The server stamps one file per call, then records the set once;
// a file that fails can be dropped or tried again without stamping the others twice.
import { useState } from 'react';
import { CircleCheck, X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { FunctionError } from '../../data/functions';
import { useRecordSet, useStampFile } from '../../data/permitStamp.mutations';
import { useStampSources } from '../../data/permitStamp.queries';
import type { PermitDetail, PermitRef } from '../../data/permits.types';
import type { RecordResult, StampMode, StampedFile } from '../../data/permitStamp.types';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { SignButton } from '../auth/SignButton';
import { StampSources } from './StampSources';
import { doneLabel, leftToStamp, signLabel, stampLabel, togglePick, type FileState } from './stamp';

interface StampFlowProps {
  detail: PermitDetail;
  mode: StampMode;
  isPhone: boolean;
  onClose: () => void;
}

/** The server wants a fresh sign-in: SignButton asks for the email code and signs again. */
function wantsCode(e: unknown): boolean {
  return e instanceof FunctionError && e.status === 403 && e.error === 'reauth_required';
}

function without<T>(o: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));
}

/** The stamped copies in the order the files were picked. */
function inOrder(picked: readonly string[], copies: Readonly<Record<string, StampedFile>>): StampedFile[] {
  return picked.map((id) => copies[id]).filter((c): c is StampedFile => c !== undefined);
}

function Done({ result, stamped, isPhone, onClose }: { result: RecordResult; stamped: StampedFile[]; isPhone: boolean; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3" data-testid="stamp-result">
      <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
        <Icon icon={CircleCheck} size={18} className="text-accent" />
        {doneLabel(result)}
      </p>
      <ul className="flex flex-col gap-0.5 text-[13px] leading-5 text-ink-2">
        {stamped.map((s) => (
          <li key={s.stamped_file_id} className="break-words">
            {s.name}
          </li>
        ))}
      </ul>
      <div>
        <Button variant="primary" size={isPhone ? 'lg' : 'md'} data-testid="stamp-done" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function StampFlow({ detail, mode, isPhone, onClose }: StampFlowProps) {
  // The permit as it was when the flow opened: every file is stamped against the same version and number.
  const [permit] = useState<PermitRef>(() => ({ id: detail.permit.id, project_id: detail.permit.project_id, version: detail.permit.version }));
  const sources = useStampSources(permit.id);
  const stampFile = useStampFile();
  const recordSet = useRecordSet();
  const [picked, setPicked] = useState<string[]>([]);
  const [copies, setCopies] = useState<Record<string, StampedFile>>({});
  const [states, setStates] = useState<Record<string, FileState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RecordResult | null>(null);

  async function stampAll(): Promise<void> {
    setRunning(true);
    try {
      const made: Record<string, StampedFile> = { ...copies };
      let failed = 0;
      for (const id of leftToStamp(picked, made)) {
        setStates((s) => ({ ...s, [id]: 'stamping' }));
        setErrors((er) => without(er, id));
        try {
          const copy = await stampFile.mutateAsync({ permit, fileId: id });
          made[id] = copy;
          setCopies((c) => ({ ...c, [id]: copy }));
          setStates((s) => ({ ...s, [id]: 'stamped' }));
        } catch (e) {
          if (wantsCode(e)) {
            setStates((st) => without(st, id));
            throw e;
          }
          failed += 1;
          setStates((s) => ({ ...s, [id]: 'failed' }));
          setErrors((er) => ({ ...er, [id]: messageOf(e) }));
        }
      }
      if (failed > 0) throw new Error(failed === 1 ? 'One file did not stamp. Drop it or try again.' : `${String(failed)} files did not stamp. Drop them or try again.`);
      setResult(await recordSet.mutateAsync({ permit, stamped: inOrder(picked, made) }));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" data-testid="stamp-flow">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">{stampLabel(mode)}</h2>
        {!running && result === null ? (
          <Button size={isPhone ? 'md' : 'sm'} variant="quiet" icon={X} aria-label="Close" data-testid="stamp-close" onClick={onClose} />
        ) : null}
      </div>
      {result ? (
        <Done result={result} stamped={inOrder(picked, copies)} isPhone={isPhone} onClose={onClose} />
      ) : (
        <>
          <StampSources
            permit={permit}
            sources={sources}
            picked={picked}
            states={states}
            errors={errors}
            locked={running}
            onToggle={(id) => {
              setPicked((p) => togglePick(p, id));
            }}
            onUploaded={(id) => {
              setPicked((p) => (p.includes(id) ? p : [...p, id]));
            }}
          />
          <div className="sticky bottom-0 -mx-1 bg-card/95 px-1 py-2">
            <SignButton
              label={signLabel(mode, picked.length)}
              testId="stamp-sign"
              size={isPhone ? 'lg' : 'md'}
              sign={stampAll}
              onSigned={() => undefined}
              pending={running}
              disabled={picked.length === 0}
            />
          </div>
        </>
      )}
    </section>
  );
}

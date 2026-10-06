// A new list from OSFM's legend (revs.manage): its name, phase and permit, the legend pasted as written, and the revs
// and items read from it shown before Create, or the line that doesn't fit. Creating twice returns the same list.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useCreateRevList } from '../../data/revs.mutations';
import { useRevSetup } from '../../data/revs.queries';
import type { LegendRev } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_LABEL } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { parseLegend } from './legend';
import { ListFields } from './SetupForms';
import type { ListValues } from './useSetupActions';
import { useRevsNav } from './useRevsNav';

const EXAMPLE = 'Rev. 0 - TOW\nTOW - Speed Plugs (Company)\nRev. 1 - HOW - Cavity\nHOW Cavity Stuff (Company)';

function Preview({ revs }: { revs: readonly LegendRev[] }) {
  const items = revs.reduce((n, r) => n + r.items.length, 0);
  return (
    <section className="flex flex-col gap-1.5" data-testid="rev-legend-preview">
      <h2 className="text-xs font-bold uppercase leading-5 tracking-[0.06em] text-ink">
        {`${String(revs.length)} ${revs.length === 1 ? 'rev' : 'revs'} · ${String(items)} ${items === 1 ? 'item' : 'items'}`}
      </h2>
      <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-card">
        {revs.map((r) => (
          <li key={r.number} className="px-3 py-2" data-testid="rev-preview-rev">
            <p className="break-words text-[14px] font-semibold leading-6 text-ink">{`Rev ${String(r.number)} · ${r.name}`}</p>
            <ul className="flex flex-col">
              {r.items.map((i) => (
                <li key={i.name} className="break-words pl-3 text-[13.5px] leading-6 text-ink">
                  {i.name}
                  {i.company ? <span className="ml-1.5 inline-block text-[12.5px] text-ink-3">{i.company}</span> : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function NewList({ projectId }: { projectId: string }) {
  const setup = useRevSetup(projectId);
  const create = useCreateRevList();
  const nav = useRevsNav(projectId, true);
  const toast = useToast();
  const last = setup.data?.lists.at(-1);
  const [value, setValue] = useState<ListValues | null>(null);
  const [legend, setLegend] = useState('');
  // Prefill: a first list is the rated walls; the next one keeps the last list's phase.
  const fields = value ?? { name: last ? '' : 'Rated walls', phase: last?.phase ?? '', permitId: last?.permit_id ?? null };
  const parsed = legend.trim() === '' ? null : parseLegend(legend);
  const ready = fields.name.trim() !== '' && parsed?.ok === true;

  function submit() {
    if (parsed?.ok !== true) return;
    create.mutate(
      { projectId, name: fields.name, phase: fields.phase, permitId: fields.permitId, revs: parsed.revs },
      {
        onSuccess: (row) => {
          toast.show({ message: `${row.name} created.` });
          nav.close();
        },
      },
    );
  }

  return (
    <form
      className="flex min-h-full flex-col"
      data-testid="rev-list-new"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit();
      }}
    >
      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        <h1 className="text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">New list</h1>
        <ListFields projectId={projectId} value={fields} onChange={setValue} />
        <label className={FIELD_LABEL}>
          Legend
          <textarea
            rows={8}
            maxLength={20000}
            className={`${FIELD_AREA.replace('text-sm', 'text-[13px]')} font-mono`}
            placeholder={EXAMPLE}
            value={legend}
            spellCheck={false}
            data-testid="rev-legend"
            onChange={(e) => {
              setLegend(e.target.value);
            }}
          />
        </label>
        {parsed?.ok === false ? (
          <p role="alert" className="text-sm text-danger" data-testid="rev-legend-error">
            {parsed.error}
          </p>
        ) : null}
        {parsed?.ok === true ? <Preview revs={parsed.revs} /> : null}
        {create.isError ? (
          <p role="alert" className="text-sm text-danger">
            {messageOf(create.error)}
          </p>
        ) : null}
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-card px-5 py-3">
        <Button type="submit" variant="primary" icon={Plus} loading={create.isPending} disabled={!ready} data-testid="rev-list-create">
          Create
        </Button>
      </footer>
    </form>
  );
}

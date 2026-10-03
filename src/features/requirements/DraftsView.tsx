// Drafts: what the AI found in a spec section, in the book's order, each with the sentence it quotes and where it is.
// Keep or Drop, one tap each, with Undo in the toast. A tap on the words opens the draft beside the list to fix it first.
import { Check, X } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useKeepRequirement, useRemoveRequirement } from '../../data/requirements.mutations';
import type { Requirement } from '../../data/requirements.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { KindChip, RequiredNote } from './RequirementBits';
import { rowFacts, triggerWords } from './model';

interface DraftsViewProps {
  projectId: string;
  rows: Requirement[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}

/** Where the quote is: "Sample Spec Book Vol 2.pdf p. 403", or "Pasted". */
function sourceWords(row: Pick<Requirement, 'source_file_name' | 'source_page' | 'source_file_id'>): string {
  if (row.source_file_id === null) return 'Pasted';
  const page = row.source_page === null ? '' : ` p. ${String(row.source_page)}`;
  return `${row.source_file_name ?? 'Spec file'}${page}`;
}

export function Quote({ row }: { row: Pick<Requirement, 'source_quote' | 'source_file_name' | 'source_page' | 'source_file_id'> }) {
  if (row.source_quote === '') return null;
  return (
    <figure className="flex flex-col gap-1">
      <blockquote className="border-l-2 border-line-strong pl-3 text-sm italic leading-6 text-ink-2" data-testid="req-quote">
        {row.source_quote}
      </blockquote>
      <figcaption className="pl-3 text-xs text-ink-3">{sourceWords(row)}</figcaption>
    </figure>
  );
}

interface CardProps {
  row: Requirement;
  selected: boolean;
  onOpen: (id: string) => void;
  onKeep: (row: Requirement) => void;
  onDrop: (row: Requirement) => void;
}

function DraftCard({ row, selected, onOpen, onKeep, onDrop }: CardProps) {
  const facts = [rowFacts(row), triggerWords(row) ?? ''].filter((s) => s !== '').join(' · ');
  return (
    <li className={`flex flex-col gap-3 px-4 py-4 ${selected ? 'bg-accent-soft/60' : ''}`} data-testid={`req-draft-${row.id}`}>
      <button type="button" className="flex flex-col gap-2 text-left" onClick={() => { onOpen(row.id); }}>
        <span className="flex flex-wrap items-center gap-2">
          <KindChip row={row} />
          <span className="min-w-0 flex-1 whitespace-normal break-words text-[15px] font-medium leading-6 text-ink">{row.title}</span>
          <RequiredNote row={row} />
        </span>
        <Quote row={row} />
        {facts !== '' ? <span className="text-[13px] leading-5 text-ink-2">{facts}</span> : null}
      </button>
      <span className="flex gap-2">
        <Button variant="primary" icon={Check} className="min-w-28 max-sm:h-11 max-sm:flex-1" data-testid={`req-keep-${row.id}`} onClick={() => { onKeep(row); }}>
          Keep
        </Button>
        <Button icon={X} className="min-w-28 max-sm:h-11 max-sm:flex-1" data-testid={`req-drop-${row.id}`} onClick={() => { onDrop(row); }}>
          Drop
        </Button>
      </span>
    </li>
  );
}

export function DraftsView({ projectId, rows, selectedId, onOpen }: DraftsViewProps) {
  const keep = useKeepRequirement(projectId);
  const remove = useRemoveRequirement(projectId);
  const toast = useToast();
  const fail = (e: unknown) => {
    toast.show({ message: messageOf(e), tone: 'error' });
  };

  const onKeep = (row: Requirement) => {
    keep.mutate(
      { id: row.id, version: row.version, keep: true },
      {
        onSuccess: (saved) => {
          toast.show({
            message: `Kept: ${row.title}`,
            action: { label: 'Undo', onClick: () => { keep.mutate({ id: saved.id, version: saved.version, keep: false }, { onError: fail }); } },
          });
        },
        onError: fail,
      },
    );
  };
  const onDrop = (row: Requirement) => {
    remove.mutate(
      { id: row.id, removed: true },
      {
        onSuccess: () => {
          toast.show({
            message: `Dropped: ${row.title}`,
            action: { label: 'Undo', onClick: () => { remove.mutate({ id: row.id, removed: false }, { onError: fail }); } },
          });
        },
        onError: fail,
      },
    );
  };

  return (
    <ul className="divide-y divide-line" data-testid="req-drafts">
      {rows.map((r) => (
        <DraftCard key={r.id} row={r} selected={selectedId === r.id} onOpen={onOpen} onKeep={onKeep} onDrop={onDrop} />
      ))}
    </ul>
  );
}

// Read one spec section with AI. Spec book: the sections found in the job's Specs folder (by number and title, each
// with its file and pages; a tap reads it); a book whose sections weren't found takes a page range; one whose text isn't
// read yet says so. Paste: the section's text. What it finds lands in Drafts, each with the sentence it quotes.
import { useState } from 'react';
import { ScanText } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useExtractRequirements } from '../../data/requirements.mutations';
import { useSpecSections } from '../../data/requirements.queries';
import type { ExtractInput, SpecSection } from '../../data/requirements.types';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_LABEL, TextField } from '../../ui/Fields';
import { SearchBox } from '../../ui/SearchBox';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { readPages, readWords } from './model';

type Source = 'book' | 'paste';
const SOURCES: readonly { value: Source; label: string }[] = [
  { value: 'book', label: 'Spec book' },
  { value: 'paste', label: 'Paste' },
];

type Run = (key: string, input: ExtractInput) => void;

interface FileGroup {
  fileId: string;
  name: string;
  ready: boolean;
  sections: SpecSection[];
}

function byFile(rows: readonly SpecSection[], q: string): FileGroup[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter((w) => w !== '');
  const files = [...new Map(rows.map((r) => [r.file_id, r])).values()];
  return files.map((f) => ({
    fileId: f.file_id,
    name: f.file_name,
    ready: f.text_ready,
    sections: rows.filter((r) => {
      const text = `${r.section ?? ''} ${r.title ?? ''}`.toLowerCase();
      return r.file_id === f.file_id && r.section !== null && words.every((w) => text.includes(w) || text.replace(/\s/g, '').includes(w));
    }),
  }));
}

function PageRange({ fileId, reading, run }: { fileId: string; reading: string | null; run: Run }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const first = Number(from);
  const last = Number(to === '' ? from : to);
  const ok = /^\d+$/.test(from) && (to === '' || /^\d+$/.test(to)) && first >= 1 && last >= first && last - first < 40;
  return (
    <div className="flex items-end gap-2 px-4 py-3">
      <TextField label="From page" value={from} maxLength={6} className="w-28" testId={`req-from-${fileId}`} onChange={setFrom} />
      <TextField label="To page" value={to} maxLength={6} className="w-28" testId={`req-to-${fileId}`} onChange={setTo} />
      <Button
        icon={ScanText}
        disabled={!ok || reading !== null}
        loading={reading === fileId}
        onClick={() => { run(fileId, { source: 'file', fileId, firstPage: first, lastPage: last }); }}
      >
        Read
      </Button>
    </div>
  );
}

function SectionRow({ s, reading, run }: { s: SpecSection; reading: string | null; run: Run }) {
  const key = `${s.file_id}:${String(s.first_page)}`;
  const pages = s.first_page === s.last_page ? `p. ${String(s.first_page)}` : `p. ${String(s.first_page)}–${String(s.last_page)}`;
  return (
    <li>
      <button
        type="button"
        disabled={reading !== null}
        data-testid={`req-section-${s.section ?? ''}`}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-page/60 active:bg-page disabled:cursor-wait"
        onClick={() => {
          if (s.first_page === null || s.last_page === null) return;
          const p = readPages(s.first_page, s.last_page);
          run(key, { source: 'file', fileId: s.file_id, firstPage: p.first, lastPage: p.last });
        }}
      >
        <span className="w-24 shrink-0 font-medium tabular-nums text-ink">{s.section}</span>
        <span className="min-w-0 flex-1 whitespace-normal break-words text-sm text-ink">{s.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-ink-3">{reading === key ? 'Reading...' : pages}</span>
      </button>
    </li>
  );
}

function Book({ projectId, reading, run, onPaste }: { projectId: string; reading: string | null; run: Run; onPaste: () => void }) {
  const sections = useSpecSections(projectId, true);
  const [q, setQ] = useState('');
  if (sections.isError) return <ErrorState error={sections.error} onRetry={() => void sections.refetch()} className="m-0" />;
  if (sections.isPending) return <LoadingState label="Finding the sections" />;
  if (sections.data.length === 0) {
    return <EmptyState icon={TOOL_META.files.icon} title="No spec book in Specs." action={<Button onClick={onPaste}>Paste</Button>} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <SearchBox label="Find a section" placeholder="10 28 00 or a word" testId="req-section-search" onChange={setQ} />
      <div className="-mx-4 flex flex-col">
        {byFile(sections.data, q).map((f) => (
          <section key={f.fileId} className="border-t border-line">
            <h3 className="bg-card-head px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">{f.name}</h3>
            {!f.ready ? (
              <p className="px-4 py-3 text-sm text-ink-2">Text not read yet</p>
            ) : f.sections.length > 0 ? (
              <ul className="divide-y divide-line">
                {f.sections.map((s) => (
                  <SectionRow key={`${s.file_id}:${String(s.first_page)}`} s={s} reading={reading} run={run} />
                ))}
              </ul>
            ) : q.trim() === '' ? (
              <PageRange fileId={f.fileId} reading={reading} run={run} />
            ) : (
              <p className="px-4 py-3 text-sm text-ink-2">No match</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function Paste({ reading, run }: { reading: string | null; run: Run }) {
  const [text, setText] = useState('');
  return (
    <div className="flex flex-col gap-3">
      <label className={FIELD_LABEL}>
        Section text
        <textarea className={FIELD_AREA} rows={10} maxLength={200_000} value={text} data-testid="req-paste" onChange={(e) => { setText(e.target.value); }} />
      </label>
      <Button
        variant="primary"
        icon={ScanText}
        className="self-start max-sm:h-11"
        disabled={text.trim().length < 40 || reading !== null}
        loading={reading === 'paste'}
        data-testid="req-paste-read"
        onClick={() => { run('paste', { source: 'text', text: text.trim() }); }}
      >
        Read
      </Button>
    </div>
  );
}

export function ReadSpec({ projectId, onRead }: { projectId: string; onRead: () => void }) {
  const [source, setSource] = useState<Source>('book');
  const [reading, setReading] = useState<string | null>(null);
  const extract = useExtractRequirements(projectId);
  const toast = useToast();
  const run: Run = (key, input) => {
    setReading(key);
    extract.mutate(input, {
      onSuccess: (res) => {
        toast.show({ message: readWords(res) });
        onRead();
      },
      onError: (e) => { toast.show({ message: messageOf(e), tone: 'error' }); },
      onSettled: () => { setReading(null); },
    });
  };
  return (
    <div className="flex flex-col gap-4 p-4" data-testid="req-read-form">
        <Segments<Source> label="Source" kind="radio" options={SOURCES} value={source} onPick={setSource} testId="req-source" />
        {source === 'book' ? (
          <Book projectId={projectId} reading={reading} run={run} onPaste={() => { setSource('paste'); }} />
        ) : (
          <Paste reading={reading} run={run} />
      )}
    </div>
  );
}

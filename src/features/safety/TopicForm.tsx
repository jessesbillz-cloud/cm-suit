// One of the company's own talks (safety.manage): its category, title, the points to read out (one per line), the
// questions to discuss, the regulation it rests on and a link to its page, and a PDF. Saving carries the version.
import { useState } from 'react';
import { Save } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSaveTopic } from '../../data/safety.mutations';
import type { Topic } from '../../data/safety.types';
import { SAFETY_CATEGORIES } from '../../lib/safety';
import { Button } from '../../ui/Button';
import { ChipPick } from '../../ui/ChipPick';
import { FIELD_AREA, FIELD_LABEL, TextField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { linesOf } from './model';
import { PdfField, type PickedPdf } from './PdfField';

interface TopicFormProps {
  projectId: string;
  orgId: string;
  /** null: a new topic. */
  topic: Topic | null;
  onSaved: (id: string) => void;
  onCancel?: (() => void) | undefined;
}

function Lines({ label, value, onChange, rows, testId }: { label: string; value: string; onChange: (v: string) => void; rows: number; testId: string }) {
  return (
    <label className={FIELD_LABEL}>
      {label}
      <textarea
        rows={rows}
        maxLength={4000}
        className={FIELD_AREA}
        value={value}
        data-testid={testId}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

export function TopicForm({ projectId, orgId, topic, onSaved, onCancel }: TopicFormProps) {
  const save = useSaveTopic(projectId, orgId);
  const toast = useToast();
  const [category, setCategory] = useState<string | null>(topic?.category ?? null);
  const [title, setTitle] = useState(topic?.title ?? '');
  const [points, setPoints] = useState(topic?.points.join('\n') ?? '');
  const [questions, setQuestions] = useState(topic?.questions.join('\n') ?? '');
  const [source, setSource] = useState(topic?.source ?? '');
  const [url, setUrl] = useState(topic?.source_url ?? '');
  const [pdf, setPdf] = useState<PickedPdf | null>(topic?.file_id ? { id: topic.file_id, name: 'PDF on file' } : null);
  const ready = category !== null && title.trim() !== '' && (linesOf(points).length > 0 || pdf !== null);

  function submit() {
    if (category === null) return;
    save.mutate(
      {
        id: topic?.id ?? null, version: topic?.version ?? null, category, title, points: linesOf(points), questions: linesOf(questions),
        source, sourceUrl: url, fileId: pdf?.id ?? null,
      },
      {
        onSuccess: (saved) => {
          toast.show({ message: 'Topic saved.' });
          onSaved(saved.id);
        },
      },
    );
  }

  return (
    <form
      className="flex min-h-full flex-col"
      data-testid="safety-topic-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit();
      }}
    >
      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        <h1 className="text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">{topic ? 'Edit topic' : 'New topic'}</h1>
        <ChipPick
          chips={SAFETY_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          picked={category === null ? [] : [category]}
          onChange={(next) => {
            setCategory(next[0] ?? null);
          }}
          label="Category"
          testId="safety-topic-category"
        />
        <TextField label="Title" value={title} onChange={setTitle} maxLength={120} testId="safety-topic-title" />
        <Lines label="Points, one per line" value={points} onChange={setPoints} rows={6} testId="safety-topic-points" />
        <Lines label="Questions, one per line" value={questions} onChange={setQuestions} rows={2} testId="safety-topic-questions" />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Regulation" value={source} onChange={setSource} maxLength={120} testId="safety-topic-source" />
          <TextField label="Link" value={url} onChange={setUrl} maxLength={300} type="url" testId="safety-topic-url" />
        </div>
        <PdfField projectId={projectId} value={pdf} onChange={setPdf} testId="safety-topic-pdf" />
        {save.isError ? (
          <p role="alert" className="text-sm text-danger">
            {messageOf(save.error)}
          </p>
        ) : null}
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-card px-5 py-3">
        {onCancel ? (
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" icon={Save} loading={save.isPending} disabled={!ready} data-testid="safety-topic-save">
          Save
        </Button>
      </footer>
    </form>
  );
}

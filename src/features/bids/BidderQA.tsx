// Q&A on the bidder's page: published answers (anonymized), "Ask a question", and my own questions with status.
import { useState } from 'react';
import { Send } from 'lucide-react';
import { useAskBidQuestion } from '../../data/bidder';
import type { BidderPage } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { StatusChip } from '../../ui/StatusChip';
import { questionChip } from './model';

interface BidderQAProps {
  projectId: string;
  page: BidderPage;
}

export function BidderQA({ projectId, page }: BidderQAProps) {
  const ask = useAskBidQuestion();
  const [text, setText] = useState('');
  const [packageId, setPackageId] = useState(page.packages[0]?.id ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  function send() {
    const q = text.trim();
    if (q === '' || packageId === '') return;
    setProblem(null);
    ask.mutate(
      { projectId, packageId, question: q },
      {
        onSuccess: () => {
          setText('');
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <Card title="Questions">
      <div className="flex flex-col gap-4">
        {page.answers.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {page.answers.map((a) => (
              <li key={a.number} className="text-sm">
                <p className="break-words font-medium text-ink">
                  <span className="mr-2 tabular-nums text-ink-2">{a.number}</span>
                  {a.question_text}
                </p>
                <p className="whitespace-pre-wrap break-words text-ink">{a.answer}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {page.packages.length > 1 ? (
            <select
              aria-label="Package"
              className="h-9 rounded-md border border-line bg-card px-2 text-sm text-ink"
              value={packageId}
              onChange={(e) => {
                setPackageId(e.target.value);
              }}
            >
              {page.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name}
                </option>
              ))}
            </select>
          ) : null}
          <textarea
            aria-label="Ask a question"
            placeholder="Ask a question"
            rows={3}
            className="rounded-md border border-line px-2.5 py-2 text-sm text-ink outline-none focus:border-accent"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
          {problem ? <p className="text-sm text-danger">{problem}</p> : null}
          <Button type="submit" icon={Send} className="w-fit" loading={ask.isPending} disabled={text.trim() === '' || packageId === ''}>
            Send
          </Button>
        </form>
        {page.my_questions.length > 0 ? (
          <ul className="flex flex-col gap-2 border-t border-line pt-3">
            {page.my_questions.map((q) => {
              const chip = questionChip(q.status);
              return (
                <li key={q.id} className="flex items-start gap-2 text-sm">
                  <span className="w-8 shrink-0 tabular-nums text-ink-2">{q.number}</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink">{q.question}</span>
                  <StatusChip status={chip.status} label={chip.label} />
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

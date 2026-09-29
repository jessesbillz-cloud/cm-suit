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

/** A question's number in a small square, like the addenda's. */
const NUMBER = 'flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-page px-1.5 text-sm font-semibold tabular-nums text-ink-2';

const CONTROL =
  'rounded-md border border-line-strong bg-card text-sm text-ink shadow-control outline-none transition-shadow focus:border-accent focus:ring-[3px] focus:ring-accent/20';

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
          <ul className="flex flex-col gap-4">
            {page.answers.map((a) => (
              <li key={a.number} className="flex items-start gap-3 text-sm">
                <span className={NUMBER}>{a.number}</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium text-ink">{a.question_text}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words leading-6 text-ink-2">{a.answer}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className={`flex flex-col gap-2 ${page.answers.length > 0 ? 'border-t border-line pt-4' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {page.packages.length > 1 ? (
            <select
              aria-label="Package"
              className={`h-9 px-2 ${CONTROL}`}
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
            className={`px-2.5 py-2 ${CONTROL}`}
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
                <li key={q.id} className="flex items-center gap-3 text-sm">
                  <span className={NUMBER}>{q.number}</span>
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

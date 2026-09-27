// One pre-bid question (SPEC §11.5): the full question, then Answer (reworded question + answer, published
// anonymized), Make addendum, or Dismiss (with Undo, no "are you sure?").
import { useState } from 'react';
import { FilePlus2, Send, X } from 'lucide-react';
import { useAddendumFromQuestion, useAnswerQuestion, useSetQuestionStatus } from '../../data/bids.mutations';
import { useBidQuestions } from '../../data/bids.queries';
import type { QuestionRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { questionChip } from './model';
import { useBidsNav } from './useBidsNav';

const INPUT = 'rounded-md border border-line px-2.5 py-2 text-sm font-normal text-ink outline-none focus:border-accent';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';

function QuestionBody({ projectId, q }: { projectId: string; q: QuestionRow }) {
  const answer = useAnswerQuestion();
  const toAddendum = useAddendumFromQuestion();
  const setStatus = useSetQuestionStatus();
  const nav = useBidsNav(projectId);
  const toast = useToast();
  const [questionText, setQuestionText] = useState(q.question);
  const [answerText, setAnswerText] = useState('');
  const [packageOnly, setPackageOnly] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const chip = questionChip(q.status);

  function publish() {
    if (questionText.trim() === '' || answerText.trim() === '') {
      setProblem('Question and answer are both needed.');
      return;
    }
    setProblem(null);
    answer.mutate(
      { question: q, questionText: questionText.trim(), answer: answerText.trim(), packageOnly },
      {
        onSuccess: () => {
          toast.show({ message: `Answer ${String(q.number)} published.` });
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  function dismiss() {
    toast.show({
      message: `Dismissing question ${String(q.number)}.`,
      action: { label: 'Undo', onClick: () => undefined },
      onCommit: () => {
        setStatus.mutate(
          { question: q, status: 'dismissed' },
          {
            onError: (e) => {
              toast.show({ tone: 'error', message: `Not dismissed: ${messageOf(e)}` });
            },
          },
        );
      },
    });
  }

  function makeAddendum() {
    toAddendum.mutate(q, {
      onSuccess: (a) => {
        nav.open(a.id, 'addenda');
      },
      onError: (e) => {
        setProblem(messageOf(e));
      },
    });
  }

  return (
    <ReadingPane number={String(q.number)} title={q.question} meta={<StatusChip status={chip.status} label={chip.label} />}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          publish();
        }}
      >
        <label className={LABEL}>
          Question as published
          <textarea rows={3} className={INPUT} value={questionText} onChange={(e) => {
              setQuestionText(e.target.value);
            }}
          />
        </label>
        <label className={LABEL}>
          Answer
          <textarea rows={5} className={INPUT} value={answerText} onChange={(e) => {
              setAnswerText(e.target.value);
            }}
          />
        </label>
        {q.package_id !== null ? (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={packageOnly} onChange={(e) => {
                setPackageOnly(e.target.checked);
              }}
            />
            Only this package
          </label>
        ) : null}
        {problem ? <p className="text-sm text-danger">{problem}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" icon={Send} loading={answer.isPending}>
            Answer
          </Button>
          <Button icon={FilePlus2} loading={toAddendum.isPending} onClick={makeAddendum}>
            Make addendum
          </Button>
          <Button variant="quiet" icon={X} disabled={q.status === 'dismissed'} onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </form>
    </ReadingPane>
  );
}

interface QuestionPaneProps {
  projectId: string;
  questionId: string;
}

export function QuestionPane({ projectId, questionId }: QuestionPaneProps) {
  const questions = useBidQuestions(projectId);
  if (questions.isPending) return <LoadingState label="Loading question" />;
  if (questions.isError) return <ErrorState error={questions.error} onRetry={() => void questions.refetch()} />;
  const q = questions.data.find((x) => x.id === questionId);
  if (!q) return <EmptyState title="That question is gone." />;
  return <QuestionBody projectId={projectId} q={q} />;
}

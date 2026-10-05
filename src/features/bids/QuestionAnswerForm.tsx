// The answer form of one question: the question as it will be published (reworded, anonymized), the answer, Only this
// package, then Answer / Make addendum / Dismiss. Answering again starts from the published answer. Make addendum
// starts from the reworded question (and the answer when written), never the asker's own words.
import { useState } from 'react';
import { FilePlus2, Send, X } from 'lucide-react';
import { addendumBody, useAddendumFromQuestion } from '../../data/addenda';
import { useAnswerQuestion, useSetQuestionStatus } from '../../data/bids.mutations';
import type { PublishedAnswerRow, QuestionRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { useBidsNav } from './useBidsNav';

const INPUT = 'rounded-md border border-line px-2.5 py-2 text-sm font-normal text-ink outline-none focus:border-accent';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';

interface QuestionAnswerFormProps {
  projectId: string;
  q: QuestionRow;
  /** The published answer, when answering again. */
  current: PublishedAnswerRow | undefined;
  onDone: () => void;
}

export function QuestionAnswerForm({ projectId, q, current, onDone }: QuestionAnswerFormProps) {
  const answer = useAnswerQuestion();
  const toAddendum = useAddendumFromQuestion();
  const setStatus = useSetQuestionStatus();
  const nav = useBidsNav(projectId);
  const toast = useToast();
  const [questionText, setQuestionText] = useState(current?.question_text ?? q.question);
  const [answerText, setAnswerText] = useState(current?.answer ?? '');
  const [packageOnly, setPackageOnly] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

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
          onDone();
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
    if (questionText.trim() === '') {
      setProblem('Word the question as it will be published first.');
      return;
    }
    toAddendum.mutate(
      { question: q, body: addendumBody(questionText, answerText) },
      {
        onSuccess: (a) => {
          nav.open(a.id, 'addenda');
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="question-form"
      onSubmit={(e) => {
        e.preventDefault();
        publish();
      }}
    >
      <label className={LABEL}>
        Question as published
        <textarea rows={3} className={INPUT} value={questionText} data-testid="question-published" onChange={(e) => {
            setQuestionText(e.target.value);
          }}
        />
      </label>
      <label className={LABEL}>
        Answer
        <textarea rows={5} className={INPUT} value={answerText} data-testid="question-answer-text" onChange={(e) => {
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
        <Button type="submit" variant="primary" icon={Send} loading={answer.isPending} data-testid="question-answer-send">
          {current ? 'Replace answer' : 'Answer'}
        </Button>
        {q.status === 'open' ? (
          <>
            <Button icon={FilePlus2} loading={toAddendum.isPending} data-testid="question-make-addendum" onClick={makeAddendum}>
              Make addendum
            </Button>
            <Button variant="quiet" icon={X} data-testid="question-dismiss" onClick={dismiss}>
              Dismiss
            </Button>
          </>
        ) : (
          <Button variant="quiet" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

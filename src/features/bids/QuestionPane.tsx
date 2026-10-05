// One pre-bid question (SPEC §11.5): who asked and for which package (managers only), the current published answer,
// then Answer (reworded question + answer, published anonymized), Make addendum (from the reworded question, never the
// asker's own words), or Dismiss (with Undo). An answered question shows its answer; "Answer again" opens the form
// with it, and publishing replaces it. A dismissed one can be reopened.
import { useState } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import { useSetQuestionStatus } from '../../data/bids.mutations';
import { useBidPackages, useBidQuestions, usePublishedAnswers } from '../../data/bids.queries';
import type { PublishedAnswerRow, QuestionRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { usePeopleDisplay } from '../../data/queries';
import { Button } from '../../ui/Button';
import { PaneSection, ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { bidderName, questionChip } from './model';
import { QuestionAnswerForm } from './QuestionAnswerForm';

interface QuestionBodyProps {
  projectId: string;
  q: QuestionRow;
  answer: PublishedAnswerRow | undefined;
}

function QuestionBody({ projectId, q, answer }: QuestionBodyProps) {
  const setStatus = useSetQuestionStatus();
  const packages = useBidPackages(projectId);
  const people = usePeopleDisplay(projectId);
  const toast = useToast();
  const [again, setAgain] = useState(false);
  const chip = questionChip(q.status);
  const pkg = packages.data?.find((p) => p.id === q.package_id);
  const asker = q.member_id === null ? 'By email' : bidderName(people.data?.find((p) => p.member_id === q.member_id));
  const meta = (
    <span className="flex flex-wrap items-center gap-2">
      <StatusChip status={chip.status} label={chip.label} />
      <span>{[asker, pkg ? `${pkg.code} ${pkg.name}` : null].filter((x) => x !== null).join(' · ')}</span>
    </span>
  );

  function reopen() {
    // Promise-based: the reopened question has a new version, which remounts this pane.
    setStatus.mutateAsync({ question: q, status: 'open' }).catch((e: unknown) => {
      toast.show({ tone: 'error', message: `Not reopened: ${messageOf(e)}` });
    });
  }

  const showForm = q.status === 'open' || again;
  return (
    <ReadingPane number={String(q.number)} title={q.question} meta={meta}>
      <div className="flex flex-col gap-3">
        {answer ? (
          <PaneSection title="Published" tone="tint" testId="question-answer">
            <p className="whitespace-pre-wrap break-words font-medium">{answer.question_text}</p>
            <p className="whitespace-pre-wrap break-words">{answer.answer}</p>
          </PaneSection>
        ) : null}
        {showForm ? (
          <QuestionAnswerForm
            projectId={projectId}
            q={q}
            current={answer}
            onDone={() => {
              setAgain(false);
            }}
          />
        ) : null}
        {q.status === 'answered' && !again ? (
          <Button
            className="w-fit"
            icon={Pencil}
            data-testid="question-answer-again"
            onClick={() => {
              setAgain(true);
            }}
          >
            Answer again
          </Button>
        ) : null}
        {q.status === 'dismissed' ? (
          <Button className="w-fit" icon={RotateCcw} loading={setStatus.isPending} data-testid="question-reopen" onClick={reopen}>
            Reopen
          </Button>
        ) : null}
      </div>
    </ReadingPane>
  );
}

interface QuestionPaneProps {
  projectId: string;
  questionId: string;
}

export function QuestionPane({ projectId, questionId }: QuestionPaneProps) {
  const questions = useBidQuestions(projectId);
  const answers = usePublishedAnswers(projectId);
  if (questions.isPending || answers.isPending) return <LoadingState label="Loading question" />;
  if (questions.isError) return <ErrorState error={questions.error} onRetry={() => void questions.refetch()} />;
  if (answers.isError) return <ErrorState error={answers.error} onRetry={() => void answers.refetch()} />;
  const q = questions.data.find((x) => x.id === questionId);
  if (!q) return <EmptyState title="That question is gone." />;
  return <QuestionBody key={`${q.id}-${String(q.version)}`} projectId={projectId} q={q} answer={answers.data.find((a) => a.number === q.number)} />;
}

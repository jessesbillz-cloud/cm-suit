// Settings > Job, "RFIs" (for those who issue RFIs, rfi.sign_issue; when RFIs are on for the job): how many days the
// architect has to answer, the originator's window to claim impact, and the route reviewers take before issue. Saved
// as it changes (days on leaving the box), one save at a time, each with the version the last one returned.
import { useRef, useState } from 'react';
import { messageOf } from '../../data/errors';
import { useCapability, usePeopleDisplay, useProject } from '../../data/queries';
import { useSaveRfiSettings } from '../../data/rfis.mutations';
import { useRfiSettings } from '../../data/rfis.queries';
import type { RfiSettings, RouteChoice } from '../../data/rfis.types';
import type { Person } from '../../data/types';
import { Card } from '../../ui/Card';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { moveAt, parseDays } from './model';
import { RouteSteps, type Step } from './RouteSteps';

interface DaysFieldProps {
  label: string;
  value: string;
  testId: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}

function DaysField({ label, value, testId, onChange, onBlur }: DaysFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
      {label}
      <span className="flex h-9 w-36 items-center rounded-md border border-line-strong bg-card shadow-control focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          className="h-full min-w-0 flex-1 rounded-md bg-transparent px-2.5 text-sm font-normal tabular-nums text-ink outline-none"
          value={value}
          data-testid={testId}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          onBlur={onBlur}
        />
        <span className="pr-2.5 text-sm font-normal text-ink-2">days</span>
      </span>
    </label>
  );
}

function choiceOf(s: Step): RouteChoice {
  return s.user_id !== null ? { user_id: s.user_id } : { role: s.role ?? '' };
}

interface FormProps {
  initial: RfiSettings;
  people: readonly Person[];
  save: ReturnType<typeof useSaveRfiSettings>;
  onProblem: (problem: string | null) => void;
}

function RfiSettingsForm({ initial, people, save, onProblem: setProblem }: FormProps) {
  const [answer, setAnswer] = useState(String(initial.answer_days));
  const [impact, setImpact] = useState(String(initial.impact_days));
  const [steps, setSteps] = useState<Step[]>(initial.route.map(({ role, user_id, label }) => ({ role, user_id, label })));
  const version = useRef(initial.version);
  const chain = useRef<Promise<void>>(Promise.resolve());

  function commit(next: { answer: string; impact: string; steps: Step[] }) {
    const answerDays = parseDays(next.answer);
    const impactDays = parseDays(next.impact);
    if (answerDays === null || impactDays === null) {
      setProblem('Days are 1 to 60.');
      return;
    }
    setProblem(null);
    const route = next.steps.map(choiceOf);
    chain.current = chain.current.then(async () => {
      try {
        const saved = await save.mutateAsync({ version: version.current, answerDays, impactDays, route });
        version.current = saved.version;
        setSteps(saved.route.map(({ role, user_id, label }) => ({ role, user_id, label })));
      } catch (e) {
        setProblem(messageOf(e));
      }
    });
  }

  function changeSteps(next: Step[]) {
    setSteps(next);
    commit({ answer, impact, steps: next });
  }

  const blurDays = () => {
    if (answer !== String(initial.answer_days) || impact !== String(initial.impact_days) || version.current !== initial.version) {
      commit({ answer, impact, steps });
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="rfi-settings">
      <div className="flex flex-wrap gap-4">
        <DaysField label="Answer due" value={answer} testId="rfi-answer-days" onChange={setAnswer} onBlur={blurDays} />
        <DaysField label="Impact window" value={impact} testId="rfi-impact-days" onChange={setImpact} onBlur={blurDays} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-2">Route</span>
        <RouteSteps
          steps={steps}
          people={people}
          onMove={(i, step) => {
            changeSteps(moveAt(steps, i, step));
          }}
          onRemove={(i) => {
            changeSteps(steps.filter((_, j) => j !== i));
          }}
          onAdd={(s) => {
            changeSteps([...steps, s]);
          }}
        />
      </div>
    </div>
  );
}

export function RfiSettingsCard({ projectId }: { projectId: string }) {
  const can = useCapability(projectId, 'rfi.sign_issue');
  const project = useProject(projectId);
  const settings = useRfiSettings(projectId);
  const people = usePeopleDisplay(projectId);
  const save = useSaveRfiSettings(projectId);
  const [problem, setProblem] = useState<string | null>(null);

  if (can.isError) return <ErrorState error={can.error} onRetry={() => void can.refetch()} />;
  if (can.data !== true || !project.data?.modules.includes('rfis')) return null;
  const error = settings.error ?? people.error;
  return (
    <Card title="RFIs" actions={<SaveState pending={save.isPending} saved={save.isSuccess} problem={problem} />}>
      {settings.isPending || people.isPending ? <LoadingState label="Loading RFI settings" /> : null}
      {error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void settings.refetch();
            void people.refetch();
          }}
        />
      ) : null}
      {settings.data && people.data ? <RfiSettingsForm key={projectId} initial={settings.data} people={people.data} save={save} onProblem={setProblem} /> : null}
    </Card>
  );
}

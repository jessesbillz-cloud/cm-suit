// The one small line under an autosaving form: a problem in red, else "Saving" / "Saved". No dialogs.
interface SaveStateProps {
  pending: boolean;
  saved: boolean;
  problem: string | null;
}

export function SaveState({ pending, saved, problem }: SaveStateProps) {
  if (problem !== null) {
    return (
      <p role="alert" className="text-sm text-danger">
        {problem}
      </p>
    );
  }
  return (
    <p aria-live="polite" className="h-5 text-xs text-ink-2">
      {pending ? 'Saving' : saved ? 'Saved' : ''}
    </p>
  );
}

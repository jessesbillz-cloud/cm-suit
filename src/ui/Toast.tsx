// The ONE toast (CLAUDE.md rule 11). Undo instead of "are you sure?" (rule 16): pass an action. At most MAX_SHOWN at
// once, the newest: a run of quick moves (a manager signing off rev after rev on a phone) must not stack toasts over
// the very buttons they tap next. A toast pushed out goes as if its time ran out (its onCommit runs).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Icon } from './Icon';

interface ToastInput {
  message: string;
  tone?: 'info' | 'error' | undefined;
  /** e.g. { label: 'Undo', onClick } — clicking it dismisses the toast without running onCommit. */
  action?: { label: string; onClick: () => void } | undefined;
  /** Runs when the toast goes away (timeout or close) without its action being used: the moment to commit. */
  onCommit?: (() => void) | undefined;
  durationMs?: number | undefined;
}

interface ToastEntry extends ToastInput {
  id: number;
}

interface ToastValue {
  /** Shows a toast; answers its id. */
  show: (t: ToastInput) => number;
  /** Closes a toast now without running its onCommit (the caller has committed, e.g. before a submit). */
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

/** The most toasts on screen at once. */
const MAX_SHOWN = 3;

export function useToast(): ToastValue {
  const v = useContext(ToastContext);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}

interface ToastItemProps {
  toast: ToastEntry;
  onDismiss: (id: number, commit: boolean) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const duration = toast.durationMs ?? (toast.tone === 'error' ? 8000 : 5000);
  useEffect(() => {
    const t = window.setTimeout(() => {
      onDismiss(toast.id, true);
    }, duration);
    return () => {
      window.clearTimeout(t);
    };
  }, [toast.id, duration, onDismiss]);

  const isError = toast.tone === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex items-center gap-3 rounded-card px-4 py-2.5 text-sm shadow-pop ${
        isError ? 'bg-danger-soft text-danger' : 'bg-ink text-white'
      }`}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          className={`font-semibold underline-offset-2 hover:underline ${isError ? 'text-danger' : 'text-white'}`}
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id, false);
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        className="opacity-70 hover:opacity-100"
        onClick={() => {
          onDismiss(toast.id, true);
        }}
      >
        <Icon icon={X} size={16} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);
  const commits = useRef(new Map<number, () => void>());

  const show = useCallback((t: ToastInput) => {
    const id = nextId.current;
    nextId.current += 1;
    if (t.onCommit) commits.current.set(id, t.onCommit);
    setToasts((list) => [...list, { ...t, id }]);
    return id;
  }, []);

  const dismiss = useCallback((id: number, commit: boolean) => {
    const onCommit = commits.current.get(id);
    commits.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
    if (commit && onCommit) onCommit();
  }, []);

  // More than MAX_SHOWN: the oldest go, committed as if their time ran out.
  useEffect(() => {
    for (const t of toasts.slice(0, Math.max(0, toasts.length - MAX_SHOWN))) dismiss(t.id, true);
  }, [toasts, dismiss]);

  const close = useCallback((id: number) => {
    dismiss(id, false);
  }, [dismiss]);

  const value = useMemo(() => ({ show, dismiss: close }), [show, close]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)]">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto w-full max-w-md">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

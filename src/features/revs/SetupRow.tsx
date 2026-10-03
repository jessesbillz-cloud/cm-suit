// One row of Setup (a rev, an item, a wall): its text, wrapping, and its moves as line icons: up, down, edit, remove.
// The icons carry the meaning; each has a spoken name. On a phone the moves drop under the text when it needs the room.
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';

interface SetupRowProps {
  /** What the row is, for the buttons' spoken names ("Move HOW Cavity Stuff up"). */
  name: string;
  children: ReactNode;
  isPhone: boolean;
  disabled: boolean;
  onUp?: (() => void) | undefined;
  onDown?: (() => void) | undefined;
  onEdit: () => void;
  onRemove: () => void;
  testId?: string | undefined;
  /** A heading row (a rev) reads stronger than its items. */
  strong?: boolean | undefined;
}

export function SetupRow({ name, children, isPhone, disabled, onUp, onDown, onEdit, onRemove, testId, strong = false }: SetupRowProps) {
  const size = isPhone ? 'md' : 'sm';
  const moves = onUp !== undefined || onDown !== undefined;
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${strong ? 'py-1.5' : 'py-1'}`} data-testid={testId}>
      <div className={`min-w-[12rem] flex-1 break-words leading-6 ${strong ? 'text-[14.5px] font-semibold text-ink' : 'text-[14px] text-ink'}`}>
        {children}
      </div>
      <div className="ml-auto flex shrink-0 items-center">
        {moves ? (
          <>
            <Button size={size} variant="quiet" icon={ArrowUp} aria-label={`Move ${name} up`} title="Up" disabled={disabled || !onUp} onClick={onUp} />
            <Button size={size} variant="quiet" icon={ArrowDown} aria-label={`Move ${name} down`} title="Down" disabled={disabled || !onDown} onClick={onDown} />
          </>
        ) : null}
        <Button size={size} variant="quiet" icon={Pencil} aria-label={`Edit ${name}`} title="Edit" disabled={disabled} data-testid="rev-setup-edit" onClick={onEdit} />
        <Button size={size} variant="quiet" icon={Trash2} aria-label={`Remove ${name}`} title="Remove" disabled={disabled} data-testid="rev-setup-remove" onClick={onRemove} />
      </div>
    </div>
  );
}

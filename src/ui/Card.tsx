import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  title?: ReactNode | undefined;
  /** Right side of the title row: one or two actions at most. */
  actions?: ReactNode | undefined;
  className?: string | undefined;
  padded?: boolean | undefined;
}

/** White card, soft shadow, 8px radius on the near-white page (SPEC §7.1). */
export function Card({ children, title, actions, className = '', padded = true }: CardProps) {
  return (
    <section className={`rounded-card bg-card shadow-card ${className}`}>
      {title !== undefined || actions !== undefined ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

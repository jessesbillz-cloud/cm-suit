import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  title?: ReactNode | undefined;
  /** Right side of the title row: one or two actions at most. */
  actions?: ReactNode | undefined;
  className?: string | undefined;
  padded?: boolean | undefined;
}

/** White card with a hairline edge and a two-step shadow on the near-white page; the header sits on a faint tint (SPEC §7.1). */
export function Card({ children, title, actions, className = '', padded = true }: CardProps) {
  return (
    <section className={`rounded-card bg-card shadow-card ${className}`}>
      {title !== undefined || actions !== undefined ? (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-t-card border-b border-line bg-card-head px-4 py-3">
          <h2 className="text-[15px] font-semibold leading-6 tracking-[-0.005em] text-ink">{title}</h2>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

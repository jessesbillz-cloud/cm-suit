// A spec section rebuilt as web text (0118): PART headings on a hard rule, numbered articles, paragraphs hung on their
// labels and set in by their level, so the outline reads at a glance on a phone as on a desk. The words are the
// server's parse of the book's own text (supabase/functions/_shared/specText.ts).
import type { SpecTextBlock } from '../../data/specs';

/** How far each paragraph level sits in: a little on a phone, more on a wider screen. */
const INDENT: Record<number, string> = {
  1: 'pl-2 sm:pl-6',
  2: 'pl-8 sm:pl-[3.75rem]',
  3: 'pl-14 sm:pl-24',
  4: 'pl-20 sm:pl-[8.25rem]',
  5: 'pl-[6.5rem] sm:pl-[10.5rem]',
};

const labelOf = (b: Extract<SpecTextBlock, { k: 'para' }>) => `${b.n}${b.d >= 4 ? ')' : '.'}`;

function Block({ b }: { b: SpecTextBlock }) {
  switch (b.k) {
    case 'part':
      return (
        <h2 data-testid="spec-part" className="heading mt-10 flex items-baseline gap-3 border-b-[3px] border-ink pb-1.5 text-[19px] font-semibold text-ink first:mt-0 sm:text-[21px]">
          <span className="shrink-0">Part {b.n}</span>
          <span className="min-w-0 wrap-anywhere">{b.t}</span>
        </h2>
      );
    case 'article':
      return (
        <h3 data-testid="spec-article" className="heading mt-7 flex items-baseline gap-3 text-[16px] font-semibold text-ink sm:text-[17px]">
          <span className="w-11 shrink-0 tabular-nums">{b.n}</span>
          <span className="min-w-0 wrap-anywhere">{b.t}</span>
        </h3>
      );
    case 'para':
      return (
        <p data-testid="spec-para" data-level={b.d} className={`mt-2.5 flex gap-2.5 ${INDENT[b.d] ?? 'pl-2'}`}>
          <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-ink-2">{labelOf(b)}</span>
          <span className="min-w-0 flex-1 break-words">{b.t}</span>
        </p>
      );
    case 'text':
      return <p className="mt-2.5 break-words text-ink-2">{b.t}</p>;
  }
}

export function SectionBody({ blocks }: { blocks: readonly SpecTextBlock[] }) {
  return (
    <div data-testid="spec-text" className="max-w-[46rem] text-[16px] leading-[1.6] text-ink">
      {blocks.map((b, i) => (
        <Block key={i} b={b} />
      ))}
    </div>
  );
}

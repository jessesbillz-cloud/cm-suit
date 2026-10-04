// A signature drawn from its strokes (a closed meeting's sheet): the same 2:1 box as the pad and the PDF.
import type { Signature } from '../../data/safety.types';
import { PAD_ASPECT, strokePath } from './signature';

const W = 200;
const H = W / PAD_ASPECT;

export function SignatureView({ strokes, label }: { strokes: Signature; label: string }) {
  return (
    <svg viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label={label} className="h-9 w-[72px] shrink-0 text-ink" data-testid="safety-signature">
      {strokes.map((s, i) => (
        <path key={i} d={strokePath(s, W, H)} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

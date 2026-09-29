// The square a line leads with: the kind's icon on a soft tile. Accent tint for what needs you.
import type { LucideIcon } from 'lucide-react';
import { Icon } from '../../ui/Icon';

interface KindSquareProps {
  icon: LucideIcon;
  /** 32 in the main area, 28 in the right column. */
  size?: 32 | 28 | undefined;
  accent?: boolean | undefined;
  /** Only when no text beside it names the kind. */
  label?: string | undefined;
}

export function KindSquare({ icon, size = 32, accent = false, label }: KindSquareProps) {
  const box = size === 32 ? 'h-8 w-8 rounded-lg' : 'h-7 w-7 rounded-md';
  const tone = accent ? 'bg-accent-soft text-accent ring-1 ring-inset ring-accent/15' : 'bg-page text-ink-2';
  return (
    <span className={`flex shrink-0 items-center justify-center ${box} ${tone}`}>
      <Icon icon={icon} size={size === 32 ? 16 : 15} label={label} />
    </span>
  );
}

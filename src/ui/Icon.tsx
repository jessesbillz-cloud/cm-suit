// Thin wrapper over Lucide line icons: one stroke weight, one color (currentColor). Decorative unless labelled.
import type { LucideIcon } from 'lucide-react';

interface IconProps {
  icon: LucideIcon;
  size?: number | undefined;
  /** Give a label only when the icon stands alone and carries meaning. */
  label?: string | undefined;
  className?: string | undefined;
}

export function Icon({ icon: Glyph, size = 18, label, className }: IconProps) {
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
    />
  );
}

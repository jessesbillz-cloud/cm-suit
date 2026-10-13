import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { Icon } from './Icon';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant | undefined;
  loading?: boolean | undefined;
  icon?: LucideIcon | undefined;
  size?: 'sm' | 'md' | 'lg' | undefined;
  children?: ReactNode | undefined;
}

// One accent (primary), a white box (secondary), red words in a white box for the rare destructive move. Every one is a
// box you can see: an edge and a drop shadow, a lift on hover, pressed in on press (Jesse, Oct 12: "very distinct
// clickable boxes"). Quiet with words is a light box (it still reads as a button); quiet with only an icon has no
// chrome until the pointer is on it.
const VARIANTS: Record<Exclude<Variant, 'quiet'>, string> = {
  primary:
    'bg-accent text-white shadow-primary hover:bg-accent-hover hover:shadow-primary-hover active:bg-accent-hover active:shadow-press disabled:bg-accent/45 disabled:shadow-none',
  secondary:
    'border border-line-strong bg-card text-ink shadow-tile hover:border-ink-3/50 hover:shadow-tile-hover active:bg-card-head active:shadow-press disabled:border-line disabled:bg-card disabled:text-ink-3/50 disabled:shadow-none',
  danger:
    'border border-line-strong bg-card text-danger shadow-tile hover:border-danger/40 hover:bg-danger-soft hover:shadow-tile-hover active:shadow-press disabled:border-line disabled:text-ink-3/50 disabled:shadow-none',
};

const QUIET_WORDS =
  'bg-card-head text-ink ring-1 ring-inset ring-line hover:bg-card hover:text-accent hover:shadow-tile active:bg-page active:shadow-press disabled:bg-transparent disabled:text-ink-3/50 disabled:shadow-none disabled:ring-0';
const QUIET_ICON =
  'bg-transparent text-ink hover:bg-card hover:text-accent hover:shadow-tile active:bg-page active:shadow-press disabled:bg-transparent disabled:text-ink-3/50 disabled:shadow-none';

function variantClass(variant: Variant, iconOnly: boolean): string {
  if (variant !== 'quiet') return VARIANTS[variant];
  return iconOnly ? QUIET_ICON : QUIET_WORDS;
}

// sm 32px, md 40px, lg 44px (a bar's one big action, e.g. Submit). A button with only an icon is square.
const SIZES = {
  sm: { text: 'h-8 gap-1.5 rounded-md px-3 text-[13px]', square: 'h-8 w-8 rounded-md', icon: 15 },
  md: { text: 'h-10 gap-2 rounded-lg px-4 text-sm', square: 'h-10 w-10 rounded-lg', icon: 16 },
  lg: { text: 'h-11 gap-2 rounded-lg px-6 text-base', square: 'h-11 w-11 rounded-lg', icon: 18 },
} as const;

export function Button({
  variant = 'secondary',
  loading = false,
  icon,
  size = 'md',
  type = 'button',
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const s = SIZES[size];
  const iconOnly = children === undefined || children === null || children === false;
  return (
    <button
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={`inline-flex select-none items-center justify-center font-medium transition-[background-color,border-color,color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${iconOnly ? `shrink-0 ${s.square}` : s.text} ${variantClass(variant, iconOnly)} ${className}`}
      {...rest}
    >
      {loading ? <Icon icon={LoaderCircle} size={s.icon} className="animate-spin" /> : icon ? <Icon icon={icon} size={s.icon} /> : null}
      {children}
    </button>
  );
}

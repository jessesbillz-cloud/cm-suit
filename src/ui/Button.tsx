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

// One accent (primary), white with a hairline (secondary), no chrome (quiet), red words for the rare destructive move.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white shadow-primary hover:bg-accent-hover active:bg-accent-hover disabled:bg-accent/45 disabled:shadow-none',
  secondary:
    'border border-line-strong bg-card text-ink shadow-control hover:border-ink-3/60 hover:bg-card-head active:bg-page disabled:border-line disabled:bg-card disabled:text-ink-3/50 disabled:shadow-none',
  quiet: 'bg-transparent text-ink hover:bg-page hover:text-accent active:bg-line/60 disabled:bg-transparent disabled:text-ink-3/50',
  danger:
    'border border-line-strong bg-card text-danger shadow-control hover:border-danger/40 hover:bg-danger-soft disabled:border-line disabled:text-ink-3/50 disabled:shadow-none',
};

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
      className={`inline-flex select-none items-center justify-center font-medium transition-[background-color,border-color,color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${iconOnly ? `shrink-0 ${s.square}` : s.text} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Icon icon={LoaderCircle} size={s.icon} className="animate-spin" /> : icon ? <Icon icon={icon} size={s.icon} /> : null}
      {children}
    </button>
  );
}

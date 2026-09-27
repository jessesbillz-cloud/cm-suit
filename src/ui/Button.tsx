import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { Icon } from './Icon';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant | undefined;
  loading?: boolean | undefined;
  icon?: LucideIcon | undefined;
  size?: 'md' | 'sm' | undefined;
  children?: ReactNode | undefined;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover disabled:bg-accent/50',
  secondary: 'bg-card text-ink border border-line hover:bg-page disabled:text-ink-3',
  quiet: 'bg-transparent text-ink-2 hover:bg-page hover:text-ink disabled:text-ink-3',
  danger: 'bg-card text-danger border border-line hover:bg-danger-soft disabled:text-ink-3',
};

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
  const pad = size === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-9 px-3.5 text-sm';
  return (
    <button
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${pad} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Icon icon={LoaderCircle} size={16} className="animate-spin" /> : icon ? <Icon icon={icon} size={16} /> : null}
      {children}
    </button>
  );
}

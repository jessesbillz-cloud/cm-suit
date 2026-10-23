import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { FOCUS_RING } from './box';
import { Icon } from './Icon';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant | undefined;
  loading?: boolean | undefined;
  icon?: LucideIcon | undefined;
  size?: 'sm' | 'md' | 'lg' | undefined;
  children?: ReactNode | undefined;
}

// The look (Jesse, Oct 12: "very distinct clickable boxes"; Oct 23: "bold hard lines"): primary is black with white
// words (the accent red stays for the selected place and focus, never next to a red "Not approved"), secondary a white
// box with a crisp ink edge, danger red words in a white box for the rare destructive move. Every one is a box you can
// see: an edge and a deep drop, a lift on hover, pressed in on press, 150 ms. Words in the display face, upper case
// (styles.css .heading). Quiet with words is a light box (it still reads as a button); quiet with only an icon has no
// chrome until the pointer is on it.
const LIFT = 'hover:-translate-y-px active:translate-y-0 disabled:translate-y-0';
const VARIANTS: Record<Exclude<Variant, 'quiet'>, string> = {
  primary: `border-[1.5px] border-ink bg-ink text-white shadow-primary ${LIFT} hover:bg-black hover:shadow-primary-hover active:shadow-press disabled:border-ink/40 disabled:bg-ink/40 disabled:shadow-none`,
  secondary: `border-[1.5px] border-ink bg-card text-ink shadow-tile ${LIFT} hover:shadow-tile-hover active:bg-card-head active:shadow-press disabled:border-line-strong disabled:bg-card disabled:text-ink-3/50 disabled:shadow-none`,
  danger: `border-[1.5px] border-danger bg-card text-danger shadow-tile ${LIFT} hover:bg-danger-soft hover:shadow-tile-hover active:shadow-press disabled:border-line-strong disabled:text-ink-3/50 disabled:shadow-none`,
};

const QUIET_WORDS =
  'bg-card-head text-ink ring-1 ring-inset ring-line-strong hover:bg-card hover:shadow-tile hover:ring-ink active:bg-page active:shadow-press disabled:bg-transparent disabled:text-ink-3/50 disabled:shadow-none disabled:ring-0';
const QUIET_ICON =
  'bg-transparent text-ink hover:bg-card hover:text-accent hover:shadow-tile active:bg-page active:shadow-press disabled:bg-transparent disabled:text-ink-3/50 disabled:shadow-none';

function variantClass(variant: Variant, iconOnly: boolean): string {
  if (variant !== 'quiet') return VARIANTS[variant];
  return iconOnly ? QUIET_ICON : QUIET_WORDS;
}

// sm 32px, md 40px, lg 44px (a bar's one big action, e.g. Submit). A button with only an icon is square.
const SIZES = {
  sm: { text: 'heading h-8 gap-1.5 rounded-md px-3 text-[13px]', square: 'h-8 w-8 rounded-md', icon: 15 },
  md: { text: 'heading h-10 gap-2 rounded-md px-4 text-[14px]', square: 'h-10 w-10 rounded-md', icon: 16 },
  lg: { text: 'heading h-11 gap-2 rounded-md px-6 text-[16px]', square: 'h-11 w-11 rounded-md', icon: 18 },
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
      className={`inline-flex select-none items-center justify-center font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out ${FOCUS_RING} disabled:cursor-not-allowed ${iconOnly ? `shrink-0 ${s.square}` : s.text} ${variantClass(variant, iconOnly)} ${className}`}
      {...rest}
    >
      {loading ? <Icon icon={LoaderCircle} size={s.icon} className="animate-spin" /> : icon ? <Icon icon={icon} size={s.icon} /> : null}
      {children}
    </button>
  );
}

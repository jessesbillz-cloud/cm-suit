// A few one-line tips so the layout gets set up well once. The one place in Settings where helper text is wanted.
import { Lightbulb } from 'lucide-react';
import { Icon } from '../../ui/Icon';

const TIPS = [
  'Put the tools you use daily first. The phone shows the first four.',
  'Open on the screen you want to land on.',
  'Keep the right column on Board to see new items while you work.',
  'Subscribe only to what you act on.',
];

export function LayoutTips() {
  return (
    <aside data-testid="layout-tips" className="flex gap-3 rounded-md border border-accent/15 bg-accent-soft px-3.5 py-3">
      <Icon icon={Lightbulb} size={18} label="Tips" className="mt-px shrink-0 text-accent" />
      <ul className="flex flex-col gap-1 text-sm text-ink">
        {TIPS.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </aside>
  );
}

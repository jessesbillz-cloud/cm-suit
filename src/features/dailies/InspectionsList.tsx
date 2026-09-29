// IR results the inspections module wrote onto the report (content.inspections): shown here, never typed.
import type { DailyContent } from '../../lib/dailies';
import { Section } from './Section';

export function InspectionsList({ items }: { items: DailyContent['inspections'] }) {
  if (items.length === 0) return null;
  return (
    <Section title="Inspections" count={items.length} testId="daily-inspections">
      <ul className="flex flex-col divide-y divide-line">
        {items.map((i) => (
          <li key={i.ref} className="whitespace-pre-wrap break-words py-2 text-sm text-ink first:pt-0 last:pb-0">
            {i.text}
          </li>
        ))}
      </ul>
    </Section>
  );
}

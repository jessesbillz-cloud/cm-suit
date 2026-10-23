// The spec section search's answer (Jesse, Oct 12: "a search bar and you can search the spec section"): each matching
// section as a box, its number, title and how many submittals, RFIs and CCDs it has; a box opens the section's page.
import { BookOpen } from 'lucide-react';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { hubCounts, matchSections } from './hubItems';
import type { HubData } from './useHubData';

interface SpecBoxesProps {
  query: string;
  data: HubData;
  onOpen: (key: string) => void;
}

export function SpecBoxes({ query, data, onOpen }: SpecBoxesProps) {
  if (data.failed) return <ErrorState error={data.failed.error} onRetry={data.failed.retry} className="m-0" />;
  if (!data.sources) {
    return (
      <Card>
        <LoadingState label="Finding sections" />
      </Card>
    );
  }
  const found = matchSections(data.sections, query, data.divisionTitle);
  if (found.length === 0) {
    return (
      <Card>
        <EmptyState icon={BookOpen} title="No spec section matches." />
      </Card>
    );
  }
  const counts = hubCounts(data.sources);
  return (
    <ul data-testid="spec-hub-boxes" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {found.map((s) => {
        const n = counts.get(s.key) ?? 0;
        return (
          <li key={s.key}>
            <button
              type="button"
              data-testid="spec-hub-box"
              className="flex h-full w-full items-start gap-3 rounded-card bg-card px-4 py-3 text-left shadow-card transition-shadow hover:shadow-pop focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => {
                onOpen(s.key);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold tabular-nums text-ink">{s.section}</span>
                <span className="block text-sm text-ink-2 wrap-anywhere">{s.title}</span>
              </span>
              {n > 0 ? (
                <span data-testid="spec-hub-box-count" className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-accent">
                  {n}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

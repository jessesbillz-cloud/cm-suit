// The sub directory (SPEC §11.2), org-level, inside the Bids tool: find by company, contact, city or license; filter by
// one of the job's packages; Import list; Add sub. A row opens in the right column.
import { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useBidPackages } from '../../data/bids.queries';
import { useSubs } from '../../data/subs.queries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { ImportSubsButton } from './ImportSubsButton';
import { NEW_SUB_ITEM } from './model';
import { SubList } from './SubList';
import { matchesQuery, searchText } from './subs';

const PAGE = 100;
const ALL = '';
const count = new Intl.NumberFormat('en-US');
const CONTROL = 'h-9 rounded-md border border-line bg-card px-2.5 text-sm text-ink outline-none focus:border-accent';

interface SubsViewProps {
  projectId: string;
  orgId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function SubsView({ projectId, orgId, selectedId, onOpen }: SubsViewProps) {
  const subs = useSubs(orgId);
  const packages = useBidPackages(projectId);
  const [query, setQuery] = useState('');
  const [trade, setTrade] = useState(ALL);
  const [shown, setShown] = useState(PAGE);

  const indexed = useMemo(() => (subs.data ?? []).map((s) => ({ s, text: searchText(s) })), [subs.data]);
  const rows = useMemo(
    () => indexed.filter((x) => (trade === ALL || x.s.trades.includes(trade)) && matchesQuery(x.text, query)).map((x) => x.s),
    [indexed, trade, query],
  );
  const more = useCallback(() => {
    setShown((n) => n + PAGE);
  }, []);

  const actions = (
    <>
      <ImportSubsButton projectId={projectId} orgId={orgId} />
      <Button
        size="sm"
        icon={Plus}
        onClick={() => {
          onOpen(NEW_SUB_ITEM);
        }}
      >
        Add sub
      </Button>
    </>
  );

  const total = subs.data?.length ?? 0;
  return (
    <Card actions={actions} padded={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <input
          type="search"
          aria-label="Find a sub"
          placeholder="Find"
          data-testid="subs-find"
          className={`min-w-40 flex-1 ${CONTROL}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
        />
        <select
          aria-label="Package"
          data-testid="subs-package"
          className={`w-44 ${CONTROL}`}
          value={trade}
          onChange={(e) => {
            setTrade(e.target.value);
            setShown(PAGE);
          }}
        >
          <option value={ALL}>All packages</option>
          {(packages.data ?? []).map((p) => (
            <option key={p.id} value={p.code}>
              {p.code} {p.name}
            </option>
          ))}
        </select>
        {subs.isSuccess ? (
          <span className="text-xs tabular-nums text-ink-2" data-testid="subs-count">
            {rows.length === total ? count.format(total) : `${count.format(rows.length)} of ${count.format(total)}`}
          </span>
        ) : null}
      </div>
      {subs.isPending ? <LoadingState label="Loading subs" /> : null}
      {subs.isError ? <ErrorState error={subs.error} onRetry={() => void subs.refetch()} /> : null}
      {subs.isSuccess && total === 0 ? <EmptyState title="No subs yet." /> : null}
      {subs.isSuccess && total > 0 && rows.length === 0 ? <EmptyState title="No match." /> : null}
      {rows.length > 0 ? <SubList rows={rows} shown={shown} onMore={more} selectedId={selectedId} onOpen={onOpen} /> : null}
    </Card>
  );
}

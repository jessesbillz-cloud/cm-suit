// RFIs (the Sep 28 contract, SPEC §7.4, §14.1): the log in the main area with one big "New RFI" button; the new form
// and each RFI open in the right column (full screen on the phone) so the log stays in view. Open / Mine / All, one
// search box (a number + Enter opens that RFI), click a header to sort; by default what waits on me comes first,
// then anything late, then anything due, then the newest.
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useUser } from '../../data/auth';
import { useProject } from '../../data/queries';
import { useRfiList } from '../../data/rfis.queries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { ChoiceRow } from '../inspections/ChoiceRow';
import { FILTERS, NEW_ITEM, openTarget, visibleRows, type Filter } from './model';
import { RfiLog } from './RfiLog';
import { useRfiCaps } from './useRfiCaps';
import { useRfisNav } from './useRfisNav';

interface RfisToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

interface SearchBoxProps {
  initial: string;
  onChange: (q: string) => void;
  onEnter: (q: string) => void;
}

function SearchBox({ initial, onChange, onEnter }: SearchBoxProps) {
  const [text, setText] = useState(initial);
  return (
    <label className="flex h-9 min-w-[10rem] flex-1 items-center gap-2 rounded-md border border-line-strong bg-card px-3 text-sm shadow-control focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20">
      <Icon icon={Search} size={16} className="text-ink-3" />
      <input
        type="search"
        aria-label="Search RFIs"
        placeholder="Number or title"
        data-testid="rfi-search"
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter(text);
        }}
      />
    </label>
  );
}

const EMPTY_FILTER: Record<Filter, string> = {
  open: 'No open RFIs.',
  mine: 'None of yours.',
  all: 'No RFIs yet.',
};

export function RfisTool({ projectId, itemId, isPhone }: RfisToolProps) {
  const user = useUser();
  const nav = useRfisNav(projectId, itemId);
  const { caps, error, retry } = useRfiCaps(projectId);
  const list = useRfiList(projectId);
  const project = useProject(projectId);

  if (error) return <ErrorState error={error} onRetry={retry} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (!caps || project.isPending) return <LoadingState label="Loading RFIs" />;

  const now = new Date();
  const rows = list.data ?? [];
  const view = { filter: nav.filter, query: nav.query, sort: nav.sort, userId: user.id };
  const visible = visibleRows(rows, view, now);
  const newButton = caps.create ? (
    <Button
      variant="primary"
      icon={Plus}
      className="h-10 px-4 text-[15px]"
      data-testid="rfi-new"
      onClick={() => {
        nav.open(NEW_ITEM);
      }}
    >
      New RFI
    </Button>
  ) : undefined;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <Card padded={false} title="RFIs" actions={newButton}>
        {rows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
            <ChoiceRow label="Show" options={FILTERS} value={nav.filter} onPick={nav.setFilter} testId="rfi-filter" />
            <SearchBox
              initial={nav.query}
              onChange={nav.setQuery}
              onEnter={(q) => {
                const target = openTarget(rows, visibleRows(rows, { ...view, query: q }, now), q);
                if (target) nav.open(target.id);
              }}
            />
          </div>
        ) : null}
        {list.isPending ? <LoadingState label="Loading RFIs" /> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.isSuccess && rows.length === 0 ? <EmptyState title="No RFIs yet." /> : null}
        {rows.length > 0 && visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-2" data-testid="rfi-none">
            {nav.query.trim() === '' ? EMPTY_FILTER[nav.filter] : 'Nothing matches.'}
          </p>
        ) : null}
        {visible.length > 0 ? (
          <RfiLog
            rows={visible}
            timeZone={project.data.timezone}
            now={now}
            selectedId={itemId}
            sort={nav.sort}
            onSort={nav.setSort}
            onOpen={nav.open}
            isPhone={isPhone}
          />
        ) : null}
      </Card>
    </div>
  );
}

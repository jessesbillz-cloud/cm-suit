// Corrections log / punchlist (SPEC §13.4, §7.4). The log in the main area; a row, New and Progress open in the right
// column (full screen on the phone). On the phone, New goes straight to the camera, then the form.
import { useEffect, useRef, useState } from 'react';
import { Camera, ChartColumn, Plus, Search } from 'lucide-react';
import { useCorrections } from '../../data/corrections.queries';
import { useProject } from '../../data/queries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { CorrectionsLog } from './CorrectionsLog';
import { NEW_ITEM, PROGRESS_ITEM, openTarget, visibleRows } from './model';
import { NewCorrection } from './NewCorrection';
import { useCorrectionCaps } from './useCorrectionCaps';
import { useCorrectionsNav } from './useCorrectionsNav';

interface CorrectionsToolProps {
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
    <label className="flex h-9 items-center gap-2 rounded-md border border-line bg-card px-3 text-sm focus-within:border-accent">
      <Icon icon={Search} size={16} className="text-ink-3" />
      <input
        type="search"
        aria-label="Search corrections"
        placeholder="Search"
        data-testid="cn-search"
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

/** Phone: New opens the camera at once. Cancelling the camera still opens the form (a photo-less item). */
function PhoneNew({ onPicked }: { onPicked: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = input.current;
    if (!el) return undefined;
    const cancelled = () => {
      onPicked([]);
    };
    el.addEventListener('cancel', cancelled);
    return () => {
      el.removeEventListener('cancel', cancelled);
    };
  }, [onPicked]);

  return (
    <>
      <Button
        variant="primary"
        icon={Camera}
        data-testid="cn-new"
        onClick={() => {
          input.current?.click();
        }}
      >
        New
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = '';
          onPicked(picked);
        }}
      />
    </>
  );
}

export function CorrectionsTool({ projectId, itemId, isPhone }: CorrectionsToolProps) {
  const nav = useCorrectionsNav(projectId, itemId);
  const { caps, error, retry } = useCorrectionCaps(projectId);
  const list = useCorrections(projectId);
  const project = useProject(projectId);
  const [shots, setShots] = useState<File[] | null>(null);

  if (error) return <ErrorState error={error} onRetry={retry} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (!caps || project.isPending) return <LoadingState label="Loading corrections" />;
  if (!caps.view) {
    return (
      <Card>
        <EmptyState title="No corrections for you on this job." />
      </Card>
    );
  }

  if (isPhone && shots !== null) {
    return (
      <Card padded={false}>
        <NewCorrection
          projectId={projectId}
          isPhone
          initialFiles={shots}
          onCreated={(row) => {
            setShots(null);
            nav.open(row.id);
          }}
          onCancel={() => {
            setShots(null);
          }}
        />
      </Card>
    );
  }

  const rows = list.data ?? [];
  const visible = visibleRows(rows, nav.query, nav.sort);
  const newButton = !caps.create ? null : isPhone ? (
    <PhoneNew onPicked={setShots} />
  ) : (
    <Button
      variant="primary"
      icon={Plus}
      data-testid="cn-new"
      onClick={() => {
        nav.open(NEW_ITEM);
      }}
    >
      New
    </Button>
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <Card
        padded={false}
        title="Corrections"
        actions={
          <>
            <Button
              variant="quiet"
              icon={ChartColumn}
              data-testid="cn-progress-open-button"
              onClick={() => {
                nav.open(PROGRESS_ITEM);
              }}
            >
              Progress
            </Button>
            {newButton}
          </>
        }
      >
        <div className="flex flex-col gap-3 p-3">
          <SearchBox
            initial={nav.query}
            onChange={nav.setQuery}
            onEnter={(q) => {
              const target = openTarget(rows, visibleRows(rows, q, nav.sort), q);
              if (target) nav.open(target.id);
            }}
          />
          {list.isPending ? <LoadingState label="Loading corrections" /> : null}
          {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
          {list.data?.length === 0 ? <EmptyState title="No corrections yet." /> : null}
          {rows.length > 0 && visible.length === 0 ? <p className="px-3 py-6 text-center text-sm text-ink-2">Nothing matches.</p> : null}
          {visible.length > 0 ? (
            <CorrectionsLog
              rows={visible}
              timeZone={project.data.timezone}
              selectedId={itemId}
              sort={nav.sort}
              onSort={nav.setSort}
              onOpen={nav.open}
              isPhone={isPhone}
            />
          ) : null}
        </div>
      </Card>
    </div>
  );
}

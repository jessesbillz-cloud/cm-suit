// Corrections log / punchlist (SPEC §13.4, §7.4). The log in the main area; a row, New and Progress open in the right
// column (full screen on the phone). On the phone, New goes straight to the camera, then the form; "No photo" opens the
// form at once (some phones never say the camera was cancelled).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, ChartColumn, Plus } from 'lucide-react';
import { useCorrections } from '../../data/corrections.queries';
import { useProject } from '../../data/queries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { SearchBox } from '../../ui/SearchBox';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { CorrectionsLog } from './CorrectionsLog';
import { NEW_ITEM, PROGRESS_ITEM, logSummary, openTarget, visibleRows } from './model';
import { NewCorrection } from './NewCorrection';
import { useCorrectionCaps } from './useCorrectionCaps';
import { useCorrectionsNav } from './useCorrectionsNav';

interface CorrectionsToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

const META = TOOL_META.corrections;

interface FrameProps {
  meta?: string | undefined;
  actions?: ReactNode;
  below?: ReactNode;
  children: ReactNode;
}

function Frame({ meta, actions, below, children }: FrameProps) {
  return (
    <div className="flex flex-col">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}

/**
 * Phone: New opens the camera at once; cancelling it still opens the form where the browser says so. "No photo" is
 * the plain way to a photo-less item on every phone.
 */
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
        variant="quiet"
        icon={Plus}
        data-testid="cn-new-plain"
        onClick={() => {
          onPicked([]);
        }}
      >
        No photo
      </Button>
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

  if (error) return <Frame><ErrorState error={error} onRetry={retry} /></Frame>;
  if (project.isError) return <Frame><ErrorState error={project.error} onRetry={() => void project.refetch()} /></Frame>;
  if (!caps || project.isPending) return <Frame><Card><LoadingState label="Loading corrections" /></Card></Frame>;
  if (!caps.view) {
    return (
      <Frame>
        <Card>
          <EmptyState icon={META.icon} title="No corrections for you on this job." />
        </Card>
      </Frame>
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
  const openNew = () => {
    nav.open(NEW_ITEM);
  };
  const newButton = !caps.create ? null : isPhone ? (
    <PhoneNew onPicked={setShots} />
  ) : (
    <Button variant="primary" icon={Plus} data-testid="cn-new" onClick={openNew}>
      New
    </Button>
  );
  const actions = (
    <>
      <Button
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
  );
  const search =
    rows.length > 0 ? (
      <SearchBox
        label="Search corrections"
        placeholder="Number, title or trade"
        initial={nav.query}
        testId="cn-search"
        onChange={nav.setQuery}
        onEnter={(q) => {
          const target = openTarget(rows, visibleRows(rows, q, nav.sort), q);
          if (target) nav.open(target.id);
        }}
      />
    ) : undefined;

  return (
    <Frame meta={rows.length > 0 ? logSummary(rows) : undefined} actions={actions} below={search}>
      <Card padded={false} className="overflow-hidden">
        {list.isPending ? <LoadingState label="Loading corrections" /> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.data?.length === 0 ? (
          <EmptyState
            icon={META.icon}
            title="No corrections yet."
            action={
              caps.create && !isPhone ? (
                <Button variant="primary" icon={Plus} onClick={openNew}>
                  New correction
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {rows.length > 0 && visible.length === 0 ? <p className="px-4 py-12 text-center text-sm text-ink-2">Nothing matches.</p> : null}
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
      </Card>
    </Frame>
  );
}

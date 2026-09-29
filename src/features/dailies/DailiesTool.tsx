// Dailies (SPEC §13.1): anyone whose role writes dailies files their own, per job and day. Today's report is already
// waiting on scheduled days. dailies.read_all also sees the team's submitted reports. Capabilities come from the
// database (has_capability), never from role names.
import { Settings2 } from 'lucide-react';
import { useCapability, useProject } from '../../data/queries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { ReaderMeta, WriterMeta } from './DailiesMeta';
import { SETUP_ITEM } from './model';
import { ReportLists } from './ReportLists';
import { TodayCard } from './TodayCard';
import { useDailiesNav } from './useDailiesNav';

interface DailiesToolProps {
  projectId: string;
  itemId: string | null;
  isPhone: boolean;
}

const META = TOOL_META.dailies;

export function DailiesTool({ projectId, itemId, isPhone }: DailiesToolProps) {
  const write = useCapability(projectId, 'dailies.write');
  const readAll = useCapability(projectId, 'dailies.read_all');
  const project = useProject(projectId);
  const nav = useDailiesNav(projectId);

  if (write.isPending || readAll.isPending || project.isPending) return <LoadingState label="Loading dailies" />;
  if (write.isError) return <ErrorState error={write.error} onRetry={() => void write.refetch()} />;
  if (readAll.isError) return <ErrorState error={readAll.error} onRetry={() => void readAll.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (!write.data && !readAll.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={META.label} icon={META.icon} />
        <Card>
          <EmptyState icon={META.icon} title="No dailies for you on this job." />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="dailies-tool">
      <PageHeader
        title={META.label}
        icon={META.icon}
        meta={write.data ? <WriterMeta project={project.data} /> : <ReaderMeta projectId={projectId} />}
        actions={
          write.data ? (
            <Button
              icon={Settings2}
              className={isPhone ? 'h-10' : ''}
              data-testid="daily-setup-open"
              onClick={() => {
                nav.open(SETUP_ITEM);
              }}
            >
              Setup
            </Button>
          ) : undefined
        }
      />
      {write.data ? (
        <TodayCard project={project.data} isPhone={isPhone} onOpen={nav.open} />
      ) : null}
      <ReportLists projectId={projectId} canWrite={write.data} canReadAll={readAll.data} selectedId={itemId} />
    </div>
  );
}

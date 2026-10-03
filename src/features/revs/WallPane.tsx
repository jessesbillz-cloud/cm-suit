// One wall in the right column (full screen on the phone), the substance at once (Jesse, Sep 30): its level and plan
// sheet, the whole name, its tracker, and every rev with its items, each with its status, the request that decided it
// and, when it failed, why. Request (ir.request) opens a new inspection request prefilled with this wall and its next
// items (up to three, from the earliest rev with items left to ask for).
import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FileText, Plus } from 'lucide-react';
import { useCapability, useFile, useMyProjects } from '../../data/queries';
import { useRevSetup, useRevStatus } from '../../data/revs.queries';
import type { RevArea, RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { Stepper } from '../../ui/Stepper';
import { indexStatus, nextItems, revSteps, wallRevs } from './model';
import { useRevsNav } from './useRevsNav';
import { WallRevs } from './WallRevs';

interface WallPaneProps {
  projectId: string;
  areaId: string;
  isPhone: boolean;
}

function SheetLink({ projectId, fileId }: { projectId: string; fileId: string }) {
  const navigate = useNavigate();
  const file = useFile(fileId);
  if (!file.data) return null;
  return (
    <button
      type="button"
      className="inline-flex min-w-0 items-start gap-1 text-left text-accent hover:underline"
      data-testid="rev-wall-sheet"
      onClick={() => {
        void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'files', itemId: fileId } });
      }}
    >
      <Icon icon={FileText} size={14} className="mt-[3px] shrink-0" />
      <span className="break-words">{file.data.original_name}</span>
    </button>
  );
}

interface HeadProps {
  projectId: string;
  area: RevArea;
  setup: RevSetup;
  onRequest: (() => void) | undefined;
  requestTitle: string;
  isPhone: boolean;
}

function WallHead({ projectId, area, setup, onRequest, requestTitle, isPhone }: HeadProps) {
  const list = setup.lists.find((l) => l.id === area.list_id);
  return (
    <header className="flex flex-col gap-1 border-b border-line px-5 pb-3.5 pt-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink-2">
        <span data-testid="rev-wall-level">{area.level}</span>
        {setup.lists.length > 1 && list ? <span className="text-ink-3">· {list.name}</span> : null}
        {area.sheet_file_id ? (
          <span className="flex min-w-0 items-start gap-1.5">
            <span className="text-ink-3">·</span>
            <SheetLink projectId={projectId} fileId={area.sheet_file_id} />
          </span>
        ) : null}
      </div>
      <div className="flex items-start gap-3">
        <h1 className="min-w-0 flex-1 break-words text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink" data-testid="rev-wall-name">
          {area.name}
        </h1>
        {onRequest ? (
          <Button variant="primary" icon={Plus} size={isPhone ? 'md' : 'sm'} title={requestTitle} data-testid="rev-request" onClick={onRequest}>
            Request
          </Button>
        ) : null}
      </div>
    </header>
  );
}

export function WallPane({ projectId, areaId, isPhone }: WallPaneProps) {
  const setup = useRevSetup(projectId);
  const status = useRevStatus(projectId);
  const manage = useCapability(projectId, 'revs.manage');
  const ask = useCapability(projectId, 'ir.request');
  const jobs = useMyProjects();
  const nav = useRevsNav(projectId, manage.data === true);
  const index = useMemo(() => indexStatus(status.data ?? []), [status.data]);
  const zone = jobs.data?.find((p) => p.project_id === projectId)?.timezone;

  const failed = [setup, status, manage, ask, jobs].find((q) => q.isError);
  if (failed) return <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  if (!setup.data || !status.data || manage.isPending || ask.isPending || zone === undefined) return <LoadingState label="Loading the wall" />;

  const area = setup.data.areas.find((a) => a.id === areaId);
  if (!area) {
    return (
      <Card>
        <EmptyState title="This wall is no longer on the job." />
      </Card>
    );
  }
  const revs = wallRevs(setup.data, index, area);
  const next = nextItems(revs);
  return (
    <article className="flex h-full flex-col" data-testid="rev-wall-pane">
      <WallHead
        projectId={projectId}
        area={area}
        setup={setup.data}
        isPhone={isPhone}
        requestTitle={next.map((i) => i.name).join(', ')}
        onRequest={ask.data === true && next.length > 0 ? () => { nav.request([area.id], next); } : undefined}
      />
      <div className="flex flex-1 flex-col gap-4 overflow-auto px-5 py-4">
        {revs.length > 0 ? (
          <Stepper size="md" anyOrder start={revs[0]?.rev.number ?? 0} label="Revs" testId="rev-wall-tracker" steps={revSteps(revs)} />
        ) : null}
        <WallRevs projectId={projectId} area={area} revs={revs} timeZone={zone} canManage={manage.data === true} onOpenRequest={nav.openRequest} />
      </div>
    </article>
  );
}

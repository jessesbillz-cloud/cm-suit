// One sub in the right column: every field saves on blur with a version check; the CSLB result is recorded by the
// server; history below. The directory is org-level, so this is the same sub from any job of the org.
import { Trash2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useProject } from '../../data/queries';
import { useRemoveSub } from '../../data/subs.mutations';
import { useSubs } from '../../data/subs.queries';
import type { SubContact, SubRow } from '../../data/subs.types';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { LicenseCheck } from './LicenseCheck';
import { SubContacts } from './SubContacts';
import { SubHistory } from './SubHistory';
import { EMPTY_CONTACT } from './subs';
import { useBidsNav } from './useBidsNav';
import { useSubDraft } from './useSubDraft';

/** Remove from the directory, with Undo. The pane closes; Undo brings the sub back. */
function RemoveSub({ projectId, row }: { projectId: string; row: SubRow }) {
  const remove = useRemoveSub();
  const nav = useBidsNav(projectId);
  const toast = useToast();
  function run() {
    remove.mutateAsync({ row, version: row.version, removed: true }).then(
      (version) => {
        nav.setView('subs');
        toast.show({
          message: `${row.company} removed.`,
          action: {
            label: 'Undo',
            onClick: () => {
              remove.mutateAsync({ row, version, removed: false }).catch((e: unknown) => {
                toast.show({ tone: 'error', message: `Not brought back: ${messageOf(e)}` });
              });
            },
          },
        });
      },
      (e: unknown) => {
        toast.show({ tone: 'error', message: `Not removed: ${messageOf(e)}` });
      },
    );
  }
  return (
    <Button size="sm" variant="quiet" icon={Trash2} className="w-fit" loading={remove.isPending} data-testid="sub-remove" onClick={run}>
      Remove
    </Button>
  );
}

const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';
const AREA = 'rounded-md border border-line px-2.5 py-2 text-sm font-normal text-ink outline-none focus:border-accent';

function SubEditor({ projectId, row, tz }: { projectId: string; row: SubRow; tz: string }) {
  const s = useSubDraft(row);
  const toast = useToast();
  const d = s.draft;
  const blur = () => {
    s.commit();
  };
  const text = (key: 'company' | 'trades' | 'city' | 'zip' | 'region' | 'dir_number' | 'certifications') => (v: string) => {
    s.edit({ [key]: v });
  };

  function changeContact(index: number, key: keyof SubContact, value: string) {
    s.edit({ contacts: d.contacts.map((c, i) => (i === index ? { ...c, [key]: value } : c)) });
  }

  function removeContact(index: number) {
    const before = d.contacts;
    s.edit({ contacts: before.filter((_, i) => i !== index) });
    s.commit();
    toast.show({
      message: 'Contact removed.',
      action: {
        label: 'Undo',
        onClick: () => {
          s.edit({ contacts: before });
          s.commit();
        },
      },
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="sub-pane">
      <TextField label="Company" value={d.company} onChange={text('company')} onBlur={blur} testId="sub-company" />
      <TextField label="Trades" value={d.trades} onChange={text('trades')} onBlur={blur} testId="sub-trades" />
      <SubContacts
        contacts={d.contacts}
        onChange={changeContact}
        onBlur={blur}
        onAdd={() => {
          s.edit({ contacts: [...d.contacts, EMPTY_CONTACT] });
        }}
        onRemove={removeContact}
      />
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <TextField label="City" value={d.city} onChange={text('city')} onBlur={blur} />
        <TextField label="ZIP" value={d.zip} onChange={text('zip')} onBlur={blur} />
      </div>
      <TextField label="Region" value={d.region} onChange={text('region')} onBlur={blur} />
      <LicenseCheck
        number={d.cslb_number}
        classes={d.license_classes}
        onNumber={(v) => {
          s.edit({ cslb_number: v });
        }}
        onClasses={(v) => {
          s.edit({ license_classes: v });
        }}
        onBlur={blur}
        status={s.base.cslb_status}
        checkedAt={s.base.cslb_checked_at}
        tz={tz}
        onRecord={s.record}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="DIR #" value={d.dir_number} onChange={text('dir_number')} onBlur={blur} />
        <TextField label="Certifications" value={d.certifications} onChange={text('certifications')} onBlur={blur} />
      </div>
      <label className={LABEL}>
        Notes
        <textarea
          rows={4}
          className={AREA}
          value={d.notes}
          onBlur={blur}
          onChange={(e) => {
            s.edit({ notes: e.target.value });
          }}
        />
      </label>
      <SaveState pending={s.pending} saved={s.saved} problem={s.problem} />
      <SubHistory orgId={row.org_id} subId={row.id} tz={tz} />
      <RemoveSub projectId={projectId} row={s.base} />
    </div>
  );
}

interface SubPaneProps {
  projectId: string;
  subId: string;
}

export function SubPane({ projectId, subId }: SubPaneProps) {
  const project = useProject(projectId);
  const subs = useSubs(project.data?.org_id);

  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (subs.isError) return <ErrorState error={subs.error} onRetry={() => void subs.refetch()} />;
  if (project.isPending || subs.isPending) return <LoadingState label="Loading sub" />;
  const row = subs.data.find((x) => x.id === subId);
  if (!row) return <EmptyState title="That sub is gone." />;
  return <SubEditor projectId={projectId} row={row} tz={project.data.timezone} />;
}

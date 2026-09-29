// One report being written. Full: weather, work log, notes, photos. Field Mode (the phone's default): a big Camera
// button and the notes. Autosaves (useReportDraft); a submitted report opens read-only until Edit. The bottom bar
// holds Submit (or Download / Send once submitted) and the autosave line.
import { useState } from 'react';
import { Pencil, RotateCw, Smartphone, Trash2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useAddDailyPhotos, useCreateDailyReport, useDailyPhotoUploads, useDeleteDailyDraft, type PhotoPick } from '../../data/dailies.mutations';
import type { DailyPhotoRow, DailyReportRow } from '../../data/dailies.types';
import { messageOf } from '../../data/errors';
import { needsResubmit, type DailyContent, type DailyHeader } from '../../lib/dailies';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { SaveState } from '../../ui/SaveState';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { numberLabel, reportChip } from './model';
import { NotesFields } from './NotesFields';
import { PhotoButtons } from './PhotoButtons';
import { PhotoList } from './PhotoList';
import { Section } from './Section';
import { INPUT } from './styles';
import { SubmitArea } from './SubmitArea';
import { useReportDraft } from './useReportDraft';
import { WorkLog } from './WorkLog';

interface EditorHeaderProps {
  report: DailyReportRow;
  header: DailyHeader;
  nextNumber: number | undefined;
  field: boolean;
  onField: () => void;
  onEdit: (() => void) | null;
}

function EditorHeader({ report, header, nextNumber, field, onField, onEdit }: EditorHeaderProps) {
  const chip = reportChip(report);
  return (
    <header className="flex items-start gap-3 border-b border-line bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-ink">
          <span className="break-words">{header.label}</span>
          <span className="tabular-nums text-ink-2">{numberLabel(report.number, nextNumber)}</span>
          <StatusChip status={chip.status} label={chip.label} />
        </h2>
        <p className="text-sm text-ink-2">{formatDay(report.report_date, 'EEEE, MMM d, yyyy')}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onEdit ? (
          <Button size="sm" icon={Pencil} onClick={onEdit}>
            Edit
          </Button>
        ) : null}
        <button
          type="button"
          aria-pressed={field}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium ${
            field ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line-strong bg-card text-ink-2 shadow-control hover:text-ink'
          }`}
          onClick={onField}
        >
          <Icon icon={Smartphone} size={15} />
          Field mode
        </button>
      </div>
    </header>
  );
}

interface ReportEditorProps {
  projectId: string;
  report: DailyReportRow;
  header: DailyHeader;
  content: DailyContent;
  photos: readonly DailyPhotoRow[];
  nextNumber: number | undefined;
  recipients: readonly string[];
  isPhone: boolean;
  onSigned: () => void;
  /** After a version conflict: read the saved report again. */
  onReload: () => void;
}

export function ReportEditor(props: ReportEditorProps) {
  const { projectId, report, header, photos, nextNumber, recipients, isPhone, onSigned, onReload } = props;
  const draft = useReportDraft(projectId, report, props.content);
  const addPhotos = useAddDailyPhotos(projectId);
  const uploads = useDailyPhotoUploads(projectId);
  const remove = useDeleteDailyDraft(projectId);
  const restore = useCreateDailyReport(projectId);
  const toast = useToast();
  const navigate = useNavigate();
  const [field, setField] = useState(isPhone);
  const [editing, setEditing] = useState(false);
  const c = draft.content;
  const stale = needsResubmit(report, photos) || (report.status === 'submitted' && draft.status !== 'saved');
  const locked = report.status === 'submitted' && !editing && !stale;
  const uploading = uploads.items.some((i) => i.status === 'queued' || i.status === 'uploading');

  function onPhotos(picks: PhotoPick[], rowKey: string | null) {
    addPhotos.mutate(
      { picks, target: { reportId: report.id, rowKey } },
      {
        onError: (e) => {
          toast.show({ tone: 'error', message: `Photo not added: ${messageOf(e)}` });
        },
      },
    );
  }

  function close() {
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'dailies' } });
  }

  function deleteDraft() {
    draft.flush();
    remove.mutate(
      { reportId: report.id, version: draft.savedVersion() },
      {
        onSuccess: () => {
          close();
          toast.show({
            message: 'Report deleted.',
            action: {
              label: 'Undo',
              // This screen is gone by then: the promise (not per-call callbacks) reports a failure.
              onClick: () => {
                restore.mutateAsync(report.report_date).catch((e: unknown) => {
                  toast.show({ tone: 'error', message: messageOf(e) });
                });
              },
            },
          });
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: `Not deleted: ${messageOf(e)}` });
        },
      },
    );
  }

  const photoList = (
    <PhotoList
      projectId={projectId}
      photos={photos}
      rows={c.work}
      tz={header.timezone}
      locked={locked}
      field={field}
      buttons={
        <PhotoButtons
          projectName={header.project_name}
          tz={header.timezone}
          variant={field ? 'field' : 'plain'}
          disabled={locked}
          testId="daily-camera"
          onPicked={(picks) => {
            onPhotos(picks, null);
          }}
        />
      }
    />
  );

  return (
    <div className="flex min-h-full flex-col bg-page" data-testid="daily-editor">
      <EditorHeader
        report={report}
        header={header}
        nextNumber={nextNumber}
        field={field}
        onField={() => {
          setField(!field);
        }}
        onEdit={
          locked
            ? () => {
                setEditing(true);
              }
            : null
        }
      />

      <div className="flex flex-1 flex-col gap-3 p-3">
        {field ? (
          photoList
        ) : (
          <>
            <label className="flex items-center gap-3 rounded-card bg-card px-4 py-3 shadow-card">
              <span className="w-20 shrink-0 text-[15px] font-semibold text-ink">Weather</span>
              <input
                className={`h-10 min-w-0 flex-1 ${INPUT}`}
                value={c.weather}
                maxLength={300}
                disabled={locked}
                onChange={(e) => {
                  const weather = e.target.value;
                  draft.edit((x) => ({ ...x, weather }));
                }}
              />
            </label>
            <WorkLog
              rows={c.work}
              locked={locked}
              onRows={(change) => {
                draft.edit((x) => ({ ...x, work: change(x.work) }));
              }}
              cameraFor={(rowKey) => (
                <PhotoButtons
                  variant="row"
                  projectName={header.project_name}
                  tz={header.timezone}
                  onPicked={(picks) => {
                    onPhotos(picks, rowKey);
                  }}
                />
              )}
            />
          </>
        )}

        {c.inspections.length > 0 ? (
          <Section title="Inspections" count={c.inspections.length} testId="daily-inspections">
            <ul className="flex flex-col divide-y divide-line">
              {c.inspections.map((i) => (
                <li key={i.ref} className="whitespace-pre-wrap break-words py-2 text-sm text-ink first:pt-0 last:pb-0">
                  {i.text}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        <NotesFields
          content={c}
          locked={locked}
          roomy={field}
          onNote={(key, text) => {
            draft.edit((x) => ({ ...x, notes: { ...x.notes, [key]: text } }));
          }}
          onCarry={(key, carry) => {
            draft.edit((x) => ({
              ...x,
              carry_sections: carry ? [...x.carry_sections.filter((k) => k !== key), key] : x.carry_sections.filter((k) => k !== key),
            }));
          }}
        />

        {field ? null : photoList}

        {report.status === 'draft' && report.number === null ? (
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            className="self-start"
            loading={remove.isPending}
            disabled={!draft.settled}
            onClick={deleteDraft}
          >
            Delete draft
          </Button>
        ) : null}
      </div>

      <footer className="sticky bottom-0 z-10 border-t border-line bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_16px_-12px_rgba(16,24,40,.25)]">
        <SubmitArea
          projectId={projectId}
          report={report}
          stale={stale}
          ready={draft.settled && !uploading}
          recipients={recipients}
          savedVersion={draft.savedVersion}
          onSigned={onSigned}
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <SaveState pending={draft.status === 'saving' || draft.status === 'dirty'} saved={draft.justSaved} problem={draft.problem} />
              {draft.status === 'conflict' ? (
                <Button size="sm" icon={RotateCw} onClick={onReload}>
                  Reload
                </Button>
              ) : null}
            </div>
          }
        />
      </footer>
    </div>
  );
}

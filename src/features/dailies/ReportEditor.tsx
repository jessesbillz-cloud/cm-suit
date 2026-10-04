// One report being written. Work log: weather, work log, notes, photos. A form (SPEC §8.3): its day's values and tables
// (FormFields) and photos; a draft fills in what the job knows that day (useDayPrefill) and the day's weather
// (useWeatherFill). Field Mode (the phone's default, except for a form with tables, which opens whole): a big Camera
// button and the notes. Autosaves (useReportDraft); a submitted report opens read-only until Edit. The bottom bar holds
// Submit (or Download / Send once submitted) and the autosave line.
import { useState } from 'react';
import { Pencil, RotateCw, Smartphone, Trash2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useAddDailyPhotos, useCreateDailyReport, useDailyPhotoUploads, useDeleteDailyDraft, type PhotoPick } from '../../data/dailies.mutations';
import type { DailyPhotoRow, DailyReportRow } from '../../data/dailies.types';
import { messageOf } from '../../data/errors';
import { needsResubmit, tablesOf, type DailyContent, type DailyHeader, type ReportForm } from '../../lib/dailies';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { SaveState } from '../../ui/SaveState';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { FormFields } from './FormFields';
import { InspectionsList } from './InspectionsList';
import { numberLabel, reportChip } from './model';
import { PhotoButtons } from './PhotoButtons';
import { PhotoList } from './PhotoList';
import { SubmitArea } from './SubmitArea';
import { useDayPrefill } from './useDayPrefill';
import { useReportDraft } from './useReportDraft';
import { useWeatherFill } from './useWeatherFill';
import { WorkLogBody } from './WorkLogBody';

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
  /** The company form the report is written on, or null for the work log. */
  form: ReportForm | null;
  photos: readonly DailyPhotoRow[];
  nextNumber: number | undefined;
  recipients: readonly string[];
  isPhone: boolean;
  onSigned: () => void;
  /** After a version conflict: read the saved report again. */
  onReload: () => void;
}

export function ReportEditor(props: ReportEditorProps) {
  const { projectId, report, header, form, photos, nextNumber, recipients, isPhone, onSigned, onReload } = props;
  const draft = useReportDraft(projectId, report, props.content);
  const addPhotos = useAddDailyPhotos(projectId);
  const uploads = useDailyPhotoUploads(projectId);
  const remove = useDeleteDailyDraft(projectId);
  const restore = useCreateDailyReport(projectId);
  const toast = useToast();
  const navigate = useNavigate();
  const [field, setField] = useState(isPhone && (form === null || tablesOf(form).length === 0));
  const [editing, setEditing] = useState(false);
  const c = draft.content;
  const prefill = useDayPrefill({ projectId, report, form, tz: header.timezone, content: c, edit: draft.edit });
  useWeatherFill({ projectId, report, form, content: c, edit: draft.edit });
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
                restore.mutateAsync({ reportType: report.report_type, reportDate: report.report_date }).catch((e: unknown) => {
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
      describe={form?.describePhotos === true}
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
        {prefill.error ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-danger" role="alert" data-testid="daily-prefill-error">
            Sign-ins and deliveries didn't load.
            <Button size="sm" icon={RotateCw} onClick={prefill.retry}>
              Retry
            </Button>
          </p>
        ) : null}
        {field ? photoList : null}
        {form ? (
          <>
            <FormFields
              form={form}
              content={c}
              locked={locked}
              field={field}
              onField={(key, value) => {
                draft.edit((x) => ({ ...x, fields: { ...x.fields, [key]: value } }));
              }}
              onTable={(key, change) => {
                draft.edit((x) => ({ ...x, tables: { ...x.tables, [key]: change(x.tables[key] ?? []) } }));
              }}
            />
            <InspectionsList items={c.inspections} />
          </>
        ) : (
          <WorkLogBody content={c} header={header} locked={locked} field={field} edit={draft.edit} onRowPhotos={onPhotos} />
        )}
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

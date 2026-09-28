// One report being written. Full: weather, work log, notes, photos. Field Mode (the phone's default): a big Camera
// button and the notes. Autosaves (useReportDraft); a submitted report opens read-only until Edit.
import { useState } from 'react';
import { Pencil, RotateCw, Trash2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useAddDailyPhotos, useCreateDailyReport, useDailyPhotoUploads, useDeleteDailyDraft, type PhotoPick } from '../../data/dailies.mutations';
import type { DailyPhotoRow, DailyReportRow } from '../../data/dailies.types';
import { messageOf } from '../../data/errors';
import { needsResubmit, type DailyContent, type DailyHeader } from '../../lib/dailies';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { SaveState } from '../../ui/SaveState';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { numberLabel, reportChip } from './model';
import { NotesFields } from './NotesFields';
import { PhotoButtons } from './PhotoButtons';
import { PhotoList } from './PhotoList';
import { SubmitArea } from './SubmitArea';
import { useReportDraft } from './useReportDraft';
import { WorkLog } from './WorkLog';

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
  const chip = reportChip(report);
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

  const photoButtons = (
    <PhotoButtons
      projectName={header.project_name}
      tz={header.timezone}
      big={field}
      disabled={locked}
      testId="daily-camera"
      onPicked={(picks) => {
        onPhotos(picks, null);
      }}
    />
  );

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="daily-editor">
      <header className="flex flex-col gap-1">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
          <span>{header.label}</span>
          <span className="tabular-nums text-ink-2">{numberLabel(report.number, nextNumber)}</span>
          <StatusChip status={chip.status} label={chip.label} />
        </h2>
        <p className="text-sm text-ink-2">{formatDay(report.report_date, 'EEE, MMM d, yyyy')}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant={field ? 'secondary' : 'quiet'}
            aria-pressed={field}
            onClick={() => {
              setField(!field);
            }}
          >
            Field mode
          </Button>
          {locked ? (
            <Button
              size="sm"
              icon={Pencil}
              onClick={() => {
                setEditing(true);
              }}
            >
              Edit
            </Button>
          ) : null}
        </div>
      </header>

      <SubmitArea
        projectId={projectId}
        report={report}
        stale={stale}
        ready={draft.settled && !uploading}
        recipients={recipients}
        savedVersion={draft.savedVersion}
        onSigned={onSigned}
      />
      <SaveState pending={draft.status === 'saving' || draft.status === 'dirty'} saved={draft.justSaved} problem={draft.problem} />
      {draft.status === 'conflict' ? (
        <Button size="sm" icon={RotateCw} className="w-fit" onClick={onReload}>
          Reload
        </Button>
      ) : null}

      {field ? (
        photoButtons
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
            Weather
            <input
              className="h-9 rounded-md border border-line bg-card px-2.5 text-sm text-ink outline-none focus:border-accent disabled:bg-page"
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
                compact
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

      {c.standing_note.trim() !== '' ? <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{c.standing_note}</p> : null}
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

      {field ? null : photoButtons}
      <PhotoList projectId={projectId} photos={photos} rows={c.work} tz={header.timezone} locked={locked} />

      {report.status === 'draft' && report.number === null ? (
        <Button
          variant="danger"
          size="sm"
          icon={Trash2}
          className="w-fit"
          loading={remove.isPending}
          disabled={!draft.settled}
          onClick={deleteDraft}
        >
          Delete draft
        </Button>
      ) : null}
    </div>
  );
}

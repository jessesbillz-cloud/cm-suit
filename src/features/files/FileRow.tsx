// One file on one tight row: a tap on its name opens the file's pane; buttons at its end, each one click (Jesse, Oct 5:
// "a download button right from it, maybe an open full screen right from that"; Oct 11: "definitely need a way to delete
// files out of here"): Full screen (photos and PDFs, data-testid="file-row-view"), Download ("file-row-download") and, on
// a file I may change, Delete ("file-row-delete", Undo in the toast). A file I may change also has a checkbox at its
// start, for Move to and Delete on many (ListHead), and in To sort a Move to of its own. The columns are its section's
// (RowCells); a submittal's section, when the job's spec book has it, opens the book there (Jesse, Oct 12). The name is
// never cut off: it wraps, even a long name with no spaces. On a phone the file's icon gives the checkbox its room and a
// row's own Move to sits on a line under it.
import { Download, Maximize2, Trash2 } from 'lucide-react';
import { useUser } from '../../data/auth';
import type { FileRow as File } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { FIELD_CONTROL } from '../../ui/Fields';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { CHECK, CheckBox, type RowCheck } from './CheckBox';
import { LeadCells, SpecSectionCell, TitleCell, TrailCells } from './RowCells';
import type { RowView } from './rowView';
import type { FolderOption } from './sections';
import { canOpenNow, scanChip } from './scanStatus';

interface FileRowProps {
  file: File;
  view: RowView;
  /** The job's zone for the date; null while it loads (the date waits). */
  timeZone: string | null;
  selected: boolean;
  downloading: boolean;
  onOpen: (fileId: string) => void;
  /** Full screen (photos and PDFs that may be opened now); left out, the row has no Full screen button. */
  onView?: (() => void) | undefined;
  onDownload: (file: File) => void;
  /**
   * The row's checkbox. Left out: the list has none. Null: a file I can't change in a list that has them (a blank of the
   * same width, so the names line up).
   */
  check?: RowCheck | null | undefined;
  /** Delete (a file I may change); left out, no Delete button. */
  onDelete?: (() => void) | undefined;
  /** A submittal's section in the job's spec book: its Section cell opens the book there. */
  spec?: { section: string; onOpen: () => void } | undefined;
  /** The row's own Move to (To sort); left out, none. */
  move?: { targets: readonly FolderOption[]; onMove: (to: FolderOption) => void } | undefined;
}

/** The buttons' column (Full screen, Download, Delete): 32px each on a desktop, 40px (a thumb's tap) on a phone. */
export const ACTION = 'w-[7.75rem] shrink-0 sm:w-[6.5rem]';
/** A row's own Move to (To sort). */
export const MOVE = 'sm:w-40 sm:shrink-0';
const ROW_BUTTON = 'h-10 w-10 sm:h-8 sm:w-8';

export function FileRow(props: FileRowProps) {
  const { file, view, timeZone, selected, downloading, onOpen, onView, onDownload, check, onDelete, move, spec } = props;
  const user = useUser();
  const chip = file.scan_status === 'clean' && file.upload_complete ? null : scanChip(file.scan_status, file.upload_complete);
  // Unfinished, infected, or someone else's file still being scanned: nothing to download yet.
  const blocked = !canOpenNow(file, user.id);
  // A plan's sheet or a submittal's section says what the file is: no icon there on a desktop, the title keeps the room.
  const iconBox = `${check === undefined ? 'flex' : 'hidden'} ${view.kind === 'plain' ? 'sm:flex' : 'sm:hidden'} h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
    selected ? 'bg-card text-accent' : 'bg-page text-ink-2'
  }`;
  const added = timeZone === null ? '' : formatInZone(file.created_at, timeZone, 'MMM d, yyyy');
  return (
    <li
      data-testid="file-row"
      aria-current={selected ? 'true' : undefined}
      className={`group flex flex-wrap items-center gap-x-3 px-4 transition-colors sm:flex-nowrap ${
        selected ? 'bg-accent-soft/60 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]' : 'hover:bg-page/60'
      }`}
    >
      {check === undefined ? null : check === null ? (
        <span aria-hidden className={CHECK} />
      ) : (
        <CheckBox label={`Select ${file.original_name}`} testId="file-row-check" check={check} />
      )}
      {/* Its own button beside the row's: a button can't hold another. */}
      {spec ? <SpecSectionCell view={view} spec={spec} /> : null}
      <button
        type="button"
        data-testid="file-row-open"
        title={file.original_name}
        className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-2 text-left"
        onClick={() => {
          onOpen(file.id);
        }}
      >
        <span className={iconBox}>
          <Icon icon={fileIcon(file.original_name, file.mime)} size={16} />
        </span>
        {spec ? null : <LeadCells view={view} />}
        <span className="min-w-0 flex-1 text-sm leading-5">
          <TitleCell
            view={view}
            file={file}
            added={added}
            chip={chip ? <StatusChip status={chip.status} label={chip.label} /> : null}
          />
        </span>
        <TrailCells view={view} file={file} timeZone={timeZone} />
      </button>
      {move ? (
        <span className={`order-last basis-full pb-2 pl-10 sm:order-none sm:basis-auto sm:pb-0 sm:pl-0 ${MOVE}`}>
          <select
            aria-label={`Move ${file.original_name} to`}
            data-testid="file-row-move"
            className={`${FIELD_CONTROL} h-8 w-full`}
            value=""
            onChange={(e) => {
              const to = move.targets.find((t) => t.id === e.target.value);
              if (to) move.onMove(to);
            }}
          >
            <option value="" disabled>
              Move to
            </option>
            {move.targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      <span className={`flex items-center justify-end gap-1 ${ACTION}`}>
        {onView ? (
          <Button
            size="sm"
            variant="quiet"
            icon={Maximize2}
            data-testid="file-row-view"
            aria-label={`Full screen ${file.original_name}`}
            title="Full screen"
            className={ROW_BUTTON}
            onClick={onView}
          />
        ) : null}
        <Button
          size="sm"
          variant="quiet"
          icon={Download}
          data-testid="file-row-download"
          aria-label={`Download ${file.original_name}`}
          title="Download"
          className={ROW_BUTTON}
          loading={downloading}
          disabled={blocked}
          onClick={() => {
            onDownload(file);
          }}
        />
        {onDelete ? (
          <Button
            size="sm"
            variant="quiet"
            icon={Trash2}
            data-testid="file-row-delete"
            aria-label={`Delete ${file.original_name}`}
            title="Delete"
            className={ROW_BUTTON}
            onClick={onDelete}
          />
        ) : null}
      </span>
    </li>
  );
}

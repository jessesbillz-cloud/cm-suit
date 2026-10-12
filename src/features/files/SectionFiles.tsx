// A section's list in Files: one flat list of every file in the section's folders (Jesse, Oct 11), narrowed by its
// filter and search (ListTools), in its section's columns (RowCells), sorted by file name. It is the drop target
// (useFileDrop), shows the upload lines, and on the rows I may change a checkbox and Delete (files_changeable, one call
// for the list); checked rows get Move to and Delete in the list's head, and in To sort each row has its own Move to.
// In Plans and Specs a row's name opens the file full screen at once (Jesse, Oct 5).
import { useState } from 'react';
import { useChangeable } from '../../data/files';
import { useSectionFiles, type FileSection } from '../../data/fileSections';
import { useUploadQueue } from '../../data/UploadQueue';
import type { FolderRow } from '../../data/types';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import type { SectionKind } from './classify';
import type { DroppedFile } from './collectDrop';
import { FileRow } from './FileRow';
import { folderDescendants } from './folderOrder';
import { leftoverUploads, storedFiles } from './leftovers';
import { ListHead } from './ListHead';
import { ListTools } from './ListTools';
import { sectionRows } from './sectionRows';
import { filterOptions, type FolderOption } from './sections';
import { UploadList } from './UploadList';
import { useDeleteFile } from './useDeleteFile';
import { useDownload } from './useDownload';
import { useFileDrop } from './useFileDrop';
import { useMoveRows } from './useMoveRows';
import { useRowViewer } from './useRowViewer';

interface SectionFilesProps {
  projectId: string;
  section: FileSection;
  kind: SectionKind;
  filterId: string | null;
  /** The folder on screen (the filter's, else the section's): its upload lines show one by one. */
  viewFolderId: string;
  folders: readonly FolderRow[];
  /** May I add here (Upload and drop)? */
  writable: boolean;
  timeZone: string | null;
  selectedFileId: string | null;
  targets: readonly FolderOption[];
  onDropped: (dropped: DroppedFile[]) => void;
  onOpenFile: (fileId: string) => void;
  onFilter: (folderId: string | null) => void;
  /** Files deleted from here: the pane closes if one of them is open. */
  onDeleted: (ids: string[]) => void;
}

const META = TOOL_META.files;

export function SectionFiles(props: SectionFilesProps) {
  const { projectId, section, kind, filterId, viewFolderId, folders, writable, timeZone, selectedFileId, targets } = props;
  const files = useSectionFiles(projectId, section);
  const queue = useUploadQueue();
  const download = useDownload();
  const drop = useFileDrop(writable, props.onDropped);
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const del = useDeleteFile((ids) => {
    setChecked((was) => new Set([...was].filter((id) => !ids.includes(id))));
    props.onDeleted(ids);
  });
  const mover = useMoveRows(() => {
    setChecked(new Set());
  });
  const stored = files.data ? storedFiles(files.data) : [];
  const within = filterId === null ? null : new Set<string>([filterId, ...folderDescendants(folders, filterId)]);
  const rows = sectionRows(stored, kind, section, folders, within, query);
  const changeable = useChangeable(
    projectId,
    kind,
    stored.map((f) => f.id),
  );
  const versions = changeable.data ?? new Map<string, number>();
  const viewer = useRowViewer(
    projectId,
    rows.map((r) => r.file),
    kind === 'specs',
  );
  const big = kind === 'plans' || kind === 'specs';
  const leftovers = files.data ? leftoverUploads(files.data, queue.items) : [];
  const mine = rows.filter((r) => versions.has(r.file.id)).map((r) => r.file);
  const picked = mine.filter((f) => checked.has(f.id)).map((f) => ({ file: f, version: versions.get(f.id) ?? 1 }));
  const inSection = new Set<string>(section.folder_ids);
  const elsewhere = new Set<string>(folders.filter((f) => !inSection.has(f.id)).map((f) => f.id));
  const under = new Set<string>(section.folder_ids.filter((id) => id !== viewFolderId));
  const filtering = filterId !== null || query.trim() !== '';

  return (
    <Card padded={false}>
      <div
        data-testid="files-drop"
        className={`min-h-48 rounded-card ${drop.over ? 'bg-accent-soft outline-dashed outline-2 -outline-offset-4 outline-accent' : ''}`}
        {...drop.handlers}
      >
        {drop.over ? (
          // Zero height, so nothing moves; it stays in view while a long list is scrolled.
          <div className="pointer-events-none sticky top-2 z-10 flex h-0 justify-center">
            <p data-testid="files-drop-hint" className="mt-2 h-fit rounded-full bg-accent px-3 py-1 text-[13px] font-medium text-white shadow-pop">
              Drop to upload
            </p>
          </div>
        ) : null}
        <div className="overflow-hidden rounded-card">
          <UploadList folderId={viewFolderId} under={under} elsewhere={elsewhere} leftovers={leftovers} />
          <ListTools
            options={filterOptions(section, folders)}
            all={kind === 'submittals' ? 'All companies' : 'All folders'}
            filterId={filterId}
            onFilter={props.onFilter}
            onSearch={setQuery}
          />
          {files.isPending ? <LoadingState label="Loading files" /> : null}
          {files.isError ? <ErrorState error={files.error} onRetry={() => void files.refetch()} /> : null}
          {changeable.isError ? (
            <ErrorState error={changeable.error} title="Delete and Move are not available." onRetry={() => void changeable.refetch()} className="m-0" />
          ) : null}
          {files.data && rows.length === 0 ? (
            <EmptyState icon={META.icon} title={filtering ? 'No files match.' : 'Nothing here yet.'} />
          ) : null}
          {rows.length > 0 ? (
            <>
              <ListHead
                section={kind}
                rowMove={kind === 'unsorted' && mine.length > 0 && targets.length > 0}
                select={
                  mine.length === 0
                    ? null
                    : {
                        count: picked.length,
                        checked: picked.length === mine.length,
                        onChange: (on) => {
                          setChecked(new Set(on ? mine.map((f) => f.id) : []));
                        },
                      }
                }
                targets={targets}
                busy={del.pending || mover.pending}
                onMove={(to) => {
                  mover.run(picked, to);
                }}
                onDelete={() => {
                  del.runMany(picked);
                }}
              />
              <ul className="divide-y divide-line">
                {rows.map(({ file: f, view }) => {
                  const version = versions.get(f.id);
                  const one = version === undefined ? null : [{ file: f, version }];
                  return (
                    <FileRow
                      key={f.id}
                      file={f}
                      view={view}
                      timeZone={timeZone}
                      selected={f.id === selectedFileId}
                      downloading={download.pendingId === f.id}
                      onOpen={(id) => {
                        props.onOpenFile(id);
                        if (big && viewer.viewable.has(id)) viewer.view(id);
                      }}
                      onView={viewer.viewable.has(f.id) ? () => { viewer.view(f.id); } : undefined}
                      onDownload={(file) => {
                        download.start(file.id, file.size);
                      }}
                      check={
                        mine.length === 0
                          ? undefined
                          : one === null
                            ? null
                            : {
                                checked: checked.has(f.id),
                                onChange: (on) => {
                                  setChecked((was) => (on ? new Set([...was, f.id]) : new Set([...was].filter((x) => x !== f.id))));
                                },
                              }
                      }
                      onDelete={one === null ? undefined : () => { del.runMany(one); }}
                      move={
                        kind === 'unsorted' && one !== null && targets.length > 0
                          ? { targets, onMove: (to) => { mover.run(one, to); } }
                          : undefined
                      }
                    />
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

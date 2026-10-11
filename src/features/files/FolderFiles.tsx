// One folder's list in Files: the drop target (useFileDrop), the upload lines, the rows, and on the rows I may change a
// checkbox and Delete (files_changeable, one call for the list). Checked rows get Move to and Delete in the list's head.
// In Plans and Specs a row's name opens the file full screen at once (Jesse, Oct 5); a spec book carries its section bar.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '../../data/auth';
import { useChangeable } from '../../data/files';
import { usePreviewFetch } from '../../data/preview';
import { useFiles } from '../../data/queries';
import { specBooksQuery } from '../../data/specs';
import { useUploadQueue } from '../../data/UploadQueue';
import type { FolderRow } from '../../data/types';
import { Card } from '../../ui/Card';
import { useFileViewer } from '../../ui/FileViewer';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { specViewerItem } from '../specs/specItem';
import type { DroppedFile } from './collectDrop';
import { FileRow } from './FileRow';
import { leftoverUploads, storedFiles } from './leftovers';
import { ListHead } from './ListHead';
import { canOpenNow } from './scanStatus';
import { UploadList } from './UploadList';
import { useDeleteFile } from './useDeleteFile';
import { useDownload } from './useDownload';
import { useFileDrop } from './useFileDrop';
import { useMoveRows, type MoveTarget } from './useMoveRows';
import { fileViewerItem } from './viewerItems';

interface FolderFilesProps {
  folder: FolderRow;
  writable: boolean;
  timeZone: string | null;
  selectedFileId: string | null;
  /** The folders inside this one, for the one line of uploads going into them. */
  under: ReadonlySet<string>;
  /** Where checked rows may go (the folders I may add to, not this one). */
  targets: readonly MoveTarget[];
  onDropped: (dropped: DroppedFile[]) => void;
  onOpenFile: (fileId: string) => void;
  /** Files deleted from here: the pane closes if one of them is open. */
  onDeleted: (ids: string[]) => void;
}

const META = TOOL_META.files;

export function FolderFiles(props: FolderFilesProps) {
  const { folder, writable, timeZone, selectedFileId, under, targets, onDropped, onOpenFile, onDeleted } = props;
  const files = useFiles(folder.id);
  const queue = useUploadQueue();
  const download = useDownload();
  const drop = useFileDrop(writable, onDropped);
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const user = useUser();
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const del = useDeleteFile((ids) => {
    setChecked((was) => new Set([...was].filter((id) => !ids.includes(id))));
    onDeleted(ids);
  });
  const mover = useMoveRows(() => {
    setChecked(new Set());
  });
  const big = folder.kind === 'plans' || folder.kind === 'specs';
  const books = useQuery({ ...specBooksQuery(folder.project_id), enabled: folder.kind === 'specs' });
  const rows = files.data ? storedFiles(files.data) : undefined;
  const changeable = useChangeable(
    folder.id,
    (rows ?? []).map((f) => f.id),
  );
  const versions = changeable.data ?? new Map<string, number>();
  // Full screen from a row walks the folder's photos and PDFs with the arrows; a spec book opens with its sections.
  const list = (rows ?? [])
    .filter((f) => canOpenNow(f, user.id))
    .map((f) => {
      const book = books.data?.find((b) => b.file_id === f.id);
      return book ? specViewerItem(folder.project_id, book, preview) : fileViewerItem(f, preview);
    })
    .filter((i) => i.kind !== 'other');
  const viewable = new Set(list.map((i) => i.id));
  // A book just added is not in the answer yet: ask again once, so it opens with its bar.
  const known = books.data;
  const newBook = known !== undefined && list.some((i) => i.kind === 'pdf' && !known.some((b) => b.file_id === i.id));
  const refetchBooks = books.refetch;
  useEffect(() => {
    if (newBook) void refetchBooks();
  }, [newBook, refetchBooks]);
  const view = (fileId: string) => {
    viewer.open(list, list.findIndex((i) => i.id === fileId));
  };
  const leftovers = files.data ? leftoverUploads(files.data, queue.items) : [];
  const mine = (rows ?? []).filter((f) => versions.has(f.id));
  const picked = mine.filter((f) => checked.has(f.id)).map((f) => ({ file: f, version: versions.get(f.id) ?? 1 }));
  const pick = (id: string, on: boolean) => {
    setChecked((was) => (on ? new Set([...was, id]) : new Set([...was].filter((x) => x !== id))));
  };

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
          <UploadList folderId={folder.id} under={under} leftovers={leftovers} />
          {files.isPending ? <LoadingState label="Loading files" /> : null}
          {files.isError ? <ErrorState error={files.error} onRetry={() => void files.refetch()} /> : null}
          {changeable.isError ? (
            <ErrorState error={changeable.error} title="Delete and Move are not available." onRetry={() => void changeable.refetch()} className="m-0" />
          ) : null}
          {rows?.length === 0 ? <EmptyState icon={META.icon} title="This folder is empty." /> : null}
          {rows && rows.length > 0 ? (
            <>
              <ListHead
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
                {rows.map((f) => {
                  const version = versions.get(f.id);
                  return (
                    <FileRow
                      key={f.id}
                      file={f}
                      timeZone={timeZone}
                      selected={f.id === selectedFileId}
                      downloading={download.pendingId === f.id}
                      onOpen={(id) => {
                        onOpenFile(id);
                        if (big && viewable.has(id)) view(id);
                      }}
                      onView={
                        viewable.has(f.id)
                          ? () => {
                              view(f.id);
                            }
                          : undefined
                      }
                      onDownload={(file) => {
                        download.start(file.id, file.size);
                      }}
                      check={
                        mine.length === 0
                          ? undefined
                          : version === undefined
                            ? null
                            : {
                                checked: checked.has(f.id),
                                onChange: (on) => {
                                  pick(f.id, on);
                                },
                              }
                      }
                      onDelete={
                        version === undefined
                          ? undefined
                          : () => {
                              del.run(f, version);
                            }
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

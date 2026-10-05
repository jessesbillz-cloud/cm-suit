// Files (SPEC §8.1, Phase 0 core): folder tree, file rows with one-click download, drag-and-drop and button upload
// through the single uploader with per-file progress, and folder create and rename for files.manage. The tree lists
// folders by sort then name (each job opens with what its kind of user uses most) and hides an empty "Emailed in". A
// row's name opens the file's pane (the file itself, Full screen, Rename, Delete); its icon opens it full screen.
// The whole file list is the drop target (useFileDrop). An upload that never finished is a line to remove, never a
// file row (leftovers).
import type { ReactNode } from 'react';
import { useUser } from '../../data/auth';
import { usePreviewFetch } from '../../data/preview';
import { useCanWriteFolder, useCapability, useFiles, useFolders, useProject } from '../../data/queries';
import { useUploadQueue } from '../../data/UploadQueue';
import type { FolderRow } from '../../data/types';
import { Card } from '../../ui/Card';
import { useFileViewer } from '../../ui/FileViewer';
import { PageHeader } from '../../ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { FileRow, FileRowsHead } from './FileRow';
import { FolderAiToggle } from './FolderAiToggle';
import { defaultFolderId, folderPath, visibleFolders } from './folderOrder';
import { FolderTree } from './FolderTree';
import { leftoverUploads, storedFiles } from './leftovers';
import { canOpenNow } from './scanStatus';
import { NewFolderForm } from './NewFolderForm';
import { RenameFolder } from './RenameFolder';
import { UploadButtons } from './UploadButtons';
import { UploadList } from './UploadList';
import { useDownload } from './useDownload';
import { useFileDrop } from './useFileDrop';
import { fileViewerItem } from './viewerItems';

interface FilesToolProps {
  projectId: string;
  /** From the URL (?folder=); null = the default folder. */
  folderId: string | null;
  selectedFileId: string | null;
  isPhone: boolean;
  onSelectFolder: (folderId: string) => void;
  onOpenFile: (fileId: string) => void;
}

const META = TOOL_META.files;

interface FrameProps {
  meta?: string | undefined;
  actions?: ReactNode;
  below?: ReactNode;
  children: ReactNode;
}

function Frame({ meta, actions, below, children }: FrameProps) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}

interface FolderFilesProps {
  folder: FolderRow;
  writable: boolean;
  timeZone: string | null;
  selectedFileId: string | null;
  onFiles: (files: File[]) => void;
  onOpenFile: (fileId: string) => void;
}

function FolderFiles({ folder, writable, timeZone, selectedFileId, onFiles, onOpenFile }: FolderFilesProps) {
  const files = useFiles(folder.id);
  const queue = useUploadQueue();
  const download = useDownload();
  const drop = useFileDrop(writable, onFiles);
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const user = useUser();
  const rows = files.data ? storedFiles(files.data) : undefined;
  // Full screen from a row walks the folder's photos and PDFs with the arrows.
  const list = (rows ?? [])
    .filter((f) => canOpenNow(f, user.id))
    .map((f) => fileViewerItem(f, preview))
    .filter((i) => i.kind !== 'other');
  const viewable = new Set(list.map((i) => i.id));
  const leftovers = files.data ? leftoverUploads(files.data, queue.items) : [];

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
          <UploadList folderId={folder.id} leftovers={leftovers} />
          {files.isPending ? <LoadingState label="Loading files" /> : null}
          {files.isError ? <ErrorState error={files.error} onRetry={() => void files.refetch()} /> : null}
          {rows?.length === 0 ? (
            <EmptyState icon={META.icon} title="This folder is empty." />
          ) : null}
          {rows && rows.length > 0 ? (
            <>
              <FileRowsHead />
              <ul className="divide-y divide-line">
                {rows.map((f) => (
                  <FileRow
                    key={f.id}
                    file={f}
                    timeZone={timeZone}
                    selected={f.id === selectedFileId}
                    downloading={download.pendingId === f.id}
                    onOpen={onOpenFile}
                    onView={
                      viewable.has(f.id)
                        ? () => {
                            viewer.open(list, list.findIndex((i) => i.id === f.id));
                          }
                        : undefined
                    }
                    onDownload={(file) => {
                      download.start(file.id, file.size);
                    }}
                  />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

interface FolderScreenProps extends Omit<FilesToolProps, 'folderId'> {
  folders: readonly FolderRow[];
  current: FolderRow;
  manager: boolean;
}

/** One open folder: the header (its path, the AI switch, Upload), the tree, the files. */
function FolderScreen({ projectId, folders, current, manager, selectedFileId, isPhone, onSelectFolder, onOpenFile }: FolderScreenProps) {
  const canWrite = useCanWriteFolder(current.id);
  const project = useProject(projectId);
  const queue = useUploadQueue();
  const writable = canWrite.data === true;
  // People's own folders (and an old one in the way of a tool's folder); never a folder the system finds by its name.
  const renamable = manager && current.kind === 'general' && !(current.parent_id === null && current.name === 'Inspection requests');
  const enqueue = (picked: File[]) => {
    if (picked.length > 0) queue.enqueue(picked, projectId, current.id);
  };
  const list = visibleFolders(folders);
  // Desktop: the folder's AI switch sits beside Upload. Phone: under the header, so Camera and Upload keep one row.
  const aiToggle = <FolderAiToggle key={current.id} folder={current} canManage={manager} />;
  const actions = (
    <>
      {isPhone ? null : aiToggle}
      {writable ? <UploadButtons showCamera={isPhone} onFiles={enqueue} /> : null}
    </>
  );
  // Without the answer Upload can't show; say why instead of leaving it out (CLAUDE.md rule 6).
  const writeError = canWrite.isError ? (
    <ErrorState error={canWrite.error} title="Upload is not available." onRetry={() => void canWrite.refetch()} className="m-0 mb-4" />
  ) : null;

  return (
    <Frame meta={folderPath(folders, current.id)} actions={actions} below={isPhone ? aiToggle : undefined}>
      {writeError}
      <div className={`flex gap-4 ${isPhone ? 'flex-col' : 'items-start'}`}>
        <Card title="Folders" padded={false} className={isPhone ? '' : 'w-64 shrink-0'}>
          {/* A phone keeps the files in reach: a long tree scrolls in its own box. */}
          <div className={`p-2 ${isPhone ? 'max-h-56 overflow-y-auto' : ''}`}>
            <FolderTree folders={list} selectedId={current.id} onSelect={onSelectFolder} />
            {manager ? <NewFolderForm projectId={projectId} onCreated={onSelectFolder} /> : null}
            {renamable ? <RenameFolder key={current.id} folder={current} /> : null}
          </div>
        </Card>
        <div className="min-w-0 flex-1">
          <FolderFiles
            key={current.id}
            folder={current}
            writable={writable}
            timeZone={project.data?.timezone ?? null}
            selectedFileId={selectedFileId}
            onFiles={enqueue}
            onOpenFile={onOpenFile}
          />
        </div>
      </div>
    </Frame>
  );
}

export function FilesTool({ projectId, folderId, selectedFileId, isPhone, onSelectFolder, onOpenFile }: FilesToolProps) {
  const folders = useFolders(projectId);
  const canManage = useCapability(projectId, 'files.manage');

  if (folders.isPending) {
    return (
      <Frame>
        <Card>
          <LoadingState label="Loading folders" />
        </Card>
      </Frame>
    );
  }
  if (folders.isError) return <Frame><ErrorState error={folders.error} onRetry={() => void folders.refetch()} /></Frame>;

  const list = visibleFolders(folders.data);
  const current = folders.data.find((f) => f.id === folderId) ?? list.find((f) => f.id === defaultFolderId(list));
  const manager = canManage.data === true;

  if (list.length === 0 || !current) {
    return (
      <Frame>
        <Card>
          <EmptyState
            icon={META.icon}
            title="No folders you can open on this job yet."
            action={manager ? <NewFolderForm projectId={projectId} onCreated={onSelectFolder} /> : undefined}
          />
        </Card>
      </Frame>
    );
  }

  return (
    <FolderScreen
      projectId={projectId}
      folders={folders.data}
      current={current}
      manager={manager}
      selectedFileId={selectedFileId}
      isPhone={isPhone}
      onSelectFolder={onSelectFolder}
      onOpenFile={onOpenFile}
    />
  );
}

// Files (SPEC §8.1, Phase 0 core): folder tree, file rows with one-click download, drag-and-drop and button upload
// through the single uploader with per-file progress, and folder create and rename for files.manage. The tree lists
// folders by sort then name (each job opens with what its kind of user uses most) and hides the app's folders while they
// are empty (0092), with a lock on them and no Upload there. The list is FolderFiles: a row's name opens the file's pane
// (the file itself, Full screen, Rename, Delete), Delete and a checkbox sit on every row I may change, and checked rows
// move to any folder I may add to that the app doesn't fill (0096). The whole file list is the drop target; a dropped
// folder keeps its folders (usePlaceDrop).
import type { ReactNode } from 'react';
import { useWritableFolders } from '../../data/files';
import { useCanWriteFolder, useCapability, useFolders, useProject } from '../../data/queries';
import { useUploadQueue } from '../../data/UploadQueue';
import type { FolderRow } from '../../data/types';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { FolderAiToggle } from './FolderAiToggle';
import { FolderFiles } from './FolderFiles';
import { defaultFolderId, folderDescendants, folderPath, treeOrder, visibleFolders } from './folderOrder';
import { FolderTree } from './FolderTree';
import { NewFolderForm } from './NewFolderForm';
import { RenameFolder } from './RenameFolder';
import { UploadButtons } from './UploadButtons';
import { usePlaceDrop } from './usePlaceDrop';
import type { MoveTarget } from './useMoveRows';

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
    <div className="flex flex-col">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
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
  // A folder only the app fills takes files from its tool, not from Upload here.
  const writable = canWrite.data === true && !current.app_only;
  // People's own folders (and an old one in the way of a tool's folder); never a folder the system finds by its name.
  const renamable = manager && current.kind === 'general' && !current.app_only;
  const enqueue = (picked: File[]) => {
    if (picked.length > 0) queue.enqueue(picked, projectId, current.id);
  };
  const placeDrop = usePlaceDrop(projectId, current, manager);
  const list = visibleFolders(folders);
  const writableIds = useWritableFolders(projectId);
  // Move to: the folders I may add to that the app doesn't fill, in tree order, by their path.
  const targets: MoveTarget[] = treeOrder(folders)
    .map(({ folder }) => folder)
    .filter((f) => f.id !== current.id && !f.app_only && writableIds.data?.has(f.id) === true)
    .map((f) => ({ id: f.id, label: folderPath(folders, f.id) }));
  // Desktop: the folder's AI switch sits beside Upload. Phone: under the header, so Camera and Upload keep one row.
  const aiToggle = <FolderAiToggle key={current.id} folder={current} canManage={manager} />;
  const actions = (
    <>
      {isPhone ? null : aiToggle}
      {writable ? <UploadButtons showCamera={isPhone} onFiles={enqueue} /> : null}
    </>
  );
  // Without the answer Upload can't show; say why instead of leaving it out (CLAUDE.md rule 6).
  const writeError = canWrite.isError && !current.app_only ? (
    <ErrorState error={canWrite.error} title="Upload is not available." onRetry={() => void canWrite.refetch()} className="m-0 mb-4" />
  ) : null;

  const moveError = writableIds.isError ? (
    <ErrorState error={writableIds.error} title="Move is not available." onRetry={() => void writableIds.refetch()} className="m-0 mb-4" />
  ) : null;

  return (
    <Frame meta={folderPath(folders, current.id)} actions={actions} below={isPhone ? aiToggle : undefined}>
      {writeError}
      {moveError}
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
            under={folderDescendants(folders, current.id)}
            targets={targets}
            onDropped={placeDrop}
            onOpenFile={onOpenFile}
            onDeleted={(ids) => {
              // The pane of a deleted file closes; the folder stays.
              if (selectedFileId !== null && ids.includes(selectedFileId)) onSelectFolder(current.id);
            }}
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

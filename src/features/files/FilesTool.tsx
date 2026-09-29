// Files (SPEC §8.1, Phase 0 core): folder tree, file rows with one-click download, drag-and-drop and button upload
// through the single uploader with per-file progress, and folder create for files.manage. The tree lists folders by
// sort then name (each job opens with what its kind of user uses most) and hides an empty "Emailed in".
import { useState, type DragEvent, type ReactNode } from 'react';
import { useCanWriteFolder, useCapability, useFiles, useFolders, useProject } from '../../data/queries';
import { useUploadQueue } from '../../data/UploadQueue';
import { messageOf } from '../../data/errors';
import type { FolderRow } from '../../data/types';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { collectDrop } from './collectDrop';
import { FileRow, FileRowsHead } from './FileRow';
import { FolderAiToggle } from './FolderAiToggle';
import { defaultFolderId, folderPath, visibleFolders } from './folderOrder';
import { FolderTree } from './FolderTree';
import { NewFolderForm } from './NewFolderForm';
import { UploadButtons } from './UploadButtons';
import { UploadList } from './UploadList';
import { useDownload } from './useDownload';

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
  const download = useDownload();
  const toast = useToast();
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!writable) return;
    collectDrop(e.dataTransfer)
      .then(onFiles)
      .catch((err: unknown) => {
        toast.show({ tone: 'error', message: `Could not read what was dropped: ${messageOf(err)}` });
      });
  };

  return (
    <Card padded={false} className="overflow-hidden">
      <div
        className={`min-h-48 ${dragging ? 'bg-accent-soft outline-dashed outline-2 -outline-offset-4 outline-accent' : ''}`}
        onDragOver={(e) => {
          if (!writable) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        <UploadList folderId={folder.id} />
        {files.isPending ? <LoadingState label="Loading files" /> : null}
        {files.isError ? <ErrorState error={files.error} onRetry={() => void files.refetch()} /> : null}
        {files.data?.length === 0 ? (
          <EmptyState icon={META.icon} title="This folder is empty." hint={writable ? 'Drag files or a whole folder here, or use Upload.' : undefined} />
        ) : null}
        {files.data && files.data.length > 0 ? (
          <>
            <FileRowsHead />
            <ul className="divide-y divide-line">
              {files.data.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  timeZone={timeZone}
                  selected={f.id === selectedFileId}
                  downloading={download.pendingId === f.id}
                  onOpen={onOpenFile}
                  onDownload={(file) => {
                    download.start(file.id, file.size);
                  }}
                />
              ))}
            </ul>
          </>
        ) : null}
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

  return (
    <Frame meta={folderPath(folders, current.id)} actions={actions} below={isPhone ? aiToggle : undefined}>
      <div className={`flex gap-4 ${isPhone ? 'flex-col' : 'items-start'}`}>
        <Card title="Folders" padded={false} className={isPhone ? '' : 'w-64 shrink-0'}>
          <div className="p-2">
            <FolderTree folders={list} selectedId={current.id} onSelect={onSelectFolder} />
            {manager ? <NewFolderForm projectId={projectId} onCreated={onSelectFolder} /> : null}
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

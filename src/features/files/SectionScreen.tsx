// One section of Files on screen (0097): the header (the section and the folder it is narrowed to, the AI switch,
// Upload), the sections (left card, a select on a phone), and the section's list. Uploads and drops are sorted by
// their names (useSortUpload). New folder and Rename folder act on the folder on screen.
import { useWritableFolders } from '../../data/files';
import type { FileSection } from '../../data/fileSections';
import { useCanWriteFolder, useCapability, useProject } from '../../data/queries';
import type { FolderRow } from '../../data/types';
import { Card } from '../../ui/Card';
import { ErrorState } from '../../ui/States';
import type { SectionKind } from './classify';
import { FilesFrame } from './FilesFrame';
import { FolderAiToggle } from './FolderAiToggle';
import { folderPath } from './folderOrder';
import { NewFolderForm } from './NewFolderForm';
import { RenameFolder } from './RenameFolder';
import { SectionFiles } from './SectionFiles';
import { SectionNav } from './SectionNav';
import { moveTargets, shownSections } from './sections';
import { UploadButtons } from './UploadButtons';
import { useSortUpload } from './useSortUpload';

interface SectionScreenProps {
  projectId: string;
  sections: readonly FileSection[];
  section: FileSection;
  kind: SectionKind;
  /** The folder on screen: the filter's, else the section's own. */
  current: FolderRow;
  folders: readonly FolderRow[];
  manager: boolean;
  selectedFileId: string | null;
  isPhone: boolean;
  onSelectFolder: (folderId: string) => void;
  onOpenFile: (fileId: string) => void;
}

export function SectionScreen(props: SectionScreenProps) {
  const { projectId, sections, section, kind, current, folders, manager, selectedFileId, isPhone, onSelectFolder } = props;
  const canWrite = useCanWriteFolder(current.id);
  const writableIds = useWritableFolders(projectId);
  const revs = useCapability(projectId, 'revs.manage');
  const project = useProject(projectId);
  // A folder only the app fills takes files from its tool, not from Upload here.
  const writable = canWrite.data === true && !current.app_only;
  // People's own folders; never a folder the system finds by its kind or name.
  const renamable = manager && current.kind === 'general' && !current.app_only;
  const sort = useSortUpload({
    projectId,
    sections,
    viewing: kind,
    viewFolder: current,
    folders,
    writable: writableIds.data,
    manager,
    revs: revs.data === true,
  });
  const shown = shownSections(sections);
  const nav = sections.filter((s) => shown.includes(s) || s.folder_id === section.folder_id);
  // Desktop: the folder's AI switch sits beside Upload. Phone: under the header, so Camera and Upload keep one row.
  const aiToggle = <FolderAiToggle key={current.id} folder={current} canManage={manager} />;
  const actions = (
    <>
      {isPhone ? null : aiToggle}
      {writable ? (
        <UploadButtons
          showCamera={isPhone}
          onFiles={(picked) => {
            sort(picked.map((file) => ({ file, dir: [] })));
          }}
        />
      ) : null}
    </>
  );
  // Without the answer Upload or Move to can't show; say why instead of leaving them out (CLAUDE.md rule 6).
  const errors = (
    <>
      {canWrite.isError && !current.app_only ? (
        <ErrorState error={canWrite.error} title="Upload is not available." onRetry={() => void canWrite.refetch()} className="m-0 mb-4" />
      ) : null}
      {writableIds.isError ? (
        <ErrorState error={writableIds.error} title="Move is not available." onRetry={() => void writableIds.refetch()} className="m-0 mb-4" />
      ) : null}
    </>
  );
  const folderTools = (
    <>
      {manager && writable ? <NewFolderForm projectId={projectId} parentId={current.id} onCreated={onSelectFolder} /> : null}
      {renamable ? <RenameFolder key={current.id} folder={current} /> : null}
    </>
  );
  const sectionNav = <SectionNav sections={nav} current={section.folder_id} isPhone={isPhone} onPick={onSelectFolder} />;

  return (
    <FilesFrame meta={folderPath(folders, current.id)} actions={actions} below={isPhone ? aiToggle : undefined}>
      {errors}
      <div className={`flex gap-4 ${isPhone ? 'flex-col' : 'items-start'}`}>
        {isPhone ? (
          <div className="flex flex-col gap-1">
            {sectionNav}
            <div className="flex flex-wrap gap-1">{folderTools}</div>
          </div>
        ) : (
          <Card padded={false} className="w-56 shrink-0">
            <div className="p-2">
              {sectionNav}
              {folderTools}
            </div>
          </Card>
        )}
        <div className="min-w-0 flex-1">
          <SectionFiles
            key={section.folder_id}
            projectId={projectId}
            section={section}
            kind={kind}
            filterId={current.id === section.folder_id ? null : current.id}
            viewFolderId={current.id}
            folders={folders}
            writable={writable}
            timeZone={project.data?.timezone ?? null}
            selectedFileId={selectedFileId}
            targets={moveTargets(sections, folders, writableIds.data ?? new Set())}
            onDropped={sort}
            onOpenFile={props.onOpenFile}
            onFilter={(id) => {
              onSelectFolder(id ?? section.folder_id);
            }}
            onDeleted={(ids) => {
              // The pane of a deleted file closes; the section stays.
              if (selectedFileId !== null && ids.includes(selectedFileId)) onSelectFolder(current.id);
            }}
          />
        </div>
      </div>
    </FilesFrame>
  );
}

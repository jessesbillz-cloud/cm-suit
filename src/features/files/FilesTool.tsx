// Files (SPEC §8.1; Jesse, Oct 11: "that whole files page we need to redesign"): the job's fixed sections (0097
// files_sections), Plans, Specs, Submittals, RFIs, CCDs, Reports, Photos, then To sort, and Bids received and Emailed in
// while something is in them, each with its file count. A section's list is every file in it as one flat list, its
// folders a filter above it (SectionScreen, SectionFiles). The URL's folder says the section, and the filter when it is
// a folder under the section, so every link to a folder in Files still lands there. Folders another tool owns (Room
// pictures, Inspection requests ...) are reached from that tool, not here.
import { useEffect } from 'react';
import { useFileSections } from '../../data/fileSections';
import { useCapability, useFolders } from '../../data/queries';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { FilesFrame } from './FilesFrame';
import { resolveView, sectionKind } from './sections';
import { SectionScreen } from './SectionScreen';

interface FilesToolProps {
  projectId: string;
  /** From the URL (?folder=): a section's folder or one under it; null = the first section. */
  folderId: string | null;
  selectedFileId: string | null;
  isPhone: boolean;
  onSelectFolder: (folderId: string) => void;
  onOpenFile: (fileId: string) => void;
}

export function FilesTool({ projectId, folderId, selectedFileId, isPhone, onSelectFolder, onOpenFile }: FilesToolProps) {
  const folders = useFolders(projectId);
  const sections = useFileSections(projectId);
  const canManage = useCapability(projectId, 'files.manage');
  // files_sections may have just made a section's folder the folder list doesn't have yet: ask for the list again.
  const known = folders.data;
  const missing = known !== undefined && (sections.data ?? []).some((x) => !known.some((f) => f.id === x.folder_id));
  const refetchFolders = folders.refetch;
  useEffect(() => {
    if (missing) void refetchFolders();
  }, [missing, refetchFolders]);

  if (folders.isPending || sections.isPending || (missing && folders.isFetching)) {
    return (
      <FilesFrame>
        <Card>
          <LoadingState label="Loading files" />
        </Card>
      </FilesFrame>
    );
  }
  if (folders.isError) {
    return (
      <FilesFrame>
        <ErrorState error={folders.error} onRetry={() => void folders.refetch()} />
      </FilesFrame>
    );
  }
  if (sections.isError) {
    return (
      <FilesFrame>
        <ErrorState error={sections.error} onRetry={() => void sections.refetch()} />
      </FilesFrame>
    );
  }

  const view = resolveView(sections.data, folderId);
  const kind = view ? sectionKind(view.section) : null;
  const current = view ? folders.data.find((f) => f.id === (view.filterId ?? view.section.folder_id)) : undefined;
  if (!view || kind === null || !current) {
    return (
      <FilesFrame>
        <Card>
          <EmptyState icon={TOOL_META.files.icon} title="No files you can open on this job yet." />
        </Card>
      </FilesFrame>
    );
  }

  return (
    <SectionScreen
      projectId={projectId}
      sections={sections.data}
      section={view.section}
      kind={kind}
      current={current}
      folders={folders.data}
      manager={canManage.data === true}
      selectedFileId={selectedFileId}
      isPhone={isPhone}
      onSelectFolder={onSelectFolder}
      onOpenFile={onOpenFile}
    />
  );
}

// The main column while the spec section search has text (its boxes) or a section's page is open (?spec=). Reads
// what it needs only then, so the plain list loads nothing more.
import type { FileSection } from '../../data/fileSections';
import { SpecBoxes } from './SpecBoxes';
import { SpecHub } from './SpecHub';
import { useFilesNav } from './useFilesNav';
import { useHubData } from './useHubData';

interface SpecMainProps {
  projectId: string;
  sections: readonly FileSection[];
  timeZone: string | null;
  selectedFileId: string | null;
}

export function SpecMain({ projectId, sections, timeZone, selectedFileId }: SpecMainProps) {
  const where = useFilesNav(projectId);
  const data = useHubData(projectId, sections);
  if (where.spec !== null) {
    return (
      <SpecHub
        projectId={projectId}
        sectionKey={where.spec}
        data={data}
        timeZone={timeZone}
        selectedFileId={selectedFileId}
        onOpenFile={where.openFile}
        onOpenRfi={where.openRfi}
      />
    );
  }
  return <SpecBoxes query={where.query} data={data} onOpen={where.openSection} />;
}

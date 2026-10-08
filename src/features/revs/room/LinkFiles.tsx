// Setup's Link files (0083, 0094): one tap links each room's picture by its name, each sign-off before the app to its
// OFS IR by its number, and each wall to its plan sheet by its sheet number (a PDF in Plans named like "A201A Floor
// Plan.pdf"). Pictures and IRs added from Revs link themselves; this is for files already on the job. The toast says
// what it found.
import { Link2 } from 'lucide-react';
import { messageOf } from '../../../data/errors';
import { useLinkRevFiles } from '../../../data/revs.rooms';
import { Button } from '../../../ui/Button';
import { useToast } from '../../../ui/Toast';
import { linkedLine } from './revFilesLine';

interface LinkFilesProps {
  projectId: string;
  listIds: string[];
}

export function LinkFiles({ projectId, listIds }: LinkFilesProps) {
  const link = useLinkRevFiles();
  const toast = useToast();
  return (
    <Button
      variant="quiet"
      icon={Link2}
      loading={link.isPending}
      data-testid="rev-link-files"
      onClick={() => {
        link.mutate(
          { projectId, listIds },
          {
            onSuccess: (r) => {
              toast.show({ message: linkedLine(r) });
            },
            onError: (e) => {
              toast.show({ tone: 'error', message: messageOf(e) });
            },
          },
        );
      }}
    >
      Link files
    </Button>
  );
}

// Setup's Link files (0083): after the rooms' images and the OFS IRs are dragged into Files, one tap links each room's
// image by its name and each sign-off before the app to its OFS IR by its number. The toast says what it found.
import { Link2 } from 'lucide-react';
import { messageOf } from '../../../data/errors';
import { useLinkRevFiles, type Linked } from '../../../data/revs.rooms';
import { Button } from '../../../ui/Button';
import { useToast } from '../../../ui/Toast';

function linkedLine({ images, files }: Linked): string {
  const parts = [
    images > 0 ? `${String(images)} ${images === 1 ? 'image' : 'images'}` : null,
    files > 0 ? `${String(files)} OFS ${files === 1 ? 'IR' : 'IRs'}` : null,
  ].filter((x): x is string => x !== null);
  return parts.length > 0 ? `${parts.join(' and ')} linked.` : 'Nothing new to link.';
}

interface LinkFilesProps {
  projectId: string;
  listIds: string[];
  isPhone: boolean;
}

export function LinkFiles({ projectId, listIds, isPhone }: LinkFilesProps) {
  const link = useLinkRevFiles();
  const toast = useToast();
  return (
    <Button
      icon={Link2}
      aria-label="Link files"
      title="Link files"
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
      {/* A phone's header keeps room for Add walls and New list. */}
      {isPhone ? undefined : 'Link files'}
    </Button>
  );
}

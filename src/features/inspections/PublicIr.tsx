// "View IR" on the status link (0075): the request's IR PDF by the same receipt, once made, full screen in the file
// viewer (its pages; Download inside), and Download beside it (one click, its own filename: lib/saveFile). The server
// signs a fresh URL and logs it as a download each time.
import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { downloadErrorMessage } from '../../data/download';
import { publicIrFile } from '../../data/requestNoLogin';
import { saveFile } from '../../lib/saveFile';
import { Button } from '../../ui/Button';
import { useFileViewer, type ViewerItem } from '../../ui/FileViewer';
import { useToast } from '../../ui/Toast';

export function PublicIr({ projectId, receipt, number }: { projectId: string; receipt: string; number: number }) {
  const viewer = useFileViewer();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const f = await publicIrFile(projectId, receipt);
    await saveFile(f.url, f.filename);
  };
  const item: ViewerItem = {
    id: `public-ir-${receipt}`,
    name: `IR ${String(number)}`,
    kind: 'pdf',
    url: async () => (await publicIrFile(projectId, receipt)).url,
    download: save,
  };
  return (
    <div className="flex gap-2">
      <Button
        size="lg"
        variant="primary"
        icon={FileText}
        className="flex-1"
        data-testid="public-view-ir"
        onClick={() => {
          viewer.open([item]);
        }}
      >
        View IR
      </Button>
      <Button
        size="lg"
        icon={Download}
        loading={saving}
        aria-label="Download IR"
        data-testid="public-download-ir"
        onClick={() => {
          setSaving(true);
          save()
            .catch((e: unknown) => {
              toast.show({ tone: 'error', message: downloadErrorMessage(e) });
            })
            .finally(() => {
              setSaving(false);
            });
        }}
      />
    </div>
  );
}

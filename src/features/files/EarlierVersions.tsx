// A file's earlier versions (a regenerated report's older PDFs), behind one small "Earlier versions" line in its pane
// (SPEC §8.1: "the old one stays viewable"). Each opens in the file viewer; Download is there too.
import type { EarlierVersion } from '../../data/files';
import { usePreviewFetch } from '../../data/preview';
import { formatInZone } from '../../lib/dates';
import { formatBytes } from '../../lib/format';
import { BehindLink } from '../../ui/BehindLink';
import { fileIcon } from '../../ui/fileIcon';
import { useFileViewer } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { fileViewerItem } from './viewerItems';

interface EarlierVersionsProps {
  versions: readonly EarlierVersion[];
  timeZone: string;
}

export function EarlierVersions({ versions, timeZone }: EarlierVersionsProps) {
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  if (versions.length === 0) return null;
  const items = versions.map((v) => fileViewerItem(v, preview));

  return (
    <div className="flex flex-col gap-2">
      <BehindLink label={`Earlier versions (${String(versions.length)})`} testId="file-earlier">
        <ul className="flex flex-col gap-1.5">
          {versions.map((v, i) => (
            <li key={v.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-page"
                onClick={() => {
                  viewer.open(items, i);
                }}
              >
                <Icon icon={fileIcon(v.original_name, v.mime)} size={16} className="shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1 wrap-anywhere">Version {v.version_no}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-3">
                  {formatBytes(v.size)} · {formatInZone(v.created_at, timeZone, 'MMM d, yyyy h:mm a')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </BehindLink>
    </div>
  );
}

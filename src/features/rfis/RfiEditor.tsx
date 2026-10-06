// The RFI's typed fields: title, question and photos first (all most RFIs need), then a quiet "More" section with the
// suggestion, reference and possible impact. Nothing below the photos is required. Autosaves. No "needed by" date: the
// answer is due by the contract (the job's RFI settings set the due date when it is issued, Jesse, Oct 5).
import { usePreviewFetch } from '../../data/preview';
import { saveRfiFile } from '../../data/rfis.mutations';
import type { RfiFileRef } from '../../data/rfis.types';
import { CheckField, FIELD_AREA, FIELD_LABEL, TextField } from '../../ui/Fields';
import { useFileViewer, type ViewerItem } from '../../ui/FileViewer';
import { PhotoTile } from '../../ui/PhotoTile';
import { PHOTO_GRID } from '../../ui/Thumb';
import { PhotoPicker } from '../corrections/PhotoPicker';
import type { RfiDraft } from './useRfiDraft';

const AREA = FIELD_AREA;
const LABEL = FIELD_LABEL;

interface KeptPhotosProps {
  rfiId: string;
  photos: readonly RfiFileRef[];
  kept: readonly string[];
  onRemove: (id: string) => void;
}

/** Photos already on the RFI (shown through it): kept unless taken off here. A tap opens them full screen. */
function KeptPhotos({ rfiId, photos, kept, onRemove }: KeptPhotosProps) {
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const shown = photos.filter((p) => kept.includes(p.id));
  if (shown.length === 0) return null;
  const items: ViewerItem[] = shown.map((p) => ({
    id: p.id,
    name: p.original_name,
    kind: 'image',
    url: () => preview(p.id, { rfiId }),
    download: () => saveRfiFile(rfiId, p.id),
    remove: () => {
      onRemove(p.id);
    },
  }));
  return (
    <ul className={PHOTO_GRID} aria-label="Photos on this RFI">
      {shown.map((p, i) => (
        <PhotoTile
          key={p.id}
          fileId={p.id}
          via={{ rfiId }}
          name={p.original_name}
          onOpen={() => {
            viewer.open(items, i);
          }}
          onRemove={() => {
            onRemove(p.id);
          }}
        />
      ))}
    </ul>
  );
}

interface RfiEditorProps {
  draft: RfiDraft;
  /** The RFI being edited (null until a new one is first saved) and the photos already on it. */
  rfiId: string | null;
  photos: readonly RfiFileRef[];
  isPhone: boolean;
  autoFocus: boolean;
}

export function RfiEditor({ draft, rfiId, photos, isPhone, autoFocus }: RfiEditorProps) {
  const { form, edit } = draft;
  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Title"
        value={form.title}
        maxLength={200}
        autoFocus={autoFocus}
        testId="rfi-title"
        onChange={(title) => {
          edit({ title });
        }}
        onBlur={() => void draft.flush()}
      />
      <label className={LABEL}>
        Question
        <textarea
          rows={isPhone ? 5 : 6}
          maxLength={8000}
          className={AREA}
          value={form.question}
          data-testid="rfi-question"
          onChange={(e) => {
            edit({ question: e.target.value });
          }}
          onBlur={() => void draft.flush()}
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-ink-2">Photos</span>
        {rfiId !== null ? (
          <KeptPhotos
            rfiId={rfiId}
            photos={photos}
            kept={form.kept}
            onRemove={(id) => {
              edit({ kept: form.kept.filter((k) => k !== id) });
            }}
          />
        ) : null}
        <PhotoPicker uploads={draft.photos} isPhone={isPhone} inputTestId="rfi-photo-input" />
      </div>

      <section className="flex flex-col gap-3 border-t border-line pt-4" aria-label="More">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">More</h2>
        <label className={LABEL}>
          Suggestion
          <textarea
            rows={2}
            maxLength={4000}
            className={AREA}
            value={form.suggestion}
            data-testid="rfi-suggestion"
            onChange={(e) => {
              edit({ suggestion: e.target.value });
            }}
            onBlur={() => void draft.flush()}
          />
        </label>
        <TextField
          label="Reference"
          value={form.refs}
          maxLength={500}
          testId="rfi-refs"
          onChange={(refs) => {
            edit({ refs });
          }}
          onBlur={() => void draft.flush()}
        />
        <fieldset className="flex flex-col">
          <legend className="text-[13px] font-medium text-ink-2">Possible impact</legend>
          <div className="flex gap-6">
            <CheckField
              label="Cost"
              checked={form.cost}
              testId="rfi-cost"
              onChange={(cost) => {
                edit({ cost });
              }}
            />
            <CheckField
              label="Time"
              checked={form.time}
              testId="rfi-time"
              onChange={(time) => {
                edit({ time });
              }}
            />
          </div>
        </fieldset>
      </section>
    </div>
  );
}

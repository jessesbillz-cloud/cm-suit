// The RFI's typed fields: title, question and photos first (all most RFIs need), then a quiet "More" section with the
// suggestion, reference, needed-by date and possible impact. Nothing below the photos is required. Autosaves.
import { Image as PhotoIcon, X } from 'lucide-react';
import type { RfiFileRef } from '../../data/rfis.types';
import { CheckField, TextField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { PhotoPicker } from '../corrections/PhotoPicker';
import type { RfiDraft } from './useRfiDraft';

const AREA =
  'rounded-md border border-line-strong bg-card px-2.5 py-2 text-sm font-normal leading-6 text-ink shadow-control outline-none transition-shadow focus:border-accent focus:ring-[3px] focus:ring-accent/20';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';

interface KeptPhotosProps {
  photos: readonly RfiFileRef[];
  kept: readonly string[];
  onRemove: (id: string) => void;
}

/** Photos already on the RFI: kept unless taken off here. */
function KeptPhotos({ photos, kept, onRemove }: KeptPhotosProps) {
  const shown = photos.filter((p) => kept.includes(p.id));
  if (shown.length === 0) return null;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Photos on this RFI">
      {shown.map((p) => (
        <li key={p.id} className="relative flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-line bg-page p-1 text-ink-2">
          <Icon icon={PhotoIcon} size={20} />
          <span className="w-full break-words text-center text-[11px] leading-4">{p.original_name}</span>
          <button
            type="button"
            aria-label={`Remove ${p.original_name}`}
            className="absolute right-1 top-1 rounded-full bg-card/90 p-1 text-ink-2 hover:text-ink"
            onClick={() => {
              onRemove(p.id);
            }}
          >
            <Icon icon={X} size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface RfiEditorProps {
  draft: RfiDraft;
  /** The photos already on the RFI (names for the tiles). */
  photos: readonly RfiFileRef[];
  isPhone: boolean;
  autoFocus: boolean;
}

export function RfiEditor({ draft, photos, isPhone, autoFocus }: RfiEditorProps) {
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
        <span className="text-xs font-medium text-ink-2">Photos</span>
        <KeptPhotos
          photos={photos}
          kept={form.kept}
          onRemove={(id) => {
            edit({ kept: form.kept.filter((k) => k !== id) });
          }}
        />
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
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
          <TextField
            label="Needed by"
            type="date"
            value={form.neededBy}
            testId="rfi-needed-by"
            onChange={(neededBy) => {
              edit({ neededBy });
            }}
          />
        </div>
        <fieldset className="flex flex-col">
          <legend className="text-xs font-medium text-ink-2">Possible impact</legend>
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

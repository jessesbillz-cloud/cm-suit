// The built-in work log's day: weather, the work log (each row with its own camera), the day's inspections, and the
// note sections. Field Mode shows only the inspections and the notes (roomy), under the big photo button.
import type { PhotoPick } from '../../data/dailies.mutations';
import type { DailyContent, DailyHeader } from '../../lib/dailies';
import { InspectionsList } from './InspectionsList';
import { NotesFields } from './NotesFields';
import { PhotoButtons } from './PhotoButtons';
import { INPUT } from './styles';
import { WorkLog } from './WorkLog';

interface WorkLogBodyProps {
  content: DailyContent;
  header: DailyHeader;
  locked: boolean;
  field: boolean;
  edit: (change: (c: DailyContent) => DailyContent) => void;
  onRowPhotos: (picks: PhotoPick[], rowKey: string) => void;
}

export function WorkLogBody({ content: c, header, locked, field, edit, onRowPhotos }: WorkLogBodyProps) {
  return (
    <>
      {field ? null : (
        <>
          <label className="flex items-center gap-3 rounded-card bg-card px-4 py-3 shadow-card">
            <span className="w-20 shrink-0 text-[15px] font-semibold text-ink">Weather</span>
            <input
              className={`h-10 min-w-0 flex-1 ${INPUT}`}
              value={c.weather}
              maxLength={300}
              disabled={locked}
              onChange={(e) => {
                const weather = e.target.value;
                edit((x) => ({ ...x, weather }));
              }}
            />
          </label>
          <WorkLog
            rows={c.work}
            locked={locked}
            onRows={(change) => {
              edit((x) => ({ ...x, work: change(x.work) }));
            }}
            cameraFor={(rowKey) => (
              <PhotoButtons
                variant="row"
                projectName={header.project_name}
                tz={header.timezone}
                onPicked={(picks) => {
                  onRowPhotos(picks, rowKey);
                }}
              />
            )}
          />
        </>
      )}
      <InspectionsList items={c.inspections} locked={locked} edit={edit} />
      <NotesFields
        content={c}
        locked={locked}
        roomy={field}
        onNote={(key, text) => {
          edit((x) => ({ ...x, notes: { ...x.notes, [key]: text } }));
        }}
        onCarry={(key, carry) => {
          edit((x) => ({
            ...x,
            carry_sections: carry ? [...x.carry_sections.filter((k) => k !== key), key] : x.carry_sections.filter((k) => k !== key),
          }));
        }}
      />
    </>
  );
}

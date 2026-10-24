// Settings > Job, with OFS on: the job's OFS route (0116), set by whoever manages the job. The contractor check (on by
// default) and who sends to the fire marshal after the inspector (the inspector by default, or the job's OFS requests
// person once the inspector marks it Ready), with the route on one line as everyone will see it on a request.
import { CheckField, SelectField } from '../../ui/Fields';
import { RouteLine } from './RouteLine';

type RouteKey = 'ir_ofs_gc_off' | 'ir_ofs_duty_sends';

interface OfsRouteSettingProps {
  gcOff: boolean;
  dutySends: boolean;
  onChange: (key: RouteKey, value: boolean) => void;
}

const SENDERS = [
  { value: 'inspector', label: 'Inspector' },
  { value: 'duty', label: "Contractor's OFS person" },
];

export function OfsRouteSetting({ gcOff, dutySends, onChange }: OfsRouteSettingProps) {
  return (
    <div className="mt-2 flex flex-col gap-1" data-testid="ofs-route-setting">
      <span className="text-[13px] font-medium text-ink">OFS route</span>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <CheckField
          label="Contractor checks"
          checked={!gcOff}
          testId="ofs-route-gc"
          onChange={(on) => {
            onChange('ir_ofs_gc_off', !on);
          }}
        />
        <SelectField
          label="Sends to fire marshal"
          value={dutySends ? 'duty' : 'inspector'}
          options={SENDERS}
          testId="ofs-route-sender"
          onChange={(v) => {
            onChange('ir_ofs_duty_sends', v === 'duty');
          }}
        />
      </div>
      <RouteLine route={{ gc: !gcOff, sender: dutySends ? 'duty' : 'inspector' }} testId="ofs-route-preview" />
    </div>
  );
}

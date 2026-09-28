// A small live sketch of my desktop frame (SPEC §7.2) and my phone bar (§7.7), drawn from my layout choices. The part
// a person is pointing at in the form lights up here, so they see exactly where a choice lands.
import type { FocusEvent } from 'react';
import { Ellipsis } from 'lucide-react';
import { phoneTabs, type LayoutChoices, type RailTool, type Tool } from '../../lib/layout';
import { Icon } from '../../ui/Icon';
import { TOOL_META } from '../../ui/tools';

type SpotArea = 'rail' | 'main' | 'right' | 'whats_new';

/** What the form is pointing at: an area of the frame, and on the rail, maybe one tool. */
export interface Spot {
  area: SpotArea;
  tool: RailTool | null;
}

/** Props that light up a spot while the pointer or focus is inside an element, and clear it when both leave. */
export function pointAt(spot: Spot, onSpot: (spot: Spot | null) => void) {
  return {
    onMouseEnter: () => {
      onSpot(spot);
    },
    onFocus: () => {
      onSpot(spot);
    },
    onMouseLeave: () => {
      onSpot(null);
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) onSpot(null);
    },
  };
}

type PreviewChoices =Pick<LayoutChoices, 'rail_items' | 'main_default' | 'docked_panel' | 'whats_new_enabled'>;

interface PreviewProps {
  choices: PreviewChoices;
  spot: Spot | null;
}

const LIT = 'bg-accent-soft ring-2 ring-inset ring-accent';

function Lines({ count }: { count: number }) {
  const widths = ['w-full', 'w-4/5', 'w-11/12', 'w-3/5', 'w-5/6'];
  return (
    <div className="flex flex-col gap-1">
      {widths.slice(0, count).map((w) => (
        <span key={w} className={`h-1 rounded-full bg-line-strong/70 ${w}`} />
      ))}
    </div>
  );
}

function Heading({ tool }: { tool: Tool }) {
  return (
    <p className="flex items-center gap-1 truncate text-[10px] font-semibold leading-3 text-ink">
      <Icon icon={TOOL_META[tool].icon} size={11} className="shrink-0" />
      {TOOL_META[tool].label}
    </p>
  );
}

interface DotProps {
  tool: Tool;
  active: boolean;
  lit: boolean;
}

function RailDot({ tool, active, lit }: DotProps) {
  const tone = lit ? 'bg-accent text-white' : active ? 'bg-accent-soft text-accent' : 'text-ink-2';
  return (
    <span data-tool={tool} className={`flex h-[17px] w-6 shrink-0 items-center justify-center rounded-sm ${tone}`}>
      <Icon icon={TOOL_META[tool].icon} size={11} />
    </span>
  );
}

function DesktopSketch({ choices, spot }: PreviewProps) {
  const at = (a: SpotArea) => spot?.area === a;
  const main = choices.main_default;
  const docked = choices.docked_panel === 'board';
  return (
    <div className="overflow-hidden rounded-md border border-line-strong bg-page shadow-control">
      <div className="flex h-4 items-center border-b border-line bg-card px-2">
        <span className="h-1 w-10 rounded-full bg-line-strong" />
      </div>
      <div className="flex h-[200px]">
        <div
          data-testid="layout-preview-rail"
          className={`flex w-8 shrink-0 flex-col items-center gap-0.5 border-r border-line py-1 transition-colors ${at('rail') ? LIT : 'bg-card'}`}
        >
          {choices.rail_items.map((t) => (
            <RailDot key={t} tool={t} active={t === main} lit={spot?.tool === t} />
          ))}
          <span className="flex-1" />
          <RailDot tool="settings" active={false} lit={false} />
        </div>
        <div
          data-testid="layout-preview-main"
          data-tool={main}
          className={`flex min-w-0 flex-1 flex-col gap-1.5 p-2 transition-colors ${at('main') ? LIT : ''}`}
        >
          <Heading tool={main} />
          {main === 'board' && choices.whats_new_enabled ? (
            <span className={`h-2.5 rounded-sm transition-colors ${at('whats_new') ? 'bg-accent' : 'bg-accent/25'}`} />
          ) : null}
          <div className="rounded-sm bg-card p-1.5 shadow-control">
            <Lines count={5} />
          </div>
          <div className="rounded-sm bg-card p-1.5 shadow-control">
            <Lines count={3} />
          </div>
        </div>
        <div
          data-testid="layout-preview-right"
          data-panel={choices.docked_panel}
          className={`flex w-[34%] shrink-0 flex-col gap-1.5 border-l p-2 transition-colors ${
            docked ? 'border-line' : 'border-dashed border-line-strong'
          } ${at('right') ? LIT : docked ? 'bg-card' : ''}`}
        >
          {docked ? (
            <>
              <Heading tool="board" />
              <Lines count={4} />
            </>
          ) : (
            <p className="m-auto text-center text-[10px] leading-3 text-ink-3">Open item</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TabDot({ tool, active, lit }: DotProps) {
  const tone = lit ? 'bg-accent text-white' : active ? 'text-accent' : 'text-ink-2';
  return (
    <span data-tool={tool} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-sm py-1 ${tone}`}>
      <Icon icon={TOOL_META[tool].icon} size={14} />
      <span className="max-w-full truncate text-[9px] leading-[10px]">{TOOL_META[tool].label}</span>
    </span>
  );
}

function PhoneSketch({ choices, spot }: PreviewProps) {
  // The phone opens on my main tool, so it is on the bar (lib/layout phoneTabs, the same rule the phone uses).
  const { tabs } = phoneTabs(choices.rail_items, choices.main_default);
  const at = (a: SpotArea) => spot?.area === a;
  return (
    <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-b-[22px] rounded-t-md border-2 border-line-strong bg-page">
      <div className={`flex flex-col gap-1 px-2 pb-2 pt-1.5 transition-colors ${at('main') ? LIT : ''}`}>
        <Heading tool={choices.main_default} />
        <Lines count={2} />
      </div>
      <div
        data-testid="layout-preview-phone"
        className={`flex border-t border-line px-1 transition-colors ${at('rail') ? LIT : 'bg-card'}`}
      >
        {tabs.map((t) => (
          <TabDot key={t} tool={t} active={t === choices.main_default} lit={spot?.tool === t} />
        ))}
        <span className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 text-ink-2">
          <Icon icon={Ellipsis} size={14} />
          <span className="text-[9px] leading-[10px]">More</span>
        </span>
      </div>
      <div className="flex justify-center bg-card pb-1.5 pt-0.5">
        <span className="h-1 w-12 rounded-full bg-ink-3/60" />
      </div>
    </div>
  );
}

function Caption({ children }: { children: string }) {
  return <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">{children}</p>;
}

export function LayoutPreview({ choices, spot }: PreviewProps) {
  const label = `Preview. Rail: ${choices.rail_items.map((t) => TOOL_META[t].label).join(', ')}. Opens on ${
    TOOL_META[choices.main_default].label
  }. Right column: ${choices.docked_panel === 'board' ? 'Board' : 'open item only'}.`;
  return (
    <div role="img" aria-label={label} data-testid="layout-preview" className="flex flex-col gap-4 sm:flex-row xl:flex-col">
      <div className="min-w-0 sm:flex-1 xl:flex-none">
        <Caption>Desktop</Caption>
        <DesktopSketch choices={choices} spot={spot} />
      </div>
      {/* On a phone, the phone sketch comes first. */}
      <div className="max-sm:order-first sm:w-60 xl:w-auto">
        <Caption>Phone</Caption>
        <PhoneSketch choices={choices} spot={spot} />
      </div>
    </div>
  );
}

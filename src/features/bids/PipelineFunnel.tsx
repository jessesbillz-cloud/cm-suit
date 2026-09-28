// The funnel across the top of the bids pipeline: Prospect > Bidding > Awarded / Lost, with how many jobs sit in each.
// Each stage is a toggle that shows or hides its jobs. Desktop: four tiles; phone: a row of chips that scrolls.
import { ChevronRight } from 'lucide-react';
import { PIPELINE_STAGES } from '../../lib/jobs';
import { Icon } from '../../ui/Icon';
import { stageChip, type PipelineStage } from './pipeline';

interface PipelineFunnelProps {
  counts: Record<PipelineStage, number>;
  shown: readonly PipelineStage[];
  onToggle: (stage: PipelineStage) => void;
  isPhone: boolean;
}

interface StageProps {
  stage: PipelineStage;
  count: number;
  on: boolean;
  onToggle: (stage: PipelineStage) => void;
}

function Dot({ stage }: { stage: PipelineStage }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--status-${stageChip(stage).status}-dot)` }} />;
}

function Tile({ stage, count, on, onToggle }: StageProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid={`pipeline-stage-${stage}`}
      className={`flex min-w-0 flex-1 flex-col gap-1 rounded-card px-4 py-3 text-left transition-[background-color,box-shadow] ${
        on ? 'bg-card shadow-card' : 'border border-dashed border-line-strong bg-transparent hover:bg-card/60'
      }`}
      onClick={() => {
        onToggle(stage);
      }}
    >
      <span className={`flex items-center gap-2 text-sm font-medium ${on ? 'text-ink' : 'text-ink-2'}`}>
        <Dot stage={stage} />
        {stageChip(stage).label}
      </span>
      <span className={`text-2xl font-semibold tabular-nums leading-8 ${on ? 'text-ink' : 'text-ink-3'}`}>{count}</span>
    </button>
  );
}

function Chip({ stage, count, on, onToggle }: StageProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid={`pipeline-stage-${stage}`}
      className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm ${
        on ? 'border-accent/40 bg-accent-soft font-medium text-ink' : 'border-line bg-card text-ink-2'
      }`}
      onClick={() => {
        onToggle(stage);
      }}
    >
      <Dot stage={stage} />
      {stageChip(stage).label}
      <span className={`tabular-nums ${on ? 'text-ink' : 'text-ink-3'}`}>{count}</span>
    </button>
  );
}

function Step() {
  return <Icon icon={ChevronRight} size={18} className="shrink-0 self-center text-ink-3" />;
}

export function PipelineFunnel({ counts, shown, onToggle, isPhone }: PipelineFunnelProps) {
  const props = (stage: PipelineStage): StageProps => ({ stage, count: counts[stage], on: shown.includes(stage), onToggle });
  if (isPhone) {
    return (
      <div role="group" aria-label="Stages" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
        {PIPELINE_STAGES.map((s) => (
          <Chip key={s} {...props(s)} />
        ))}
      </div>
    );
  }
  // Awarded and Lost are the two ways a bid ends, side by side after Bidding.
  return (
    <div role="group" aria-label="Stages" className="flex items-stretch gap-2">
      <Tile {...props('prospect')} />
      <Step />
      <Tile {...props('bidding')} />
      <Step />
      <Tile {...props('awarded')} />
      <Tile {...props('lost')} />
    </div>
  );
}

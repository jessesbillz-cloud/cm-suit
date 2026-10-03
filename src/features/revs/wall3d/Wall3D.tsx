// The 3-D wall (Jesse, Oct 3: "what are you looking at? Oh, a wall, there it is, it's pointing to it. Oh, first layer
// of drywall, there it is."): a rated stud wall assembly drawn as a clean technical drawing, each part tinted by its
// state (lib/status), the focused part in the accent color with a leader and its name, and a tap on a part picks it.
// Pure SVG and React; the geometry is assembly.ts, built once.
import { useId, type KeyboardEvent } from 'react';
import { PART_LABELS, type WallPart } from '../wallParts';
import { ASSEMBLY, type Layer } from './assembly';
import { CalloutLabel, Leader } from './Callout';
import { paintOf, type PartState } from './paint';
import { PartGhost, PartShape, type Textures } from './PartShape';
import { labelSize, placeLabel } from './placeLabel';
import { useWidth } from './useWidth';

interface Wall3DProps {
  states: Partial<Record<WallPart, PartState>>;
  focus?: WallPart | undefined;
  /** The callout's words (the item's name); the part's own name when not given. */
  focusLabel?: string | undefined;
  onPick?: ((part: WallPart) => void) | undefined;
  /** At most this tall (a CSS length): the drawing narrows to keep its shape and stays centered. */
  maxHeight?: string | undefined;
  testId?: string | undefined;
}

const CONTEXT = new Set<string>(['slab', 'deck', 'topping', 'beam']);

const isPart = (id: Layer['id']): id is Exclude<WallPart, 'whole_wall'> => !CONTEXT.has(id);

function Patterns({ textures }: { textures: Textures }) {
  return (
    <defs>
      <pattern id={textures.wool} width="5" height="4" patternUnits="userSpaceOnUse">
        <path d="M0 2 Q1.25 0.6 2.5 2 T5 2" fill="none" stroke="#8B95A5" strokeOpacity="0.45" strokeWidth="0.35" />
      </pattern>
      <pattern id={textures.concrete} width="4" height="4" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.3" fill="#8B95A5" fillOpacity="0.5" />
        <circle cx="3" cy="2.6" r="0.22" fill="#8B95A5" fillOpacity="0.4" />
      </pattern>
    </defs>
  );
}

interface LayerProps {
  layer: Layer;
  state: PartState | undefined;
  focused: boolean;
  textures: Textures;
  onPick: ((part: WallPart) => void) | undefined;
}

function WallLayer({ layer, state, focused, textures, onPick }: LayerProps) {
  const id = layer.id;
  const paint = paintOf(layer.material, state, !isPart(id));
  const shape = <PartShape layer={layer} paint={paint} focused={focused} textures={textures} />;
  if (!isPart(id) || !onPick) {
    return (
      <g data-part={id} data-state={state} opacity={paint.faint ? 0.55 : undefined}>
        {shape}
      </g>
    );
  }
  const pick = () => {
    onPick(id);
  };
  return (
    <g
      data-part={id}
      data-state={state}
      role="button"
      tabIndex={0}
      aria-label={PART_LABELS[id]}
      aria-pressed={focused}
      className="cursor-pointer outline-none"
      opacity={paint.faint && !focused ? 0.55 : undefined}
      onClick={pick}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      }}
    >
      {shape}
    </g>
  );
}

/** The focused part's label: its words, where it sits, and where its leader starts. */
function useCallout(focus: WallPart | undefined, text: string, widthPx: number) {
  if (!focus) return null;
  const { view, anchors, slots, edges } = ASSEMBLY;
  const unitsPerPx = (view.maxX - view.minX) / Math.max(widthPx, 1);
  const px = labelSize(text, Math.min(320, Math.max(150, widthPx * 0.46)));
  const slot = slots[focus];
  const placed = placeLabel({ anchor: anchors[focus], slot, size: { w: px.w * unitsPerPx, h: px.h * unitsPerPx }, view, edges });
  return { slot, placed, from: anchors[focus] };
}

export function Wall3D({ states, focus, focusLabel, onPick, maxHeight, testId }: Wall3DProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [frame, widthPx] = useWidth(360);
  const textures: Textures = { wool: `wool-${uid}`, concrete: `concrete-${uid}` };
  const { layers, view } = ASSEMBLY;
  const w = view.maxX - view.minX;
  const h = view.maxY - view.minY;
  const whole = focus === 'whole_wall';
  const focusedLayer = focus && !whole ? layers.find((l) => l.id === focus) : undefined;
  const text = focus ? (focusLabel ?? PART_LABELS[focus]) : '';
  const callout = useCallout(focus, text, widthPx);
  return (
    <div
      ref={frame}
      className="relative mx-auto w-full select-none"
      style={{ aspectRatio: `${String(w)} / ${String(h)}`, maxWidth: maxHeight ? `calc(${maxHeight} * ${String(w / h)})` : undefined }}
      data-testid={testId}
      data-focus={focus}
    >
      <svg
        viewBox={`${String(view.minX)} ${String(view.minY)} ${String(w)} ${String(h)}`}
        className="absolute inset-0 h-full w-full text-accent"
        role="group"
        aria-label="Wall"
      >
        <Patterns textures={textures} />
        {layers.map((layer) => (
          <WallLayer
            key={layer.id}
            layer={layer}
            state={isPart(layer.id) ? states[layer.id] : undefined}
            focused={isPart(layer.id) && (layer.id === focus || (whole && !layer.hidden))}
            textures={textures}
            onPick={onPick}
          />
        ))}
        {focusedLayer ? <PartGhost layer={focusedLayer} /> : null}
        {callout ? <Leader from={callout.from} placed={callout.placed} slot={callout.slot} /> : null}
      </svg>
      {callout ? <CalloutLabel text={text} placed={callout.placed} slot={callout.slot} view={view} /> : null}
    </div>
  );
}

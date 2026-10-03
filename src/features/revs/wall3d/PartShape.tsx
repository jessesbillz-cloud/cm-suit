// One layer of the 3-D wall (a part, or the slab, deck or beam around it): its faces filled and shaded, its lines thin
// at any size. A focused part is drawn in the accent color (currentColor) over white; a hidden part (behind the wall
// from this side) is a dashed line. Round pieces are shaded without facet lines and get one outline.
import type { ReactNode } from 'react';
import type { Layer, Piece } from './assembly';
import { pathOf, shadeOf, type Face } from './iso';
import { shade, type Paint } from './paint';

/** Textures for wool and concrete, by pattern id. */
export interface Textures {
  wool: string;
  concrete: string;
}

interface PartShapeProps {
  layer: Layer;
  paint: Paint;
  focused: boolean;
  textures: Textures;
}

const LINE = { vectorEffect: 'non-scaling-stroke' as const, strokeLinejoin: 'round' as const };

function textureOf(layer: Layer, textures: Textures): string | null {
  if (layer.material === 'wool') return textures.wool;
  if (layer.material === 'concrete') return textures.concrete;
  return null;
}

function FaceFill({ face, paint, focused, texture, outlined }: { face: Face; paint: Paint; focused: boolean; texture: string | null; outlined: boolean }) {
  const d = pathOf(face.pts);
  const k = shadeOf(face.normal);
  const stroke = outlined ? (focused ? 'currentColor' : paint.stroke) : 'none';
  if (focused) {
    return (
      <>
        <path d={d} fill="#FFFFFF" stroke="none" />
        <path d={d} fill="currentColor" fillOpacity={0.3 + k * 2.2} stroke={stroke} strokeWidth={1.25} {...LINE} />
      </>
    );
  }
  return (
    <>
      <path d={d} fill={shade(paint.fill, k)} stroke={stroke} strokeWidth={0.75} {...LINE} />
      {texture ? <path d={d} fill={`url(#${texture})`} stroke="none" /> : null}
    </>
  );
}

function PieceShape({ piece, paint, focused, texture }: { piece: Piece; paint: Paint; focused: boolean; texture: string | null }) {
  const round = piece.outline;
  const out: ReactNode[] = piece.faces.map((f, i) => (
    <FaceFill key={i} face={f} paint={paint} focused={focused} texture={texture} outlined={!round || f.kind === 'cap'} />
  ));
  if (!round) return <>{out}</>;
  const d = pathOf(round);
  return (
    <>
      {out}
      <path d={d} fill="none" stroke={focused ? 'currentColor' : paint.stroke} strokeWidth={focused ? 1.25 : 0.75} {...LINE} />
    </>
  );
}

/** A hidden part: its outline dashed, in its state's line color (or the accent when focused). */
function HiddenShape({ layer, paint, focused }: { layer: Layer; paint: Paint; focused: boolean }) {
  return (
    <>
      {layer.pieces.flatMap((p, i) =>
        p.faces.map((f, j) => (
          <path
            key={`${String(i)}-${String(j)}`}
            d={pathOf(f.pts)}
            fill={focused ? 'currentColor' : 'none'}
            fillOpacity={focused ? 0.35 : undefined}
            stroke={focused ? 'currentColor' : paint.stroke}
            strokeWidth={focused ? 1.25 : 0.75}
            strokeDasharray="3 2.5"
            {...LINE}
          />
        )),
      )}
    </>
  );
}

export function PartShape({ layer, paint, focused, textures }: PartShapeProps) {
  if (layer.hidden) return <HiddenShape layer={layer} paint={paint} focused={focused} />;
  const texture = focused ? null : textureOf(layer, textures);
  return (
    <>
      {layer.pieces.map((p, i) => (
        <PieceShape key={i} piece={p} paint={paint} focused={focused} texture={texture} />
      ))}
    </>
  );
}

/** The focused part again over everything: where it runs behind other parts, a dashed accent outline. */
export function PartGhost({ layer }: { layer: Layer }) {
  return (
    <g pointerEvents="none" data-testid="wall3d-ghost">
      {layer.pieces.flatMap((p, i) =>
        (p.outline ? [{ pts: p.outline }] : p.faces).map((f, j) => (
          <path
            key={`${String(i)}-${String(j)}`}
            d={pathOf(f.pts)}
            fill="currentColor"
            fillOpacity={0.08}
            stroke="currentColor"
            strokeOpacity={0.75}
            strokeWidth={1}
            strokeDasharray="3 2.5"
            {...LINE}
          />
        )),
      )}
    </g>
  );
}

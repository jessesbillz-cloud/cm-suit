// A room's cropped plan image in the one sheet viewer (map/SheetStage with a picture: pinch, wheel or + / - / Fit, drag
// to pan), each of its walls drawn over it as a thick line in its state's color with its callout (plan/PlanWalls); a
// tap on a line or a callout opens the wall. While a manager draws a wall's line, taps are its points. Full screen puts
// the same viewer over the window (map/SheetFrame), with Download (through Revs' gate, logged).
import { useCallback, useState, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import type { RevRoom } from '../../../data/revs.rooms';
import { useRevFile } from '../../../data/revs.history';
import type { Stroke } from '../../../lib/markup';
import { Icon } from '../../../ui/Icon';
import { ErrorState, LoadingState } from '../../../ui/States';
import { SheetFrame } from '../map/SheetFrame';
import { SheetStage } from '../map/SheetStage';
import { wallAt, type Box, type Pt } from '../plan/planGeom';
import { PlanWalls, type PlanWall } from '../plan/PlanWalls';
import { roomLabel } from '../rooms';
import { RevFileDownload } from './RevFileDownload';
import { useImageAspect } from './useImageAspect';

interface RoomImageProps {
  projectId: string;
  room: RevRoom;
  /** The walls drawn on it (those with a line). */
  walls: readonly PlanWall[];
  focusId: string | null;
  /** Opens a wall (off while drawing). */
  onOpen: ((areaId: string) => void) | null;
  /** The line being drawn, and where a tap lands while drawing. */
  draft?: readonly Pt[] | null | undefined;
  onPoint?: ((p: Pt, scale: number, aspect: number) => void) | undefined;
  /** Opens zoomed on this part of the image. */
  focus?: Box | null | undefined;
  full: boolean;
  onFull: (full: boolean) => void;
  /** Under the top bar in full screen (the drawing bar). */
  bar?: ReactNode;
  /** The frame in its place on the page. */
  className: string;
}

/** The room has no marks of its own: its walls are the overlay. */
const NO_STROKES: readonly Stroke[] = [];

/** A tap this close to a wall's line (screen pixels) opens it. */
const REACH_PX = 22;

type StageProps = Pick<RoomImageProps, 'walls' | 'focusId' | 'onOpen' | 'draft' | 'onPoint' | 'focus'> & { url: string };

function RoomStage({ url, walls, focusId, onOpen, draft, onPoint, focus }: StageProps) {
  const size = useImageAspect(url);
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => {
    setFailed(true);
  }, []);
  if (size.status === 'error' || failed) return <NoImage text="The image did not load." />;
  if (size.status === 'loading') return <LoadingState label="Opening the room" />;
  const { aspect } = size;
  const drawing = onPoint !== undefined;
  return (
    <SheetStage
      image={url}
      aspect={aspect}
      strokes={NO_STROKES}
      pen={null}
      onStroke={() => undefined}
      onError={onError}
      focus={focus}
      aiming={drawing}
      overlay={(place) => <PlanWalls walls={walls} place={place} aspect={aspect} focusId={focusId} draft={draft ?? null} onOpen={drawing ? null : onOpen} />}
      onTap={(p, at, place) => {
        if (onPoint) {
          onPoint(p, place.scale, aspect);
          return;
        }
        const hit = wallAt([at.x, at.y], walls.map((w) => ({ id: w.id, line: w.line.map((q) => place.toFrame(q)) })), REACH_PX);
        if (hit) onOpen?.(hit.id);
      }}
    />
  );
}

function NoImage({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-ink-2" data-testid="room-no-image">
      <Icon icon={ImageOff} size={22} />
      {text}
    </div>
  );
}

export function RoomImage({ projectId, room, full, onFull, bar, className, ...rest }: RoomImageProps) {
  const file = useRevFile(projectId, room.image_file_id);
  const fileId = room.image_file_id;
  return (
    <SheetFrame
      full={full}
      onFull={onFull}
      title={roomLabel(room)}
      bar={bar}
      actions={fileId !== null ? <RevFileDownload projectId={projectId} fileId={fileId} name={file.data?.filename ?? null} testId="room-download" /> : null}
      className={className}
      testId="room-image"
    >
      {fileId === null ? (
        <NoImage text="No image yet." />
      ) : file.isError ? (
        <ErrorState error={file.error} title="The image did not open." onRetry={() => void file.refetch()} />
      ) : file.isPending ? (
        <LoadingState label="Opening the room" />
      ) : (
        <RoomStage url={file.data.url} {...rest} />
      )}
    </SheetFrame>
  );
}

// The one look for anything you can click that isn't a Button (Jesse, Oct 12: "deep shadows and very distinct clickable
// boxes"; Oct 23: "deep shadow boxes, bold hard lines"): a white box with a crisp near-black edge and a deep drop, lifted
// on hover, pressed in on press, a strong focus ring. Text that does nothing stays flat. Rows inside a card stay rows:
// ROW_HOVER tints them and marks their left edge (the open row keeps the accent bar, ui/Table). The caller sets size,
// radius and layout. Motion is 150 ms (reduced motion: none, src/app/styles.css).

export const FOCUS_RING = 'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accent';

const MOTION = 'transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out';

/** A clickable box inside a card: a tile, a link that opens an item, a pick. White; the caller adds the radius. */
export const CLICK_BOX = `border-[1.5px] border-ink bg-card shadow-tile ${MOTION} hover:-translate-y-px hover:shadow-tile-hover active:translate-y-0 active:bg-card-head active:shadow-press disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-line-strong disabled:shadow-none ${FOCUS_RING}`;

/** The same box without its own background or edge color, for a caller that tints it (weekend, picked). */
export const CLICK_EDGE = `border-[1.5px] shadow-tile ${MOTION} hover:-translate-y-px hover:shadow-tile-hover active:translate-y-0 active:shadow-press ${FOCUS_RING}`;

/** A clickable row inside a card (lists, logs): a tint and an ink bar on its left edge under the pointer, darker on press. */
export const ROW_HOVER = 'hover:bg-page/60 hover:shadow-[inset_4px_0_0_theme(colors.ink.3)] active:bg-page';

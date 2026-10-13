// The one look for anything you can click that isn't a Button (Jesse, Oct 12: "deep shadows and very distinct clickable
// boxes"): a white box with an edge and a drop shadow, lifted on hover, pressed in on press, a focus ring. Text that does
// nothing stays flat. Rows inside a card stay rows: ROW_HOVER tints them and marks their left edge in gray (the open row
// keeps the accent bar, ui/Table). The caller sets size, radius and layout.

export const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** A clickable box inside a card: a tile, a link that opens an item, a pick. White; the caller adds the radius. */
export const CLICK_BOX = `border border-line-strong bg-card shadow-tile transition-[background-color,border-color,box-shadow] hover:border-ink-3/50 hover:shadow-tile-hover active:bg-card-head active:shadow-press disabled:cursor-not-allowed disabled:shadow-none ${FOCUS_RING}`;

/** The same box without its own background, for a caller that tints it (weekend, picked). */
export const CLICK_EDGE = `border shadow-tile transition-[background-color,border-color,box-shadow] hover:border-ink-3/50 hover:shadow-tile-hover active:shadow-press ${FOCUS_RING}`;

/** A clickable row inside a card (lists, logs): a tint and a gray bar on its left edge under the pointer, darker on press. */
export const ROW_HOVER = 'hover:bg-page/70 hover:shadow-[inset_3px_0_0_theme(colors.line.strong)] active:bg-page';

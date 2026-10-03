// The report editor's text boxes: the same edge and focus ring as ui/Fields, greyed when the report is locked.
/** The edge alone (a form table's smaller boxes set their own padding and size). */
export const INPUT_EDGE =
  'rounded-md border border-line-strong bg-card font-normal text-ink outline-none focus:border-accent disabled:border-line disabled:bg-page disabled:text-ink-2';

export const INPUT = `${INPUT_EDGE} px-2.5 text-sm`;

export const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';

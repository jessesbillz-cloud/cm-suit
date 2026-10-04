// The readiness checklist every OFS request opens with (migration 0061; the job's Procore "OSFM Inspection Request"):
// five items, each Yes or N/A, all answered before the request is made. ONE definition shared by the request forms
// (src/lib/readiness.ts re-exports it), the request link's contract (requestLink.ts) and the IR map PDF (pdf/irMap.ts),
// so the screen, the stored answers and the printed map never disagree. The database checks the same keys and answers
// (ir_readiness_ok). Pure, no imports.

/** The items in the template's order, in its words. */
export const READINESS_ITEMS = [
  { key: 'previous', label: 'Previous required inspections complete' },
  { key: 'trade', label: 'Trade contractor inspection complete' },
  { key: 'gc', label: 'GC inspection complete' },
  { key: 'ior', label: 'IOR inspection complete' },
  { key: 'special', label: 'Special inspection complete' },
] as const;

export type ReadinessKey = (typeof READINESS_ITEMS)[number]['key'];

export const READINESS_ANSWERS = [
  { value: 'yes', label: 'Yes' },
  { value: 'na', label: 'N/A' },
] as const;

export type ReadinessAnswer = (typeof READINESS_ANSWERS)[number]['value'];

/** All five answered. */
export type Readiness = Record<ReadinessKey, ReadinessAnswer>;

/** Exactly the five keys, each "yes" or "na" (ir_readiness_ok). */
export function isReadiness(v: unknown): v is Readiness {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const entries = Object.entries(v);
  return (
    entries.length === READINESS_ITEMS.length &&
    READINESS_ITEMS.every((it) => {
      const a: unknown = (v as Record<string, unknown>)[it.key];
      return a === 'yes' || a === 'na';
    })
  );
}

/** "Yes" / "N/A". */
export function answerLabel(a: ReadinessAnswer): string {
  return a === 'yes' ? 'Yes' : 'N/A';
}

/** Each item with its answer, in order, for a screen or the map: [{ label, answer: "Yes" | "N/A" }]. */
export function readinessLines(r: Readiness): { label: string; answer: string }[] {
  return READINESS_ITEMS.map((it) => ({ label: it.label, answer: answerLabel(r[it.key]) }));
}

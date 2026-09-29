// A section of the day under the calendar: "DONE · 3", a hairline to the edge (MDR's group headers).
export function SectionTitle({ label, count }: { label: string; count?: string | number | undefined }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h3 className="shrink-0 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
        {count !== undefined ? <span className="font-medium normal-case tracking-normal"> · {count}</span> : null}
      </h3>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

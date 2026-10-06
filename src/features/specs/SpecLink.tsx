// A spec section number that opens the spec book full screen at that section; SpecRefs makes every section number in
// a line of free text one of these.
import { useOpenSpec } from './useOpenSpec';
import { sectionRefs } from './sections';

const LINK = 'font-medium tabular-nums text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent';

export function SpecLink({ projectId, section, className = '' }: { projectId: string; section: string; className?: string }) {
  const open = useOpenSpec(projectId);
  return (
    <button
      type="button"
      data-testid="spec-link"
      className={`${LINK} ${className}`}
      onClick={() => {
        open({ section });
      }}
    >
      {section}
    </button>
  );
}

export function SpecRefs({ projectId, text }: { projectId: string; text: string }) {
  return (
    <>
      {sectionRefs(text).map((p, i) => ('section' in p ? <SpecLink key={i} projectId={projectId} section={p.section} /> : <span key={i}>{p.text}</span>))}
    </>
  );
}

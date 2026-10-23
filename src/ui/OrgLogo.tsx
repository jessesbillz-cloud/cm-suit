// The job's brand in the top bar (0110): the logo of the company the job shows (Settings > Job > Brand, else the company
// that runs it), at a fixed height, the company's name as its alt text. On a job the box is always there (empty while
// loading, without a logo, or when it could not load), so nothing moves when the logo arrives. The app's own name and
// mark stay where they are: this is the job's company, never the app.
import { useJobBrand } from '../data/brand';
import { messageOf } from '../data/errors';

export function OrgLogo({ projectId }: { projectId: string | null }) {
  const brand = useJobBrand(projectId);
  if (projectId === null) return null;
  const logo = brand.data?.logoUrl ?? null;
  const state = brand.isPending ? 'loading' : brand.isError ? 'error' : logo === null ? 'none' : 'shown';
  return (
    <div
      data-testid="org-logo"
      data-state={state}
      title={brand.isError ? messageOf(brand.error) : undefined}
      className="flex h-8 w-32 shrink-0 items-center"
    >
      {logo !== null ? (
        <img src={logo} alt={brand.data?.name ?? ''} data-testid="org-logo-image" className="max-h-full max-w-full object-contain" />
      ) : null}
    </div>
  );
}

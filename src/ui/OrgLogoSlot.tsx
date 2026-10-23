// The job's brand in the top bar, desktop and phone (0110): the logo of the company the job shows (Settings > Job >
// Brand, else the company that runs it), uploaded in Settings > Company. No customer's logo or name is ever in the code
// (CLAUDE.md rule 8). The bar is black, so the logo sits on its own white plate at a fixed size, with the company's name
// as its alt text. On a job the box is always there (empty while loading, without a logo, or when it could not load), so
// nothing moves when the logo arrives. Off a job (All my jobs) there is nothing. The app's own name and mark stay where
// they are: this is the job's company, never the app.
import { useParams } from '@tanstack/react-router';
import { useJobBrand } from '../data/brand';
import { messageOf } from '../data/errors';

export function OrgLogoSlot() {
  const { projectId } = useParams({ strict: false });
  const brand = useJobBrand(projectId ?? null);
  if (projectId === undefined) return null;
  const logo = brand.data?.logoUrl ?? null;
  const state = brand.isPending ? 'loading' : brand.isError ? 'error' : logo === null ? 'none' : 'shown';
  return (
    <div
      data-testid="org-logo"
      data-state={state}
      title={brand.isError ? messageOf(brand.error) : undefined}
      className={`flex h-9 w-28 shrink-0 items-center justify-center rounded-md px-1.5 py-1 sm:w-32 ${logo !== null ? 'bg-white' : ''}`}
    >
      {logo !== null ? (
        <img src={logo} alt={brand.data?.name ?? ''} data-testid="org-logo-image" className="max-h-full max-w-full object-contain" />
      ) : null}
    </div>
  );
}

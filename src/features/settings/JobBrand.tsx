// Settings > Job, Brand (0110): which of the job's companies the job shows: its logo in the top bar and its logo and
// letterhead on the job's PDFs. The job's own company unless picked. Only when there is a choice. The job's managers only
// (the Job card around it already is).
import { useJobBrand, useJobBrandChoices, useSetJobBrand } from '../../data/brand';
import { messageOf } from '../../data/errors';
import { SelectField } from '../../ui/Fields';
import { ErrorState } from '../../ui/States';
import { FIELD_ROW } from './SettingRow';

export function JobBrand({ projectId }: { projectId: string }) {
  const choices = useJobBrandChoices(projectId);
  const brand = useJobBrand(projectId);
  const set = useSetJobBrand(projectId);
  if (choices.isError) return <ErrorState error={choices.error} onRetry={() => void choices.refetch()} />;
  if (brand.isError) return <ErrorState error={brand.error} onRetry={() => void brand.refetch()} />;
  // Loading, or one company only: nothing to pick.
  if (!choices.data || !brand.data || choices.data.length < 2) return null;
  return (
    <>
      <SelectField
        label="Brand"
        value={(set.isPending ? set.variables : undefined) ?? brand.data.orgId}
        options={choices.data.map((c) => ({ value: c.org_id, label: c.name }))}
        className={FIELD_ROW}
        testId="job-brand"
        onChange={(orgId) => {
          set.mutate(orgId);
        }}
      />
      {set.isError ? (
        <p role="alert" className="py-1.5 text-sm text-danger">
          {messageOf(set.error)}
        </p>
      ) : null}
    </>
  );
}

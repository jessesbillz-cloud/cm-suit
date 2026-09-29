// Settings > Company: my company's name and type, saved as I go, and its logo. Shown only for companies I run
// (is_org_admin).
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { useSaveOrg } from '../../data/jobs.mutations';
import { useMyOrgs, useOrgAdmin } from '../../data/queries';
import type { MyOrg, OrgPatch } from '../../data/types';
import { ORG_KINDS } from '../../lib/jobs';
import { Card } from '../../ui/Card';
import { SelectField, TextField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { ErrorState } from '../../ui/States';
import { CompanyLogo } from './CompanyLogo';
import { FIELD_ROW } from './SettingRow';

function CompanyFields({ org, commit }: { org: MyOrg; commit: (patch: OrgPatch) => void }) {
  const [name, setName] = useState(org.name);
  return (
    <>
      <TextField
        label="Company name"
        value={name}
        className={FIELD_ROW}
        onChange={setName}
        onBlur={() => {
          if (name.trim() !== org.name) commit({ name: name.trim() });
        }}
      />
      <SelectField
        label="Type"
        value={org.kind}
        options={ORG_KINDS}
        className={FIELD_ROW}
        onChange={(kind) => {
          commit({ kind });
        }}
      />
    </>
  );
}

function CompanyCard({ org, titled }: { org: MyOrg; titled: boolean }) {
  const admin = useOrgAdmin(org.org_id);
  const save = useSaveOrg(org.org_id);
  const [problem, setProblem] = useState<string | null>(null);

  function commit(patch: OrgPatch) {
    if (patch.name !== undefined && patch.name === '') {
      setProblem('Name is empty.');
      return;
    }
    setProblem(null);
    save.mutate(patch, {
      onError: (e) => {
        setProblem(messageOf(e));
      },
    });
  }

  if (admin.isError) return <ErrorState error={admin.error} onRetry={() => void admin.refetch()} />;
  if (admin.data !== true) return null;
  return (
    <Card title={titled ? org.name : 'Company'} actions={<SaveState pending={save.isPending} saved={save.isSuccess} problem={problem} />}>
      <div className="flex flex-col">
        <CompanyFields key={org.org_id} org={org} commit={commit} />
        <CompanyLogo orgId={org.org_id} />
      </div>
    </Card>
  );
}

export function CompanySettings() {
  const orgs = useMyOrgs();
  if (orgs.isPending) return null;
  if (orgs.isError) return <ErrorState error={orgs.error} onRetry={() => void orgs.refetch()} />;
  // One company (the usual case) is just "Company"; with several, each card carries its name.
  return (
    <>
      {orgs.data.map((o) => (
        <CompanyCard key={o.org_id} org={o} titled={orgs.data.length > 1} />
      ))}
    </>
  );
}

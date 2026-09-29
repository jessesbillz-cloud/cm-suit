// The request link from the inside (0046): the job's link state (members.manage) and my hub (people who decide
// inspections). Tokens are never readable: the server keeps only their hashes.
import { useQuery } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/requestLink';
import type { HubState, RequestLinkState } from './requestLink.types';

/** Is the job's request link on, and since when. */
export function useRequestLinkState(projectId: string) {
  return useQuery({
    queryKey: qk.requestLink(projectId),
    queryFn: async (): Promise<RequestLinkState> => {
      if (isMock()) return mock.linkState(projectId);
      const row = throwIfError(await supabase.rpc('request_link_state', { p_project_id: projectId }))[0];
      return { active: row?.active ?? false, since: row?.since ?? null };
    },
  });
}

/** My hub: whether I decide inspections anywhere, the hub if made, and how many jobs it lists now. */
export function useRequestHubState() {
  return useQuery({
    queryKey: qk.requestHub,
    queryFn: async (): Promise<HubState> => {
      if (isMock()) return mock.hubState();
      const row = throwIfError(await supabase.rpc('request_hub_state'))[0];
      return { decides: row?.decides ?? false, hub_id: row?.hub_id ?? null, made_at: row?.made_at ?? null, jobs: row?.jobs ?? 0 };
    },
  });
}

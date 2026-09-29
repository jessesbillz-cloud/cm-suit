// The public request page and hub (SPEC §6.4 #4): everything goes through the request-link edge function, which
// answers the job name (plus whether this device's own session is on the job) and the hub's job names. Joining runs
// after the email code: the function records a sub invite for the signed-in address, accept_invites binds it here.
import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptInvites } from './auth';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/requestLink';
import {
  hubAnswerSchema,
  joinAnswerSchema,
  openAnswerSchema,
  type HubAnswer,
  type JoinAnswer,
  type LinkKey,
  type OpenAnswer,
} from './requestLink.types';

function linkBody(key: LinkKey) {
  return { project_id: key.projectId, token: key.token, ...(key.hubId === null ? {} : { hub_id: key.hubId }) };
}

/**
 * The job behind a request link, and whether `userId`'s session (null = signed out) is already on it. Pass null
 * while the session is still loading. A dead link rejects with FunctionError 404.
 */
export function useOpenRequestLink(key: LinkKey | null, userId: string | null) {
  return useQuery({
    queryKey: qk.requestLinkOpen(key?.projectId ?? '', `${key?.hubId ?? 'job'}:${userId ?? 'signed-out'}`),
    queryFn: key
      ? (): Promise<OpenAnswer> =>
          isMock() ? mock.open(key) : callFunction('request-link', { action: 'open', ...linkBody(key) }, openAnswerSchema)
      : skipToken,
    retry: false,
    // Signing in with the code changes the key; the page keeps showing the job meanwhile.
    placeholderData: keepPreviousData,
  });
}

/** After the email code: records the invite for the signed-in address, binds it, and asks the link again. */
export function useJoinRequestLink(key: LinkKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { name: string; company: string }): Promise<JoinAnswer> => {
      const answer = isMock()
        ? await mock.join(key)
        : await callFunction('request-link', { action: 'join', ...linkBody(key), name: v.name, company: v.company }, joinAnswerSchema);
      await acceptInvites();
      return answer;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.myProjects });
      await qc.invalidateQueries({ queryKey: qk.requestLinkPublic(key.projectId) });
    },
  });
}

/** The hub's jobs. A dead hub link rejects with FunctionError 404. */
export function useRequestHub(hubId: string, token: string | null) {
  return useQuery({
    queryKey: qk.requestHubPublic(hubId),
    queryFn: token
      ? (): Promise<HubAnswer> =>
          isMock() ? mock.hub(hubId, token) : callFunction('request-link', { action: 'hub', hub_id: hubId, token }, hubAnswerSchema)
      : skipToken,
    retry: false,
  });
}

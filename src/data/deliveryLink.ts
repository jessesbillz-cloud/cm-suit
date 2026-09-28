// The public delivery link (SPEC §6.4 #3): no session, the token from the poster opens one job's board. Everything
// goes through the delivery-board edge function, which answers board fields only.
import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/deliveries';
import { linkBoardSchema, linkReceiptSchema, type DeliveryInput, type LinkBoard, type LinkReceipt } from './deliveries.types';

/** The board between two days (inclusive). `refreshMs` for the TV. A dead link rejects with FunctionError 404. */
export function useLinkBoard(projectId: string, token: string | null, from: string, to: string, refreshMs?: number) {
  return useQuery({
    queryKey: qk.deliveryLinkPart(projectId, 'board', `${from}:${to}`),
    queryFn: token
      ? (): Promise<LinkBoard> =>
          isMock()
            ? mock.linkBoard(projectId, token, from, to)
            : callFunction('delivery-board', { action: 'board', project_id: projectId, token, from, to }, linkBoardSchema)
      : skipToken,
    retry: false,
    refetchInterval: refreshMs ?? false,
    // Moving the three weeks keeps the old counts on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  });
}

/** Posts with the typed name; answers the receipt. */
export function useLinkPost(projectId: string, token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; input: DeliveryInput }): Promise<LinkReceipt> =>
      isMock()
        ? mock.linkPost(projectId, token, v.name, v.input)
        : callFunction(
            'delivery-board',
            {
              action: 'post',
              project_id: projectId,
              token,
              name: v.name,
              company: v.input.company,
              date: v.input.date,
              time: v.input.time,
              duration_min: v.input.duration_min,
              description: v.input.description,
            },
            linkReceiptSchema,
          ),
    onSuccess: (receipt) => {
      qc.setQueryData(qk.deliveryLinkPart(projectId, 'receipt', receipt.id), receipt);
      return qc.invalidateQueries({ queryKey: qk.deliveryLink(projectId) });
    },
  });
}

/** A receipt posted through the link, again (e.g. after a reload). */
export function useLinkReceipt(projectId: string, token: string | null, id: string | null) {
  return useQuery({
    queryKey: qk.deliveryLinkPart(projectId, 'receipt', id ?? ''),
    queryFn:
      token && id
        ? (): Promise<LinkReceipt> =>
            isMock()
              ? mock.linkReceipt(token, id)
              : callFunction('delivery-board', { action: 'receipt', project_id: projectId, token, delivery_id: id }, linkReceiptSchema)
        : skipToken,
    retry: false,
    staleTime: Infinity,
  });
}

// The meeting sign-in page (SPEC §6.4 #8, migration 0060). No session: everything goes through the public
// meeting-signin function, which answers the meeting as the page shows it (job, number, kind, title, day, whether it
// still takes signatures) and takes one person's name, company, trade and signature. A dead link (wrong token, a new QR
// since, closed) rejects with FunctionError 404.
import { skipToken, useMutation, useQuery } from '@tanstack/react-query';
import { callFunction } from './functions';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/safety';
import { publicMeetingSchema, signedSchema, type MeetingKey, type PublicMeeting, type SignInput } from './safety.types';

function body(key: MeetingKey) {
  return { meeting_id: key.meetingId, token: key.token };
}

/** The meeting behind a sign-in link. `key` null: the link is incomplete. */
export function useOpenMeeting(key: MeetingKey | null) {
  return useQuery({
    queryKey: qk.meetingPublic(key?.meetingId ?? ''),
    queryFn: key
      ? (): Promise<PublicMeeting> =>
          isMock() ? mock.publicOpen(key) : callFunction('meeting-signin', { action: 'open', ...body(key) }, publicMeetingSchema)
      : skipToken,
    retry: false,
  });
}

/** One person signs. A repeat (the same name) answers the same. */
export function useSignMeeting(key: MeetingKey) {
  return useMutation({
    mutationFn: async (v: SignInput): Promise<void> => {
      if (isMock()) return mock.publicSign(key, v);
      await callFunction(
        'meeting-signin',
        { action: 'sign', ...body(key), name: v.name, company: v.company, trade: v.trade, signature: v.signature },
        signedSchema,
      );
    },
  });
}

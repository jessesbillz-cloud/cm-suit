// Testing only (0039, docs/decisions.md): "View as" in the top bar. A tester takes any role on every job they're on;
// "Me" puts the real roles back. Everything RLS answers is refetched after a switch. Hidden unless the database says
// this person may use it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import { isMock } from './mock';

const stateSchema = z
  .object({
    viewing: z.string().nullable(),
    roles: z.array(z.object({ name: z.string(), label: z.string() })),
  })
  .nullable();
type ViewAsState = z.infer<typeof stateSchema>;

async function fetchState(): Promise<ViewAsState> {
  if (isMock()) return null;
  return stateSchema.parse(throwIfErrorMaybe(await supabase.rpc('testing_view_as_state')));
}

export function useViewAs() {
  return useQuery({ queryKey: qk.viewAs, queryFn: fetchState, staleTime: 60_000 });
}

export function useSetViewAs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (role: string | null): Promise<ViewAsState> =>
      stateSchema.parse(throwIfErrorMaybe(await supabase.rpc('testing_view_as', { p_role: role as string }))),
    onSuccess: async (state) => {
      qc.setQueryData(qk.viewAs, state);
      // Every answer RLS gives depends on the role: refetch all of it.
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== qk.viewAs[0] });
    },
  });
}

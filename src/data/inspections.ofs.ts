// The OFS request flow (0091): the sub's attestation wording, the checks in order (GC Ready, inspector Ready, Special
// inspection report), the OFS number a sender types, the chain everyone reads (the fire marshal included), and the
// job's duties (who sends OFS requests). Every write is an RPC that runs as me with the version check.
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { irRpc, useIrMutation, type IrRef } from './inspections.mutations';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockDuties from './mock/duties';
import * as mock from './mock/ofsFlow';

const stepSchema = z.object({ name: z.string().nullable(), at: z.string() });

const ofsChainSchema = z
  .object({
    attest: stepSchema.extend({ text: z.string() }).nullable(),
    gc: stepSchema.nullable(),
    ready: stepSchema.nullable(),
    si: stepSchema.extend({ file_id: z.string().nullable(), file_name: z.string().nullable() }).nullable(),
    sent: stepSchema.nullable(),
    special_required: z.boolean().nullable(),
    /** One after the job's highest OFS number. */
    next_number: z.number(),
  })
  .nullable();
export type OfsChain = NonNullable<z.infer<typeof ofsChainSchema>>;
export type OfsStep = z.infer<typeof stepSchema>;

const dutySchema = z.object({
  duty: z.string(),
  company: z.string().nullable(),
  person_id: z.string().nullable(),
  person_name: z.string().nullable(),
  version: z.number().nullable(),
  can_assign: z.boolean(),
  can_pick: z.boolean(),
  companies: z.array(z.string()),
  people: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type Duty = z.infer<typeof dutySchema>;
const dutiesSchema = z.array(dutySchema);

export type OfsCheck = 'gc' | 'ready' | 'si';

async function fetchAttestText(projectId: string): Promise<string> {
  if (isMock()) return mock.attestText(projectId);
  return throwIfError(await supabase.rpc('ir_ofs_attest_text', { p_project_id: projectId }));
}

/** The words a sub confirms before an OFS request goes to the GC: the job's own, or the standard wording. */
export function useOfsAttestText(projectId: string, enabled = true) {
  return useQuery({
    queryKey: qk.inspectionsPart(projectId, 'ofs-attest'),
    queryFn: enabled ? () => fetchAttestText(projectId) : skipToken,
  });
}

async function fetchChain(requestId: string): Promise<OfsChain | null> {
  if (isMock()) return mock.chain(requestId);
  return ofsChainSchema.parse(throwIfError(await supabase.rpc('ir_ofs_chain', { p_request_id: requestId })));
}

/** Who did each step of an OFS request, and when. */
export function useOfsChain(projectId: string, requestId: string | null) {
  return useQuery({
    queryKey: qk.inspectionsPart(projectId, 'ofs-chain', requestId ?? ''),
    queryFn: requestId ? () => fetchChain(requestId) : skipToken,
  });
}

/** One tap: a check on, or (on: false) its Undo. The SI report may carry its file. */
export function useOfsCheck() {
  return useIrMutation((v: { row: IrRef; check: OfsCheck; on: boolean; fileId?: string | null | undefined }) =>
    irRpc('ir_ofs_check', {
      p_request_id: v.row.id,
      p_version: v.row.version,
      p_check: v.check,
      p_on: v.on,
      ...(v.fileId ? { p_file_id: v.fileId } : {}),
    }),
  );
}

/** The OFS number, typed by whoever sends requests to OFS. */
export function useOfsNumber() {
  return useIrMutation((v: { row: IrRef; number: number }) =>
    irRpc('ir_ofs_number_set', { p_request_id: v.row.id, p_version: v.row.version, p_number: v.number }),
  );
}

async function fetchDuties(projectId: string): Promise<Duty[]> {
  if (isMock()) return mockDuties.duties(projectId);
  return dutiesSchema.parse(throwIfError(await supabase.rpc('project_duties_view', { p_project_id: projectId })));
}

/** The job's duties: who sends OFS requests, and what I may change about it. */
export function useDuties(projectId: string, enabled = true) {
  return useQuery({
    queryKey: qk.inspectionsPart(projectId, 'duties'),
    queryFn: enabled ? () => fetchDuties(projectId) : skipToken,
  });
}

export type DutyChange = { projectId: string; duty: Duty } & ({ company: string } | { personId: string | null });

async function setDuty(v: DutyChange): Promise<Duty[]> {
  if (isMock()) return mockDuties.setDuty(v);
  const base = { p_project_id: v.projectId, p_duty: v.duty.duty, ...(v.duty.version === null ? {} : { p_version: v.duty.version }) };
  const raw =
    'company' in v
      ? throwIfError(await supabase.rpc('duty_set_company', { ...base, p_company: v.company }))
      : throwIfError(await supabase.rpc('duty_set_person', { ...base, ...(v.personId === null ? {} : { p_person_id: v.personId }) }));
  return dutiesSchema.parse(raw);
}

export function useSetDuty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setDuty,
    onSuccess: (rows, v) => {
      qc.setQueryData(qk.inspectionsPart(v.projectId, 'duties'), rows);
    },
  });
}

// Write hooks. Saves carry a version check (CLAUDE.md rule 7): `.eq('version', v)` and 0 rows = conflict.
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { LayoutChoices } from '../lib/layout';
import { useUser } from './auth';
import { supabase } from './client';
import { conflictError, throwIfError } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import * as mock from './mock/api';
import { isMock } from './mock';
import type { LayoutState } from './queries';
import type { InviteInput, InviteResult, ProfilePatch, ProfileRow, TaskRow } from './types';

async function setTaskDone(task: { id: string; version: number }, userId: string, done: boolean): Promise<number> {
  if (isMock()) return mock.setTaskDone(task.id, task.version, done);
  const patch = done ? { done_at: new Date().toISOString(), done_by: userId } : { done_at: null, done_by: null };
  const rows = throwIfError(
    await supabase.from('tasks').update(patch).eq('id', task.id).eq('version', task.version).select('version'),
  );
  const row = rows[0];
  if (!row) throw conflictError();
  return row.version;
}

type TaskSnapshot = [readonly unknown[], TaskRow[] | undefined][];

function removeTaskEverywhere(qc: QueryClient, taskId: string): TaskSnapshot {
  const snapshot = qc.getQueriesData<TaskRow[]>({ queryKey: qk.tasksAll });
  for (const [key, rows] of snapshot) {
    if (rows) qc.setQueryData<TaskRow[]>(key, rows.filter((t) => t.id !== taskId));
  }
  return snapshot;
}

/** "Done" in the Needs-you strip. Optimistic; returns the new version so Undo can check it. */
export function useCompleteTask() {
  const qc = useQueryClient();
  const user = useUser();
  return useMutation({
    mutationFn: (task: TaskRow) => setTaskDone(task, user.id, true),
    onMutate: async (task) => {
      await qc.cancelQueries({ queryKey: qk.tasksAll });
      return { snapshot: removeTaskEverywhere(qc, task.id) };
    },
    onError: (_e, _task, ctx) => {
      for (const [key, rows] of ctx?.snapshot ?? []) qc.setQueryData(key, rows);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tasksAll }),
  });
}

export function useUndoTask() {
  const qc = useQueryClient();
  const user = useUser();
  return useMutation({
    mutationFn: (task: { id: string; version: number }) => setTaskDone(task, user.id, false),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tasksAll }),
  });
}

/** Marks boards read up to the newest line seen, per job. Uses the line's server time, not the device clock. */
export function useMarkRead() {
  const qc = useQueryClient();
  const user = useUser();
  return useMutation({
    mutationFn: async (marks: { projectId: string; seenAt: string }[]) => {
      if (marks.length === 0) return;
      if (isMock()) {
        for (const m of marks) await mock.markRead([m.projectId], m.seenAt);
        return;
      }
      const rows = marks.map((m) => ({ user_id: user.id, project_id: m.projectId, last_seen_at: m.seenAt }));
      throwIfError(await supabase.from('read_marks').upsert(rows, { onConflict: 'user_id,project_id' }).select('project_id'));
    },
    onSuccess: (_d, marks) => Promise.all(marks.map((m) => qc.invalidateQueries({ queryKey: qk.readMark(m.projectId) }))),
  });
}

async function writeLayout(userId: string, choices: LayoutChoices, version: number | null): Promise<number> {
  if (isMock()) return mock.saveLayout(choices, version);
  if (version === null) {
    const row: unknown = throwIfError(
      await supabase.from('user_layout').insert({ user_id: userId, ...choices }).select('version').single(),
    );
    return z.object({ version: z.number() }).parse(row).version;
  }
  const rows = throwIfError(
    await supabase.from('user_layout').update(choices).eq('user_id', userId).eq('version', version).select('version'),
  );
  const row = rows[0];
  if (!row) throw conflictError();
  return row.version;
}

/** Saves one or more layout choices. Serialized so quick toggles never race each other's version. */
export function useSaveLayout() {
  const qc = useQueryClient();
  const user = useUser();
  return useMutation<number, Error, Partial<LayoutChoices>, { before: LayoutState | undefined }>({
    scope: { id: 'user_layout' },
    // The patch is already merged into the cache by onMutate; the save writes the whole, current set.
    mutationFn: async () => {
      const current = qc.getQueryData<LayoutState>(qk.layout);
      if (!current) throw new Error('Layout not loaded yet.');
      return writeLayout(user.id, current.choices, current.version);
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.layout });
      const before = qc.getQueryData<LayoutState>(qk.layout);
      if (before) qc.setQueryData<LayoutState>(qk.layout, { ...before, choices: { ...before.choices, ...patch } });
      return { before };
    },
    onSuccess: (version) => {
      qc.setQueryData<LayoutState>(qk.layout, (s) => (s ? { ...s, version } : s));
    },
    onError: async (_e, _patch, ctx) => {
      if (ctx?.before) qc.setQueryData(qk.layout, ctx.before);
      await qc.invalidateQueries({ queryKey: qk.layout });
    },
  });
}

const inviteResultSchema = z.object({
  member_id: z.string(),
  status: z.string(),
  link_url: z.string(),
  email_status: z.string(),
  email_error: z.string().nullable(),
});

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteInput): Promise<InviteResult> =>
      isMock() ? mock.invite(input) : callFunction('invite-member', input, inviteResultSchema),
    onSuccess: (_r, input) => qc.invalidateQueries({ queryKey: qk.people(input.project_id) }),
  });
}

export function useRevokeMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { projectId: string; memberId: string }) => {
      if (isMock()) return mock.revoke(v.memberId);
      // 204 No Content: nothing to validate.
      await callFunction('revoke-member', { member_id: v.memberId }, z.unknown());
    },
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: qk.people(v.projectId) }),
  });
}

async function updateProfile(userId: string, patch: ProfilePatch, version: number): Promise<ProfileRow> {
  if (isMock()) return mock.saveProfile(patch, version);
  const rows = throwIfError(
    await supabase
      .from('profiles')
      .update(patch)
      .eq('user_id', userId)
      .eq('version', version)
      .select('user_id, email, full_name, phone, title, company, timezone, timezone_set_by_user, version'),
  );
  const row = rows[0];
  if (!row) throw conflictError();
  return row;
}

/** Saves as I go (Settings > Profile): one at a time, each with the version the last save left in the cache. */
export function useSaveProfile() {
  const qc = useQueryClient();
  const user = useUser();
  return useMutation({
    scope: { id: 'profile' },
    mutationFn: async (patch: ProfilePatch) => {
      const current = qc.getQueryData<ProfileRow>(qk.profile);
      if (!current) throw new Error('Your profile has not loaded yet.');
      return updateProfile(user.id, patch, current.version);
    },
    onSuccess: (row) => {
      qc.setQueryData(qk.profile, row);
    },
  });
}

// My quick phrases (migration 0117; Jesse, Oct 23: "save whatever they want as their own quick button ... tap it and it
// says the same thing every time"). Read through RLS (owner only), written only through the quick_phrase_* RPCs, each
// safe to repeat: an add carries its own key, an edit or a remove the version I saw. A remove keeps the row and its
// Undo is quick_phrase_restore. Every answer is parsed with zod.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/phrases';
import { PHRASE_PLACES, type PhraseInput, type QuickPhrase } from './phrases.types';

const COLS = 'id, version, context, label, body, sort, deleted_at';

const phraseSchema: z.ZodType<QuickPhrase> = z.object({
  id: z.string(),
  version: z.number().int(),
  context: z.enum(PHRASE_PLACES),
  label: z.string(),
  body: z.string(),
  sort: z.number().int(),
  deleted_at: z.string().nullable(),
});

async function fetchPhrases(): Promise<QuickPhrase[]> {
  if (isMock()) return mock.list();
  const rows = throwIfError(
    await supabase.from('quick_phrases').select(COLS).is('deleted_at', null).order('sort').order('created_at'),
  );
  return z.array(phraseSchema).parse(rows);
}

/** All my live phrases, in my order (each note box shows the ones for its place). */
export function useQuickPhrases() {
  return useQuery({ queryKey: qk.phrases, queryFn: fetchPhrases, staleTime: 60_000 });
}

function usePhraseMutation<V>(run: (v: V) => Promise<QuickPhrase>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: run, onSettled: () => qc.invalidateQueries({ queryKey: qk.phrases }) });
}

export function useAddPhrase() {
  return usePhraseMutation(async (v: PhraseInput & { key: string }): Promise<QuickPhrase> => {
    if (isMock()) return mock.add(v);
    const row = throwIfError(
      await supabase.rpc('quick_phrase_add', { p_key: v.key, p_label: v.label, p_body: v.body, p_context: v.context }),
    );
    return phraseSchema.parse(row);
  });
}

export function useEditPhrase() {
  return usePhraseMutation(async (v: PhraseInput & { phrase: QuickPhrase }): Promise<QuickPhrase> => {
    if (isMock()) return mock.edit(v.phrase, v);
    const row = throwIfError(
      await supabase.rpc('quick_phrase_edit', {
        p_id: v.phrase.id, p_version: v.phrase.version, p_label: v.label, p_body: v.body, p_context: v.context,
      }),
    );
    return phraseSchema.parse(row);
  });
}

export function useRemovePhrase() {
  return usePhraseMutation(async (phrase: QuickPhrase): Promise<QuickPhrase> => {
    if (isMock()) return mock.remove(phrase);
    return phraseSchema.parse(throwIfError(await supabase.rpc('quick_phrase_remove', { p_id: phrase.id, p_version: phrase.version })));
  });
}

/** The Undo of a remove. */
export function useRestorePhrase() {
  return usePhraseMutation(async (id: string): Promise<QuickPhrase> => {
    if (isMock()) return mock.restore(id);
    return phraseSchema.parse(throwIfError(await supabase.rpc('quick_phrase_restore', { p_id: id })));
  });
}

/** My phrases in this order (the database answers them all). */
export function useOrderPhrases() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<QuickPhrase[]> => {
      if (isMock()) return mock.order(ids);
      return z.array(phraseSchema).parse(throwIfError(await supabase.rpc('quick_phrase_order', { p_ids: ids })));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.phrases }),
  });
}

// "To" (0098): the job's companies for the picker, and a company's name wherever an item shows who it goes to. One
// query (correction_companies) behind both.
import { useCallback } from 'react';
import { useCorrectionCompanies } from '../../data/corrections.queries';
import { companyName, pickable, savedTo, type ToName } from './model';

/** The picker: what it offers, its load error, and what Save sends (if the list did not load, the item keeps its own). */
export function useToPicker(projectId: string, keep: string | null) {
  const companies = useCorrectionCompanies(projectId);
  const list = companies.data ?? [];
  const loaded = companies.isSuccess;
  return {
    options: pickable(list, keep),
    error: companies.isError ? companies.error : null,
    saved: (picked: string) => (loaded ? savedTo(picked, list, keep) : keep),
  };
}

/** The company's name for an item ('' for nobody, or while the names load). */
export function useToName(projectId: string): ToName {
  const companies = useCorrectionCompanies(projectId);
  const list = companies.data;
  return useCallback((orgId: string | null) => companyName(list ?? [], orgId), [list]);
}

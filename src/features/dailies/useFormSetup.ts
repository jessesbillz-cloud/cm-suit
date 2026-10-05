// A company's setup of one daily form while its admin changes it (SPEC §18.1 principle 10). Every change is saved at
// once, version-checked against the company row: one save at a time, always the latest setup. A field of the company's
// own is added by the database, which gives its key. A change that breaks the form's rules (nothing left on, a name
// too long) is refused and said. A conflict stops saving and says so: nothing is overwritten. When the company row moved
// on without this form changing (the company's name, its logo, another form), saves simply carry its new version.
import { useEffect, useRef, useState } from 'react';
import { useAddCompanyFormField, useSaveCompanyForm } from '../../data/dailies.mutations';
import type { CompanyFormSaved, CompanyForms } from '../../data/dailies.types';
import { DataError, messageOf } from '../../data/errors';
import { formSetupSchema, fullSetup, type FormSetup, type ReportForm } from '../../lib/dailies';
import { withAdded } from './formSetup';

interface FormSetupInput {
  orgId: string;
  formId: string;
  form: ReportForm;
  /** The company's forms as read (with the row version the first save carries). */
  loaded: CompanyForms;
}

export function useFormSetup({ orgId, formId, form, loaded }: FormSetupInput) {
  const save = useSaveCompanyForm(orgId);
  const add = useAddCompanyFormField(orgId);
  const [setup, setSetup] = useState<FormSetup>(() => fullSetup(form, loaded.forms[formId] ?? null));
  const [problem, setProblem] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const version = useRef(loaded.version);
  // This form as the database has it, as far as this screen knows.
  const known = useRef(JSON.stringify(loaded.forms[formId] ?? null));
  const latest = useRef(setup);
  const stopped = useRef(false);
  const busy = useRef(false);
  const again = useRef(false);
  // An add asked for while a save was on its way: it runs when that save is done.
  const waiting = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (busy.current || stopped.current || loaded.version <= version.current) return;
    if (JSON.stringify(loaded.forms[formId] ?? null) === known.current) version.current = loaded.version;
  }, [loaded, formId]);

  /** What a save or an add answered: the version the next save carries, and the form as stored. */
  function stored(saved: CompanyFormSaved) {
    version.current = saved.version;
    known.current = JSON.stringify(saved.setup);
    setProblem(null);
  }

  function failed(e: unknown) {
    again.current = false;
    waiting.current = null;
    if (e instanceof DataError && e.code === '40001') {
      stopped.current = true;
      setConflict(true);
      setProblem('Changed elsewhere. Reload to see it.');
    } else {
      setProblem(messageOf(e));
    }
  }

  function settled() {
    busy.current = false;
    if (again.current) {
      again.current = false;
      write();
      return;
    }
    const next = waiting.current;
    waiting.current = null;
    next?.();
  }

  function write() {
    busy.current = true;
    save.mutate(
      { formId, setup: latest.current, version: version.current },
      {
        onSuccess: stored,
        onError: failed,
        onSettled: settled,
      },
    );
  }

  /** Shows the setup and saves it (after the save on its way, if there is one). */
  function put(next: FormSetup) {
    latest.current = next;
    setSetup(next);
    if (busy.current) again.current = true;
    else write();
  }

  /** Makes a change to the setup as it is now (null changes nothing). True: it was made and is being saved. */
  function change(update: (current: FormSetup) => FormSetup | null): boolean {
    if (stopped.current) return false;
    const next = update(latest.current);
    if (next === null) return false;
    const parsed = formSetupSchema.safeParse(next);
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Check the form.');
      return false;
    }
    setProblem(null);
    put(parsed.data);
    return true;
  }

  /** Adds a field of the company's own (or, with `table`, a column); `done` runs once it is on the form. */
  function addField(label: string, long: boolean, table: string | null, done: () => void) {
    if (stopped.current) return;
    if (busy.current) {
      waiting.current = () => {
        addField(label, long, table, done);
      };
      return;
    }
    busy.current = true;
    add.mutate(
      { formId, setup: latest.current, version: version.current, label, long, table },
      {
        onSuccess: (saved) => {
          stored(saved);
          latest.current = withAdded(latest.current, saved.setup, table);
          setSetup(latest.current);
          done();
        },
        onError: failed,
        onSettled: settled,
      },
    );
  }

  return {
    setup,
    change,
    addField,
    problem,
    /** The company row changed elsewhere: nothing more is saved until the setup is read again. */
    conflict,
    pending: save.isPending || add.isPending,
    saved: save.isSuccess || add.isSuccess,
  };
}

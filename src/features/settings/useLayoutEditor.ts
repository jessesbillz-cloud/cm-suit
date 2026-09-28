// The layout cards in Settings (layout, calendar subscriptions, notifications) all edit user_layout: each change
// saves at once through the one layout mutation, and a failed save says so in a toast and rolls back.
import { messageOf } from '../../data/errors';
import { useSaveLayout } from '../../data/mutations';
import { useUserLayout } from '../../data/queries';
import type { LayoutChoices } from '../../lib/layout';
import { useToast } from '../../ui/Toast';

export function useLayoutEditor() {
  const layout = useUserLayout();
  const save = useSaveLayout();
  const toast = useToast();

  function set(patch: Partial<LayoutChoices>) {
    save.mutate(patch, {
      onError: (e) => {
        toast.show({ tone: 'error', message: `Not saved: ${messageOf(e)}` });
      },
    });
  }

  return { layout, save, set };
}

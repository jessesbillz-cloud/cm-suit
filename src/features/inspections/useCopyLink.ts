// Copy a link to the clipboard with a toast either way (the Share panel's job link and hub link).
import { useToast } from '../../ui/Toast';

export function useCopyLink(): (url: string) => void {
  const toast = useToast();
  return (url) => {
    navigator.clipboard.writeText(url).then(
      () => {
        toast.show({ message: 'Link copied.' });
      },
      (e: unknown) => {
        console.warn('clipboard write failed', e);
        toast.show({ tone: 'error', message: 'Could not copy. Copy the link above.' });
      },
    );
  };
}

// `deno test supabase/functions/_shared/images_test.ts` — which files a preview may show.
import { isPreviewable, isPreviewImage, isPreviewPdf, PREVIEW_TTL_SECONDS } from './images.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

Deno.test('previews: photos by mime and name', () => {
  check(isPreviewImage('image/jpeg', 'Sample crack.jpg'), 'jpeg');
  check(isPreviewImage('IMAGE/JPEG', 'SAMPLE.JPEG'), 'case does not matter');
  check(isPreviewImage('image/png', 'a.png'), 'png');
  check(isPreviewImage('image/webp', 'a.webp'), 'webp');
  check(isPreviewImage('image/heic', 'a.heic'), 'heic');
});

Deno.test('previews: never anything else', () => {
  check(!isPreviewImage('application/pdf', 'plan.pdf'), 'a PDF');
  check(!isPreviewImage('application/pdf', 'fake.jpg'), 'an image name on a PDF');
  check(!isPreviewImage('image/jpeg', 'bid.pdf'), 'an image mime on a PDF name');
  check(!isPreviewImage('image/svg+xml', 'logo.svg'), 'SVG can carry script');
  check(!isPreviewImage('text/html', 'page.html'), 'HTML');
  check(!isPreviewImage('image/jpeg', 'photo.jpg.html'), 'the name must end in an image type');
});

Deno.test('previews: a PDF by mime and name (0074), never a disguised one', () => {
  check(isPreviewPdf('application/pdf', 'Sample plan.PDF'), 'pdf');
  check(!isPreviewPdf('application/pdf', 'fake.jpg'), 'a PDF mime on an image name');
  check(!isPreviewPdf('text/html', 'page.pdf'), 'HTML named .pdf');
  check(isPreviewable('application/pdf', 'a.pdf') && isPreviewable('image/png', 'a.png'), 'a PDF or a photo');
  check(!isPreviewable('image/svg+xml', 'logo.svg') && !isPreviewable('text/html', 'page.html'), 'nothing else');
});

Deno.test('previews: a preview URL lives 10 minutes, like a download URL (SPEC §6.5)', () => {
  check(PREVIEW_TTL_SECONDS === 600, 'ten minutes');
});

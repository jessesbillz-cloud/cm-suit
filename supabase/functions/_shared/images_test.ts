// `deno test supabase/functions/_shared/images_test.ts` — which files a preview may show.
import { isPreviewImage, PREVIEW_TTL_SECONDS } from './images.ts';

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

Deno.test('previews: short-lived', () => {
  check(PREVIEW_TTL_SECONDS > 0 && PREVIEW_TTL_SECONDS <= 3600, 'at most an hour');
});

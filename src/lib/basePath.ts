// The app may live under a sub-path (staging: /cm-suit/). Every address the app builds by hand, outside the router,
// goes through here, so a new window or a full reload stays inside the app.

/** An in-app path ("/p/job/files/1?window=1") as the browser must open it: the base path in front. */
export function inAppPath(path: string, basePath: string = __BASE_PATH__): string {
  const root = basePath.replace(/\/+$/, '');
  return `${root}${path.startsWith('/') ? path : `/${path}`}`;
}

// A new browser tab opened inside the tap itself (pop-up blockers allow only that), to send to a URL once the server
// has made it (an approved set opens the browser's own PDF viewer this way). Null when the browser refused. The new tab gets no handle back to this page.

export function blankTab(): Window | null {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  return tab;
}

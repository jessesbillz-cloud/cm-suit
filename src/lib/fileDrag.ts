// Is something being dragged in from outside the page (files or a folder), not text or a link dragged within it?

export function carriesFiles(dt: Pick<DataTransfer, 'types'> | null): boolean {
  return dt !== null && dt.types.includes('Files');
}

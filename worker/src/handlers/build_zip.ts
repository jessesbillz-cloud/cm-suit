// build_zip: "Download all (zip)" for a folder or log (SPEC §8.1). Arrives in Phase 2.
export function buildZip(): Promise<void> {
  return Promise.reject(new Error('build_zip is not implemented until Phase 2'));
}

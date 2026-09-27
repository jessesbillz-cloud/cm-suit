// Which package a dropped bid file belongs to, from its name (SPEC §11.6 office intake). Matt's folder names start
// with the CSI division ("09_21050_..."): the first package whose code starts with those two digits, by code, so
// "09" lands on 09A. A full code up front ("09B_...") wins when that package exists. No leading digits = no guess.

interface CodedPackage {
  id: string;
  code: string;
}

const LEAD = /^\s*(\d{2})([A-Za-z])?(?=[\s_\-.])/;

/** The package id a file name points at, or null when the name does not start with a division. */
export function guessPackage(fileName: string, packages: readonly CodedPackage[]): string | null {
  const m = LEAD.exec(fileName);
  if (!m) return null;
  const division = m[1] ?? '';
  const letter = m[2]?.toUpperCase();
  const byCode = [...packages].sort((a, b) => a.code.localeCompare(b.code));
  if (letter !== undefined) {
    const exact = byCode.find((p) => p.code === `${division}${letter}`);
    if (exact) return exact.id;
  }
  return byCode.find((p) => p.code.startsWith(division))?.id ?? null;
}

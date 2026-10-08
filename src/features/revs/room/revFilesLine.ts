// What a toast says after Revs' files are linked (0094): Link files (pictures, IRs and sheets newly linked), and the
// pictures and IRs just added (how many linked, the names that matched nothing).
import type { FileLink, Linked } from '../../../data/revs.rooms';

/** One file added and what it linked. */
export interface Added extends FileLink {
  name: string;
}

/** The most file names a toast lists; the rest are counted. */
const MAX_NAMES = 5;

const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
function joined(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}

function names(list: readonly string[]): string {
  if (list.length <= MAX_NAMES) return joined(list);
  return joined([...list.slice(0, MAX_NAMES), `${String(list.length - MAX_NAMES)} more`]);
}

/** Link files: "1 picture, 2 IRs and 6 sheets linked." */
export function linkedLine({ images, files, sheets }: Linked): string {
  const parts = [
    images > 0 ? count(images, 'picture', 'pictures') : null,
    files > 0 ? count(files, 'IR', 'IRs') : null,
    sheets > 0 ? count(sheets, 'sheet', 'sheets') : null,
  ].filter((x): x is string => x !== null);
  return parts.length > 0 ? `${joined(parts)} linked.` : 'Nothing new to link.';
}

/** Files added: "20 pictures and 3 IRs linked. Not matched: x.png." */
export function addedLine(added: readonly Added[]): string {
  const pictures = added.filter((a) => a.rooms > 0).length;
  const irs = added.filter((a) => a.signoffs > 0).length;
  const missed = added.filter((a) => a.rooms === 0 && a.signoffs === 0).map((a) => a.name);
  const parts = [pictures > 0 ? count(pictures, 'picture', 'pictures') : null, irs > 0 ? count(irs, 'IR', 'IRs') : null].filter(
    (x): x is string => x !== null,
  );
  const head = parts.length > 0 ? `${joined(parts)} linked.` : 'Nothing linked.';
  return missed.length > 0 ? `${head} Not matched: ${names(missed)}.` : head;
}

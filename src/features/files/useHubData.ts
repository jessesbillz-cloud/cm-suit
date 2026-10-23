// What the spec section search and a section's page read: the files of Submittals, RFIs and CCDs (a DSA job's only,
// 0111: no CCDs section, no CCDs group) (the same lists, and
// the same access, as Files), the RFI tool's RFIs I may see, the spec books' sections and the CSI titles. The RFI
// tool's own PDFs in RFIs stand for their RFIs and are not listed twice.
import { useQuery } from '@tanstack/react-query';
import { useCsiLibrary } from '../../data/csi.queries';
import { useSectionFiles, type FileSection } from '../../data/fileSections';
import { useRfiRefs } from '../../data/specHub';
import { specBooksQuery } from '../../data/specs';
import { storedFiles } from './leftovers';
import { hubSections, namedSections, type HubSection, type HubSources } from './hubItems';

export interface HubData {
  sources: HubSources | null;
  sections: HubSection[];
  /** The first thing that failed, with its retry. */
  failed: { error: unknown; retry: () => void } | null;
  divisionTitle: (d: string) => string | null;
}

export function useHubData(projectId: string, all: readonly FileSection[]): HubData {
  const of = (kind: string) => all.find((s) => s.kind === kind) ?? null;
  const submittals = useSectionFiles(projectId, of('submittals'));
  const rfiFiles = useSectionFiles(projectId, of('rfis'));
  const ccds = useSectionFiles(projectId, of('ccd'));
  const rfis = useRfiRefs(projectId);
  const books = useQuery(specBooksQuery(projectId));
  const csi = useCsiLibrary();

  const read = (section: FileSection | null, q: typeof submittals) => (section === null ? [] : q.data ? storedFiles(q.data) : null);
  const s = read(of('submittals'), submittals);
  const r = read(of('rfis'), rfiFiles);
  const c = read(of('ccd'), ccds);
  const pdfs = new Set((rfis.data ?? []).flatMap((x) => x.pdf_file_id ?? []));
  const sources: HubSources | null =
    s && r && c && rfis.data ? { submittals: s, rfiFiles: r.filter((f) => !pdfs.has(f.id)), ccds: c, rfis: rfis.data } : null;

  const bookSections = (books.data ?? []).flatMap((b) => b.sections);
  const csiSections = (csi.data?.sections ?? []).map((x) => ({ section: x.number, title: x.title }));
  const sections = sources ? hubSections(bookSections, namedSections(sources), csiSections) : [];

  const broken = [submittals, rfiFiles, ccds, rfis, books].find((q) => q.isError);
  return {
    sources: books.isPending ? null : sources,
    sections,
    failed: broken ? { error: broken.error, retry: () => void broken.refetch() } : null,
    divisionTitle: (d) => csi.data?.divisions.find((x) => x.number === d)?.title ?? null,
  };
}

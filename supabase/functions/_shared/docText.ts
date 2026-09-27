// Text out of a bid file without the worker (SPEC §11.6): PDFs through unpdf (pdf.js built for serverless runtimes),
// .eml as the mail's text part (MIME headers stripped, quoted-printable and base64 decoded), .txt as is. Word, Excel
// and images are refused by the caller (docKind is null): no OCR or office conversion here. Pages are capped so one
// request stays inside the edge runtime's CPU budget; the caller stores the pages once, in file_pages.
import { extractText, getDocumentProxy } from 'unpdf';

/** Bid documents are a few pages. Past this, one request would not finish in the edge runtime's CPU time. */
export const MAX_PAGES = 40;
/** Files above this are not downloaded at all (the caller checks files.size before fetching). */
export const MAX_DOC_BYTES = 25 * 1024 * 1024;

export type DocKind = 'pdf' | 'eml' | 'txt';

export type DocText =
  | { kind: 'pages'; pages: string[] }
  | { kind: 'too_long'; pages: number };

/** What this module can read, from the MIME type and the file extension; null = not a text source. */
export function docKind(name: string, mime: string): DocKind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  const type = mime.split(';')[0].trim().toLowerCase();
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type === 'message/rfc822' || ext === 'eml') return 'eml';
  if (type === 'text/plain' || ext === 'txt') return 'txt';
  return null;
}

/** Postgres text cannot hold NUL; the rest is whitespace cleanup. */
function cleanText(s: string): string {
  return s.replaceAll('\u0000', '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

/** A charset label the runtime does not know (TextDecoder throws a RangeError) is read as UTF-8, the mail default. */
const decoder = (charset: string): TextDecoder => {
  try {
    return new TextDecoder(charset);
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    return new TextDecoder('utf-8');
  }
};

function decodeQuotedPrintable(s: string, charset = 'utf-8'): string {
  const joined = s.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const c = joined[i];
    const hex = joined.slice(i + 1, i + 3);
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(c.charCodeAt(0) & 0xff);
    }
  }
  return decoder(charset).decode(new Uint8Array(bytes));
}

function decodeBase64Text(s: string, charset = 'utf-8'): string {
  const bin = atob(s.replace(/[^A-Za-z0-9+/=]/g, ''));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return decoder(charset).decode(bytes);
}

/** Tags out, entities in, block ends as line breaks. Enough for a quoted bid in an HTML-only mail. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n');
}

interface MimePart {
  headers: Record<string, string>;
  body: string;
}

function splitHeaders(raw: string): MimePart {
  const cut = raw.search(/\r?\n\r?\n/);
  const head = cut < 0 ? raw : raw.slice(0, cut);
  const body = cut < 0 ? '' : raw.slice(cut).replace(/^\r?\n\r?\n/, '');
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  return { headers, body };
}

function param(header: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(header);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function decodeBody(p: MimePart): string {
  const type = p.headers['content-type'] ?? 'text/plain';
  const charset = param(type, 'charset') ?? 'utf-8';
  const enc = (p.headers['content-transfer-encoding'] ?? '').trim().toLowerCase();
  const text = enc === 'quoted-printable' ? decodeQuotedPrintable(p.body, charset) : enc === 'base64' ? decodeBase64Text(p.body, charset) : p.body;
  return type.toLowerCase().startsWith('text/html') ? htmlToText(text) : text;
}

/** The text parts of a mail, plain preferred over HTML within one multipart/alternative; attachments are skipped. */
function textParts(p: MimePart, depth = 0): string[] {
  const type = (p.headers['content-type'] ?? 'text/plain').toLowerCase();
  if (type.startsWith('multipart/') && depth < 8) {
    const boundary = param(p.headers['content-type'] ?? '', 'boundary');
    if (!boundary) return [];
    const parts = p.body.split(`--${boundary}`).slice(1).filter((s) => !s.startsWith('--')).map((s) => splitHeaders(s.replace(/^\r?\n/, '')));
    if (type.startsWith('multipart/alternative')) {
      const plain = parts.find((x) => (x.headers['content-type'] ?? 'text/plain').toLowerCase().startsWith('text/plain'));
      const chosen = plain ?? parts.find((x) => (x.headers['content-type'] ?? '').toLowerCase().startsWith('text/html'));
      return chosen ? textParts(chosen, depth + 1) : [];
    }
    return parts.flatMap((x) => textParts(x, depth + 1));
  }
  const disposition = (p.headers['content-disposition'] ?? '').toLowerCase();
  if (disposition.startsWith('attachment')) return [];
  if (type.startsWith('text/plain') || type.startsWith('text/html')) return [decodeBody(p)];
  return [];
}

/** One "page": the mail's headers people read (from, date, subject) and its text. */
function emlToText(raw: string): string {
  const msg = splitHeaders(raw);
  const head = ['from', 'to', 'date', 'subject'].filter((h) => msg.headers[h]).map((h) => `${h[0].toUpperCase()}${h.slice(1)}: ${msg.headers[h]}`);
  return [...head, '', ...textParts(msg)].join('\n');
}

async function pdfPages(bytes: Uint8Array): Promise<DocText> {
  const pdf = await getDocumentProxy(bytes);
  if (pdf.numPages > MAX_PAGES) return { kind: 'too_long', pages: pdf.numPages };
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map(cleanText);
  return { kind: 'pages', pages };
}

/** Reads the file's text as pages (one page for mail and text). Throws on a broken file. */
export function extractDocText(bytes: Uint8Array, kind: DocKind): Promise<DocText> {
  if (kind === 'pdf') return pdfPages(bytes);
  const raw = new TextDecoder('utf-8').decode(bytes);
  const text = cleanText(kind === 'eml' ? emlToText(raw) : raw);
  return Promise.resolve({ kind: 'pages', pages: [text] });
}

// Turns a drop (files and whole folders) into files for the single uploader. Folders are walked with the File System
// entries API. Each file keeps the folders it sat in (`dir`, from the dropped folder down), so Files can rebuild them.
// Hidden files the desktop leaves in folders (.DS_Store, ._ copies) are not the person's files and are left out.

export interface DroppedFile {
  file: File;
  /** The dropped folder and the folders under it that hold the file; empty for a file dropped by itself. */
  dir: string[];
}

function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const out: FileSystemEntry[] = [];
    const next = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(out);
          return;
        }
        out.push(...batch);
        next();
      }, reject);
    };
    next();
  });
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

const hidden = (name: string) => name.startsWith('.') || name === 'Thumbs.db' || name === 'desktop.ini';

async function walk(entry: FileSystemEntry, dir: string[]): Promise<DroppedFile[]> {
  if (hidden(entry.name)) return [];
  if (entry.isFile) return [{ file: await fileOf(entry as FileSystemFileEntry), dir }];
  if (!entry.isDirectory) return [];
  const children = await readAll((entry as FileSystemDirectoryEntry).createReader());
  const nested = await Promise.all(children.map((c) => walk(c, [...dir, entry.name])));
  return nested.flat();
}

/** The dropped files with the folders they came in. */
export async function collectDropTree(dt: DataTransfer): Promise<DroppedFile[]> {
  const entries = [...dt.items]
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null);
  if (entries.length === 0) return [...dt.files].map((file) => ({ file, dir: [] }));
  const lists = await Promise.all(entries.map((e) => walk(e, [])));
  return lists.flat();
}

/** The dropped files only, for a place that keeps no folders (received bids). */
export async function collectDrop(dt: DataTransfer): Promise<File[]> {
  return (await collectDropTree(dt)).map((d) => d.file);
}

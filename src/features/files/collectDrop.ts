// Turns a drop (files and whole folders) into a flat list of files for the single uploader.
// Folders are walked with the File System entries API; their files land in the folder being viewed.

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

async function walk(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) return [await fileOf(entry as FileSystemFileEntry)];
  if (!entry.isDirectory) return [];
  const children = await readAll((entry as FileSystemDirectoryEntry).createReader());
  const nested = await Promise.all(children.map(walk));
  return nested.flat();
}

export async function collectDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items]
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null);
  if (entries.length === 0) return [...dt.files];
  const lists = await Promise.all(entries.map(walk));
  return lists.flat();
}

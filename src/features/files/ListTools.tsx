// Above a section's list: its folders as a filter ("All companies" in Submittals, "All folders" elsewhere) and a search
// by name, section or company.
import { FIELD_CONTROL } from '../../ui/Fields';
import { SearchBox } from '../../ui/SearchBox';
import type { FolderOption } from './sections';

interface ListToolsProps {
  /** The section's folders; none: no filter. */
  options: readonly FolderOption[];
  all: string;
  filterId: string | null;
  onFilter: (folderId: string | null) => void;
  onSearch: (q: string) => void;
}

export function ListTools({ options, all, filterId, onFilter, onSearch }: ListToolsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      {options.length > 0 ? (
        <select
          aria-label="Filter"
          data-testid="files-filter"
          className={`${FIELD_CONTROL} h-9 min-w-0 max-w-full flex-1 sm:max-w-xs sm:flex-none`}
          value={filterId ?? ''}
          onChange={(e) => {
            onFilter(e.target.value === '' ? null : e.target.value);
          }}
        >
          <option value="">{all}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}
      <SearchBox label="Search files" placeholder="Search" onChange={onSearch} testId="files-search" className="min-w-0 flex-1" />
    </div>
  );
}

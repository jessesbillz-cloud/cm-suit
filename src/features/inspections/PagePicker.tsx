// The page of a multi-page sheet the map is drawn on (many jobs keep the whole plan set as one PDF): back, the page
// ("Page 12 of 40", a jump to any page), next. The page count comes from the PDF itself (pdf.js).
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/Button';

interface PagePickerProps {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}

const SELECT =
  'h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-3 text-center text-base font-medium tabular-nums text-ink shadow-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:h-10 sm:flex-none sm:text-sm';

export function PagePicker({ page, pages, onPage }: PagePickerProps) {
  return (
    <div role="group" aria-label="Page" className="flex items-center gap-2" data-testid="map-pages">
      <Button
        size="lg"
        icon={ChevronLeft}
        aria-label="Previous page"
        className="sm:h-10 sm:w-10"
        disabled={page <= 1}
        data-testid="map-page-prev"
        onClick={() => {
          onPage(page - 1);
        }}
      />
      <select
        aria-label="Page"
        className={SELECT}
        value={page}
        data-testid="map-page"
        onChange={(e) => {
          onPage(Number(e.target.value));
        }}
      >
        {Array.from({ length: pages }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            Page {i + 1} of {pages}
          </option>
        ))}
      </select>
      <Button
        size="lg"
        icon={ChevronRight}
        aria-label="Next page"
        className="sm:h-10 sm:w-10"
        disabled={page >= pages}
        data-testid="map-page-next"
        onClick={() => {
          onPage(page + 1);
        }}
      />
    </div>
  );
}

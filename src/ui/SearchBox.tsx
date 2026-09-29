// The one search box for logs: a magnifier, the text, Enter to jump (e.g. a number opens that item). It keeps what is
// typed itself, so a caller that stores the query in the URL never moves the cursor.
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Icon } from './Icon';

interface SearchBoxProps {
  /** For screen readers: "Search RFIs". */
  label: string;
  placeholder: string;
  initial?: string | undefined;
  onChange: (q: string) => void;
  onEnter?: ((q: string) => void) | undefined;
  testId?: string | undefined;
  className?: string | undefined;
}

export function SearchBox({ label, placeholder, initial = '', onChange, onEnter, testId, className = '' }: SearchBoxProps) {
  const [text, setText] = useState(initial);
  return (
    <label
      className={`flex h-9 min-w-[10rem] items-center gap-2 rounded-full border border-line-strong/80 bg-card px-3.5 text-sm shadow-control transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20 ${className}`}
    >
      <Icon icon={Search} size={16} className="shrink-0 text-ink-3" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        data-testid={testId}
        className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.(text);
        }}
      />
    </label>
  );
}

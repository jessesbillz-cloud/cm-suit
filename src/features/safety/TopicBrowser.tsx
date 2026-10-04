// The topic library as a list to pick from (the new meeting's topic, the Library view): a search, one button per
// category, then the talks. Each row: the title, then its category and the regulation it rests on; "Ours" marks the
// company's own, a page icon one with a PDF.
import { useState } from 'react';
import { Check, FileText } from 'lucide-react';
import type { Topic } from '../../data/safety.types';
import { categoryLabel } from '../../lib/safety';
import { ChipPick } from '../../ui/ChipPick';
import { Icon } from '../../ui/Icon';
import { SearchBox } from '../../ui/SearchBox';
import { categoriesOf, filterTopics } from './model';

interface TopicBrowserProps {
  topics: readonly Topic[];
  pickedId: string | null;
  onPick: (topic: Topic) => void;
  testId: string;
}

function TopicRow({ topic, picked, onPick, testId }: { topic: Topic; picked: boolean; onPick: (t: Topic) => void; testId: string }) {
  const facts = [categoryLabel(topic.category), topic.source, topic.org_id === null ? null : 'Ours'].filter((x) => x !== null);
  return (
    <li>
      <button
        type="button"
        aria-pressed={picked}
        data-testid={`${testId}-${topic.slug ?? topic.id}`}
        className={`flex min-h-[52px] w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${picked ? 'bg-accent-soft/70' : 'hover:bg-page/60'}`}
        onClick={() => {
          onPick(topic);
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[15px] font-medium leading-6 text-ink">{topic.title}</span>
          <span className="block text-[13px] leading-5 text-ink-2">{facts.join(' · ')}</span>
        </span>
        {topic.file_id ? <Icon icon={FileText} size={16} className="mt-1 shrink-0 text-ink-3" /> : null}
        {picked ? <Icon icon={Check} size={18} className="mt-0.5 shrink-0 text-accent" /> : null}
      </button>
    </li>
  );
}

export function TopicBrowser({ topics, pickedId, onPick, testId }: TopicBrowserProps) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const shown = filterTopics(topics, q, category);
  return (
    <div className="flex flex-col gap-3">
      <SearchBox label="Search topics" placeholder="Search topics" onChange={setQ} testId={`${testId}-search`} className="w-full" />
      <ChipPick
        chips={categoriesOf(topics)}
        picked={category === null ? [] : [category]}
        onChange={(next) => {
          setCategory(next[0] ?? null);
        }}
        label="Category"
        testId={`${testId}-category`}
      />
      {shown.length === 0 ? (
        <p className="px-1 text-sm text-ink-2">No topics match.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card" data-testid={`${testId}-list`}>
          {shown.map((t) => (
            <TopicRow key={t.id} topic={t} picked={t.id === pickedId} onPick={onPick} testId={testId} />
          ))}
        </ul>
      )}
    </div>
  );
}

// The Library view: the built-in starter talks and the company's own, by category and search. A tap opens a talk beside
// the list (its points, questions, the regulation and its official page, a PDF).
import { useSafetyTopics } from '../../data/safety.queries';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { topicIdOf, topicItemId } from './model';
import { TopicBrowser } from './TopicBrowser';

interface LibraryViewProps {
  orgId: string;
  selectedId: string | null;
  onOpen: (itemId: string) => void;
}

export function LibraryView({ orgId, selectedId, onOpen }: LibraryViewProps) {
  const topics = useSafetyTopics(orgId);
  if (topics.isError) {
    return (
      <Card padded={false}>
        <ErrorState error={topics.error} onRetry={() => void topics.refetch()} />
      </Card>
    );
  }
  if (topics.isPending) {
    return (
      <Card padded={false}>
        <LoadingState label="Loading the library" />
      </Card>
    );
  }
  if (topics.data.length === 0) {
    return (
      <Card>
        <EmptyState icon={TOOL_META.safety.icon} title="No topics yet." />
      </Card>
    );
  }
  return (
    <Card>
      <TopicBrowser
        topics={topics.data}
        pickedId={selectedId === null ? null : topicIdOf(selectedId)}
        onPick={(t) => {
          onOpen(topicItemId(t.id));
        }}
        testId="safety-library"
      />
    </Card>
  );
}

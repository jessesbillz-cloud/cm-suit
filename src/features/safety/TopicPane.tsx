// One talk from the library (beside the list): its category, title, the points and questions, the regulation with its
// official page, and its PDF. The company's own talks can be edited or removed (with Undo) by whoever keeps the library;
// the built-in starters stay as they are.
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSafetyTopics } from '../../data/safety.queries';
import { useRemoveTopic } from '../../data/safety.mutations';
import type { Topic } from '../../data/safety.types';
import { categoryLabel } from '../../lib/safety';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { TopicForm } from './TopicForm';
import { TopicOutline } from './TopicOutline';

interface TopicPaneProps {
  projectId: string;
  orgId: string;
  topicId: string;
  canManage: boolean;
  onClose: () => void;
}

function View({ projectId, orgId, topic, canManage, onEdit, onClose }: Omit<TopicPaneProps, 'topicId'> & { topic: Topic; onEdit: () => void }) {
  const remove = useRemoveTopic(projectId, orgId);
  const toast = useToast();
  const mine = canManage && topic.org_id !== null;
  return (
    <div className="flex min-h-full flex-col" data-testid="safety-topic">
      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        <header className="flex flex-col gap-1">
          <span className="text-[13px] font-bold uppercase tracking-[0.04em] text-ink">
            {categoryLabel(topic.category)}
            {topic.org_id === null ? '' : ' · Ours'}
          </span>
          <h1 className="break-words text-[19px] font-semibold leading-7 tracking-[-0.01em] text-ink">{topic.title}</h1>
        </header>
        <TopicOutline projectId={projectId} outline={topic} pdf={topic.file_id ? { topicId: topic.id } : null} />
      </div>
      {mine ? (
        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-card px-5 py-3">
          <Button
            variant="danger"
            icon={Trash2}
            loading={remove.isPending}
            onClick={() => {
              remove.mutate(
                { topic, removed: true },
                {
                  onSuccess: () => {
                    onClose();
                    toast.show({
                      message: `${topic.title} removed.`,
                      action: {
                        label: 'Undo',
                        onClick: () => {
                          remove.mutate({ topic, removed: false }, { onError: (e) => { toast.show({ tone: 'error', message: `Not undone: ${messageOf(e)}` }); } });
                        },
                      },
                    });
                  },
                  onError: (e) => {
                    toast.show({ tone: 'error', message: messageOf(e) });
                  },
                },
              );
            }}
          >
            Remove
          </Button>
          <Button variant="primary" icon={Pencil} data-testid="safety-topic-edit" onClick={onEdit}>
            Edit
          </Button>
        </footer>
      ) : null}
    </div>
  );
}

export function TopicPane({ projectId, orgId, topicId, canManage, onClose }: TopicPaneProps) {
  const topics = useSafetyTopics(orgId);
  const [editing, setEditing] = useState(false);
  if (topics.isError) return <ErrorState error={topics.error} onRetry={() => void topics.refetch()} />;
  if (topics.isPending) return <LoadingState label="Loading the topic" />;
  const topic = topics.data.find((t) => t.id === topicId);
  if (!topic) {
    return (
      <Card>
        <EmptyState title="That topic is not in the library." />
      </Card>
    );
  }
  if (editing) {
    return (
      <TopicForm
        projectId={projectId}
        orgId={orgId}
        topic={topic}
        onSaved={() => {
          setEditing(false);
        }}
        onCancel={() => {
          setEditing(false);
        }}
      />
    );
  }
  return (
    <View projectId={projectId} orgId={orgId} topic={topic} canManage={canManage} onClose={onClose} onEdit={() => { setEditing(true); }} />
  );
}

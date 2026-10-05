// A new meeting (safety.run): Tailgate or Meeting (the big choice; nothing picked until someone taps one), the topic from
// the library or an own topic (a title, notes or a PDF), where. Start makes it (the next number, me leading) and opens
// its screen with the QR. Starting twice from one form is the same meeting (the form's key). Where starts as the job's
// last meeting's place (prefill what's known).
import { useState } from 'react';
import { BookOpen, PenLine, Play } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useLastMeetingLocation, useSafetyTopics } from '../../data/safety.queries';
import { useStartMeeting } from '../../data/safety.mutations';
import type { Topic } from '../../data/safety.types';
import { rememberLink } from '../../lib/requestLink';
import { MEETING_KINDS, meetingLabel, meetingLinkKey, type MeetingKind } from '../../lib/safety';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_LABEL, TextField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { ChoiceRow } from '../inspections/ChoiceRow';
import { PdfField, type PickedPdf } from './PdfField';
import { TopicBrowser } from './TopicBrowser';

interface NewMeetingProps {
  projectId: string;
  orgId: string;
  onStarted: (meetingId: string) => void;
}

function Library({ orgId, picked, onPick }: { orgId: string; picked: Topic | null; onPick: (t: Topic) => void }) {
  const topics = useSafetyTopics(orgId);
  if (topics.isError) return <ErrorState error={topics.error} onRetry={() => void topics.refetch()} className="m-0" />;
  if (topics.isPending) return <LoadingState label="Loading the library" />;
  return <TopicBrowser topics={topics.data} pickedId={picked?.id ?? null} onPick={onPick} testId="safety-topic" />;
}

export function NewMeeting({ projectId, orgId, onStarted }: NewMeetingProps) {
  const start = useStartMeeting(projectId);
  const toast = useToast();
  const [key] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<MeetingKind | null>(null);
  const [own, setOwn] = useState(false);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [pdf, setPdf] = useState<PickedPdf | null>(null);
  const last = useLastMeetingLocation(projectId);
  // null: not touched, so it shows the last meeting's place; typed text wins once there is any.
  const [typed, setTyped] = useState<string | null>(null);
  const location = typed ?? last.data ?? '';
  const ready = kind !== null && (own ? title.trim() !== '' : topic !== null);

  function submit() {
    if (kind === null) return;
    start.mutate(
      {
        key, kind, topicId: own ? null : (topic?.id ?? null), title: own ? title : '', notes: own ? notes : '', fileId: own ? (pdf?.id ?? null) : null,
        location,
      },
      {
        onSuccess: (s) => {
          rememberLink(meetingLinkKey(s.id), { token: s.token, made_at: s.token_made_at });
          toast.show({ message: `${meetingLabel(kind, s.number)} started.` });
          onStarted(s.id);
        },
      },
    );
  }

  return (
    <form
      className="flex min-h-full flex-col"
      data-testid="safety-new-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit();
      }}
    >
      <div className="flex flex-1 flex-col gap-5 px-5 py-4">
        <h1 className="text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">New meeting</h1>
        <ChoiceRow<MeetingKind> label="Kind" options={MEETING_KINDS} value={kind} onPick={setKind} testId="safety-kind" large />
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">{own ? 'Own topic' : 'Topic'}</h2>
            <Button
              size="sm"
              variant="quiet"
              icon={own ? BookOpen : PenLine}
              data-testid="safety-own-toggle"
              onClick={() => {
                setOwn(!own);
              }}
            >
              {own ? 'Library' : 'Own topic'}
            </Button>
          </div>
          {own ? (
            <>
              <TextField label="Title" value={title} onChange={setTitle} maxLength={160} testId="safety-own-title" />
              <label className={FIELD_LABEL}>
                Notes
                <textarea
                  rows={4}
                  maxLength={4000}
                  className={FIELD_AREA}
                  value={notes}
                  data-testid="safety-own-notes"
                  onChange={(e) => {
                    setNotes(e.target.value);
                  }}
                />
              </label>
              <PdfField projectId={projectId} value={pdf} onChange={setPdf} testId="safety-own-pdf" />
            </>
          ) : (
            <Library orgId={orgId} picked={topic} onPick={setTopic} />
          )}
        </section>
        <TextField label="Location" value={location} onChange={setTyped} maxLength={120} testId="safety-location" />
        {start.isError ? (
          <p role="alert" className="text-sm text-danger">
            {messageOf(start.error)}
          </p>
        ) : null}
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-card px-5 py-3">
        <Button type="submit" variant="primary" size="lg" icon={Play} loading={start.isPending} disabled={!ready} data-testid="safety-start">
          Start
        </Button>
      </footer>
    </form>
  );
}

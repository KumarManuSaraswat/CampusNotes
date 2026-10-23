import { useEffect, useState } from 'react';
import type { NoteDto, StudyGateResult } from '@campusnotes/shared';
import { api } from '../../services/api';
import { getStudyGateStatus, processStudyNote } from '../../services/studyGateApi';
import { StudyGatePanel } from './StudyGatePanel';
export function mergeGate(note: NoteDto, result: StudyGateResult): NoteDto {
  return {
    ...note,
    processingStatus: result.processingStatus,
    processingStage: result.processingStage ?? note.processingStage,
    studyGateStatus: result.studyGateStatus,
    studyAssessment: result.assessment,
    reviewRequestedAt: result.reviewRequestedAt ?? null,
    reviewMessage: result.reviewMessage ?? '',
    processingError: result.processingError ?? null,
  };
}
export function StudyGateControls({
  note,
  onChange,
}: {
  note: NoteDto;
  onChange: (note: NoteDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (note.processingStatus !== 'pending') return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      getStudyGateStatus(note.id, controller.signal)
        .then((result) => onChange(mergeGate(note, result)))
        .catch((e) => {
          if (e.name !== 'AbortError') setError('Status could not be refreshed. Please try again.');
        });
    }, 3000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [note.id, note.processingStatus, onChange]);
  async function run(action: 'analyse' | 'review' | 'apply') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'apply')
        onChange(await api<NoteDto>(`/notes/${note.id}/apply-suggestions`, { method: 'POST' }));
      else {
        if (action === 'analyse')
          onChange({
            ...note,
            studyGateStatus: 'pending',
            processingStatus: 'pending',
            studyAssessment: null,
          });
        const result =
          action === 'analyse'
            ? await processStudyNote(note.id)
            : await api<StudyGateResult>(`/notes/${note.id}/request-review`, { method: 'POST' });
        onChange(mergeGate(note, result));
      }
    } catch (e) {
      setError((e as Error).message);
      try {
        onChange(mergeGate(note, await getStudyGateStatus(note.id)));
      } catch {
        /* Keep last known state. */
      }
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || note.processingStatus === 'pending' || !!note.reviewRequestedAt;
  const initial =
    note.studyGateStatus === 'legacy_unreviewed' ||
    (note.studyGateStatus === 'pending' && note.processingStatus === 'not_requested');
  return (
    <div className="gate-controls">
      {initial ? (
        <div className="soft-banner">
          <strong>Your original is saved privately.</strong>
          <p>
            Run the study check to make this note eligible for the library, or ask a moderator to
            review it.
          </p>
        </div>
      ) : (
        <StudyGatePanel
          status={
            note.studyGateStatus === 'legacy_unreviewed' ? 'needs_review' : note.studyGateStatus
          }
          assessment={note.reviewMessage && !note.reviewRequestedAt ? null : note.studyAssessment}
          onRetry={!locked ? () => void run('analyse') : undefined}
          onRequestReview={!locked ? () => void run('review') : undefined}
        />
      )}
      {note.reviewMessage && (
        <p className="review-message" role="status">
          {note.reviewRequestedAt ? 'Review requested: ' : 'Moderator feedback: '}
          {note.reviewMessage}
        </p>
      )}
      {note.studyGateStatus === 'failed' && note.processingError && (
        <p className="form-error" role="alert">
          {note.processingError}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {initial && (
          <button className="button small" disabled={locked} onClick={() => void run('analyse')}>
            Run study check
          </button>
        )}
        {(initial || note.studyGateStatus === 'failed') && (
          <button className="secondary-button" disabled={locked} onClick={() => void run('review')}>
            Request human review
          </button>
        )}
        {note.studyGateStatus === 'approved' &&
          note.studyAssessment?.decision === 'academic' &&
          note.metadataSource !== 'ai_reviewed' && (
            <button className="secondary-button" disabled={busy} onClick={() => void run('apply')}>
              Use suggested subject & topics
            </button>
          )}
      </div>
      {note.studyGateStatus === 'approved' &&
        note.studyAssessment?.decision === 'academic' &&
        note.metadataSource !== 'ai_reviewed' && (
          <p className="hint">
            Applying suggestions replaces your subject and topics. Your title and description stay
            the same.
          </p>
        )}
    </div>
  );
}

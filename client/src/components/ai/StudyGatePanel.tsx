import type { StudyAssessment, StudyGateStatus } from '@campusnotes/shared';
import './StudyGatePanel.css';

export interface StudyGatePanelProps {
  status: StudyGateStatus;
  assessment: StudyAssessment | null;
  onRetry?: () => void;
  onRequestReview?: () => void;
}

const headings: Record<StudyGateStatus, string> = {
  pending: 'Checking whether your document is study-related...',
  approved: 'Study material detected',
  rejected: 'This file does not appear to contain study material',
  needs_review: 'We could not determine the document category reliably',
  failed: 'The analysis could not finish',
};

/** Display only: callbacks belong to the integrating page; this component never publishes a note. */
export function StudyGatePanel({
  status,
  assessment,
  onRetry,
  onRequestReview,
}: StudyGatePanelProps) {
  const showAssessment = status !== 'pending' && status !== 'failed' && assessment !== null;
  const canAct = status === 'rejected' || status === 'needs_review' || status === 'failed';
  return (
    <section
      className={`study-gate study-gate--${status}`}
      aria-label="Document study check"
      aria-busy={status === 'pending'}
    >
      <div role="status" aria-live="polite" aria-atomic="true">
        <h2>{headings[status]}</h2>
        <p>
          {status === 'approved'
            ? 'This check identifies study-related content. It does not verify accuracy or authorship.'
            : 'Your original upload is retained. This document stays private until approved.'}
        </p>
      </div>
      {showAssessment && (
        <div className="study-gate__details">
          {(assessment.category || assessment.subject) && (
            <dl>
              {assessment.category && (
                <>
                  <dt>Category</dt>
                  <dd>{assessment.category}</dd>
                </>
              )}
              {assessment.subject && (
                <>
                  <dt>Subject</dt>
                  <dd>{assessment.subject}</dd>
                </>
              )}
            </dl>
          )}
          {assessment.tags.length > 0 && (
            <ul className="study-gate__tags" aria-label="Topics">
              {assessment.tags.map((tag, index) => (
                <li key={`${index}-${tag}`}>{tag}</li>
              ))}
            </ul>
          )}
          <h3>Why this result?</h3>
          <p>{assessment.reason}</p>
          {assessment.evidence.length > 0 && (
            <>
              <h3>Examples from your document</h3>
              <ul>
                {assessment.evidence.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </>
          )}
          {assessment.warnings.length > 0 && (
            <>
              <h3>What could not be checked clearly</h3>
              <ul>
                {assessment.warnings.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {canAct && (
        <div className="study-gate__actions">
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Retry analysis
            </button>
          )}
          {status !== 'failed' && onRequestReview && (
            <button type="button" onClick={onRequestReview}>
              Request review
            </button>
          )}
          {!onRetry && (status === 'failed' || !onRequestReview) && (
            <p>Check back later for review or retry options.</p>
          )}
        </div>
      )}
    </section>
  );
}

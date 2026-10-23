// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { StudyAssessment, StudyGateStatus } from '@campusnotes/shared';
import { StudyGatePanel } from './StudyGatePanel';

afterEach(cleanup);
const assessment: StudyAssessment = {
  decision: 'academic',
  category: 'Computer Science',
  subject: 'Stacks',
  tags: ['LIFO'],
  reason: 'Explains stack operations.',
  evidence: ['push adds an item'],
  warnings: ['One line is unclear.'],
};

describe('StudyGatePanel', () => {
  it.each<[StudyGateStatus, string]>([
    ['pending', 'Checking whether your document is study-related...'],
    ['approved', 'Study material detected'],
    ['rejected', 'This file does not appear to contain study material'],
    ['needs_review', 'We could not determine the document category reliably'],
    ['failed', 'The analysis could not finish'],
  ])('renders %s with plain language and an accessible announcement', (status, heading) => {
    render(<StudyGatePanel status={status} assessment={null} />);
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.getByRole('status').textContent).not.toMatch(/Gemini|schema|API|classifier/i);
    if (status !== 'approved')
      expect(screen.getByText(/stays private until approved/)).toBeTruthy();
  });
  it('shows metadata, reason, source evidence, and warnings without claiming verification', () => {
    render(<StudyGatePanel status="approved" assessment={assessment} />);
    for (const text of [
      'Computer Science',
      'Stacks',
      'LIFO',
      assessment.reason,
      ...assessment.evidence,
      ...assessment.warnings,
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByText(/does not verify accuracy or authorship/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it.each<StudyGateStatus>(['rejected', 'needs_review'])(
    'calls retry and review exactly once for %s',
    (status) => {
      const onRetry = vi.fn();
      const onRequestReview = vi.fn();
      render(
        <StudyGatePanel
          status={status}
          assessment={assessment}
          onRetry={onRetry}
          onRequestReview={onRequestReview}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }));
      fireEvent.click(screen.getByRole('button', { name: 'Request review' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRequestReview).toHaveBeenCalledTimes(1);
    },
  );
  it.each<StudyGateStatus>(['pending', 'failed'])('hides stale assessment in %s', (status) => {
    const onRetry = vi.fn();
    render(<StudyGatePanel status={status} assessment={assessment} onRetry={onRetry} />);
    expect(screen.queryByText(assessment.reason)).toBeNull();
    if (status === 'failed') {
      fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }));
      expect(onRetry).toHaveBeenCalledOnce();
    } else expect(screen.queryByRole('button')).toBeNull();
  });
  it('renders long and HTML-like document content as text', () => {
    const text = '<img src=x onerror=alert(1)>'.repeat(30);
    const { container } = render(
      <StudyGatePanel status="needs_review" assessment={{ ...assessment, reason: text }} />,
    );
    expect(screen.getByText(text)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

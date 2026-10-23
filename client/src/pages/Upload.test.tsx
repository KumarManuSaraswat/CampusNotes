// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NoteDto, StudyGateResult } from '@campusnotes/shared';
import { Upload } from './Upload';
import { uploadNote } from '../services/api';
import { processStudyNote, getStudyGateStatus } from '../services/studyGateApi';
vi.mock('../services/api', () => ({ uploadNote: vi.fn(), api: vi.fn() }));
vi.mock('../services/studyGateApi', () => ({
  processStudyNote: vi.fn(),
  getStudyGateStatus: vi.fn(),
}));
const note = {
  id: 'a'.repeat(24),
  title: 'Calculus',
  processingStatus: 'not_requested',
  studyGateStatus: 'pending',
  studyAssessment: null,
} as NoteDto;
const result = (status: StudyGateResult['studyGateStatus']): StudyGateResult => ({
  noteId: note.id,
  processingStatus: status === 'failed' ? 'failed' : 'completed',
  studyGateStatus: status,
  assessment: null,
});
function setup() {
  render(
    <MemoryRouter>
      <Upload />
    </MemoryRouter>,
  );
}
function select() {
  fireEvent.change(document.querySelector('input[type=file]')!, {
    target: { files: [new File(['PDF'], 'calculus.pdf', { type: 'application/pdf' })] },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('Upload form', () => {
  it('offers a study check and keeps optional manual metadata', () => {
    setup();
    expect(screen.getByText('Let the study check do the sorting')).toBeTruthy();
    expect(screen.getByLabelText('Subject')).toBeTruthy();
    expect(screen.getByLabelText('Description')).toBeTruthy();
  });
  it('rejects unsupported files before submitting', () => {
    setup();
    fireEvent.change(document.querySelector('input[type=file]')!, {
      target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(screen.getByRole('alert').textContent).toContain('not a PDF, JPG, JPEG, or PNG');
    expect(uploadNote).not.toHaveBeenCalled();
  });
  it.each([
    ['approved', 'Study material detected'],
    ['rejected', 'This file does not appear to contain study material'],
    ['needs_review', 'We could not determine the document category reliably'],
  ] as const)('shows %s without uploading again', async (status, heading) => {
    vi.mocked(uploadNote).mockResolvedValue([note]);
    vi.mocked(processStudyNote).mockResolvedValue(result(status));
    setup();
    select();
    fireEvent.click(screen.getByRole('button', { name: 'Upload & check notes' }));
    expect(await screen.findByText(heading)).toBeTruthy();
    expect(uploadNote).toHaveBeenCalledTimes(1);
    expect(processStudyNote).toHaveBeenCalledWith(note.id);
  });
  it('recovers a failed check and retries the saved original', async () => {
    vi.mocked(uploadNote).mockResolvedValue([note]);
    vi.mocked(processStudyNote)
      .mockRejectedValueOnce(new Error('Provider unavailable'))
      .mockResolvedValueOnce(result('approved'));
    vi.mocked(getStudyGateStatus).mockResolvedValue(result('failed'));
    setup();
    select();
    fireEvent.click(screen.getByRole('button', { name: 'Upload & check notes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry analysis' }));
    await waitFor(() => expect(screen.getByText('Study material detected')).toBeTruthy());
    expect(uploadNote).toHaveBeenCalledTimes(1);
    expect(processStudyNote).toHaveBeenCalledTimes(2);
  });
});
